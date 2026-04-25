// src/lib/validations/booking.schema.ts
// Validation messages are i18n keys (dotted paths into messages/*/validation.json).
import { z } from "zod";

export const requestBookingSchema = z.object({
  trip_id: z.string().uuid("validation.booking.trip_id.invalid"),
  seats_requested: z.number().int().min(1).max(9),
  passenger_message: z.string().max(500).optional(),
});

export const acceptBookingSchema = z.object({
  booking_id: z.string().uuid("validation.booking.id.invalid"),
});

export const cancelBookingSchema = z.object({
  booking_id: z.string().uuid("validation.booking.id.invalid"),
});

export const getWhatsAppLinkSchema = z.object({
  booking_id: z.string().uuid("validation.booking.id.invalid"),
});
