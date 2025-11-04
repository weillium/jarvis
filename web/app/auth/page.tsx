'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/features/auth/components/auth-form';
import { useAuth } from '@/shared/hooks/use-auth';
import { supabase } from '@/shared/lib/supabase/client';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect if we have a confirmed, valid user
    // Give a small delay to ensure auth state is fully loaded
    if (!loading && user) {
      // Double-check user is actually valid by verifying with Supabase
      const checkUser = async () => {
        try {
          const { data: { user: verifiedUser }, error } = await supabase.auth.getUser();
          if (error) {
            console.error('[Auth Page] Error verifying user before redirect:', {
              message: error.message,
              status: error.status,
              name: error.name,
            });
            return;
          }
          if (verifiedUser && !error) {
            router.push('/');
          } else {
            console.warn('[Auth Page] User from useAuth but verification returned no user');
          }
        } catch (err) {
          console.error('[Auth Page] Exception verifying user before redirect:', {
            error: err,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
      };
      checkUser();
    }
  }, [user, loading, router]);

  // Show loading state while checking auth, but don't redirect until we confirm user exists
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom, #f8fafc 0%, #ffffff 100%)',
      }}>
        <div style={{
          fontSize: '16px',
          color: '#64748b',
        }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #f8fafc 0%, #ffffff 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        width: '100%',
        maxWidth: '480px',
      }}>
        <AuthForm
          mode={mode}
          onToggleMode={() => setMode(mode === 'login' ? 'signup' : 'login')}
        />
      </div>
    </div>
  );
}

