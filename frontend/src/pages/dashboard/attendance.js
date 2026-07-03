import DashboardLayout from '@/components/layout/DashboardLayout';
import AttendanceCalendar from '@/components/attendance/AttendanceCalendar';
import { useEffect, useState } from 'react';
import { subjectsApi, attendanceApi } from '@/lib/api';
import { Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export default function AttendancePage() {
  const [subjects, setSubjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: '', code: '', professor: '', color: COLORS[0] });

  useEffect(() => {
    subjectsApi.list().then(data => {
      setSubjects(data);
      if (data.length > 0) setSelected(data[0].id);
    });
    attendanceApi.stats().then(setStats);
  }, []);

  async function addSubject() {
    if (!newSubject.name.trim()) return;
    const s = await subjectsApi.create(newSubject);
    setSubjects(prev => [...prev, s]);
    setSelected(s.id);
    setNewSubject({ name: '', code: '', professor: '', color: COLORS[subjects.length % COLORS.length] });
    setShowAdd(false);
  }

  async function deleteSubject(id) {
    if (!confirm('Delete this subject and all its attendance records?')) return;
    await subjectsApi.delete(id);
    setSubjects(prev => prev.filter(s => s.id !== id));
    if (selected === id) setSelected(subjects.find(s => s.id !== id)?.id || null);
    setStats(prev => prev.filter(s => s.subject_id !== id));
  }

  const selectedStats = stats.find(s => s.subject_id === selected);

  return (
    <DashboardLayout title="Attendance">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: Subject list */}
        <div className="lg:col-span-1 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subjects</p>
            <button onClick={() => setShowAdd(!showAdd)}
              className="text-xs text-accent hover:text-accent-glow flex items-center gap-1">
              <Plus size={13} /> Add
            </button>
          </div>

          {showAdd && (
            <div className="glass-card p-3 space-y-2 animate-slide-up">
              <input className="input-base" placeholder="Subject name" value={newSubject.name}
                onChange={e => setNewSubject(s => ({ ...s, name: e.target.value }))} />
              <input className="input-base" placeholder="Code (e.g. CS301)" value={newSubject.code}
                onChange={e => setNewSubject(s => ({ ...s, code: e.target.value }))} />
              <input className="input-base" placeholder="Professor (optional)" value={newSubject.professor}
                onChange={e => setNewSubject(s => ({ ...s, professor: e.target.value }))} />
              <div className="flex gap-1.5 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewSubject(s => ({ ...s, color: c }))}
                    style={{ background: c }}
                    className={clsx('w-5 h-5 rounded-full transition-transform',
                      newSubject.color === c && 'ring-2 ring-white ring-offset-1 ring-offset-base-900 scale-110'
                    )} />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={addSubject} className="btn-primary text-xs py-1.5 px-3">Add</button>
                <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs py-1.5 px-3">Cancel</button>
              </div>
            </div>
          )}

          {subjects.length === 0 ? (
            <div className="glass-card p-6 text-center text-slate-600 text-sm">
              No subjects yet.<br />Add one to start tracking.
            </div>
          ) : (
            subjects.map(s => {
              const stat = stats.find(st => st.subject_id === s.id);
              return (
                <div key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={clsx(
                    'glass-card p-3 cursor-pointer transition-all group',
                    selected === s.id && 'border-accent/40'
                  )}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{s.name}</p>
                      {s.code && <p className="text-xs text-slate-600">{s.code}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {stat && (
                        <span className={clsx('text-xs font-semibold',
                          parseFloat(stat.percentage) >= 75 ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {stat.percentage}%
                        </span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); deleteSubject(s.id); }}
                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Calendar */}
        <div className="lg:col-span-2">
          {selected ? (
            <AttendanceCalendar selectedSubject={selected} />
          ) : (
            <div className="glass-card p-10 text-center text-slate-600 text-sm">
              Select or add a subject to view attendance calendar
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
