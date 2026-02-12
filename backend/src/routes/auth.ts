import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../index';
import { generateToken } from '../middleware/auth';
interface LoginRequest { email: string; password: string; }

const router = express.Router();

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password }: LoginRequest = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { organization: true },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if user is active
    if (!user.active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }
    
    // Generate JWT
    const token = generateToken(user.id, user.email, user.role, user.organizationId);
    
    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      user: userWithoutPassword,
      token,
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/register
 * Register a new user (typically done by admin)
 */
router.post('/register', async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      role = 'STAFF',
      organizationId,
      seniority,
      hireDate,
    } = req.body;
    
    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone || !organizationId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role,
        organizationId,
        seniority: seniority || null,
        hireDate: hireDate ? new Date(hireDate) : null,
      },
    });
    
    // Log audit trail
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: user.id,
        action: 'USER_CREATED',
        details: {
          email: user.email,
          role: user.role,
        },
      },
    });
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    
    res.status(201).json({
      user: userWithoutPassword,
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/setup
 * Initial setup - create first admin user and organization
 */
router.post('/setup', async (req, res) => {
  try {
    // Check if any users exist
    const userCount = await prisma.user.count();
    
    if (userCount > 0) {
      return res.status(400).json({ error: 'System already initialized' });
    }
    
    const {
      organizationName,
      adminEmail,
      adminPassword,
      adminFirstName,
      adminLastName,
      adminPhone,
    } = req.body;
    
    // Create organization
    const organization = await prisma.organization.create({
      data: {
        name: organizationName,
        active: true,
      },
    });
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail.toLowerCase(),
        password: hashedPassword,
        firstName: adminFirstName,
        lastName: adminLastName,
        phone: adminPhone,
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });
    
    // Generate token
    const token = generateToken(adminUser.id, adminUser.email, adminUser.role, adminUser.organizationId);
    
    // Return without password
    const { password: _, ...userWithoutPassword } = adminUser;
    
    res.status(201).json({
      organization,
      user: userWithoutPassword,
      token,
    });
    
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Setup failed' });
  }
});

export default router;
