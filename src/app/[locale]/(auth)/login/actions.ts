// src/app/(auth)/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth.schema";
import type { ActionResult } from "@/types/actions";

export async function signIn(rawData: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Never expose the raw Supabase error — it can leak enumeration info.
    return { success: false, error: "Email ou mot de passe incorrect." };
  }

  // Middleware will handle /complete-profile redirect if profile is missing.
  redirect("/dashboard");
}
