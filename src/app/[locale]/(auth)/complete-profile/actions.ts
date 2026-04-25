// src/app/[locale]/(auth)/complete-profile/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { completeProfileSchema } from "@/lib/validations/auth.schema";
import type { ActionResult } from "@/types/actions";

export async function completeProfile(rawData: unknown): Promise<ActionResult> {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: { code: "errors.common.session_expired" } };
  }

  const parsed = completeProfileSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  const { error: dbError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
    },
    { onConflict: "id" },
  );

  if (dbError) {
    if (dbError.message.includes("profiles_phone_unique_idx")) {
      return { success: false, error: { code: "errors.auth.phone_already_used" } };
    }
    console.error("[completeProfile]", dbError.message);
    return { success: false, error: { code: "errors.auth.profile_save_failed" } };
  }

  redirect("/dashboard");
}
