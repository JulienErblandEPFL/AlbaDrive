// src/middleware.ts
// ─────────────────────────────────────────────────────────────
// Responsibilities (in order):
//  1. Refresh the Supabase session on every request (cookie rewrite).
//  2. Redirect unauthenticated users away from auth-required routes.
//  3. Redirect authenticated users away from auth-only pages.
//  4. Redirect authenticated users without a profile away from
//     routes that require a complete profile.
//
// Route visibility matrix:
//  /                   → public (anyone)
//  /trips              → public (anyone)
//  /trips/[id]         → public (anyone)
//  /trips/create       → protected (auth + profile required)
//  /dashboard          → protected (auth + profile required)
//  /complete-profile   → auth only (no profile required — they're creating it)
//  /login /register    → auth-only pages (redirect authenticated users out)
//  /auth/*             → public (OAuth callback)
// ─────────────────────────────────────────────────────────────
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pages only for unauthenticated users — authenticated users are redirected away. */
const AUTH_ONLY_PREFIXES = ["/login", "/register"];

/** Pages requiring auth + a complete profile. */
const PROTECTED_PREFIXES = ["/dashboard", "/trips/create"];

/** Page requiring auth but NOT a profile (the user is actively creating one). */
const PROFILE_SETUP_PATH = "/complete-profile";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

function matchesAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => matchesPrefix(pathname, p));
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() refreshes the session token.
  // Do NOT remove this call — it is what keeps sessions alive.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Unauthenticated visitor ─────────────────────────────────
  if (!user) {
    // Protected routes and profile setup both require a session.
    const requiresAuth =
      matchesAny(pathname, PROTECTED_PREFIXES) ||
      matchesPrefix(pathname, PROFILE_SETUP_PATH);

    if (requiresAuth) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    // Everything else (/, /trips, /trips/[id], /auth/*, /login, /register) is public.
    return supabaseResponse;
  }

  // ── Authenticated user on auth-only pages ───────────────────
  // They're already in — send them to the dashboard.
  if (matchesAny(pathname, AUTH_ONLY_PREFIXES)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Profile completeness check ──────────────────────────────
  // Only enforced for routes that truly require a complete profile.
  // Public routes (/, /trips, /trips/[id]) and /complete-profile are exempt.
  if (matchesAny(pathname, PROTECTED_PREFIXES)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.redirect(new URL("/complete-profile", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
