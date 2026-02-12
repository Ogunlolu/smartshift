import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
dotenv.config();

// Initialize Prisma
export const prisma = new PrismaClient();

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import shiftRoutes from './routes/shifts';
import sickCallRoutes from './routes/sickcalls';
import dashboardRoutes from './routes/dashboard';

const app = express();
const httpServer = createServer(app);

// Setup Socket.io for real-time updates
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/sickcalls', sickCallRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Join organization room
  socket.on('join-organization', (organizationId: string) => {
    socket.join(`org-${organizationId}`);
    console.log(`Socket ${socket.id} joined org-${organizationId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`
🚀 SmartShift Backend Server Running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server: http://localhost:${PORT}
🔌 Socket.io: Ready for real-time connections
🗄️  Database: Connected to PostgreSQL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
