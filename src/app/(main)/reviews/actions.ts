// src/app/(main)/reviews/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { submitReviewSchema } from "@/lib/validations/review.schema";
import type { ActionResult } from "@/types/actions";
import type { ReviewRow } from "@/types/database.types";

type CanReviewCode =
  | "OK"
  | "NOT_AUTHENTICATED"
  | "SELF_REVIEW"
  | "TRIP_NOT_FOUND"
  | "TRIP_NOT_COMPLETED"
  | "WINDOW_EXPIRED"
  | "NOT_PARTICIPANTS"
  | "DUPLICATE";

function mapEligibilityError(code: CanReviewCode): string {
  switch (code) {
    case "NOT_AUTHENTICATED":
      return "Authentification requise.";
    case "SELF_REVIEW":
      return "Vous ne pouvez pas vous évaluer vous-même.";
    case "TRIP_NOT_FOUND":
      return "Trajet introuvable.";
    case "TRIP_NOT_COMPLETED":
      return "Vous ne pouvez évaluer qu'un trajet terminé.";
    case "WINDOW_EXPIRED":
      return "Le délai pour laisser un avis (30 jours) est dépassé.";
    case "NOT_PARTICIPANTS":
      return "Vous n'avez pas partagé ce trajet avec cette personne.";
    case "DUPLICATE":
      return "Vous avez déjà laissé un avis pour ce trajet.";
    default:
      return "Évaluation impossible. Veuillez réessayer.";
  }
}

export async function submitReview(rawData: unknown): Promise<ActionResult<ReviewRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Authentification requise." };
  }

  const parsed = submitReviewSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Pre-insert eligibility check via RPC — gives us a specific error code.
  // The INSERT RLS policy uses the same SQL function (can_review) as defence
  // in depth; this client-side call is purely for error messaging.
  const { data: code, error: rpcError } = await supabase.rpc("can_review_reason", {
    p_reviewee_id: parsed.data.reviewee_id,
    p_trip_id: parsed.data.trip_id,
  });

  if (rpcError) {
    console.error("[submitReview] can_review_reason", rpcError.message);
    return { success: false, error: "Évaluation impossible. Veuillez réessayer." };
  }

  if (code !== "OK") {
    return { success: false, error: mapEligibilityError(code as CanReviewCode) };
  }

  const { data: review, error: insertError } = await supabase
    .from("reviews")
    .insert({
      trip_id: parsed.data.trip_id,
      reviewer_id: user.id,
      reviewee_id: parsed.data.reviewee_id,
      rating: parsed.data.rating,
      comment: parsed.data.comment && parsed.data.comment.length > 0 ? parsed.data.comment : null,
    })
    .select()
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      return { success: false, error: mapEligibilityError("DUPLICATE") };
    }
    console.error("[submitReview]", insertError.message);
    return { success: false, error: "Évaluation impossible. Veuillez réessayer." };
  }

  revalidatePath("/dashboard");
  return { success: true, data: review as ReviewRow };
}
