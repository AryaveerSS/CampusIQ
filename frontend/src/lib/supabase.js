import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export const supabase = createClientComponentClient();

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}
