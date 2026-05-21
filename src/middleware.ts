// src/middleware.ts
// ─────────────────────────────────────────────────────────────
// Responsibilities (in order):
//  1. Locale routing via next-intl: redirect "/" → "/{locale}/" and prefix
//     unprefixed URLs with the negotiated locale.
//  2. Refresh the Supabase session on every request (cookie rewrite).
//  3. Redirect unauthenticated users away from auth-required routes.
//  4. Redirect authenticated users away from auth-only pages.
//  5. Redirect authenticated users without a profile away from
//     routes that require a complete profile.
//
// All match patterns operate on the locale-stripped pathname so the existing
// route-visibility matrix is preserved verbatim:
//  /                   → public (anyone)
//  /trips              → public (anyone)
//  /trips/[id]         → public (anyone)
//  /trips/create       → protected (auth + profile required)
//  /dashboard          → protected (auth + profile required)
//  /complete-profile   → auth only (no profile required — they're creating it)
//  /login /register    → auth-only pages (redirect authenticated users out)
//  /auth/*             → not handled here (excluded from matcher)
// ─────────────────────────────────────────────────────────────
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const AUTH_ONLY_PREFIXES = ["/login", "/register"] as const;
const PROTECTED_PREFIXES = ["/dashboard", "/trips/create"] as const;
const PROFILE_SETUP_PATH = "/complete-profile";

const LOCALE_REGEX = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

function matchesAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => matchesPrefix(pathname, p));
}

function stripLocale(pathname: string): { locale: string | null; path: string } {
  const match = pathname.match(LOCALE_REGEX);
  if (!match) return { locale: null, path: pathname };
  const stripped = pathname.slice(match[0].length) || "/";
  return { locale: match[1], path: stripped };
}

export async function middleware(request: NextRequest) {
  // Step 1 — locale routing. If the URL is missing a locale prefix, this
  // returns a redirect response we should NOT mutate further.
  const response = intlMiddleware(request);

  // Step 2 — Supabase session refresh, threading any cookie writes onto the
  // intl response so locale + session cookies travel together.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the session token.
  // Do NOT remove this call — it is what keeps sessions alive.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Step 3 — if intl already issued a redirect (e.g. "/" → "/fr/" or
  // "/dashboard" → "/fr/dashboard"), let it through. Auth checks will run on
  // the next request, by which point the path is locale-prefixed.
  if (response.headers.get("location")) {
    return response;
  }

  const { locale, path } = stripLocale(request.nextUrl.pathname);

  // No locale prefix means this is a route outside i18n (shouldn't happen with
  // current routes but defensively passes through).
  if (!locale) {
    return response;
  }

  const buildLocaleUrl = (path: string) =>
    new URL(`/${locale}${path}`, request.url);

  // ── Unauthenticated visitor ─────────────────────────────────
  if (!user) {
    const requiresAuth =
      matchesAny(path, PROTECTED_PREFIXES) ||
      matchesPrefix(path, PROFILE_SETUP_PATH);

    if (requiresAuth) {
      return NextResponse.redirect(buildLocaleUrl("/login"));
    }
    return response;
  }

  // ── Authenticated user on auth-only pages ───────────────────
  if (matchesAny(path, AUTH_ONLY_PREFIXES)) {
    return NextResponse.redirect(buildLocaleUrl("/dashboard"));
  }

  // ── Profile completeness check ──────────────────────────────
  if (matchesAny(path, PROTECTED_PREFIXES)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.redirect(buildLocaleUrl("/complete-profile"));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match everything except: Next internals, static asset extensions, the
    // favicon, and the OAuth callback route handler.
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
