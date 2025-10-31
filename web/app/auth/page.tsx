'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/features/auth/components/auth-form';
import { useAuth } from '@/shared/hooks/use-auth';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || user) {
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

