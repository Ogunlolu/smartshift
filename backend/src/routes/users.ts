import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../index';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/users
 * Get all users in the organization
 */
router.get('/', authorize('MANAGER', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { organizationId } = req.user!;
    const { role, active } = req.query;
    
    let where: any = { organizationId };
    
    if (role) {
      where.role = role;
    }
    
    if (active !== undefined) {
      where.active = active === 'true';
    }
    
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        active: true,
        seniority: true,
        hireDate: true,
        createdAt: true,
      },
      orderBy: { seniority: 'desc' },
    });
    
    res.json({ users });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/users/:id
 * Get a specific user
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { organizationId, role, id: requesterId } = req.user!;
    
    // Staff can only view their own profile
    if (role === 'STAFF' && id !== requesterId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const user = await prisma.user.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        active: true,
        seniority: true,
        hireDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * PUT /api/users/:id
 * Update a user (Admin only, or self)
 */
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { role, id: requesterId } = req.user!;
    const {
      firstName,
      lastName,
      phone,
      role: newRole,
      active,
      seniority,
      hireDate,
      password,
    } = req.body;
    
    // Staff can only update their own basic info
    if (role === 'STAFF' && id !== requesterId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Only admin can change roles, active status, or seniority
    if (role !== 'ADMIN' && (newRole || active !== undefined || seniority !== undefined)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    const updateData: any = {};
    
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone) updateData.phone = phone;
    
    if (role === 'ADMIN') {
      if (newRole) updateData.role = newRole;
      if (active !== undefined) updateData.active = active;
      if (seniority !== undefined) updateData.seniority = seniority;
      if (hireDate) updateData.hireDate = new Date(hireDate);
    }
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        active: true,
        seniority: true,
        hireDate: true,
        updatedAt: true,
      },
    });
    
    res.json({ user });
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:id
 * Deactivate a user (Admin only)
 */
router.delete('/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    await prisma.user.update({
      where: { id },
      data: { active: false },
    });
    
    res.json({ message: 'User deactivated successfully' });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

export default router;
