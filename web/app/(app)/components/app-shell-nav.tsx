'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase/client';

interface AppShellNavProps {
  user: User;
}

export function AppShellNav({ user }: AppShellNavProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Redirect to root (will show landing page for unauthenticated users)
    window.location.href = '/';
  };

  return (
    <header style={{
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      padding: '16px 24px',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Link href="/" style={{
          fontSize: '20px',
          fontWeight: '600',
          color: '#1e293b',
          textDecoration: 'none',
        }}>
          Jarvis
        </Link>
        <nav style={{
          display: 'flex',
          gap: '24px',
          alignItems: 'center',
        }}>
          <Link href="/" style={{
            color: '#475569',
            textDecoration: 'none',
            fontSize: '15px',
            fontWeight: '500',
          }}>
            Dashboard
          </Link>
          <Link href="/events" style={{
            color: '#475569',
            textDecoration: 'none',
            fontSize: '15px',
            fontWeight: '500',
          }}>
            Events
          </Link>
          <Link href="/agents" style={{
            color: '#475569',
            textDecoration: 'none',
            fontSize: '15px',
            fontWeight: '500',
          }}>
            Agents
          </Link>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginLeft: '16px',
            paddingLeft: '16px',
            borderLeft: '1px solid #e2e8f0',
          }}>
            <Link href="/profile" style={{
              fontSize: '14px',
              color: '#64748b',
              textDecoration: 'none',
            }}>
              {user.email}
            </Link>
            <button
              onClick={handleSignOut}
              style={{
                background: 'transparent',
                border: '1px solid #cbd5e1',
                color: '#475569',
                padding: '6px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              Sign Out
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}

