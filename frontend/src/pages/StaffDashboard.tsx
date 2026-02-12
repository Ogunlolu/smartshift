import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import type { Shift, SickCall } from '../shared-types';

export default function StaffDashboard() {
  const [nextShift, setNextShift] = useState<Shift | null>(null);
  const [mySickCalls, setMySickCalls] = useState<SickCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [shiftRes, sickCallsRes] = await Promise.all([
        api.getNextShift(),
        api.getSickCalls(),
      ]);
      
      setNextShift(shiftRes.shift);
      setMySickCalls(sickCallsRes.sickCalls);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextShift) return;

    setSubmitting(true);
    try {
      await api.submitSickCall({
        shiftId: nextShift.id,
        locationId: nextShift.locationId,
        reason: reason.trim() || undefined,
      });

      setSuccess(true);
      setReason('');
      
      // Reload data after submission
      setTimeout(() => {
        setSuccess(false);
        loadData();
      }, 3000);
      
    } catch (error: any) {
      alert(error.message || 'Failed to submit sick call');
    } finally {
      setSubmitting(false);
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
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">
          Call In Sick
        </h1>
        <p className="text-gray-600">
          Submit a sick call for your upcoming shift
        </p>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-success-50 border-2 border-success-500 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-success-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-success-900">Sick call submitted successfully!</p>
              <p className="text-sm text-success-700">We're finding coverage for your shift...</p>
            </div>
          </div>
        </div>
      )}

      {!nextShift ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-600 text-lg">No upcoming shifts scheduled</p>
          <p className="text-sm text-gray-500 mt-2">Check back later or contact your manager</p>
        </div>
      ) : (
        <div className="card">
          <form onSubmit={handleSubmit}>
            {/* Next Shift Info */}
            <div className="mb-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
              <p className="text-sm font-medium text-primary-900 mb-2">Your Next Shift</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold text-primary-900">
                    {format(new Date(nextShift.date), 'EEEE, MMM d, yyyy')}
                  </p>
                  <p className="text-primary-700">
                    {format(new Date(nextShift.startTime), 'h:mm a')} - {format(new Date(nextShift.endTime), 'h:mm a')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-primary-700">Location</p>
                  <p className="font-medium text-primary-900">{(nextShift as any).location?.name || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Reason Input (Optional) */}
            <div className="mb-6">
              <label htmlFor="reason" className="label">
                Reason (Optional)
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input"
                rows={3}
                placeholder="Brief reason for calling in sick (optional)"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-danger btn-lg w-full"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Call In Sick
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Recent Sick Calls */}
      {mySickCalls.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-display font-semibold text-gray-900 mb-4">
            My Recent Sick Calls
          </h2>
          
          <div className="space-y-3">
            {mySickCalls.map((sickCall) => (
              <div key={sickCall.id} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {format(new Date((sickCall as any).shift?.date || ''), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm text-gray-600">
                      {(sickCall as any).shift?.location?.name}
                    </p>
                  </div>
                  <span className={`badge badge-${sickCall.status.toLowerCase()}`}>
                    {sickCall.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
