// Helpers for emitting SEO metadata that respects the 4-locale routing scheme.
// Used by every public page's generateMetadata to populate alternates.languages
// (the <link rel="alternate" hreflang="…" /> tags Google + Bing read) and the
// per-locale openGraph.locale tag.
import { routing, type SupportedLocale } from "@/i18n/routing";

// `NEXT_PUBLIC_APP_URL` may carry a trailing slash from .env (Vercel sometimes
// stores it that way). Normalise once so callers don't have to think about it.
function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

// Open Graph expects BCP-47-ish locale codes with a region — `fr_FR`, not `fr`.
// Region picks reflect AlbaDrive's user base; "sq_AL" is closer to the diaspora
// vernacular than "sq_XK", though both Kosovars and Albanians use the bundle.
const OG_LOCALE_MAP: Record<SupportedLocale, string> = {
  fr: "fr_FR",
  en: "en_GB",
  de: "de_DE",
  sq: "sq_AL",
};

export function getOgLocale(locale: SupportedLocale): string {
  return OG_LOCALE_MAP[locale];
}

export function getOgAlternateLocales(currentLocale: SupportedLocale): string[] {
  return routing.locales
    .filter((l) => l !== currentLocale)
    .map((l) => OG_LOCALE_MAP[l]);
}

/**
 * Builds the `alternates.languages` map for `metadata`.
 *
 * `pathSuffix` is the part after the locale segment with a leading slash,
 * empty string for the landing page. Examples:
 *   - landing:    pathSuffix = ""           → /fr, /en, /de, /sq
 *   - search:     pathSuffix = "/trips"     → /fr/trips, /en/trips, …
 *   - detail:     pathSuffix = "/trips/abc" → /fr/trips/abc, …
 *
 * Emits an `x-default` entry pointing at the app's default locale, which is
 * the convention Google recommends when the user's preferred language can't
 * be inferred from `Accept-Language`.
 */
export function buildLocaleAlternates(pathSuffix: string): Record<string, string> {
  const site = getSiteUrl();
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc] = `${site}/${loc}${pathSuffix}`;
  }
  languages["x-default"] = `${site}/${routing.defaultLocale}${pathSuffix}`;
  return languages;
}

/** Canonical URL for the current locale + path. */
export function buildCanonical(locale: SupportedLocale, pathSuffix: string): string {
  return `${getSiteUrl()}/${locale}${pathSuffix}`;
}
