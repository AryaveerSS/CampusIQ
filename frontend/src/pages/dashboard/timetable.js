import DashboardLayout from '@/components/layout/DashboardLayout';
import TimetableView from '@/components/attendance/TimetableView';

export default function TimetablePage() {
  return (
    <DashboardLayout title="Timetable">
      <div className="space-y-2 mb-4">
        <p className="text-sm text-slate-500">
          Add your class schedule manually, or scan a timetable image/PDF/Excel and let AI build it for you.
          The app sends a push notification after each class asking if you attended.
        </p>
        <div className="glass-card p-3 bg-accent/5 border-accent/20 text-xs text-slate-400">
          💡 <strong className="text-slate-300">How notifications work:</strong> After a class ends, you'll get a push notification on your phone — tap "Yes" or "No" and attendance is marked automatically.
        </div>
      </div>
      <TimetableView />
    </DashboardLayout>
  );
}
