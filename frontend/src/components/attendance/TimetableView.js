import { useState, useEffect } from 'react';
import { timetableApi, subjectsApi } from '@/lib/api';
import { Plus, Upload, Trash2, Clock, MapPin, User, Sparkles } from 'lucide-react';
import TimetablePreview from './TimetablePreview';
import clsx from 'clsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TimetableView() {
  const [slots, setSlots] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewSlots, setPreviewSlots] = useState(null); // null = closed
  const [form, setForm] = useState({
    subject_id: '', day_of_week: '1', start_time: '', end_time: '', room: '', slot_type: 'lecture',
  });

  function refresh() {
    timetableApi.list().then(setSlots).catch(console.error);
    subjectsApi.list().then(setSubjects).catch(console.error);
  }

  useEffect(() => { refresh(); }, []);

  async function addSlot() {
    if (!form.subject_id || !form.start_time || !form.end_time) return;
    await timetableApi.create({ ...form, day_of_week: parseInt(form.day_of_week) });
    const data = await timetableApi.list();
    setSlots(data);
    setShowForm(false);
    setForm({ subject_id: '', day_of_week: '1', start_time: '', end_time: '', room: '', slot_type: 'lecture' });
  }

  async function deleteSlot(id) {
    await timetableApi.delete(id);
    setSlots(s => s.filter(x => x.id !== id));
  }

  // Smart upload: image / pdf / excel / csv → AI parse → preview modal
  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const res = await timetableApi.parse(file);
      if (!res.slots?.length) {
        setUploadError('No classes could be extracted. Try a clearer image or a different file.');
      } else {
        setPreviewSlots(res.slots);
      }
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Could not read that file. Try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function onSaved(result) {
    setPreviewSlots(null);
    refresh();
    const errs = result?.errors?.length ? ` (${result.errors.length} skipped)` : '';
    setUploadError('');
    alert(`Saved ${result.inserted} classes${errs}.`);
  }

  // Group slots by day
  const byDay = DAYS.map((_, i) =>
    slots.filter(s => s.day_of_week === i).sort((a, b) => a.start_time.localeCompare(b.start_time))
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs py-2 px-3">
          <Plus size={13} /> Add Slot
        </button>
        <label className={clsx('btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer', uploading && 'opacity-50')}>
          {uploading ? <Sparkles size={13} className="animate-pulse" /> : <Upload size={13} />}
          {uploading ? 'Scanning timetable...' : 'Scan Timetable'}
          <input type="file" accept="image/*,.pdf,.xlsx,.xls,.csv" className="hidden"
            onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="glass-card p-3 bg-accent/5 border-accent/20 text-xs text-slate-400 flex items-start gap-2">
        <Sparkles size={14} className="text-accent mt-0.5 flex-shrink-0" />
        <span>
          <strong className="text-slate-300">Scan Timetable</strong> reads an image, PDF, Excel, or CSV of your
          schedule and extracts classes automatically. Make sure the day, subject name, and times are clearly
          visible. You'll review and edit everything before it saves.
        </span>
      </div>

      {uploadError && (
        <div className="glass-card p-3 border border-red-500/20 bg-red-500/5 text-xs text-red-400">
          {uploadError}
        </div>
      )}

      {/* Add slot form */}
      {showForm && (
        <div className="glass-card p-4 space-y-3 animate-slide-up">
          <p className="text-sm font-medium text-slate-300">Add Timetable Slot</p>
          <div className="grid grid-cols-2 gap-2">
            <select className="input-base col-span-2" value={form.subject_id}
              onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}>
              <option value="">Select subject...</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="input-base" value={form.day_of_week}
              onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
            <select className="input-base" value={form.slot_type}
              onChange={e => setForm(f => ({ ...f, slot_type: e.target.value }))}>
              <option value="lecture">Lecture</option>
              <option value="lab">Lab</option>
              <option value="tutorial">Tutorial</option>
            </select>
            <input className="input-base" type="time" placeholder="Start time" value={form.start_time}
              onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            <input className="input-base" type="time" placeholder="End time" value={form.end_time}
              onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            <input className="input-base col-span-2" placeholder="Room (optional)" value={form.room}
              onChange={e => setForm(f => ({ ...f, room: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={addSlot} className="btn-primary text-xs py-2 px-3">Add</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost text-xs py-2 px-3">Cancel</button>
          </div>
        </div>
      )}

      {/* Weekly grid — only show Mon–Sat by default */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map(dayIdx => (
          <div key={dayIdx} className="glass-card overflow-hidden">
            <div className="px-3 py-2 bg-surface-raised border-b border-surface-border">
              <p className="text-xs font-semibold text-slate-300">{DAYS[dayIdx]}</p>
            </div>
            <div className="divide-y divide-surface-border">
              {byDay[dayIdx].length === 0 ? (
                <p className="px-3 py-3 text-xs text-slate-700">No classes</p>
              ) : (
                byDay[dayIdx].map(slot => (
                  <div key={slot.id} className="px-3 py-2.5 flex items-start justify-between group">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200">{slot.subjects?.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock size={10} className="text-slate-600" />
                        <span className="text-xs text-slate-500">
                          {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                        </span>
                      </div>
                      {/* Professor + Room */}
                      {(slot.subjects?.professor || slot.room) && (
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
                          {slot.subjects?.professor && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <User size={10} className="text-slate-600" /> {slot.subjects.professor}
                            </span>
                          )}
                          {slot.room && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <MapPin size={10} className="text-slate-600" /> {slot.room}
                            </span>
                          )}
                        </div>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-surface-raised text-slate-500 capitalize mt-1 inline-block">
                        {slot.slot_type}
                      </span>
                    </div>
                    <button onClick={() => deleteSlot(slot.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-0.5 flex-shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Preview & confirm modal */}
      {previewSlots && (
        <TimetablePreview
          initialSlots={previewSlots}
          onClose={() => setPreviewSlots(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
