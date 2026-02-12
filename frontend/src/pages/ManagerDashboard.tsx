import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import type { DashboardStats, MatchedCandidate } from '@shared/types';

interface ActiveSickCall {
  id: string;
  status: string;
  createdAt: string;
  staff: {
    firstName: string;
    lastName: string;
  };
  shift: {
    date: string;
    startTime: string;
    endTime: string;
    location: {
      name: string;
    };
  };
  responses: any[];
  notifications: any[];
}

export default function ManagerDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeSickCalls, setActiveSickCalls] = useState<ActiveSickCall[]>([]);
  const [selectedSickCall, setSelectedSickCall] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MatchedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadDashboard();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const [statsRes, sickCallsRes] = await Promise.all([
        api.getDashboardStats(),
        api.getActiveSickCalls(),
      ]);
      
      setStats(statsRes.stats);
      setActiveSickCalls(sickCallsRes.sickCalls);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  };

  const loadCandidates = async (sickCallId: string) => {
    try {
      setSelectedSickCall(sickCallId);
      const res = await api.getCandidates(sickCallId);
      setCandidates(res.candidates);
    } catch (error) {
      console.error('Failed to load candidates:', error);
    }
  };

  const handleAssign = async (sickCallId: string, staffId: string) => {
    if (!confirm('Assign this shift to the selected staff member?')) return;

    setAssigning(true);
    try {
      await api.assignShift(sickCallId, staffId);
      alert('Shift assigned successfully!');
      loadDashboard();
      setSelectedSickCall(null);
      setCandidates([]);
    } catch (error: any) {
      alert(error.message || 'Failed to assign shift');
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">
          Manager Dashboard
        </h1>
        <p className="text-gray-600">
          Real-time shift coverage monitoring and management
        </p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-600">Active Sick Calls</p>
              <div className="w-8 h-8 bg-accent-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-accent-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-display font-bold text-gray-900">{stats.activeSickCalls}</p>
            <p className="text-xs text-gray-500 mt-1">Pending or notifying</p>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-600">Covered Today</p>
              <div className="w-8 h-8 bg-success-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-success-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-display font-bold text-gray-900">{stats.coveredToday}</p>
            <p className="text-xs text-gray-500 mt-1">Successfully filled</p>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-600">Unfilled Shifts</p>
              <div className="w-8 h-8 bg-danger-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-danger-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-display font-bold text-gray-900">{stats.unfilledShifts}</p>
            <p className="text-xs text-gray-500 mt-1">Need attention</p>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-600">Avg Time to Fill</p>
              <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-display font-bold text-gray-900">{stats.avgTimeToFill}</p>
            <p className="text-xs text-gray-500 mt-1">Minutes average</p>
          </div>
        </div>
      )}

      {/* Active Sick Calls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sick Calls List */}
        <div>
          <h2 className="text-xl font-display font-semibold text-gray-900 mb-4">
            Active Sick Calls ({activeSickCalls.length})
          </h2>

          {activeSickCalls.length === 0 ? (
            <div className="card text-center py-12">
              <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-success-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
              </div>
              <p className="text-gray-600 text-lg">All shifts covered!</p>
              <p className="text-sm text-gray-500 mt-2">No active sick calls at the moment</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeSickCalls.map((sickCall) => (
                <div
                  key={sickCall.id}
                  className={`card cursor-pointer transition-all hover:shadow-lg ${
                    selectedSickCall === sickCall.id ? 'ring-2 ring-primary-500' : ''
                  }`}
                  onClick={() => loadCandidates(sickCall.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {sickCall.staff.firstName} {sickCall.staff.lastName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(sickCall.shift.date), 'MMM d')} • {format(new Date(sickCall.shift.startTime), 'h:mm a')}
                      </p>
                      <p className="text-sm text-gray-500">{sickCall.shift.location.name}</p>
                    </div>
                    <span className={`badge badge-${sickCall.status.toLowerCase()}`}>
                      {sickCall.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">
                      {sickCall.notifications.length} notified
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500">
                      {sickCall.responses.length} responses
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Candidates Panel */}
        <div>
          <h2 className="text-xl font-display font-semibold text-gray-900 mb-4">
            Ranked Candidates
          </h2>

          {!selectedSickCall ? (
            <div className="card text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-gray-600">Select a sick call to see candidates</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-600">Loading candidates...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.slice(0, 10).map((candidate) => (
                <div key={candidate.userId} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-semibold">
                        #{candidate.rank}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          {candidate.user.firstName} {candidate.user.lastName}
                        </p>
                        <p className="text-sm text-gray-600">Score: {candidate.score}</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleAssign(selectedSickCall, candidate.userId)}
                      disabled={assigning || !candidate.isAvailable}
                      className="btn btn-success btn-sm"
                    >
                      Assign
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {candidate.reasons.map((reason, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
