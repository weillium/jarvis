import { createServerClient } from '@/shared/lib/supabase/server';
import LandingPage from './(marketing)/components/landing-page';
import AppDashboard from './(app)/components/dashboard';
import { AppShellWrapper } from './(app)/components/app-shell-wrapper';

export default async function RootPage() {
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

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
}
