import { format, type Locale } from "date-fns";
import { de, enGB, fr, sq } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import type { SupportedLocale } from "@/i18n/routing";

// Eager imports — the four locales together add ~15 KB and let us format
// dates synchronously in both Server and Client Components without per-render
// dynamic imports.
const LOCALE_MAP: Record<SupportedLocale, Locale> = {
  fr,
  en: enGB,
  de,
  sq,
};

export function formatLocalizedDate(
  date: Date | string,
  formatStr: string,
  locale: SupportedLocale,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, formatStr, { locale: LOCALE_MAP[locale] });
}

/**
 * Client-component hook: returns a `(date, key) => string` function that
 * pulls the format string from `common.dateFormat.{key}` in the active
 * locale and formats with the matching date-fns locale.
 */
export function useFormatLocalizedDate() {
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations("common.dateFormat");
  return (
    date: Date | string,
    key: "cardDate" | "detail" | "tripCard" | "metaShort",
  ) => formatLocalizedDate(date, t(key), locale);
}
