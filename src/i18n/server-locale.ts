// Server-only helper used at sign-in time to seed the NEXT_LOCALE cookie
// from the user's saved preferred_locale. Honours the saved value over any
// other signal (OAuth provider hint, browser Accept-Language header) so a
// returning user lands in the same UI language they last selected, regardless
// of the device they're on.
//
// Best-effort: any failure (no profile row yet, RLS denies, invalid value) is
// logged and silently swallowed. The user simply falls back to whatever locale
// they had during the unauthenticated session.

import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { routing, type SupportedLocale } from "@/i18n/routing";

const LOCALE_COOKIE = "NEXT_LOCALE";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (routing.locales as readonly string[]).includes(value)
  );
}

export async function seedLocaleCookieFromProfile(userId: string): Promise<void> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("preferred_locale")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        `[seedLocaleCookieFromProfile] read failed for ${userId}:`,
        error.message,
      );
      return;
    }

    const saved = data?.preferred_locale;
    if (!isSupportedLocale(saved)) return;

    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, saved, {
      maxAge: ONE_YEAR_SECONDS,
      path: "/",
      sameSite: "lax",
    });
  } catch (err) {
    console.error(
      `[seedLocaleCookieFromProfile] unexpected error for ${userId}:`,
      err,
    );
  }
}
