import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string | null;
  requiredStaff: number;
  sortOrder: number;
  isActive: boolean;
}

const PRESET_COLORS = [
  '#4A90D9', '#50C878', '#FF6B6B', '#FFD93D',
  '#6C5CE7', '#A29BFE', '#FD79A8', '#00CEC9',
];

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4).toString().padStart(2, '0');
  const m = ((i % 4) * 15).toString().padStart(2, '0');
  return `${h}:${m}`;
});

export default function ShiftTemplateSettings() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    startTime: '07:00',
    endTime: '15:00',
    color: PRESET_COLORS[0],
    requiredStaff: 1,
  });

  useEffect(() => {
    api.getLocations().then(res => {
      setLocations(res.locations);
      if (res.locations.length > 0) setSelectedLocation(res.locations[0].id);
    }).catch(() => setError('Failed to load locations'));
  }, []);

  useEffect(() => {
    if (!selectedLocation) return;
    setLoading(true);
    api.getShiftTemplates(selectedLocation)
      .then(data => setTemplates(data))
      .catch(() => setError('Failed to load shift templates'))
      .finally(() => setLoading(false));
  }, [selectedLocation]);

  const isOvernight = formData.endTime < formData.startTime;

  const resetForm = () => {
    setFormData({ name: '', startTime: '07:00', endTime: '15:00', color: PRESET_COLORS[0], requiredStaff: 1 });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (editingId) {
        const updated = await api.updateShiftTemplate(editingId, formData);
        setTemplates(prev => prev.map(t => t.id === editingId ? updated : t));
        setSuccess('Shift template updated');
      } else {
        const created = await api.createShiftTemplate({ ...formData, locationId: selectedLocation });
        setTemplates(prev => [...prev, created]);
        setSuccess('Shift template created');
      }
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save shift template');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleEdit = (template: ShiftTemplate) => {
    setFormData({
      name: template.name,
      startTime: template.startTime,
      endTime: template.endTime,
      color: template.color || PRESET_COLORS[0],
      requiredStaff: template.requiredStaff,
    });
    setEditingId(template.id);
    setShowForm(true);
  };

  const handleDelete = async (template: ShiftTemplate) => {
    if (!confirm(`Deactivating "${template.name}" will hide it from future schedules. Existing assignments are preserved. Continue?`)) return;
    try {
      await api.deleteShiftTemplate(template.id);
      setTemplates(prev => prev.filter(t => t.id !== template.id));
      setSuccess('Shift template deactivated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const locationName = locations.find(l => l.id === selectedLocation)?.name || '';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shift Configuration</h1>
        <select
          value={selectedLocation}
          onChange={e => setSelectedLocation(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      </div>

      {locationName && (
        <p className="text-gray-500 text-sm mb-4">Configuring shifts for <strong>{locationName}</strong></p>
      )}

      {/* Messages */}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>}

      {/* Template List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Shift Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Start</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">End</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Staff</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No shift templates yet. Click "+ Add Shift" to create one.
                  </td>
                </tr>
              ) : (
                templates.map(template => (
                  <tr key={template.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: template.color || '#6B7280' }}></span>
                      {template.name}
                      {template.endTime < template.startTime && (
                        <span className="text-xs text-gray-400">(Overnight)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{template.startTime}</td>
                    <td className="px-4 py-3 text-gray-600">{template.endTime}</td>
                    <td className="px-4 py-3 text-gray-600">{template.requiredStaff}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleEdit(template)} className="text-blue-600 hover:underline text-xs mr-3">Edit</button>
                      <button onClick={() => handleDelete(template)} className="text-red-600 hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm ? (
        <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">{editingId ? 'Edit Shift Template' : 'New Shift Template'}</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Day Shift"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <select
                value={formData.startTime}
                onChange={e => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <select
                value={formData.endTime}
                onChange={e => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {isOvernight && <p className="text-xs text-amber-600 mt-1">Overnight shift (crosses midnight)</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Required Staff</label>
            <input
              type="number"
              min={1}
              max={20}
              value={formData.requiredStaff}
              onChange={e => setFormData(prev => ({ ...prev, requiredStaff: parseInt(e.target.value) || 1 }))}
              className="w-24 border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex gap-2 items-center">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, color }))}
                  className={`w-7 h-7 rounded-full border-2 ${formData.color === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="text"
                value={formData.color}
                onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))}
                placeholder="#HEX"
                className="w-24 border rounded px-2 py-1 text-xs ml-2"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              {editingId ? 'Save Changes' : 'Create Template'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 text-sm"
        >
          + Add Shift
        </button>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Shifts where end time is before start time are treated as overnight shifts (crossing midnight).
      </p>
    </div>
  );
}
