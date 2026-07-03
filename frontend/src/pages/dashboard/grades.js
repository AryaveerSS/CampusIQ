import DashboardLayout from '@/components/layout/DashboardLayout';
import GradesPanel from '@/components/grades/GradesPanel';
import { useEffect, useState } from 'react';
import { subjectsApi } from '@/lib/api';
import { Plus } from 'lucide-react';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export default function GradesPage() {
  const [subjects, setSubjects] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', professor: '', color: COLORS[0] });

  useEffect(() => {
    subjectsApi.list().then(setSubjects).catch(console.error);
  }, []);

  async function addSubject() {
    if (!form.name.trim()) return;
    const s = await subjectsApi.create(form);
    setSubjects(prev => [...prev, s]);
    setForm({ name: '', code: '', professor: '', color: COLORS[subjects.length % COLORS.length] });
    setShowAdd(false);
  }

  return (
    <DashboardLayout title="Grades">
      <div className="space-y-4">

        {/* Add subject */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Track weighted scores for each subject component.</p>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-xs py-2 px-3">
            <Plus size={13} /> Add Subject
          </button>
        </div>

        {showAdd && (
          <div className="glass-card p-4 space-y-3 animate-slide-up">
            <p className="text-sm font-medium text-slate-300">New Subject</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input-base" placeholder="Subject name" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input className="input-base" placeholder="Code (e.g. CS301)" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              <input className="input-base col-span-2" placeholder="Professor (optional)" value={form.professor}
                onChange={e => setForm(f => ({ ...f, professor: e.target.value }))} />
            </div>
            <div className="flex gap-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{ background: c }}
                  className={`w-5 h-5 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-base-900 scale-110' : ''}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={addSubject} className="btn-primary text-xs py-2 px-3">Add Subject</button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs py-2 px-3">Cancel</button>
            </div>
          </div>
        )}

        {/* Grades panels per subject */}
        {subjects.length === 0 ? (
          <div className="glass-card p-10 text-center space-y-3">
            <p className="text-2xl">📊</p>
            <p className="text-slate-400 text-sm">No subjects yet. Add a subject to start tracking grades.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {subjects.map(s => (
              <GradesPanel key={s.id} subjectId={s.id} subjectName={s.name} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
