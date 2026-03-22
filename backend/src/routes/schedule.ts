import express from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = express.Router();

// ============================================
// SHIFT TEMPLATE MANAGEMENT
// ============================================

const shiftTemplateSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  startTime: z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'Time must be in HH:MM format with 15-minute increments'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'Time must be in HH:MM format with 15-minute increments'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  requiredStaff: z.number().int().min(1).max(20).default(1),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * POST /api/schedule/shift-templates
 * Create a new shift template for a location
 */
router.post('/shift-templates', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const data = shiftTemplateSchema.parse(req.body);
    const organizationId = req.user!.organizationId;

    // Verify location belongs to this organization
    const location = await prisma.location.findFirst({
      where: { id: data.locationId, organizationId },
    });
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Check for duplicate name at this location (case-insensitive)
    const existing = await prisma.shiftTemplate.findFirst({
      where: {
        organizationId,
        locationId: data.locationId,
        name: { equals: data.name, mode: 'insensitive' },
        isActive: true,
      },
    });
    if (existing) {
      return res.status(409).json({ error: 'A shift template with this name already exists at this location' });
    }

    const template = await prisma.shiftTemplate.create({
      data: {
        ...data,
        organizationId,
      },
    });

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating shift template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/schedule/shift-templates?locationId=xxx
 * List shift templates for a location
 */
router.get('/shift-templates', authenticate, async (req: AuthRequest, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const locationId = req.query.locationId as string;

    if (!locationId) {
      return res.status(400).json({ error: 'locationId query parameter is required' });
    }

    const templates = await prisma.shiftTemplate.findMany({
      where: {
        organizationId,
        locationId,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    res.json(templates);
  } catch (error) {
    console.error('Error fetching shift templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/schedule/shift-templates/:id
 * Update a shift template
 */
router.put('/shift-templates/:id', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;

    const updateSchema = shiftTemplateSchema.partial().omit({ locationId: true });
    const data = updateSchema.parse(req.body);

    const existing = await prisma.shiftTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Shift template not found' });
    }

    // If renaming, check for duplicate
    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.shiftTemplate.findFirst({
        where: {
          organizationId,
          locationId: existing.locationId,
          name: { equals: data.name, mode: 'insensitive' },
          isActive: true,
          id: { not: id },
        },
      });
      if (duplicate) {
        return res.status(409).json({ error: 'A shift template with this name already exists at this location' });
      }
    }

    const updated = await prisma.shiftTemplate.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating shift template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/schedule/shift-templates/:id
 * Soft-delete a shift template (sets isActive = false)
 */
router.delete('/shift-templates/:id', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;

    const existing = await prisma.shiftTemplate.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Shift template not found' });
    }

    await prisma.shiftTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: 'Shift template deactivated' });
  } catch (error) {
    console.error('Error deleting shift template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// SCHEDULE ASSIGNMENTS
// ============================================

const assignmentSchema = z.object({
  locationId: z.string().uuid(),
  shiftTemplateId: z.string().uuid(),
  staffId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(200).optional(),
});

/**
 * GET /api/schedule/assignments?locationId=xxx&startDate=2026-03-23&endDate=2026-03-29
 */
router.get('/assignments', authenticate, async (req: AuthRequest, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const { locationId, startDate, endDate } = req.query;

    if (!locationId || !startDate || !endDate) {
      return res.status(400).json({ error: 'locationId, startDate, and endDate are required' });
    }

    const assignments = await prisma.scheduleAssignment.findMany({
      where: {
        organizationId,
        locationId: locationId as string,
        date: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        },
      },
      include: {
        shiftTemplate: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'asc' }, { shiftTemplate: { sortOrder: 'asc' } }],
    });

    const shiftTemplates = await prisma.shiftTemplate.findMany({
      where: { organizationId, locationId: locationId as string, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const staffList = await prisma.user.findMany({
      where: { organizationId, active: true, role: 'STAFF' },
      select: { id: true, firstName: true, lastName: true, seniority: true },
      orderBy: { lastName: 'asc' },
    });

    res.json({
      assignments,
      shiftTemplates,
      staffList,
      weekStart: startDate,
      weekEnd: endDate,
    });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/schedule/assignments
 * Create a single schedule assignment
 */
router.post('/assignments', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const data = assignmentSchema.parse(req.body);
    const organizationId = req.user!.organizationId;
    const createdBy = req.user!.id;

    // Verify all references exist in this org
    const [location, template, staff] = await Promise.all([
      prisma.location.findFirst({ where: { id: data.locationId, organizationId } }),
      prisma.shiftTemplate.findFirst({ where: { id: data.shiftTemplateId, organizationId, isActive: true } }),
      prisma.user.findFirst({ where: { id: data.staffId, organizationId, active: true } }),
    ]);

    if (!location) return res.status(404).json({ error: 'Location not found' });
    if (!template) return res.status(404).json({ error: 'Shift template not found' });
    if (!staff) return res.status(404).json({ error: 'Staff member not found' });

    const assignment = await prisma.scheduleAssignment.create({
      data: {
        organizationId,
        locationId: data.locationId,
        shiftTemplateId: data.shiftTemplateId,
        staffId: data.staffId,
        date: new Date(data.date),
        notes: data.notes,
        createdBy,
      },
      include: {
        shiftTemplate: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Audit log
    await prisma.scheduleAuditLog.create({
      data: {
        organizationId,
        assignmentId: assignment.id,
        action: 'ASSIGNMENT_CREATED',
        performedBy: createdBy,
        details: { staffId: data.staffId, date: data.date, shiftTemplateId: data.shiftTemplateId },
      },
    });

    res.status(201).json(assignment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    // Handle unique constraint violation
    if ((error as any)?.code === 'P2002') {
      return res.status(409).json({ error: 'This staff member is already assigned to this shift on this date' });
    }
    console.error('Error creating assignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/schedule/assignments/:id
 */
router.put('/assignments/:id', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;

    const updateSchema = z.object({
      status: z.enum(['SCHEDULED', 'SICK_CALL', 'COVERED', 'CANCELLED', 'NO_SHOW']).optional(),
      notes: z.string().max(200).optional(),
    });
    const data = updateSchema.parse(req.body);

    const existing = await prisma.scheduleAssignment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const updated = await prisma.scheduleAssignment.update({
      where: { id },
      data,
      include: {
        shiftTemplate: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.scheduleAuditLog.create({
      data: {
        organizationId,
        assignmentId: id,
        action: 'ASSIGNMENT_UPDATED',
        performedBy: req.user!.id,
        details: { before: existing, after: data },
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/schedule/assignments/:id
 */
router.delete('/assignments/:id', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;

    const existing = await prisma.scheduleAssignment.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    await prisma.scheduleAssignment.delete({ where: { id } });

    await prisma.scheduleAuditLog.create({
      data: {
        organizationId,
        assignmentId: id,
        action: 'ASSIGNMENT_DELETED',
        performedBy: req.user!.id,
        details: { deleted: existing },
      },
    });

    res.json({ message: 'Assignment deleted' });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/schedule/assignments/bulk
 * Apply weekly defaults to a date range
 */
router.post('/assignments/bulk', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const bulkSchema = z.object({
      locationId: z.string().uuid(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      overwriteExisting: z.boolean().default(false),
    });
    const data = bulkSchema.parse(req.body);
    const organizationId = req.user!.organizationId;
    const createdBy = req.user!.id;

    // Get weekly defaults for this location
    const defaults = await prisma.weeklyDefault.findMany({
      where: { organizationId, locationId: data.locationId },
      include: { staff: { select: { id: true, active: true } } },
    });

    if (defaults.length === 0) {
      return res.status(400).json({ error: 'No weekly defaults configured for this location' });
    }

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const created: any[] = [];
    const skipped: any[] = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const dateStr = d.toISOString().split('T')[0];

      const dayDefaults = defaults.filter(def => def.dayOfWeek === dayOfWeek && def.staff.active);

      for (const def of dayDefaults) {
        if (!data.overwriteExisting) {
          const existing = await prisma.scheduleAssignment.findFirst({
            where: {
              locationId: data.locationId,
              shiftTemplateId: def.shiftTemplateId,
              staffId: def.staffId,
              date: new Date(dateStr),
            },
          });
          if (existing) {
            skipped.push({ date: dateStr, staffId: def.staffId, shiftTemplateId: def.shiftTemplateId });
            continue;
          }
        }

        try {
          const assignment = await prisma.scheduleAssignment.upsert({
            where: {
              locationId_shiftTemplateId_staffId_date: {
                locationId: data.locationId,
                shiftTemplateId: def.shiftTemplateId,
                staffId: def.staffId,
                date: new Date(dateStr),
              },
            },
            update: { status: 'SCHEDULED', notes: null, createdBy },
            create: {
              organizationId,
              locationId: data.locationId,
              shiftTemplateId: def.shiftTemplateId,
              staffId: def.staffId,
              date: new Date(dateStr),
              createdBy,
            },
          });
          created.push(assignment);
        } catch {
          // Skip constraint violations silently
        }
      }
    }

    // Single audit log for bulk operation
    await prisma.scheduleAuditLog.create({
      data: {
        organizationId,
        action: 'SCHEDULE_PUBLISHED',
        performedBy: createdBy,
        details: {
          locationId: data.locationId,
          startDate: data.startDate,
          endDate: data.endDate,
          created: created.length,
          skipped: skipped.length,
        },
      },
    });

    res.status(201).json({
      message: `Created ${created.length} assignments, skipped ${skipped.length}`,
      created: created.length,
      skipped: skipped.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error bulk creating assignments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// WEEKLY DEFAULTS
// ============================================

/**
 * GET /api/schedule/weekly-defaults?locationId=xxx
 */
router.get('/weekly-defaults', authenticate, async (req: AuthRequest, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const locationId = req.query.locationId as string;

    if (!locationId) {
      return res.status(400).json({ error: 'locationId query parameter is required' });
    }

    const defaults = await prisma.weeklyDefault.findMany({
      where: { organizationId, locationId },
      include: {
        shiftTemplate: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { shiftTemplate: { sortOrder: 'asc' } }],
    });

    res.json(defaults);
  } catch (error) {
    console.error('Error fetching weekly defaults:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/schedule/weekly-defaults
 */
router.post('/weekly-defaults', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      locationId: z.string().uuid(),
      shiftTemplateId: z.string().uuid(),
      staffId: z.string().uuid(),
      dayOfWeek: z.number().int().min(0).max(6),
    });
    const data = schema.parse(req.body);
    const organizationId = req.user!.organizationId;

    const weeklyDefault = await prisma.weeklyDefault.create({
      data: { ...data, organizationId },
      include: {
        shiftTemplate: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.scheduleAuditLog.create({
      data: {
        organizationId,
        action: 'WEEKLY_DEFAULT_SET',
        performedBy: req.user!.id,
        details: data,
      },
    });

    res.status(201).json(weeklyDefault);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if ((error as any)?.code === 'P2002') {
      return res.status(409).json({ error: 'This weekly default already exists' });
    }
    console.error('Error creating weekly default:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/schedule/weekly-defaults/:id
 */
router.delete('/weekly-defaults/:id', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;

    const existing = await prisma.weeklyDefault.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Weekly default not found' });
    }

    await prisma.weeklyDefault.delete({ where: { id } });

    await prisma.scheduleAuditLog.create({
      data: {
        organizationId,
        action: 'WEEKLY_DEFAULT_REMOVED',
        performedBy: req.user!.id,
        details: { deleted: existing },
      },
    });

    res.json({ message: 'Weekly default removed' });
  } catch (error) {
    console.error('Error deleting weekly default:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// MY SHIFTS (Staff View)
// ============================================

/**
 * GET /api/schedule/my-shifts?startDate=xxx&endDate=xxx&past=true
 */
router.get('/my-shifts', authenticate, async (req: AuthRequest, res) => {
  try {
    const staffId = req.user!.id;
    const organizationId = req.user!.organizationId;
    const past = req.query.past === 'true';

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (past) {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      endDate = now;
    } else {
      startDate = req.query.startDate ? new Date(req.query.startDate as string) : now;
      endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    }

    const shifts = await prisma.scheduleAssignment.findMany({
      where: {
        staffId,
        organizationId,
        date: { gte: startDate, lte: endDate },
      },
      include: {
        shiftTemplate: true,
        location: { select: { id: true, name: true, address: true } },
      },
      orderBy: past ? { date: 'desc' } : { date: 'asc' },
    });

    res.json({ shifts });
  } catch (error) {
    console.error('Error fetching my shifts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// SCHEDULE STATS
// ============================================

/**
 * GET /api/schedule/stats?locationId=xxx&startDate=xxx&endDate=xxx
 */
router.get('/stats', authenticate, authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const { locationId, startDate, endDate } = req.query;

    if (!locationId || !startDate || !endDate) {
      return res.status(400).json({ error: 'locationId, startDate, and endDate are required' });
    }

    const assignments = await prisma.scheduleAssignment.findMany({
      where: {
        organizationId,
        locationId: locationId as string,
        date: { gte: new Date(startDate as string), lte: new Date(endDate as string) },
      },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true } },
        shiftTemplate: true,
      },
    });

    const totalShifts = assignments.length;
    const sickCalls = assignments.filter(a => a.status === 'SICK_CALL').length;
    const covered = assignments.filter(a => a.status === 'COVERED').length;
    const scheduled = assignments.filter(a => a.status === 'SCHEDULED').length;

    // Staff utilization
    const staffMap = new Map<string, { name: string; shifts: number; hours: number }>();
    for (const a of assignments) {
      const key = a.staffId;
      const existing = staffMap.get(key) || { name: `${a.staff.firstName} ${a.staff.lastName}`, shifts: 0, hours: 0 };
      existing.shifts++;
      // Calculate hours from shift template times
      const [sh, sm] = a.shiftTemplate.startTime.split(':').map(Number);
      const [eh, em] = a.shiftTemplate.endTime.split(':').map(Number);
      let hours = (eh * 60 + em - sh * 60 - sm) / 60;
      if (hours <= 0) hours += 24; // overnight
      existing.hours += hours;
      staffMap.set(key, existing);
    }

    res.json({
      totalShifts,
      filledShifts: scheduled + covered,
      sickCalls,
      coveredSickCalls: covered,
      coverageRate: sickCalls > 0 ? `${((covered / sickCalls) * 100).toFixed(1)}%` : '100%',
      staffUtilization: Array.from(staffMap.entries()).map(([staffId, data]) => ({
        staffId,
        name: data.name,
        shiftsThisWeek: data.shifts,
        hoursThisWeek: data.hours,
      })),
    });
  } catch (error) {
    console.error('Error fetching schedule stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
