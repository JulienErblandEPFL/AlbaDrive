// src/lib/intl/translate.test.ts
// CI guardrail: every key present in fr/{namespace}.json must exist in
// en/, de/, and sq/ counterparts. Catches missing translations at test
// time rather than as a runtime [Missing translation] warning in production.
import { describe, expect, it } from "vitest";
import { NAMESPACES, routing } from "@/i18n/routing";

function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return prefix ? [prefix] : [];
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "_meta") continue; // bookkeeping field, not a translation key
    const path = prefix ? `${prefix}.${k}` : k;
    keys.push(...flatten(v, path));
  }
  return keys;
}

describe("translation parity", () => {
  for (const ns of NAMESPACES) {
    it(`fr/${ns}.json keys are present in every other locale`, async () => {
      const fr = (await import(`@/messages/fr/${ns}.json`)).default;
      const expected = flatten(fr).sort();
      for (const locale of routing.locales) {
        if (locale === "fr") continue;
        const other = (await import(`@/messages/${locale}/${ns}.json`)).default;
        const actual = flatten(other);
        const missing = expected.filter((k) => !actual.includes(k));
        expect(
          missing,
          `${locale}/${ns}.json is missing: ${missing.join(", ")}`,
        ).toEqual([]);
      }
    });
  }
});
