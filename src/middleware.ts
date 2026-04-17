// src/middleware.ts
// ─────────────────────────────────────────────────────────────
// Responsibilities (in order):
//  1. Refresh the Supabase session on every request (cookie rewrite).
//  2. Redirect unauthenticated users away from protected routes.
//  3. Redirect authenticated users without a profile to /complete-profile.
//  4. Redirect authenticated users away from auth-only pages.
//
// Public by default: /, /trips, /trips/[id], /auth/*
// Protected (auth required): /dashboard, /trips/create, /complete-profile
// Auth-only (unauthenticated only): /login, /register
// ─────────────────────────────────────────────────────────────
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pages only accessible when NOT logged in. */
const AUTH_ONLY_PREFIXES = ["/login", "/register"];

/** Pages that require a valid session. Everything else is public. */
const PROTECTED_PREFIXES = ["/dashboard", "/trips/create", "/complete-profile"];

/** Skip the profile-completeness check on these paths to avoid redirect loops. */
const SKIP_PROFILE_CHECK_PREFIXES = ["/complete-profile", "/auth/"];

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
    if (matchesAny(pathname, PROTECTED_PREFIXES)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return supabaseResponse;
  }

  // ── Authenticated user on auth-only pages ───────────────────
  if (matchesAny(pathname, AUTH_ONLY_PREFIXES)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Profile completeness check ──────────────────────────────
  if (!matchesAny(pathname, SKIP_PROFILE_CHECK_PREFIXES)) {
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
