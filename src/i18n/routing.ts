import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "de", "sq"] as const,
  defaultLocale: "fr",
  localePrefix: "always",
  localeDetection: true,
});

export type SupportedLocale = (typeof routing.locales)[number];

export const NAMESPACES = [
  "common",
  "navbar",
  "auth",
  "landing",
  "trips",
  "bookings",
  "reviews",
  "dashboard",
  "status",
  "errors",
  "validation",
  "countries",
] as const;

export type Namespace = (typeof NAMESPACES)[number];
