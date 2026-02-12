// Shared types between frontend and backend

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
}

export enum ShiftStatus {
  SCHEDULED = 'SCHEDULED',
  SICK_CALL = 'SICK_CALL',
  COVERED = 'COVERED',
  UNFILLED = 'UNFILLED',
  CANCELLED = 'CANCELLED',
}

export enum SickCallStatus {
  PENDING = 'PENDING',
  NOTIFYING = 'NOTIFYING',
  COVERED = 'COVERED',
  UNFILLED = 'UNFILLED',
  CANCELLED = 'CANCELLED',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  RESPONDED = 'RESPONDED',
}

export enum ResponseType {
  ACCEPT = 'ACCEPT',
  DECLINE = 'DECLINE',
  NO_RESPONSE = 'NO_RESPONSE',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: UserRole;
  active: boolean;
  seniority?: number;
  hireDate?: Date;
  organizationId: string;
}

export interface AuthUser extends User {
  token: string;
}

export interface Shift {
  id: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  role?: string;
  status: ShiftStatus;
  locationId: string;
  assignedToId?: string;
  organizationId: string;
}

export interface SickCall {
  id: string;
  staffId: string;
  shiftId: string;
  locationId: string;
  reason?: string;
  status: SickCallStatus;
  consecutiveDates: Date[];
  coveredById?: string;
  coveredAt?: Date;
  createdAt: Date;
  organizationId: string;
}

export interface MatchedCandidate {
  userId: string;
  user: User;
  score: number;
  rank: number;
  reasons: string[];
  isAvailable: boolean;
  willBeOvertime: boolean;
  hoursWorkedThisWeek: number;
}

export interface DashboardStats {
  activeSickCalls: number;
  pendingSickCalls: number;
  coveredToday: number;
  unfilledShifts: number;
  avgTimeToFill: number; // minutes
}

// API Request/Response types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

export interface SickCallSubmission {
  shiftId: string;
  locationId: string;
  reason?: string;
  consecutiveDates?: Date[];
}

export interface ManualAssignment {
  sickCallId: string;
  staffId: string;
  reason?: string;
}

export interface ShiftResponsePayload {
  sickCallId: string;
  responseType: ResponseType;
  responseText?: string;
}
