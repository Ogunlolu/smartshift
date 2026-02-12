import express from 'express';
import { prisma } from '../index';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/shifts
 * Get all shifts for the organization
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { organizationId, role, id: userId } = req.user!;
    const { startDate, endDate, locationId, status } = req.query;
    
    let where: any = { organizationId };
    
    // Staff can only see their own shifts
    if (role === 'STAFF') {
      where.assignedToId = userId;
    }
    
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }
    
    if (locationId) {
      where.locationId = locationId;
    }
    
    if (status) {
      where.status = status;
    }
    
    const shifts = await prisma.shift.findMany({
      where,
      include: {
        location: true,
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    
    res.json({ shifts });
    
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

/**
 * GET /api/shifts/next
 * Get the next scheduled shift for a staff member
 */
router.get('/next', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    
    const nextShift = await prisma.shift.findFirst({
      where: {
        assignedToId: userId,
        date: { gte: new Date() },
        status: 'SCHEDULED',
      },
      include: {
        location: true,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    
    res.json({ shift: nextShift });
    
  } catch (error) {
    console.error('Get next shift error:', error);
    res.status(500).json({ error: 'Failed to fetch next shift' });
  }
});

/**
 * POST /api/shifts
 * Create a new shift (Manager/Admin only)
 */
router.post('/', authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { organizationId } = req.user!;
    const { locationId, assignedToId, date, startTime, endTime, role } = req.body;
    
    const shift = await prisma.shift.create({
      data: {
        organizationId,
        locationId,
        assignedToId,
        date: new Date(date),
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        role,
        status: 'SCHEDULED',
      },
      include: {
        location: true,
        assignedTo: true,
      },
    });
    
    res.status(201).json({ shift });
    
  } catch (error) {
    console.error('Create shift error:', error);
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

/**
 * PUT /api/shifts/:id
 * Update a shift (Manager/Admin only)
 */
router.put('/:id', authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { locationId, assignedToId, date, startTime, endTime, role, status } = req.body;
    
    const shift = await prisma.shift.update({
      where: { id },
      data: {
        ...(locationId && { locationId }),
        ...(assignedToId !== undefined && { assignedToId }),
        ...(date && { date: new Date(date) }),
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime && { endTime: new Date(endTime) }),
        ...(role !== undefined && { role }),
        ...(status && { status }),
      },
      include: {
        location: true,
        assignedTo: true,
      },
    });
    
    res.json({ shift });
    
  } catch (error) {
    console.error('Update shift error:', error);
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

/**
 * DELETE /api/shifts/:id
 * Delete a shift (Manager/Admin only)
 */
router.delete('/:id', authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    await prisma.shift.delete({
      where: { id },
    });
    
    res.json({ message: 'Shift deleted successfully' });
    
  } catch (error) {
    console.error('Delete shift error:', error);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

export default router;
