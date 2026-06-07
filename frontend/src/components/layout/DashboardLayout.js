import Sidebar from './Sidebar';
import { useSession } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function DashboardLayout({ children, title }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.push('/');
  }, [session]);

  if (!session) return (
    <div className="min-h-screen bg-base-950 flex items-center justify-center">
      <div className="animate-pulse-soft text-slate-500 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-base-950 flex">
      <Sidebar />

      <main className="flex-1 lg:ml-56 pt-14 lg:pt-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {title && (
            <h1 className="text-xl font-semibold text-slate-100 mb-6">{title}</h1>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
