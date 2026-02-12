import express from 'express';
import { prisma } from '../index';
import { io } from '../index';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { MatchingEngine } from '../services/matching';
import { NotificationService } from '../services/notifications';
import { format } from 'date-fns';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/sickcalls/submit
 * Staff submits a sick call
 */
router.post('/submit', async (req: AuthRequest, res) => {
  try {
    const { shiftId, locationId, reason, consecutiveDates } = req.body;
    const staffId = req.user!.id;
    const organizationId = req.user!.organizationId;
    
    // Validate shift exists and belongs to this staff member
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { location: true },
    });
    
    if (!shift) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    
    if (shift.assignedToId !== staffId) {
      return res.status(403).json({ error: 'This shift is not assigned to you' });
    }
    
    if (shift.status === 'SICK_CALL') {
      return res.status(400).json({ error: 'Sick call already submitted for this shift' });
    }
    
    // Create sick call
    const sickCall = await prisma.sickCall.create({
      data: {
        organizationId,
        locationId,
        staffId,
        shiftId,
        reason,
        status: 'PENDING',
        consecutiveDates: consecutiveDates || [],
      },
      include: {
        staff: true,
        shift: {
          include: { location: true },
        },
        location: true,
      },
    });
    
    // Update shift status
    await prisma.shift.update({
      where: { id: shiftId },
      data: { status: 'SICK_CALL' },
    });
    
    // Log audit trail
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: staffId,
        sickCallId: sickCall.id,
        action: 'SICK_CALL_SUBMITTED',
        details: {
          shiftId,
          locationId,
          reason,
        },
      },
    });
    
    // Emit real-time update to managers
    io.to(`org-${organizationId}`).emit('sick-call-submitted', {
      sickCall,
    });
    
    // Start the auto-matching and notification process
    // In production, this would be queued with Bull
    setImmediate(async () => {
      try {
        await startShiftCoverageProcess(sickCall.id);
      } catch (error) {
        console.error('Error starting coverage process:', error);
      }
    });
    
    res.status(201).json({
      sickCall,
      message: 'Sick call submitted. Finding coverage...',
    });
    
  } catch (error) {
    console.error('Sick call submission error:', error);
    res.status(500).json({ error: 'Failed to submit sick call' });
  }
});

/**
 * Auto-matching and notification workflow
 */
async function startShiftCoverageProcess(sickCallId: string) {
  console.log(`🔄 Starting coverage process for sick call: ${sickCallId}`);
  
  const sickCall = await prisma.sickCall.findUnique({
    where: { id: sickCallId },
    include: {
      shift: {
        include: { location: true },
      },
      staff: true,
    },
  });
  
  if (!sickCall) return;
  
  // Update status to NOTIFYING
  await prisma.sickCall.update({
    where: { id: sickCallId },
    data: { status: 'NOTIFYING' },
  });
  
  // Get top candidates
  const candidates = await MatchingEngine.getTopCandidates(
    sickCall.shiftId,
    sickCall.organizationId,
    sickCall.locationId,
    5 // Top 5 candidates
  );
  
  console.log(`📋 Found ${candidates.length} candidates for sick call ${sickCallId}`);
  
  if (candidates.length === 0) {
    // No candidates available
    await prisma.sickCall.update({
      where: { id: sickCallId },
      data: { status: 'UNFILLED' },
    });
    
    io.to(`org-${sickCall.organizationId}`).emit('sick-call-unfilled', {
      sickCallId,
    });
    
    return;
  }
  
  // Notify first candidate
  const shiftDetails = {
    location: sickCall.shift.location.name,
    date: format(sickCall.shift.date, 'MMM dd'),
    startTime: format(sickCall.shift.startTime, 'h:mm a'),
    endTime: format(sickCall.shift.endTime, 'h:mm a'),
  };
  
  await NotificationService.sendSMS(
    candidates[0].userId,
    sickCallId,
    `🚨 SmartShift: Shift available at ${shiftDetails.location} on ${shiftDetails.date}, ${shiftDetails.startTime}-${shiftDetails.endTime}. Reply YES to accept, NO to decline.`
  );
  
  // Emit real-time update with candidates
  io.to(`org-${sickCall.organizationId}`).emit('candidates-found', {
    sickCallId,
    candidates,
  });
}

/**
 * POST /api/sickcalls/:id/respond
 * Staff responds to shift offer (YES/NO)
 */
router.post('/:id/respond', async (req: AuthRequest, res) => {
  try {
    const { id: sickCallId } = req.params;
    const { responseText } = req.body;
    const staffId = req.user!.id;
    
    const sickCall = await prisma.sickCall.findUnique({
      where: { id: sickCallId },
      include: { shift: true },
    });
    
    if (!sickCall) {
      return res.status(404).json({ error: 'Sick call not found' });
    }
    
    if (sickCall.status === 'COVERED') {
      return res.status(400).json({ error: 'Shift already covered' });
    }
    
    // Parse response
    const responseType = NotificationService.parseResponse(responseText);
    
    if (!responseType) {
      return res.status(400).json({ error: 'Invalid response. Reply YES or NO.' });
    }
    
    // Record response
    const response = await prisma.shiftResponse.create({
      data: {
        sickCallId,
        shiftId: sickCall.shiftId,
        staffId,
        responseType,
        responseText,
      },
      include: {
        staff: true,
      },
    });
    
    // If accepted and shift not yet covered, assign it
    if (responseType === 'ACCEPT' && (sickCall.status as string) !== 'COVERED') {
      await assignShift(sickCallId, staffId);
    }
    
    // Emit real-time update
    io.to(`org-${sickCall.organizationId}`).emit('shift-response', {
      sickCallId,
      response,
    });
    
    res.json({
      response,
      message: responseType === 'ACCEPT' ? 'Shift assigned to you!' : 'Response recorded',
    });
    
  } catch (error) {
    console.error('Response error:', error);
    res.status(500).json({ error: 'Failed to record response' });
  }
});

/**
 * POST /api/sickcalls/:id/assign
 * Manager manually assigns shift to staff
 */
router.post('/:id/assign', authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id: sickCallId } = req.params;
    const { staffId, reason } = req.body;
    const managerId = req.user!.id;
    
    await assignShift(sickCallId, staffId, managerId, reason);
    
    res.json({ message: 'Shift assigned successfully' });
    
  } catch (error) {
    console.error('Manual assignment error:', error);
    res.status(500).json({ error: 'Failed to assign shift' });
  }
});

/**
 * Helper function to assign a shift
 */
async function assignShift(
  sickCallId: string,
  staffId: string,
  managerId?: string,
  reason?: string
) {
  const sickCall = await prisma.sickCall.findUnique({
    where: { id: sickCallId },
    include: { shift: { include: { location: true } } },
  });
  
  if (!sickCall) throw new Error('Sick call not found');
  
  // Update sick call
  await prisma.sickCall.update({
    where: { id: sickCallId },
    data: {
      status: 'COVERED',
      coveredById: staffId,
      coveredAt: new Date(),
    },
  });
  
  // Update shift
  await prisma.shift.update({
    where: { id: sickCall.shiftId },
    data: {
      status: 'COVERED',
      assignedToId: staffId,
    },
  });
  
  // Log audit trail
  await prisma.auditLog.create({
    data: {
      organizationId: sickCall.organizationId,
      userId: managerId || staffId,
      sickCallId,
      action: managerId ? 'MANUAL_ASSIGNMENT' : 'SHIFT_ACCEPTED',
      details: {
        staffId,
        shiftId: sickCall.shiftId,
        reason,
      },
    },
  });
  
  // Notify assigned staff
  const staff = await prisma.user.findUnique({ where: { id: staffId } });
  if (staff) {
    await NotificationService.sendSMS(
      staffId,
      sickCallId,
      `✅ Shift confirmed! ${sickCall.shift.location.name} on ${format(sickCall.shift.date, 'MMM dd')}, ${format(sickCall.shift.startTime, 'h:mm a')}-${format(sickCall.shift.endTime, 'h:mm a')}`
    );
  }
  
  // Emit real-time update
  io.to(`org-${sickCall.organizationId}`).emit('shift-covered', {
    sickCallId,
    staffId,
    shift: sickCall.shift,
  });
}

/**
 * GET /api/sickcalls
 * Get all sick calls (filtered by role)
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const role = req.user!.role;
    const staffId = req.user!.id;
    
    let where: any = { organizationId };
    
    // Staff can only see their own sick calls
    if (role === 'STAFF') {
      where.staffId = staffId;
    }
    
    const sickCalls = await prisma.sickCall.findMany({
      where,
      include: {
        staff: true,
        shift: {
          include: { location: true },
        },
        location: true,
        responses: {
          include: { staff: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({ sickCalls });
    
  } catch (error) {
    console.error('Get sick calls error:', error);
    res.status(500).json({ error: 'Failed to fetch sick calls' });
  }
});

/**
 * GET /api/sickcalls/:id/candidates
 * Get ranked candidates for a sick call
 */
router.get('/:id/candidates', authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id: sickCallId } = req.params;
    const organizationId = req.user!.organizationId;
    
    const sickCall = await prisma.sickCall.findUnique({
      where: { id: sickCallId },
    });
    
    if (!sickCall) {
      return res.status(404).json({ error: 'Sick call not found' });
    }
    
    const candidates = await MatchingEngine.findCandidates(
      sickCall.shiftId,
      organizationId,
      sickCall.locationId
    );
    
    res.json({ candidates });
    
  } catch (error) {
    console.error('Get candidates error:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

export default router;
