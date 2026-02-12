import express from 'express';
import { prisma } from '../index';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { startOfDay, subDays, differenceInMinutes } from 'date-fns';

const router = express.Router();
router.use(authenticate);
router.use(authorize('MANAGER', 'ADMIN'));

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const { organizationId } = req.user!;
    const today = startOfDay(new Date());
    
    // Active sick calls (pending or notifying)
    const activeSickCalls = await prisma.sickCall.count({
      where: {
        organizationId,
        status: {
          in: ['PENDING', 'NOTIFYING'],
        },
      },
    });
    
    // Pending sick calls
    const pendingSickCalls = await prisma.sickCall.count({
      where: {
        organizationId,
        status: 'PENDING',
      },
    });
    
    // Covered today
    const coveredToday = await prisma.sickCall.count({
      where: {
        organizationId,
        status: 'COVERED',
        coveredAt: {
          gte: today,
        },
      },
    });
    
    // Unfilled shifts
    const unfilledShifts = await prisma.sickCall.count({
      where: {
        organizationId,
        status: 'UNFILLED',
      },
    });
    
    // Average time to fill (last 30 days)
    const thirtyDaysAgo = subDays(new Date(), 30);
    const coveredSickCalls = await prisma.sickCall.findMany({
      where: {
        organizationId,
        status: 'COVERED',
        coveredAt: {
          gte: thirtyDaysAgo,
        },
      },
      select: {
        createdAt: true,
        coveredAt: true,
      },
    });
    
    let avgTimeToFill = 0;
    if (coveredSickCalls.length > 0) {
      const totalMinutes = coveredSickCalls.reduce((sum, sc) => {
        if (sc.coveredAt) {
          return sum + differenceInMinutes(sc.coveredAt, sc.createdAt);
        }
        return sum;
      }, 0);
      avgTimeToFill = Math.round(totalMinutes / coveredSickCalls.length);
    }
    
    res.json({
      stats: {
        activeSickCalls,
        pendingSickCalls,
        coveredToday,
        unfilledShifts,
        avgTimeToFill,
      },
    });
    
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

/**
 * GET /api/dashboard/recent-activity
 * Get recent activity (sick calls, assignments, etc.)
 */
router.get('/recent-activity', async (req: AuthRequest, res) => {
  try {
    const { organizationId } = req.user!;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const recentActivity = await prisma.auditLog.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sickCall: {
          include: {
            shift: {
              include: {
                location: true,
              },
            },
            staff: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    
    res.json({ activity: recentActivity });
    
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

/**
 * GET /api/dashboard/active-sickcalls
 * Get all active sick calls with full details
 */
router.get('/active-sickcalls', async (req: AuthRequest, res) => {
  try {
    const { organizationId } = req.user!;
    
    const activeSickCalls = await prisma.sickCall.findMany({
      where: {
        organizationId,
        status: {
          in: ['PENDING', 'NOTIFYING', 'UNFILLED'],
        },
      },
      include: {
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        shift: {
          include: {
            location: true,
          },
        },
        location: true,
        notifications: {
          include: {
            recipient: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        responses: {
          include: {
            staff: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({ sickCalls: activeSickCalls });
    
  } catch (error) {
    console.error('Get active sick calls error:', error);
    res.status(500).json({ error: 'Failed to fetch active sick calls' });
  }
});

/**
 * GET /api/dashboard/locations
 * Get all locations with their current status
 */
router.get('/locations', async (req: AuthRequest, res) => {
  try {
    const { organizationId } = req.user!;
    
    const locations = await prisma.location.findMany({
      where: { organizationId, active: true },
      include: {
        shifts: {
          where: {
            date: {
              gte: startOfDay(new Date()),
            },
          },
          include: {
            assignedTo: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            sickCalls: {
              where: {
                status: {
                  in: ['PENDING', 'NOTIFYING'],
                },
              },
            },
          },
        },
      },
    });
    
    res.json({ locations });
    
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

export default router;
