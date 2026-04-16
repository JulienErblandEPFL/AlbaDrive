// src/lib/validations/booking.schema.ts
import { z } from "zod";

export const requestBookingSchema = z.object({
  trip_id: z.string().uuid("Invalid trip ID"),
  seats_requested: z.number().int().min(1).max(9),
  passenger_message: z.string().max(500).optional(),
});

export const acceptBookingSchema = z.object({
  booking_id: z.string().uuid("Invalid booking ID"),
});

export const cancelBookingSchema = z.object({
  booking_id: z.string().uuid("Invalid booking ID"),
});

export const getWhatsAppLinkSchema = z.object({
  booking_id: z.string().uuid("Invalid booking ID"),
});
