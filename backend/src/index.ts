import { Server } from 'socket.io';
import { createServer } from 'http';
import app from './app';
import { prisma } from './lib/prisma';
import { setIo } from './lib/socket';
export { prisma };

const httpServer = createServer(app);

// Setup Socket.io for real-time updates
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});
setIo(io);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

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
SmartShift Backend Server Running!
Server: http://localhost:${PORT}
Socket.io: Ready for real-time connections
Database: Connected to PostgreSQL
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
