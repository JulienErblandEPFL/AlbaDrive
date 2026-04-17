// src/app/(auth)/register/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { registerSchema } from "@/lib/validations/auth.schema";
import type { ActionResult } from "@/types/actions";

export async function signUp(
  rawData: unknown
): Promise<ActionResult<{ needsEmailConfirmation: boolean }>> {
  const parsed = registerSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createServerClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return {
        success: false,
        error: "Un compte existe déjà avec cet email.",
      };
    }
    console.error("[signUp]", error.message);
    return { success: false, error: "Impossible de créer le compte. Réessayez." };
  }

  // If Supabase email confirmation is enabled, there won't be a session yet.
  if (!data.session) {
    return { success: true, data: { needsEmailConfirmation: true } };
  }

  // Session active — middleware will redirect to /complete-profile (no profile yet).
  redirect("/complete-profile");
}
