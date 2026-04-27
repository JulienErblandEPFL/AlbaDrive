// src/app/sitemap.ts — auto-generated /sitemap.xml at the root.
//
// Lists the public, indexable URLs and emits hreflang alternates per entry so
// Google can route the user to the locale variant matching their preference.
// Auth-walled or near-auth pages (login/register/dashboard/complete-profile)
// are intentionally excluded — there's nothing for a crawler to consume there.
//
// Dynamic /trips/[id] URLs are not enumerated yet: it would require a DB
// query at sitemap-fetch time and the trip set is small + churn-heavy in the
// MVP. Public pages cover the SEO surface that matters today (brand + search).
import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { buildCanonical, buildLocaleAlternates } from "@/lib/intl/seo";

// Public path suffixes (after the locale segment). Empty = landing.
const PUBLIC_PATHS = ["", "/trips"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return PUBLIC_PATHS.map((pathSuffix) => ({
    // Canonical URL is the default-locale version; alternates carry the rest.
    url: buildCanonical(routing.defaultLocale, pathSuffix),
    lastModified: now,
    changeFrequency: pathSuffix === "" ? "weekly" : "daily",
    priority: pathSuffix === "" ? 1.0 : 0.8,
    alternates: {
      languages: buildLocaleAlternates(pathSuffix),
    },
  }));
}
