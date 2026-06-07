import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-base-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-6xl font-bold gradient-text">404</p>
        <p className="text-slate-400">Page not found</p>
        <Link href="/dashboard" className="btn-primary inline-flex">Back to Dashboard</Link>
      </div>
    </div>
  );
}
