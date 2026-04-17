// src/app/auth/callback/route.ts
// OAuth callback handler — exchanges the authorization code for a session.
// Supabase redirects here after Google (or any OAuth provider) login.
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Optional: `next` param lets us redirect to a specific page post-login.
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Middleware will handle the /complete-profile redirect if no profile exists.
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send back to login with a readable error.
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
