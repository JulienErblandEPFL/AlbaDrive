// src/app/[locale]/(auth)/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth.schema";
import { seedLocaleCookieFromProfile } from "@/i18n/server-locale";
import type { ActionResult } from "@/types/actions";

export async function signIn(rawData: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  const supabase = await createServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Never expose the raw Supabase error — it can leak enumeration info.
    return { success: false, error: { code: "errors.auth.invalid_credentials" } };
  }

  // Carry the saved locale across devices: a user signing in from a fresh
  // browser should immediately see their last chosen language.
  if (data.user) {
    await seedLocaleCookieFromProfile(data.user.id);
  }

  // Middleware will handle /complete-profile redirect if profile is missing.
  redirect("/dashboard");
}
