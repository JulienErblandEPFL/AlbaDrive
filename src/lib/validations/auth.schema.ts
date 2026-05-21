// src/lib/validations/auth.schema.ts
// Validation messages are i18n keys (dotted paths into messages/*/validation.json),
// not user-facing strings. Server Actions surface them via ActionError.code,
// and clients translate at render with `t(code)`.
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("validation.auth.email.invalid"),
  password: z.string().min(1, "validation.auth.password.required"),
});

export const registerSchema = z
  .object({
    email: z.string().email("validation.auth.email.invalid"),
    password: z.string().min(8, "validation.auth.password.too_short"),
    confirmPassword: z.string().min(1, "validation.auth.confirm_password.required"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "validation.auth.passwords_dont_match",
    path: ["confirmPassword"],
  });

export const completeProfileSchema = z.object({
  full_name: z
    .string()
    .min(2, "validation.auth.full_name.too_short")
    .max(100, "validation.auth.full_name.too_long"),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "validation.auth.phone.format"),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "validation.auth.country.format")
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;
