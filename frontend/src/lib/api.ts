import type {
  User,
  LoginRequest,
  LoginResponse,
  SickCall,
  Shift,
  MatchedCandidate,
  DashboardStats,
} from '../shared-types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class APIClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on init
    this.token = localStorage.getItem('token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============================================
  // AUTH ENDPOINTS
  // ============================================
  
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.setToken(response.token);
    return response;
  }

  async register(userData: any) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async setup(setupData: any) {
    return this.request('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(setupData),
    });
  }

  // ============================================
  // USER ENDPOINTS
  // ============================================
  
  async getUsers(filters?: { role?: string; active?: boolean }) {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.active !== undefined) params.append('active', String(filters.active));
    
    return this.request<{ users: User[] }>(`/users?${params}`);
  }

  async getUser(id: string) {
    return this.request<{ user: User }>(`/users/${id}`);
  }

  // ============================================
  // SHIFT ENDPOINTS
  // ============================================
  
  async getShifts(filters?: {
    startDate?: string;
    endDate?: string;
    locationId?: string;
    status?: string;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    
    return this.request<{ shifts: Shift[] }>(`/shifts?${params}`);
  }

  async getNextShift() {
    return this.request<{ shift: Shift | null }>('/shifts/next');
  }

  async createShift(shiftData: any) {
    return this.request('/shifts', {
      method: 'POST',
      body: JSON.stringify(shiftData),
    });
  }

  async updateShift(id: string, updates: any) {
    return this.request(`/shifts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteShift(id: string) {
    return this.request(`/shifts/${id}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // SICK CALL ENDPOINTS
  // ============================================
  
  async submitSickCall(data: {
    shiftId: string;
    locationId: string;
    reason?: string;
    consecutiveDates?: Date[];
  }) {
    return this.request<{ sickCall: SickCall; message: string }>('/sickcalls/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSickCalls() {
    return this.request<{ sickCalls: SickCall[] }>('/sickcalls');
  }

  async respondToSickCall(sickCallId: string, responseText: string) {
    return this.request(`/sickcalls/${sickCallId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ responseText }),
    });
  }

  async assignShift(sickCallId: string, staffId: string, reason?: string) {
    return this.request(`/sickcalls/${sickCallId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ staffId, reason }),
    });
  }

  async getCandidates(sickCallId: string) {
    return this.request<{ candidates: MatchedCandidate[] }>(
      `/sickcalls/${sickCallId}/candidates`
    );
  }

  // ============================================
  // DASHBOARD ENDPOINTS
  // ============================================
  
  async getDashboardStats() {
    return this.request<{ stats: DashboardStats }>('/dashboard/stats');
  }

  async getRecentActivity(limit?: number) {
    const params = limit ? `?limit=${limit}` : '';
    return this.request(`/dashboard/recent-activity${params}`);
  }

  async getActiveSickCalls() {
    return this.request<{ sickCalls: any[] }>('/dashboard/active-sickcalls');
  }

  async getLocations() {
    return this.request<{ locations: any[] }>('/dashboard/locations');
  }
}

export const api = new APIClient();
