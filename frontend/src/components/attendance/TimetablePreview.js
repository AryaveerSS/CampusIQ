import { useState } from 'react';
import { Trash2, Plus, X, Save, AlertTriangle } from 'lucide-react';
import { timetableApi } from '@/lib/api';
import clsx from 'clsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_TYPES = ['lecture', 'lab', 'tutorial'];

const emptyRow = () => ({
    day_of_week: 1, subject_name: '', start_time: '', end_time: '',
    room: '', professor: '', slot_type: 'lecture',
});

export default function TimetablePreview({ initialSlots, onClose, onSaved }) {
    const [rows, setRows] = useState(() => initialSlots.map(s => ({ ...s })));
    const [replaceExisting, setReplaceExisting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    function updateRow(i, field, value) {
        setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    }
    function removeRow(i) {
        setRows(rs => rs.filter((_, idx) => idx !== i));
    }
    function addRow() {
        setRows(rs => [...rs, emptyRow()]);
    }

    function validate() {
        for (const r of rows) {
            if (!r.subject_name?.trim()) return 'Every row needs a subject name.';
            if (!r.start_time || !r.end_time) return 'Every row needs a start and end time.';
        }
        return '';
    }

    async function handleSave() {
        const msg = validate();
        if (msg) { setError(msg); return; }
        setError('');
        setSaving(true);
        try {
            const payload = rows.map(r => ({
                day_of_week: parseInt(r.day_of_week, 10),
                subject_name: r.subject_name.trim(),
                start_time: r.start_time,
                end_time: r.end_time,
                room: r.room?.trim() || null,
                professor: r.professor?.trim() || null,
                slot_type: r.slot_type || 'lecture',
            }));
            const res = await timetableApi.saveParsed(payload, replaceExisting);
            onSaved?.(res);
        } catch (e) {
            setError(e.response?.data?.error || e.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="glass-card w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
                    <div>
                        <h3 className="font-semibold text-slate-100">Review extracted timetable</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Check what the AI found, fix anything wrong, then save. Nothing is saved until you click Save.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
                        <X size={18} />
                    </button>
                </div>

                {/* Rows */}
                <div className="flex-1 overflow-auto px-5 py-4 space-y-2">
                    {/* Column labels (desktop) */}
                    <div className="hidden md:grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_1fr_1.2fr_0.9fr_auto] gap-2 px-1 text-xs text-slate-500 font-medium">
                        <span>Subject</span><span>Day</span><span>Start</span><span>End</span>
                        <span>Room</span><span>Professor</span><span>Type</span><span></span>
                    </div>

                    {rows.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-6">
                            No rows. Add one manually below.
                        </p>
                    ) : rows.map((r, i) => (
                        <div key={i}
                            className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_1fr_1.2fr_0.9fr_auto] gap-2 items-center bg-surface-raised/30 md:bg-transparent rounded-lg p-2 md:p-0">
                            <input className="input-base !py-1.5 text-xs" placeholder="Subject"
                                value={r.subject_name || ''} onChange={e => updateRow(i, 'subject_name', e.target.value)} />
                            <select className="input-base !py-1.5 text-xs"
                                value={r.day_of_week} onChange={e => updateRow(i, 'day_of_week', e.target.value)}>
                                {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                            </select>
                            <input className="input-base !py-1.5 text-xs" type="time"
                                value={r.start_time || ''} onChange={e => updateRow(i, 'start_time', e.target.value)} />
                            <input className="input-base !py-1.5 text-xs" type="time"
                                value={r.end_time || ''} onChange={e => updateRow(i, 'end_time', e.target.value)} />
                            <input className="input-base !py-1.5 text-xs" placeholder="Room"
                                value={r.room || ''} onChange={e => updateRow(i, 'room', e.target.value)} />
                            <input className="input-base !py-1.5 text-xs" placeholder="Professor"
                                value={r.professor || ''} onChange={e => updateRow(i, 'professor', e.target.value)} />
                            <select className="input-base !py-1.5 text-xs"
                                value={r.slot_type || 'lecture'} onChange={e => updateRow(i, 'slot_type', e.target.value)}>
                                {SLOT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button onClick={() => removeRow(i)}
                                className="text-slate-600 hover:text-red-400 transition-colors justify-self-end p-1">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}

                    <button onClick={addRow}
                        className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-glow transition-colors mt-2">
                        <Plus size={13} /> Add row
                    </button>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-surface-border space-y-3">
                    {error && (
                        <div className="flex items-center gap-2 text-xs text-red-400">
                            <AlertTriangle size={14} /> {error}
                        </div>
                    )}
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input type="checkbox" checked={replaceExisting}
                                onChange={e => setReplaceExisting(e.target.checked)}
                                className="accent-accent w-3.5 h-3.5" />
                            Replace my existing timetable
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">{rows.length} classes</span>
                            <button onClick={onClose} className="btn-ghost text-xs py-2 px-3">Cancel</button>
                            <button onClick={handleSave} disabled={saving || rows.length === 0}
                                className={clsx('btn-primary text-xs py-2 px-4', (saving || rows.length === 0) && 'opacity-50')}>
                                <Save size={13} /> {saving ? 'Saving...' : 'Save Timetable'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
