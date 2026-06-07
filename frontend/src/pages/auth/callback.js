import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Supabase handles the OAuth token from URL hash automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.push('/dashboard');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-base-950 flex items-center justify-center">
      <div className="glass-card p-8 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
