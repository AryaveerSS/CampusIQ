import clsx from 'clsx';

export default function StatCard({ label, value, sub, color = 'text-accent', icon: Icon }) {
  return (
    <div className="glass-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        {Icon && <Icon size={14} className="text-slate-600" />}
      </div>
      <p className={clsx('text-2xl font-bold', color)}>{value}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
}
