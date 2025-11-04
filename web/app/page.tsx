import { createServerClient } from '@/shared/lib/supabase/server';
import LandingPage from './(marketing)/components/landing-page';
import AppDashboard from './(app)/components/dashboard';
import { AppShellWrapper } from './(app)/components/app-shell-wrapper';

export default async function RootPage() {
  try {
    const supabase = await createServerClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error('[Root Page] Error getting session:', {
        message: error.message,
        status: error.status,
        name: error.name,
      });
      // On error, show landing page (unauthenticated state)
      return <LandingPage />;
    }

    if (session) {
      // Authenticated: show app dashboard with app shell
      return (
        <AppShellWrapper>
          <AppDashboard />
        </AppShellWrapper>
      );
    } else {
      // Unauthenticated: show marketing landing
      return <LandingPage />;
    }
  } catch (err) {
    console.error('[Root Page] Exception getting session:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // On exception, show landing page (unauthenticated state)
    return <LandingPage />;
  }
}
