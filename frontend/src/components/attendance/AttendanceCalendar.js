import { useState, useEffect, useCallback } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameDay, isSameMonth, isToday, addMonths, subMonths
} from 'date-fns';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { attendanceApi } from '@/lib/api';
import clsx from 'clsx';

export default function AttendanceCalendar({ selectedSubject }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAttendance = useCallback(async () => {
    if (!selectedSubject) return;
    setLoading(true);
    try {
      const month = format(currentMonth, 'yyyy-MM');
      const data = await attendanceApi.list({ subject_id: selectedSubject, month });
      setAttendance(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedSubject, currentMonth]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  async function markDay(date, status) {
    if (!selectedSubject) return;
    await attendanceApi.mark({
      subject_id: selectedSubject,
      date: format(date, 'yyyy-MM-dd'),
      status,
    });
    fetchAttendance();
  }

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startPad = getDay(startOfMonth(currentMonth));

  function getStatus(day) {
    const rec = attendance.find(a => isSameDay(new Date(a.date + 'T00:00:00'), day));
    return rec?.status || null;
  }

  // Stats
  const present = attendance.filter(a => a.status === 'present').length;
  const absent  = attendance.filter(a => a.status === 'absent').length;
  const total   = present + absent;
  const pct     = total > 0 ? ((present / total) * 100).toFixed(1) : '--';

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Present', value: present, color: 'text-emerald-400' },
          { label: 'Absent',  value: absent,  color: 'text-red-400'     },
          { label: 'This Month %', value: `${pct}%`, color: 'text-accent' },
        ].map(s => (
          <div key={s.label} className="glass-card p-3 text-center">
            <p className={clsx('text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="glass-card p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1.5 rounded-lg hover:bg-surface-raised text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <h3 className="font-semibold text-slate-200 text-sm">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1.5 rounded-lg hover:bg-surface-raised text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 mb-2">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} className="text-center text-xs text-slate-600 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Padding cells */}
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}

          {days.map(day => {
            const status = getStatus(day);
            const today  = isToday(day);
            return (
              <div key={day.toISOString()} className="group relative">
                <div className={clsx(
                  'aspect-square flex items-center justify-center rounded-lg text-xs font-medium cursor-pointer transition-all',
                  status === 'present' && 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
                  status === 'absent'  && 'bg-red-500/20 text-red-400 border border-red-500/30',
                  status === 'cancelled' && 'bg-slate-700/30 text-slate-600',
                  !status && today && 'border-2 border-accent/60 text-accent',
                  !status && !today && 'text-slate-400 hover:bg-surface-raised',
                )}>
                  {day.getDate()}
                </div>

                {/* Mark buttons on hover */}
                {selectedSubject && (
                  <div className="absolute inset-0 hidden group-hover:flex items-center justify-center gap-0.5 bg-base-900/90 rounded-lg z-10">
                    <button onClick={() => markDay(day, 'present')}
                      className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors">
                      <Check size={11} />
                    </button>
                    <button onClick={() => markDay(day, 'absent')}
                      className="p-0.5 rounded hover:bg-red-500/20 text-red-400 transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40" /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /> Absent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border-2 border-accent/60" /> Today
          </span>
        </div>
      </div>
    </div>
  );
}
