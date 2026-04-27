// src/app/auth/callback/route.ts
// OAuth callback handler — exchanges the authorization code for a session.
// Supabase redirects here after Google (or any OAuth provider) login.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { seedLocaleCookieFromProfile } from "@/i18n/server-locale";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Optional: `next` param lets us redirect to a specific page post-login.
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Honour a returning user's saved preference over the OAuth provider
      // hint or any prior cookie value.
      if (data.user) {
        await seedLocaleCookieFromProfile(data.user.id);
      }
      // Middleware will handle the /complete-profile redirect if no profile exists.
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send back to login with a readable error.
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
