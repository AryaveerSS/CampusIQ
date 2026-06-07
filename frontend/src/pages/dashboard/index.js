import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/layout/StatCard';
import { useEffect, useState } from 'react';
import { attendanceApi, gradesApi, gmailApi } from '@/lib/api';
import { CalendarDays, BookOpen, Mail, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { requestNotificationPermission } from '@/lib/firebase';
import clsx from 'clsx';

export default function DashboardPage() {
  const [attendanceStats, setAttendanceStats] = useState([]);
  const [gradesSummary, setGradesSummary] = useState([]);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [att, grades, gmail] = await Promise.allSettled([
          attendanceApi.stats(),
          gradesApi.summary(),
          gmailApi.status(),
        ]);
        if (att.status === 'fulfilled') setAttendanceStats(att.value);
        if (grades.status === 'fulfilled') setGradesSummary(grades.value);
        if (gmail.status === 'fulfilled') setGmailStatus(gmail.value);
      } finally { setLoading(false); }
    }
    load();
    // Request notification permission on first load
    requestNotificationPermission().catch(() => { });
  }, []);

  // Overall attendance %
  const totalPresent = attendanceStats.reduce((s, a) => s + a.present, 0);
  const totalClasses = attendanceStats.reduce((s, a) => s + a.total, 0);
  const overallAtt = totalClasses > 0 ? ((totalPresent / totalClasses) * 100).toFixed(1) : '--';

  // Low attendance subjects (below 75%)
  const lowAtt = attendanceStats.filter(a => parseFloat(a.percentage) < 75);

  return (
    <DashboardLayout title="Overview">
      {loading ? (
        <div className="text-center py-16 text-slate-600 text-sm animate-pulse-soft">Loading your dashboard...</div>
      ) : (
        <div className="space-y-6 animate-fade-in">

          {/* Top stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Overall Attendance"
              value={`${overallAtt}%`}
              sub={`${totalPresent} / ${totalClasses} classes`}
              color={parseFloat(overallAtt) >= 75 ? 'text-emerald-400' : 'text-red-400'}
              icon={CalendarDays}
            />
            <StatCard
              label="Subjects Tracked"
              value={attendanceStats.length}
              sub="click Attendance to manage"
              icon={BookOpen}
            />
            <StatCard
              label="Subjects Graded"
              value={gradesSummary.length}
              sub="tracked in Grades"
              icon={TrendingUp}
            />
            <StatCard
              label="Gmail"
              value={gmailStatus?.connected ? 'Connected' : 'Not linked'}
              sub={gmailStatus?.connected ? 'Smart inbox active' : 'Link in Smart Inbox tab'}
              color={gmailStatus?.connected ? 'text-emerald-400' : 'text-slate-500'}
              icon={Mail}
            />
          </div>

          {/* Attendance per subject */}
          {attendanceStats.length > 0 && (
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">Attendance by Subject</h2>
                <Link href="/dashboard/attendance" className="text-xs text-accent hover:text-accent-glow">
                  View all →
                </Link>
              </div>
              <div className="space-y-2.5">
                {attendanceStats.map(s => (
                  <div key={s.subject_id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-300">{s.subject_name}</span>
                      <span className={clsx('text-xs font-semibold',
                        parseFloat(s.percentage) >= 75 ? 'text-emerald-400' : 'text-red-400'
                      )}>
                        {s.percentage}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full transition-all',
                          parseFloat(s.percentage) >= 75 ? 'bg-emerald-500' : 'bg-red-500'
                        )}
                        style={{ width: `${Math.min(parseFloat(s.percentage), 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{s.present} present / {s.total} total</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low attendance warning */}
          {lowAtt.length > 0 && (
            <div className="glass-card p-4 border border-red-500/20 bg-red-500/5">
              <h3 className="text-sm font-semibold text-red-400 mb-2">⚠️ Low Attendance Warning</h3>
              <p className="text-xs text-slate-400 mb-3">
                You're below 75% in {lowAtt.length} subject{lowAtt.length > 1 ? 's' : ''}. Attend more classes to avoid issues.
              </p>
              {lowAtt.map(s => (
                <div key={s.subject_id} className="flex items-center justify-between text-xs py-1">
                  <span className="text-slate-300">{s.subject_name}</span>
                  <span className="text-red-400 font-semibold">{s.percentage}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Grades summary */}
          {gradesSummary.length > 0 && (
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">Grade Summary</h2>
                <Link href="/dashboard/grades" className="text-xs text-accent hover:text-accent-glow">
                  Manage →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {gradesSummary.map(g => (
                  <div key={g.subject_id} className="bg-surface-raised rounded-lg p-3">
                    <p className="text-xs font-medium text-slate-300 truncate">{g.name}</p>
                    <p className="text-lg font-bold text-accent mt-1">
                      {g.earned_weight.toFixed(2)}
                      <span className="text-xs text-slate-500 font-normal"> / {g.total_weight}%</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Raw: {g.raw_scored.toFixed(1)} / {g.raw_max.toFixed(1)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {attendanceStats.length === 0 && gradesSummary.length === 0 && (
            <div className="glass-card p-10 text-center space-y-4">
              <p className="text-3xl">🎓</p>
              <h3 className="text-slate-200 font-semibold">Welcome to CampusIQ!</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Start by heading to the <strong className="text-slate-300">Attendance</strong> tab to add your subjects, or <strong className="text-slate-300">Grades</strong> to track your scores.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/dashboard/attendance" className="btn-primary text-sm">
                  <CalendarDays size={14} /> Track Attendance
                </Link>
                <Link href="/dashboard/grades" className="btn-ghost text-sm">
                  <BookOpen size={14} /> Add Grades
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
