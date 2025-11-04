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
      
      // If session is invalid, clear the cookies and return client without session
      if (error) {
        // Check if user doesn't exist (common after DB reset)
        const isUserNotFound = error.message.includes('User from sub claim in JWT does not exist') ||
                               error.message.includes('user not found') ||
                               error.message.includes('Invalid Refresh Token');
        
        if (isUserNotFound) {
          // Clear invalid cookies (they reference a user that no longer exists)
          try {
            cookieStore.delete('sb-access-token');
            cookieStore.delete('sb-refresh-token');
          } catch (deleteError) {
            // If delete fails, try setting to empty with maxAge: 0
            cookieStore.set('sb-access-token', '', { path: '/', maxAge: 0 });
            cookieStore.set('sb-refresh-token', '', { path: '/', maxAge: 0 });
          }
          // Don't log - this is expected after DB reset
        } else {
          // Log other auth errors for debugging
          console.warn('Server: Failed to set session from cookies:', error.message);
        }
      }
    }
  } catch (error) {
    // Gracefully handle any errors (e.g., invalid tokens, network issues)
    // Don't log - this is expected when cookies are malformed or missing
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

