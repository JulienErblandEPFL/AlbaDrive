"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { routing } from "@/i18n/routing";
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

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parsed.data.locale, {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
  });

  return { success: true };
}
