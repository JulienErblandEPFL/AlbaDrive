// src/lib/validations/trip.schema.ts
// Validation messages are i18n keys (dotted paths into messages/*/validation.json).
import { z } from "zod";

export const locationSchema = z.object({
  label: z.string().min(1, "validation.trip.location.label_required"),
  lat: z.number({ error: "validation.trip.location.lat_required" }),
  lng: z.number({ error: "validation.trip.location.lng_required" }),
  place_id: z.string().optional(),
});

export const createTripSchema = z.object({
  origin: locationSchema,
  destination: locationSchema,
  departure_at: z
    .string()
    .datetime({ offset: true, message: "validation.trip.departure_at.invalid" })
    .refine(
      (val) => new Date(val) > new Date(),
      "validation.trip.departure_at.future",
    ),
  total_seats: z
    .number()
    .int()
    .min(1, "validation.trip.total_seats.min")
    .max(9, "validation.trip.total_seats.max"),
  price_per_seat: z.number().nonnegative().nullable().optional(),
  vehicle_description: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export const cancelTripSchema = z.object({
  trip_id: z.string().uuid("validation.trip.id.invalid"),
});
