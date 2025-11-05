import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          supabaseResponse.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options });
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          supabaseResponse.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Refresh session if expired - this ensures tokens are always fresh
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect app routes (require authentication)
  // Note: Routes under /app/ are authenticated routes
  if (request.nextUrl.pathname.startsWith('/app') || request.nextUrl.pathname === '/') {
    if (!user) {
      const url = new URL('/auth', request.url);
      return NextResponse.redirect(url);
    }
  }

  // Redirect authenticated users away from auth page
  if (request.nextUrl.pathname === '/auth' && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     * - API routes that use service role (like /api/ingest)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

