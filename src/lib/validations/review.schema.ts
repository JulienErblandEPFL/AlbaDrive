// src/lib/validations/review.schema.ts
// Validation messages are i18n keys (dotted paths into messages/*/validation.json).
import { z } from "zod";

export const submitReviewSchema = z.object({
  trip_id: z.string().uuid("validation.review.trip_id.invalid"),
  reviewee_id: z.string().uuid("validation.review.reviewee_id.invalid"),
  rating: z
    .number({ error: "validation.review.rating.required" })
    .int()
    .min(1, "validation.review.rating.range")
    .max(5, "validation.review.rating.range"),
  comment: z
    .string()
    .trim()
    .max(1000, "validation.review.comment.too_long")
    .optional()
    .or(z.literal("")),
});

export const getReviewSummarySchema = z.object({
  user_id: z.string().uuid("validation.review.user_id.invalid"),
});
