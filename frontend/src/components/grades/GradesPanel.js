import { useState, useEffect, useCallback } from 'react';
import { gradesApi } from '@/lib/api';
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';
import clsx from 'clsx';

export default function GradesPanel({ subjectId, subjectName }) {
  const [components, setComponents] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [expanded, setExpanded]     = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState(null);

  const [form, setForm] = useState({ name: '', weight_percent: '', scored_marks: '', max_marks: '' });

  const fetchComponents = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    try {
      const data = await gradesApi.list({ subject_id: subjectId });
      setComponents(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [subjectId]);

  useEffect(() => { fetchComponents(); }, [fetchComponents]);

  // Computed totals
  const totalWeight    = components.reduce((s, c) => s + parseFloat(c.weight_percent || 0), 0);
  const rawScored      = components.reduce((s, c) => s + (c.scored_marks != null ? parseFloat(c.scored_marks) : 0), 0);
  const rawMax         = components.reduce((s, c) => s + parseFloat(c.max_marks || 0), 0);
  const weightedScored = components.reduce((s, c) => {
    if (c.scored_marks == null) return s;
    return s + (parseFloat(c.scored_marks) / parseFloat(c.max_marks)) * parseFloat(c.weight_percent);
  }, 0);
  const overallPct = totalWeight > 0 ? ((weightedScored / totalWeight) * 100).toFixed(2) : '0.00';

  async function handleSubmit() {
    if (!form.name || !form.weight_percent || !form.max_marks) return;
    try {
      if (editingId) {
        await gradesApi.update(editingId, { ...form, subject_id: subjectId });
      } else {
        await gradesApi.create({ ...form, subject_id: subjectId });
      }
      setForm({ name: '', weight_percent: '', scored_marks: '', max_marks: '' });
      setShowForm(false);
      setEditingId(null);
      fetchComponents();
    } catch (e) { console.error(e); }
  }

  function startEdit(c) {
    setForm({
      name: c.name,
      weight_percent: c.weight_percent,
      scored_marks: c.scored_marks ?? '',
      max_marks: c.max_marks,
    });
    setEditingId(c.id);
    setShowForm(true);
    setExpanded(true);
  }

  async function handleDelete(id) {
    await gradesApi.delete(id);
    fetchComponents();
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-raised/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200 text-sm">{subjectName}</span>
          <span className="text-xs text-slate-500">{totalWeight}% total weight</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={clsx('text-sm font-bold',
            parseFloat(overallPct) >= 75 ? 'text-emerald-400' :
            parseFloat(overallPct) >= 50 ? 'text-yellow-400' : 'text-red-400'
          )}>
            {weightedScored.toFixed(2)} / {totalWeight}%
          </span>
          {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surface-border">
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-3 px-4 py-3 bg-surface-raised/30">
            <div>
              <p className="text-xs text-slate-500">Overall Score (%)</p>
              <p className="text-lg font-bold text-accent">{overallPct}%</p>
              <p className="text-xs text-slate-600">of total 100%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Raw Score</p>
              <p className="text-lg font-bold text-slate-200">{rawScored.toFixed(1)} / {rawMax.toFixed(1)}</p>
              <p className="text-xs text-slate-600">total marks</p>
            </div>
          </div>

          {/* Component rows */}
          {loading ? (
            <div className="px-4 py-6 text-center text-slate-600 text-sm">Loading...</div>
          ) : components.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-600 text-sm">No components yet. Add one below.</div>
          ) : (
            <div className="divide-y divide-surface-border">
              {components.map(c => {
                const ws = c.scored_marks != null
                  ? ((parseFloat(c.scored_marks) / parseFloat(c.max_marks)) * parseFloat(c.weight_percent)).toFixed(2)
                  : null;
                return (
                  <div key={c.id} className="px-4 py-3 flex items-center gap-3 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        Weight: <span className="text-slate-400">{c.weight_percent}%</span>
                        &nbsp;·&nbsp;
                        Marks: <span className="text-slate-400">
                          {c.scored_marks ?? '–'} / {c.max_marks}
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      {ws != null ? (
                        <p className="text-sm font-bold text-accent">{ws}<span className="text-xs text-slate-500">/{c.weight_percent}</span></p>
                      ) : (
                        <p className="text-xs text-slate-600">Not scored</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(c)} className="p-1 text-slate-500 hover:text-accent rounded">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1 text-slate-500 hover:text-red-400 rounded">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add form */}
          {showForm ? (
            <div className="px-4 py-3 border-t border-surface-border bg-surface-raised/20 space-y-3">
              <p className="text-xs font-medium text-slate-400">{editingId ? 'Edit component' : 'Add new component'}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input-base col-span-2"
                  placeholder='Component name (e.g. "Quiz 1", "Major Exam")'
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
                <input
                  className="input-base"
                  placeholder="Weight % (e.g. 10)"
                  type="number"
                  min="0" max="100"
                  value={form.weight_percent}
                  onChange={e => setForm(f => ({ ...f, weight_percent: e.target.value }))}
                />
                <input
                  className="input-base"
                  placeholder="Max marks (e.g. 40)"
                  type="number"
                  min="0"
                  value={form.max_marks}
                  onChange={e => setForm(f => ({ ...f, max_marks: e.target.value }))}
                />
                <input
                  className="input-base col-span-2"
                  placeholder="Your scored marks (leave blank if not yet)"
                  type="number"
                  min="0"
                  value={form.scored_marks}
                  onChange={e => setForm(f => ({ ...f, scored_marks: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSubmit} className="btn-primary text-xs py-2 px-3">
                  <Check size={12} /> {editingId ? 'Save' : 'Add'}
                </button>
                <button onClick={() => { setShowForm(false); setEditingId(null); setForm({ name: '', weight_percent: '', scored_marks: '', max_marks: '' }); }}
                  className="btn-ghost text-xs py-2 px-3">
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 border-t border-surface-border">
              <button
                onClick={() => { setShowForm(true); setExpanded(true); }}
                className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-glow transition-colors"
              >
                <Plus size={13} /> Add Component
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
