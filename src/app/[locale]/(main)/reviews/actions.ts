// src/app/[locale]/(main)/reviews/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { submitReviewSchema, getReviewSummarySchema } from "@/lib/validations/review.schema";
import { pseudonymizeName } from "@/lib/reviews/display-name";
import type { ActionResult } from "@/types/actions";
import type { ReviewRow, ReviewSummary, ReviewSummaryRaw } from "@/types/database.types";

type CanReviewCode =
  | "OK"
  | "NOT_AUTHENTICATED"
  | "SELF_REVIEW"
  | "TRIP_NOT_FOUND"
  | "TRIP_NOT_COMPLETED"
  | "WINDOW_EXPIRED"
  | "NOT_PARTICIPANTS"
  | "DUPLICATE";

function mapEligibilityCode(code: CanReviewCode): string {
  switch (code) {
    case "NOT_AUTHENTICATED":
      return "errors.common.auth_required";
    case "SELF_REVIEW":
      return "errors.review.self_review";
    case "TRIP_NOT_FOUND":
      return "errors.review.trip_not_found";
    case "TRIP_NOT_COMPLETED":
      return "errors.review.trip_not_completed";
    case "WINDOW_EXPIRED":
      return "errors.review.window_expired";
    case "NOT_PARTICIPANTS":
      return "errors.review.not_participants";
    case "DUPLICATE":
      return "errors.review.duplicate";
    default:
      return "errors.review.submit_failed";
  }
}

export async function submitReview(rawData: unknown): Promise<ActionResult<ReviewRow>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const parsed = submitReviewSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
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
    return { success: false, error: { code: "errors.review.submit_failed" } };
  }

  if (code !== "OK") {
    return { success: false, error: { code: mapEligibilityCode(code as CanReviewCode) } };
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
      return { success: false, error: { code: mapEligibilityCode("DUPLICATE") } };
    }
    console.error("[submitReview]", insertError.message);
    return { success: false, error: { code: "errors.review.submit_failed" } };
  }

  revalidatePath("/dashboard");
  return { success: true, data: review as ReviewRow };
}

function adaptSummary(raw: NonNullable<ReviewSummaryRaw>): ReviewSummary {
  return {
    avg: Number(raw.avg),
    count: Number(raw.count),
    recent: raw.recent.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      reviewerDisplayName: pseudonymizeName(r.reviewer_full_name),
      createdAt: r.created_at,
    })),
  };
}

export async function getPassengerReviewSummary(rawData: unknown): Promise<ActionResult<ReviewSummary>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const parsed = getReviewSummarySchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  const { data, error } = await supabase.rpc("get_passenger_review_summary", {
    p_passenger_id: parsed.data.user_id,
  });

  if (error) {
    console.error("[getPassengerReviewSummary]", error.message);
    return { success: false, error: { code: "errors.review.summary_failed" } };
  }

  if (data === null) {
    return { success: false, error: { code: "errors.review.unauthorized" } };
  }

  return { success: true, data: adaptSummary(data as NonNullable<ReviewSummaryRaw>) };
}

export async function getDriverReviewDetails(rawData: unknown): Promise<ActionResult<ReviewSummary>> {
  const supabase = await createServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }

  const parsed = getReviewSummarySchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: { code: parsed.error.issues[0].message } };
  }

  const { data, error } = await supabase.rpc("get_driver_review_details", {
    p_driver_id: parsed.data.user_id,
  });

  if (error) {
    console.error("[getDriverReviewDetails]", error.message);
    return { success: false, error: { code: "errors.review.summary_failed" } };
  }

  if (data === null) {
    return { success: false, error: { code: "errors.review.unauthorized" } };
  }

  return { success: true, data: adaptSummary(data as NonNullable<ReviewSummaryRaw>) };
}
