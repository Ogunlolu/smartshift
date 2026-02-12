import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../../shared/types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    organizationId: string;
  };
}

export const generateToken = (userId: string, email: string, role: UserRole, organizationId: string): string => {
  return jwt.sign(
    { id: userId, email, role, organizationId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Middleware to verify JWT and attach user to request
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = decoded;
  next();
};

// Middleware to check if user has required role
export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

// Middleware to ensure user can only access their own organization's data
export const checkOrganization = (req: AuthRequest, res: Response, next: NextFunction) => {
  const organizationId = req.params.organizationId || req.body.organizationId || req.query.organizationId;
  
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Admins and managers can access their organization
  // Staff can only see their own data (enforced in specific routes)
  if (organizationId && organizationId !== req.user.organizationId) {
    return res.status(403).json({ error: 'Cannot access other organization data' });
  }
  
  next();
};
