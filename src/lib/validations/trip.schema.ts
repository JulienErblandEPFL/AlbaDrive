// src/lib/validations/trip.schema.ts
import { z } from "zod";

export const locationSchema = z.object({
  label: z.string().min(1, "Location label is required"),
  lat: z.number({ error: "Latitude is required" }),
  lng: z.number({ error: "Longitude is required" }),
  place_id: z.string().optional(),
});

export const createTripSchema = z.object({
  origin: locationSchema,
  destination: locationSchema,
  departure_at: z
    .string()
    .datetime({ offset: true, message: "Invalid date format" })
    .refine(
      (val) => new Date(val) > new Date(),
      "Departure must be in the future"
    ),
  total_seats: z
    .number()
    .int()
    .min(1, "At least 1 seat required")
    .max(9, "Maximum 9 seats"),
  price_per_seat: z.number().nonnegative().nullable().optional(),
  vehicle_description: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export const cancelTripSchema = z.object({
  trip_id: z.string().uuid("Invalid trip ID"),
});
