import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const cookieStore = await cookies();
  
  // Create a simple client for server-side use
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Try to get session from cookies (client sets these)
  // Handle gracefully if cookies don't exist yet (e.g., right after sign-in)
  try {
    const accessToken = cookieStore.get('sb-access-token')?.value;
    const refreshToken = cookieStore.get('sb-refresh-token')?.value;

    if (accessToken && refreshToken) {
      // Use setSession with error handling
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      
      // If session is invalid, don't throw - just return client without session
      if (error) {
        console.warn('Server: Failed to set session from cookies:', error.message);
      }
    }
  } catch (error) {
    // Gracefully handle any errors (e.g., invalid tokens, network issues)
    console.warn('Server: Error reading auth cookies:', error);
  }

  return supabase;
}

export async function getServerSession() {
  const supabase = await createServerClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.warn('Server: Error getting session:', error.message);
    return null;
  }
  
  return session;
}

