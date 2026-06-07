import { signInWithGoogle } from '@/lib/supabase';
import { useSession } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Head from 'next/head';

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.push('/dashboard');
  }, [session]);

  return (
    <>
      <Head><title>CampusIQ — Login</title></Head>
      <div className="min-h-screen flex items-center justify-center bg-base-950 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        <div className="glass-card p-10 w-full max-w-md relative z-10 animate-slide-up">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center font-bold text-white text-lg">
              C
            </div>
            <span className="text-2xl font-bold gradient-text">CampusIQ</span>
          </div>

          <p className="text-slate-400 text-sm mb-8">
            Track attendance, grades & emails — all in one place.
          </p>

          <div className="space-y-4">
            <div className="bg-base-800 rounded-xl p-4 text-sm text-slate-400 space-y-2">
              <p className="flex items-center gap-2">📅 <span>Smart attendance calendar</span></p>
              <p className="flex items-center gap-2">📊 <span>Weighted grade calculator</span></p>
              <p className="flex items-center gap-2">📧 <span>Smart email inbox</span></p>
              <p className="flex items-center gap-2">🔔 <span>Auto attendance notifications</span></p>
            </div>

            <button
              onClick={signInWithGoogle}
              className="btn-primary w-full justify-center text-base py-3"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <p className="text-xs text-slate-600 text-center mt-6">
            By signing in, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </>
  );
}
