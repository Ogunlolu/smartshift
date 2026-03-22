import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';

interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string | null;
  requiredStaff: number;
  sortOrder: number;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  seniority: number | null;
}

interface Assignment {
  id: string;
  date: string;
  status: string;
  notes: string | null;
  shiftTemplateId: string;
  staffId: string;
  shiftTemplate: ShiftTemplate;
  staff: StaffMember;
}

interface PopoverData {
  assignment: Assignment;
  x: number;
  y: number;
}

const STATUS_STYLES: Record<string, { icon: string; color: string }> = {
  SCHEDULED: { icon: '\u2713', color: 'bg-green-100 text-green-800' },
  SICK_CALL: { icon: '\u{1F534}', color: 'bg-red-100 text-red-800' },
  COVERED: { icon: '\u{1F7E1}', color: 'bg-yellow-100 text-yellow-800' },
  CANCELLED: { icon: '\u2715', color: 'bg-gray-100 text-gray-500' },
  NO_SHOW: { icon: '!', color: 'bg-orange-100 text-orange-800' },
};

export default function SchedulePage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [weekStart, setWeekStart] = useState(() => {
    const saved = localStorage.getItem('schedule-week-start');
    return saved ? new Date(saved) : startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [popover, setPopover] = useState<PopoverData | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [error, setError] = useState('');

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = format(new Date(), 'yyyy-MM-dd');

  // Load locations on mount
  useEffect(() => {
    api.getLocations().then(res => {
      setLocations(res.locations);
      const savedLoc = localStorage.getItem('schedule-location');
      if (savedLoc && res.locations.find((l: any) => l.id === savedLoc)) {
        setSelectedLocation(savedLoc);
      } else if (res.locations.length > 0) {
        setSelectedLocation(res.locations[0].id);
      }
    }).catch(() => setError('Failed to load locations'));
  }, []);

  // Load schedule data when location or week changes
  const loadSchedule = useCallback(async () => {
    if (!selectedLocation) return;
    setLoading(true);
    setError('');
    try {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');
      const data = await api.getScheduleAssignments(selectedLocation, startStr, endStr);
      setTemplates(data.shiftTemplates);
      setStaffList(data.staffList);
      setAssignments(data.assignments);
    } catch (err: any) {
      setError(err.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, weekStart]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    localStorage.setItem('schedule-week-start', weekStart.toISOString());
  }, [weekStart]);

  useEffect(() => {
    if (selectedLocation) localStorage.setItem('schedule-location', selectedLocation);
  }, [selectedLocation]);

  // Find assignment for a specific cell
  const getAssignment = (staffId: string, templateId: string, date: string): Assignment | undefined => {
    return assignments.find(
      a => a.staffId === staffId && a.shiftTemplateId === templateId && format(new Date(a.date), 'yyyy-MM-dd') === date
    );
  };

  // Count coverage for a shift+date
  const getCoverage = (templateId: string, date: string) => {
    const template = templates.find(t => t.id === templateId);
    const assigned = assignments.filter(
      a => a.shiftTemplateId === templateId &&
        format(new Date(a.date), 'yyyy-MM-dd') === date &&
        a.status !== 'CANCELLED'
    ).length;
    return { assigned, required: template?.requiredStaff || 1 };
  };

  // Handle cell click — assign or show popover
  const handleCellClick = async (staffId: string, templateId: string, date: string, e: React.MouseEvent) => {
    const existing = getAssignment(staffId, templateId, date);

    if (existing) {
      setPopover({
        assignment: existing,
        x: e.clientX,
        y: e.clientY,
      });
      setShowNoteField(false);
      setNoteInput(existing.notes || '');
      return;
    }

    // Optimistic create
    const tempId = `temp-${Date.now()}`;
    const optimistic: Assignment = {
      id: tempId,
      date,
      status: 'SCHEDULED',
      notes: null,
      shiftTemplateId: templateId,
      staffId,
      shiftTemplate: templates.find(t => t.id === templateId)!,
      staff: staffList.find(s => s.id === staffId)!,
    };
    setAssignments(prev => [...prev, optimistic]);

    try {
      const created = await api.createAssignment({
        locationId: selectedLocation,
        shiftTemplateId: templateId,
        staffId,
        date,
      });
      setAssignments(prev => prev.map(a => a.id === tempId ? created : a));
    } catch (err: any) {
      // Revert optimistic
      setAssignments(prev => prev.filter(a => a.id !== tempId));
      setError(err.message || 'Failed to create assignment');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Handle delete assignment
  const handleDelete = async (assignmentId: string) => {
    const backup = assignments.find(a => a.id === assignmentId);
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    setPopover(null);

    try {
      await api.deleteAssignment(assignmentId);
    } catch (err: any) {
      if (backup) setAssignments(prev => [...prev, backup]);
      setError(err.message || 'Failed to delete assignment');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Handle save note
  const handleSaveNote = async () => {
    if (!popover) return;
    try {
      await api.updateAssignment(popover.assignment.id, { notes: noteInput || undefined });
      setAssignments(prev =>
        prev.map(a => a.id === popover.assignment.id ? { ...a, notes: noteInput || null } : a)
      );
      setShowNoteField(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Week navigation
  const prevWeek = () => setWeekStart(prev => addDays(prev, -7));
  const nextWeek = () => setWeekStart(prev => addDays(prev, 7));
  const goToToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Apply weekly template
  const handleApplyTemplate = async () => {
    if (!confirm(`Apply weekly template to ${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}? Empty slots will be filled.`)) return;
    try {
      const result = await api.bulkApplyTemplate({
        locationId: selectedLocation,
        startDate: format(weekStart, 'yyyy-MM-dd'),
        endDate: format(weekEnd, 'yyyy-MM-dd'),
      });
      alert(`Created ${result.created} assignments, skipped ${result.skipped}`);
      loadSchedule();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (templates.length === 0 && !loading && selectedLocation) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No shifts configured</h2>
        <p className="text-gray-500 mb-4">Set up shift templates for this location to start building your schedule.</p>
        <a href="/settings/shifts" className="text-blue-600 hover:underline">Configure Shift Templates</a>
      </div>
    );
  }

  return (
    <div className="p-4" onClick={() => setPopover(null)}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>

        <div className="flex items-center gap-3">
          {/* Location selector */}
          <select
            value={selectedLocation}
            onChange={e => setSelectedLocation(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>

          {/* Week navigation */}
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="px-2 py-1 rounded hover:bg-gray-100 text-sm">&lt;</button>
            <button onClick={goToToday} className="px-3 py-1 rounded hover:bg-gray-100 text-sm font-medium">Today</button>
            <span className="text-sm font-medium px-2">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </span>
            <button onClick={nextWeek} className="px-2 py-1 rounded hover:bg-gray-100 text-sm">&gt;</button>
          </div>

          <button onClick={handleApplyTemplate} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            Apply Template
          </button>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        /* Schedule Grid */
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 border-b border-r px-3 py-2 text-left font-medium text-gray-600 min-w-[120px]">
                  Staff
                </th>
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isToday = dateStr === today;
                  return templates.map(template => (
                    <th
                      key={`${dateStr}-${template.id}`}
                      className={`border-b border-r px-2 py-2 text-center font-medium min-w-[80px] ${isToday ? 'bg-blue-50' : ''}`}
                    >
                      <div className="text-xs text-gray-500">{format(day, 'EEE d')}</div>
                      <div className="text-xs mt-0.5" style={{ color: template.color || '#6B7280' }}>
                        {template.name}
                      </div>
                    </th>
                  ));
                })}
              </tr>
            </thead>
            <tbody>
              {staffList.map(staff => (
                <tr key={staff.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 z-10 bg-white border-b border-r px-3 py-2 font-medium text-gray-700 whitespace-nowrap">
                    {staff.firstName} {staff.lastName.charAt(0)}.
                  </td>
                  {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isToday = dateStr === today;
                    return templates.map(template => {
                      const assignment = getAssignment(staff.id, template.id, dateStr);
                      const status = assignment ? STATUS_STYLES[assignment.status] || STATUS_STYLES.SCHEDULED : null;

                      return (
                        <td
                          key={`${staff.id}-${dateStr}-${template.id}`}
                          className={`border-b border-r px-1 py-1 text-center cursor-pointer transition-colors ${
                            isToday ? 'bg-blue-50' : ''
                          } ${!assignment ? 'hover:bg-gray-100' : ''}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleCellClick(staff.id, template.id, dateStr, e);
                          }}
                        >
                          {assignment && (
                            <div
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status?.color}`}
                              style={template.color ? { borderLeft: `3px solid ${template.color}` } : {}}
                            >
                              <span>{status?.icon}</span>
                              {assignment.notes && <span title={assignment.notes}>*</span>}
                            </div>
                          )}
                          {!assignment && (
                            <span className="text-gray-300 text-xs">&mdash;</span>
                          )}
                        </td>
                      );
                    });
                  })}
                </tr>
              ))}

              {/* Coverage footer */}
              <tr className="bg-gray-50 font-medium">
                <td className="sticky left-0 z-10 bg-gray-50 border-t border-r px-3 py-2 text-gray-600 text-xs">
                  Coverage
                </td>
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  return templates.map(template => {
                    const { assigned, required } = getCoverage(template.id, dateStr);
                    const met = assigned >= required;
                    const danger = assigned < required - 1;

                    return (
                      <td
                        key={`coverage-${dateStr}-${template.id}`}
                        className={`border-t border-r px-2 py-2 text-center text-xs ${
                          met ? 'text-green-700 bg-green-50' :
                          danger ? 'text-red-700 bg-red-50' :
                          'text-amber-700 bg-amber-50'
                        }`}
                      >
                        {assigned}/{required} {met ? '\u2713' : '\u26A0'}
                      </td>
                    );
                  });
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Popover for filled cell */}
      {popover && (
        <div
          className="fixed z-50 bg-white border rounded-lg shadow-lg p-4 w-64"
          style={{ top: Math.min(popover.y, window.innerHeight - 200), left: Math.min(popover.x, window.innerWidth - 280) }}
          onClick={e => e.stopPropagation()}
        >
          <div className="text-sm font-semibold text-gray-900 mb-1">
            {popover.assignment.staff.firstName} {popover.assignment.staff.lastName}
          </div>
          <div className="text-xs text-gray-600 mb-1">
            {popover.assignment.shiftTemplate.name} ({popover.assignment.shiftTemplate.startTime} - {popover.assignment.shiftTemplate.endTime})
          </div>
          <div className="text-xs text-gray-500 mb-3">
            {format(new Date(popover.assignment.date), 'EEEE, MMM d, yyyy')}
          </div>
          <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-3 ${STATUS_STYLES[popover.assignment.status]?.color}`}>
            {popover.assignment.status}
          </div>

          {popover.assignment.notes && !showNoteField && (
            <div className="text-xs text-gray-600 mb-3 italic">Note: {popover.assignment.notes}</div>
          )}

          {showNoteField ? (
            <div className="mb-3">
              <input
                type="text"
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                maxLength={200}
                placeholder="Add a note..."
                className="w-full border rounded px-2 py-1 text-sm"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button onClick={handleSaveNote} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Save</button>
                <button onClick={() => setShowNoteField(false)} className="px-2 py-1 text-gray-600 text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (confirm(`Remove ${popover.assignment.staff.firstName} from ${popover.assignment.shiftTemplate.name}?`)) {
                    handleDelete(popover.assignment.id);
                  }
                }}
                className="px-3 py-1.5 bg-red-50 text-red-700 rounded text-xs hover:bg-red-100"
              >
                Remove
              </button>
              <button
                onClick={() => setShowNoteField(true)}
                className="px-3 py-1.5 bg-gray-50 text-gray-700 rounded text-xs hover:bg-gray-100"
              >
                Add Note
              </button>
              <button
                onClick={() => setPopover(null)}
                className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
