import { prismaMock } from './prisma-mock';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper to generate a valid auth token
function authToken(overrides: Partial<{ id: string; email: string; role: string; organizationId: string }> = {}) {
  return jwt.sign(
    {
      id: overrides.id || 'user-1',
      email: overrides.email || 'manager@test.com',
      role: overrides.role || 'MANAGER',
      organizationId: overrides.organizationId || 'org-1',
    },
    JWT_SECRET,
    { expiresIn: '1h' as any },
  );
}

const managerToken = authToken();
const staffToken = authToken({ id: 'staff-1', role: 'STAFF', email: 'staff@test.com' });

// ============================================
// SHIFT TEMPLATE TESTS
// ============================================
describe('Shift Template API', () => {
  beforeEach(() => jest.clearAllMocks());

  const validTemplate = {
    locationId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Day Shift',
    startTime: '07:00',
    endTime: '15:00',
    color: '#4A90D9',
    requiredStaff: 2,
  };

  describe('POST /api/schedule/shift-templates', () => {
    it('should create a shift template with valid data', async () => {
      (prismaMock.location.findFirst as jest.Mock).mockResolvedValue({ id: validTemplate.locationId, organizationId: 'org-1' });
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaMock.shiftTemplate.create as jest.Mock).mockResolvedValue({
        id: 'template-1',
        organizationId: 'org-1',
        ...validTemplate,
        isActive: true,
        sortOrder: 0,
      });

      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validTemplate);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Day Shift');
      expect(res.body.requiredStaff).toBe(2);
    });

    it('should reject duplicate template name at same location', async () => {
      (prismaMock.location.findFirst as jest.Mock).mockResolvedValue({ id: validTemplate.locationId, organizationId: 'org-1' });
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue({ id: 'existing', name: 'Day Shift' });

      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validTemplate);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('should reject invalid time format', async () => {
      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validTemplate, startTime: '7:00' });

      expect(res.status).toBe(400);
    });

    it('should reject times not in 15-min increments', async () => {
      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validTemplate, startTime: '07:10' });

      expect(res.status).toBe(400);
    });

    it('should reject requiredStaff > 20', async () => {
      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validTemplate, requiredStaff: 21 });

      expect(res.status).toBe(400);
    });

    it('should reject requiredStaff < 1', async () => {
      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validTemplate, requiredStaff: 0 });

      expect(res.status).toBe(400);
    });

    it('should reject STAFF role', async () => {
      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(validTemplate);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .send(validTemplate);

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent location', async () => {
      (prismaMock.location.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validTemplate);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/schedule/shift-templates', () => {
    it('should list templates for a location', async () => {
      const templates = [
        { id: '1', name: 'Day Shift', startTime: '07:00', endTime: '15:00', sortOrder: 0 },
        { id: '2', name: 'Evening', startTime: '15:00', endTime: '23:00', sortOrder: 1 },
      ];
      (prismaMock.shiftTemplate.findMany as jest.Mock).mockResolvedValue(templates);

      const res = await request(app)
        .get('/api/schedule/shift-templates?locationId=loc-1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Day Shift');
    });

    it('should require locationId parameter', async () => {
      const res = await request(app)
        .get('/api/schedule/shift-templates')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/schedule/shift-templates/:id', () => {
    it('should update a template', async () => {
      (prismaMock.shiftTemplate.findFirst as jest.Mock)
        .mockResolvedValueOnce({
          id: 'template-1',
          organizationId: 'org-1',
          locationId: 'loc-1',
          name: 'Day Shift',
        })
        .mockResolvedValueOnce(null); // no duplicate found
      (prismaMock.shiftTemplate.update as jest.Mock).mockResolvedValue({
        id: 'template-1',
        name: 'Morning Shift',
        requiredStaff: 3,
      });

      const res = await request(app)
        .put('/api/schedule/shift-templates/template-1')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Morning Shift', requiredStaff: 3 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Morning Shift');
    });

    it('should return 404 for non-existent template', async () => {
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .put('/api/schedule/shift-templates/nonexistent')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/schedule/shift-templates/:id', () => {
    it('should soft-delete a template', async () => {
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue({
        id: 'template-1',
        organizationId: 'org-1',
        isActive: true,
      });
      (prismaMock.shiftTemplate.update as jest.Mock).mockResolvedValue({ id: 'template-1', isActive: false });

      const res = await request(app)
        .delete('/api/schedule/shift-templates/template-1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deactivated');
      expect(prismaMock.shiftTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-1' },
        data: { isActive: false },
      });
    });

    it('should return 404 for already-deactivated template', async () => {
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/schedule/shift-templates/nonexistent')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
    });
  });
});

// ============================================
// SCHEDULE ASSIGNMENT TESTS
// ============================================
describe('Schedule Assignment API', () => {
  beforeEach(() => jest.clearAllMocks());

  const validAssignment = {
    locationId: '550e8400-e29b-41d4-a716-446655440000',
    shiftTemplateId: '550e8400-e29b-41d4-a716-446655440001',
    staffId: '550e8400-e29b-41d4-a716-446655440002',
    date: '2026-03-23',
  };

  describe('POST /api/schedule/assignments', () => {
    it('should create an assignment with valid data', async () => {
      (prismaMock.location.findFirst as jest.Mock).mockResolvedValue({ id: validAssignment.locationId });
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue({ id: validAssignment.shiftTemplateId });
      (prismaMock.user.findFirst as jest.Mock).mockResolvedValue({ id: validAssignment.staffId });
      (prismaMock.scheduleAssignment.create as jest.Mock).mockResolvedValue({
        id: 'assignment-1',
        ...validAssignment,
        status: 'SCHEDULED',
        organizationId: 'org-1',
      });
      (prismaMock.scheduleAuditLog.create as jest.Mock).mockResolvedValue({});

      const res = await request(app)
        .post('/api/schedule/assignments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validAssignment);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('SCHEDULED');
    });

    it('should return 404 if location not found', async () => {
      (prismaMock.location.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (prismaMock.user.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });

      const res = await request(app)
        .post('/api/schedule/assignments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validAssignment);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Location');
    });

    it('should return 404 if shift template not found', async () => {
      (prismaMock.location.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue(null);
      (prismaMock.user.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });

      const res = await request(app)
        .post('/api/schedule/assignments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validAssignment);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Shift template');
    });

    it('should return 404 if staff not found', async () => {
      (prismaMock.location.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (prismaMock.user.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/schedule/assignments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validAssignment);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Staff');
    });

    it('should return 409 for duplicate assignment', async () => {
      (prismaMock.location.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (prismaMock.shiftTemplate.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (prismaMock.user.findFirst as jest.Mock).mockResolvedValue({ id: 'x' });
      (prismaMock.scheduleAssignment.create as jest.Mock).mockRejectedValue({ code: 'P2002' });

      const res = await request(app)
        .post('/api/schedule/assignments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validAssignment);

      expect(res.status).toBe(409);
    });

    it('should reject invalid date format', async () => {
      const res = await request(app)
        .post('/api/schedule/assignments')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validAssignment, date: 'March 23' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/schedule/assignments', () => {
    it('should return assignments for a date range', async () => {
      (prismaMock.scheduleAssignment.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.shiftTemplate.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.user.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/schedule/assignments?locationId=loc-1&startDate=2026-03-23&endDate=2026-03-29')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('assignments');
      expect(res.body).toHaveProperty('shiftTemplates');
      expect(res.body).toHaveProperty('staffList');
    });

    it('should require all query parameters', async () => {
      const res = await request(app)
        .get('/api/schedule/assignments?locationId=loc-1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/schedule/assignments/:id', () => {
    it('should update assignment status', async () => {
      (prismaMock.scheduleAssignment.findFirst as jest.Mock).mockResolvedValue({
        id: 'a-1',
        organizationId: 'org-1',
        status: 'SCHEDULED',
      });
      (prismaMock.scheduleAssignment.update as jest.Mock).mockResolvedValue({
        id: 'a-1',
        status: 'CANCELLED',
      });
      (prismaMock.scheduleAuditLog.create as jest.Mock).mockResolvedValue({});

      const res = await request(app)
        .put('/api/schedule/assignments/a-1')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('should reject invalid status values', async () => {
      const res = await request(app)
        .put('/api/schedule/assignments/a-1')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'INVALID' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/schedule/assignments/:id', () => {
    it('should delete an assignment', async () => {
      (prismaMock.scheduleAssignment.findFirst as jest.Mock).mockResolvedValue({
        id: 'a-1',
        organizationId: 'org-1',
      });
      (prismaMock.scheduleAssignment.delete as jest.Mock).mockResolvedValue({});
      (prismaMock.scheduleAuditLog.create as jest.Mock).mockResolvedValue({});

      const res = await request(app)
        .delete('/api/schedule/assignments/a-1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent assignment', async () => {
      (prismaMock.scheduleAssignment.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/schedule/assignments/nonexistent')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
    });
  });
});

// ============================================
// WEEKLY DEFAULTS TESTS
// ============================================
describe('Weekly Defaults API', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/schedule/weekly-defaults', () => {
    const validDefault = {
      locationId: '550e8400-e29b-41d4-a716-446655440000',
      shiftTemplateId: '550e8400-e29b-41d4-a716-446655440001',
      staffId: '550e8400-e29b-41d4-a716-446655440002',
      dayOfWeek: 1,
    };

    it('should create a weekly default', async () => {
      (prismaMock.weeklyDefault.create as jest.Mock).mockResolvedValue({
        id: 'wd-1',
        ...validDefault,
        organizationId: 'org-1',
      });
      (prismaMock.scheduleAuditLog.create as jest.Mock).mockResolvedValue({});

      const res = await request(app)
        .post('/api/schedule/weekly-defaults')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validDefault);

      expect(res.status).toBe(201);
    });

    it('should reject dayOfWeek > 6', async () => {
      const res = await request(app)
        .post('/api/schedule/weekly-defaults')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validDefault, dayOfWeek: 7 });

      expect(res.status).toBe(400);
    });

    it('should reject dayOfWeek < 0', async () => {
      const res = await request(app)
        .post('/api/schedule/weekly-defaults')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...validDefault, dayOfWeek: -1 });

      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate defaults', async () => {
      (prismaMock.weeklyDefault.create as jest.Mock).mockRejectedValue({ code: 'P2002' });

      const res = await request(app)
        .post('/api/schedule/weekly-defaults')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(validDefault);

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/schedule/weekly-defaults', () => {
    it('should list defaults for a location', async () => {
      (prismaMock.weeklyDefault.findMany as jest.Mock).mockResolvedValue([
        { id: 'wd-1', dayOfWeek: 1, staffId: 'staff-1' },
      ]);

      const res = await request(app)
        .get('/api/schedule/weekly-defaults?locationId=loc-1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should require locationId', async () => {
      const res = await request(app)
        .get('/api/schedule/weekly-defaults')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/schedule/weekly-defaults/:id', () => {
    it('should delete a weekly default', async () => {
      (prismaMock.weeklyDefault.findFirst as jest.Mock).mockResolvedValue({ id: 'wd-1', organizationId: 'org-1' });
      (prismaMock.weeklyDefault.delete as jest.Mock).mockResolvedValue({});
      (prismaMock.scheduleAuditLog.create as jest.Mock).mockResolvedValue({});

      const res = await request(app)
        .delete('/api/schedule/weekly-defaults/wd-1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent default', async () => {
      (prismaMock.weeklyDefault.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/schedule/weekly-defaults/nonexistent')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
    });
  });
});

// ============================================
// MY SHIFTS TESTS
// ============================================
describe('My Shifts API', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/schedule/my-shifts', () => {
    it('should return staff member shifts', async () => {
      (prismaMock.scheduleAssignment.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'a-1',
          date: '2026-03-23',
          status: 'SCHEDULED',
          shiftTemplate: { name: 'Day Shift', startTime: '07:00', endTime: '15:00' },
          location: { name: 'Maple House' },
        },
      ]);

      const res = await request(app)
        .get('/api/schedule/my-shifts')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.shifts).toHaveLength(1);
    });

    it('should work with past=true', async () => {
      (prismaMock.scheduleAssignment.findMany as jest.Mock).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/schedule/my-shifts?past=true')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
    });
  });
});

// ============================================
// SCHEDULE STATS TESTS
// ============================================
describe('Schedule Stats API', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/schedule/stats', () => {
    it('should return schedule statistics', async () => {
      (prismaMock.scheduleAssignment.findMany as jest.Mock).mockResolvedValue([
        {
          staffId: 'staff-1',
          status: 'SCHEDULED',
          staff: { firstName: 'Jane', lastName: 'Doe' },
          shiftTemplate: { startTime: '07:00', endTime: '15:00' },
        },
        {
          staffId: 'staff-1',
          status: 'SICK_CALL',
          staff: { firstName: 'Jane', lastName: 'Doe' },
          shiftTemplate: { startTime: '07:00', endTime: '15:00' },
        },
      ]);

      const res = await request(app)
        .get('/api/schedule/stats?locationId=loc-1&startDate=2026-03-23&endDate=2026-03-29')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalShifts).toBe(2);
      expect(res.body.sickCalls).toBe(1);
      expect(res.body.filledShifts).toBe(1);
    });

    it('should require all query parameters', async () => {
      const res = await request(app)
        .get('/api/schedule/stats')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(400);
    });

    it('should reject STAFF role', async () => {
      const res = await request(app)
        .get('/api/schedule/stats?locationId=loc-1&startDate=2026-03-23&endDate=2026-03-29')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
    });
  });
});
