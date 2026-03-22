import { PrismaClient } from '@prisma/client';

// Deep mock of PrismaClient for testing
const mockMethods = () => ({
  findMany: jest.fn().mockResolvedValue([]),
  findFirst: jest.fn().mockResolvedValue(null),
  findUnique: jest.fn().mockResolvedValue(null),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  upsert: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
});

export const prismaMock = {
  user: mockMethods(),
  organization: mockMethods(),
  location: mockMethods(),
  shift: mockMethods(),
  sickCall: mockMethods(),
  notification: mockMethods(),
  shiftResponse: mockMethods(),
  auditLog: mockMethods(),
  shiftTemplate: mockMethods(),
  scheduleAssignment: mockMethods(),
  weeklyDefault: mockMethods(),
  scheduleAuditLog: mockMethods(),
  $disconnect: jest.fn(),
  $connect: jest.fn(),
} as unknown as PrismaClient;

// Mock the prisma module
jest.mock('../lib/prisma', () => ({
  prisma: prismaMock,
}));
