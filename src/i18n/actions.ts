"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

// Cookie name follows the next-intl convention so its middleware honours the
// preference without further configuration.
const LOCALE_COOKIE = "NEXT_LOCALE";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const setLocaleSchema = z.object({
  locale: z.enum(routing.locales),
});

export async function setLocale(rawData: unknown): Promise<ActionResult> {
  const parsed = setLocaleSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: "validation.locale.invalid" } };
  }

  const { locale } = parsed.data;

  // Cookie is the request-time source of truth — write it first so the next
  // request honours the new locale even if the profile write fails.
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
  });

  // Best-effort cross-device persistence for authenticated users. Failure must
  // not surface to the UI — the cookie has already been written, the user's
  // locale switch in this session is already effective.
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_locale: locale })
      .eq("id", user.id);
    if (error) {
      console.error(
        `[setLocale] failed to persist preferred_locale for user ${user.id}:`,
        error.message,
      );
    }
  }

  return { success: true };
}
