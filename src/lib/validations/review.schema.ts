// src/lib/validations/review.schema.ts
import { z } from "zod";

export const submitReviewSchema = z.object({
  trip_id: z.string().uuid("Identifiant de trajet invalide."),
  reviewee_id: z.string().uuid("Identifiant d'utilisateur invalide."),
  rating: z
    .number({ error: "Veuillez choisir une note." })
    .int()
    .min(1, "La note doit être entre 1 et 5.")
    .max(5, "La note doit être entre 1 et 5."),
  comment: z
    .string()
    .trim()
    .max(1000, "Le commentaire est trop long (1000 caractères maximum).")
    .optional()
    .or(z.literal("")),
});

export const getReviewSummarySchema = z.object({
  user_id: z.string().uuid("Identifiant d'utilisateur invalide."),
});
