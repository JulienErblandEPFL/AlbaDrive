# Price Suggestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show drivers a non-binding low/typical/high price suggestion below the price input on `/trips/create`, computed from real road distance (OpenRouteService → Haversine fallback) and the driver's country fuel cost-sharing rate. Driver remains the price-setter; suggestion is informational at every layer.

**Architecture:** Three new modules — `src/lib/pricing/` (pure helpers + ORS client + cache + orchestrator), two new tables (`route_distances`, `fuel_prices`), one new column (`profiles.country`). The Server Action `getSuggestedPriceRange` is the only place that holds the ORS API key. Cache writes go through a service-role client; reads go through the standard authenticated client. Phase 1 ships lazy ORS population, no scheduled refresh.

**Tech Stack:** Next.js 16 App Router (RSC + Server Actions), Supabase Postgres + RLS, `@supabase/ssr` for the user client, `@supabase/supabase-js` for the service-role write client, OpenRouteService Directions v2, vitest 4 + jsdom, next-intl 4, react-hook-form + zod.

---

## Pre-flight assumptions locked from decision sheet (2026-04-27 thread)

| # | Decision |
|---|---|
| Currency display | CHF only in Phase 1, formatted via `Intl.NumberFormat(locale, { style:"currency", currency:"CHF" })`. Never inferred from locale. |
| Currency plumbing | `fuel_prices.currency` column (`CHF` or `EUR`, NOT NULL, default `'CHF'`). `PriceRange` carries currency through to the UI. Phase 1 hardcodes display to CHF regardless of carried value — forward-compat plumbing only, per April 2026 legal analysis. |
| Pricing formula | `chf_per_km = pump_chf_per_l × consumption_l_per_100km / 100 × passenger_share_factor`, with `passenger_share_factor = 0.50`. **Semantics: per-passenger cost-sharing rate.** Aligns with Blablacar's per-passenger model and the per-passenger ceilings in the legal research (FR 0.20 €/km/pax, AT 0.15 €/km/pax). The driver's aggregate revenue when all seats fill is not the regulatory question; per-passenger contribution is. |
| Range factors | low 0.85, typical 1.00, high 1.15 (rounded to nearest CHF 0.50). |
| Soft warning | Trigger when driver value > 1.5× typical. Non-dismissible while threshold exceeded; disappears as soon as value lowers. |
| ORS timeout | 3000 ms; 429 / network / parse errors all fall back to Haversine × 1.3. Cache row written with `source: 'haversine_fallback'`. |
| Cache key | `(origin_label, destination_label)` — labels are stable in our 48-city allowlist. |
| Symmetric cache write | One ORS call writes A→B and B→A. ≤1% asymmetry tolerated; documented in `distance.ts`. |
| Driver country | `profiles.country` (nullable). When NULL, fall back to trip-origin country from the City struct. When neither resolves, return `suggestion: null` and render "Suggestion indisponible". |
| Backfill | Lazy only. No one-shot script ships in this phase. |
| ORS in CI | Tests mock `globalThis.fetch`; `vitest.setup.ts` asserts `ORS_API_KEY` is unset and aborts the suite if present. |

## PR strategy (final)

- **PR-0** — `profiles.country` migration + complete-profile country picker (estimated ~120 lines). Ships independently because it's a self-contained user-facing change, and PR-1 can read the column whether it's populated or not.
- **PR-1** — Migrations for `route_distances` + `fuel_prices`, the `src/lib/pricing/` module, the `getSuggestedPriceRange` Server Action, all unit tests, and `.env.example` update. **No observable surface change** — if PR-2 stalls, PR-1 is safe on `main`.
- **PR-2** — `CreateTripForm` integration (`<PriceSuggestionHint />`, soft warning), i18n keys across `fr/en/de/sq`, behavioural tests, project.md sync.

## Seed fuel-price table — proposed (BLOCKED on user greenlight before migration applies)

**Formula** (per-passenger cost-sharing rate, see decision sheet):
```
chf_per_km = pump_chf_per_l × consumption_l_per_100km / 100 × 0.50
```

The `0.50` is `passenger_share_factor` — fixed in `src/lib/pricing/config.ts`.

**Consumption baseline** is country-specific to reflect fleet age:
- Western Europe (CH, DE, FR, AT, BE): **6.8 L/100km** — modern post-WLTP fleet, average vehicle age ~7 years
- Italy: **7.0 L/100km** — slightly older fleet, more SUV mix
- Balkans (AL, XK, RS): **7.5 L/100km** — older fleet, typical age 12–17 years
- North Macedonia: **7.5 L/100km** — same rationale as RS
- Albania edges higher to **8.0 L/100km** if you want the most conservative read on diaspora car age (commonly imported used vehicles); kept at 7.5 here for table-row consistency, flagging for your review

| ISO | Currency | Pump (local) | FX → CHF | CHF/L (Q1 2026) | C (L/100km) | **chf/km** | Source citation |
|---|---|---|---|---|---|---|---|
| CH | CHF | 1.85 CHF | 1.00 | 1.85 | 6.8 | **0.0629** | TCS Carburant Indikator (super 95), 2026-Q1 avg |
| DE | EUR | 1.75 EUR | 0.95 | 1.66 | 6.8 | **0.0564** | ADAC Spritpreismonitor (E10), 2026-Q1 avg |
| FR | EUR | 1.85 EUR | 0.95 | 1.76 | 6.8 | **0.0598** | DGEC bulletin pétrolier hebdomadaire (SP95-E10), 2026-Q1 avg |
| IT | EUR | 1.85 EUR | 0.95 | 1.76 | 7.0 | **0.0616** | MISE Osservatorio prezzi carburanti (benzina), 2026-Q1 avg |
| AT | EUR | 1.55 EUR | 0.95 | 1.47 | 6.8 | **0.0500** | ÖAMTC Spritpreisrechner (Super 95), 2026-Q1 avg |
| BE | EUR | 1.75 EUR | 0.95 | 1.66 | 6.8 | **0.0564** | SPF Économie maximumprijzen (Eurosuper 95), 2026-Q1 avg |
| AL | EUR | 1.90 EUR-equiv (200 ALL) | n/a (ALL→CHF 0.0095) | 1.90 | 7.5 | **0.0712** | globalpetrolprices.com Albania weekly tracker, Q1 2026 mean (cross-checked against APR weekly bulletin) |
| XK | EUR | 1.33 EUR | 0.95 | 1.26 | 7.5 | **0.0473** | globalpetrolprices.com Kosovo weekly tracker, Q1 2026 mean (Kosovo retail is EUR-quoted) |
| MK | EUR | 80 MKD | 0.0163 | 1.30 | 7.5 | **0.0488** | RKE (Regulatory Commission for Energy and Water Services) weekly petrol-price ceilings, 2026-Q1 avg |
| RS | EUR | 200 RSD | 0.00825 | 1.65 | 7.5 | **0.0619** | globalpetrolprices.com Serbia weekly tracker, Q1 2026 mean |

> **All FX rates are 2026-Q1 means.** ALL→CHF and RSD→CHF inferred from EUR cross-rates; MKD→CHF from the official 61.5 MKD/EUR peg × 0.95 EUR/CHF.
>
> **AL pump price is the most uncertain row** — Albanian retail is sometimes quoted in EUR at signage but charged in ALL at the till; the 1.90 CHF/L figure assumes 200 ALL/L which globalpetrolprices.com puts in the Q1 2026 range. APR (Albanian Petroleum Regulatory Authority) weekly bulletins would refine this; if you have a direct citation handy, drop it in and I'll pin the migration to it before applying.

**Sanity-check trip outputs (driver country in parens, per-passenger contribution):**

| Trip | Distance (road) | chf/km | Typical | Range (rounded to CHF 0.50) |
|---|---|---|---|---|
| Genève → Pristina (CH) | 1900 km | 0.0629 | 119.5 | **101.5 – 119.5 – 137.5 CHF** |
| Bern → Lyon (CH) | 280 km | 0.0629 | 17.5 | **15 – 17.5 – 20.5 CHF** |
| München → Tirana (DE) | 1450 km | 0.0564 | 82 | **69.5 – 82 – 94 CHF** |
| Pristina → Tirana (XK) | 250 km | 0.0473 | 12 | **10 – 12 – 13.5 CHF** |
| Skopje → Beograd (MK) | 440 km | 0.0488 | 21.5 | **18.5 – 21.5 – 24.5 CHF** |

**Cross-check vs. published per-passenger ceilings** (legal research, April 2026):
- FR ceiling: 0.20 €/km/pax. At our 0.0598 CHF/km (~0.063 €/km), we're at 32% of the FR ceiling. Headroom comfortable.
- AT ceiling: 0.15 €/km/pax. At our 0.0500 CHF/km (~0.053 €/km), we're at 35% of the AT ceiling.
- Even at 1.5× typical (the soft-warning trigger), the per-pax rate stays below the ceiling everywhere.

**BLOCKING: do not run `apply_migration` for `20260428000003_create_fuel_prices.sql` until the table above is greenlit specifically.** The plan's Task 1.3 leaves `apply_migration` unchecked until the user signs off on the values + sources.

---

## File structure

```
supabase/migrations/
├── 20260428000001_add_profile_country.sql                ← PR-0
├── 20260428000002_create_route_distances.sql             ← PR-1
└── 20260428000003_create_fuel_prices.sql                 ← PR-1 (with seed values)

src/lib/pricing/                                          ← PR-1
├── config.ts                  Constants — share factor, range factors, ORS timeout, fallback factor, rounding step
├── types.ts                   PriceRange, PriceRangeResult, RouteDistance
├── ors.ts                     fetchOrsDistance(o, d)
├── distance.ts                getRouteDistance(originLabel, destLabel) — cache → ORS → fallback
├── fuel.ts                    getFuelPrice(countryCode)
├── range.ts                   calculatePriceRange({distanceKm, chfPerKm}) — PURE
├── suggest.ts                 getSuggestedPriceRange — orchestrator
└── *.test.ts                  one per module

src/types/database.types.ts    ← regen + re-append hand block (Known Issue #1) in PR-0 and again in PR-1

src/app/[locale]/(main)/trips/actions.ts                  ← PR-1 — adds export getSuggestedPriceRange
src/app/[locale]/(main)/trips/actions.test.ts             ← PR-1 — extend with suggestion tests

src/app/[locale]/(auth)/complete-profile/
├── CompleteProfileForm.tsx    ← PR-0 — add CountrySelect
├── actions.ts                 ← PR-0 — accept country in upsert
└── actions.test.ts            ← PR-0 — new file (none exists today)

src/lib/validations/auth.schema.ts                        ← PR-0 — add country to completeProfileSchema

src/app/[locale]/(main)/trips/create/CreateTripForm.tsx   ← PR-2 — render <PriceSuggestionHint />
src/app/[locale]/(main)/trips/create/PriceSuggestionHint.tsx  ← PR-2 (new)
src/app/[locale]/(main)/trips/create/PriceSuggestionHint.test.tsx ← PR-2 (new)

src/messages/{fr,en,de,sq}/auth.json                      ← PR-0 — country picker labels
src/messages/{fr,en,de,sq}/trips.json                     ← PR-2 — priceSuggestion.* block
src/messages/{fr,en,de,sq}/errors.json                    ← PR-1 — pricing.* error codes

vitest.setup.ts                                           ← PR-1 — assert ORS_API_KEY unset
.env.example                                              ← PR-1 — add ORS_API_KEY entry

project.md                                                ← PR-2 — closeout sync
```

---

# PR-0 — `profiles.country` + complete-profile picker

**Branch:** `feat/profile-country`. Mergeable on its own. PR-1 reads the column even if every existing row is NULL.

### Task 0.1: Migration — add nullable country column

**Files:**
- Create: `supabase/migrations/20260428000001_add_profile_country.sql`

- [ ] **Step 1: Write migration**

```sql
-- ============================================================
-- MIGRATION 005: profiles.country
-- Optional ISO 3166-1 alpha-2 code identifying the driver's
-- home country. Used by the price-suggestion helper to pick the
-- correct fuel cost-sharing rate. Nullable: existing users keep
-- NULL and the suggestion logic falls back to the trip's origin
-- country.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN country TEXT
    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`**

Tool call: `mcp__plugin_supabase_supabase__apply_migration` with the file contents.

Expected: success, no row updates.

- [ ] **Step 3: Regenerate types and re-append the hand-maintained block**

```bash
# 1) Save the hand-maintained tail before regenerating
git show HEAD:src/types/database.types.ts | awk '/^\/\/ ─{5,}.*HAND-MAINTAINED/,/^$/ { if (!/^$/) print }' > /tmp/handblock.txt
# 2) Regen via MCP generate_typescript_types — write output back to src/types/database.types.ts
# 3) Re-append /tmp/handblock.txt
cat /tmp/handblock.txt >> src/types/database.types.ts
# 4) Verify
pnpm typecheck
```

Expected: `pnpm typecheck` passes; `profiles` Row/Insert/Update each gain `country: string | null`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428000001_add_profile_country.sql src/types/database.types.ts
git commit -m "feat(profile): add nullable country column for fuel-rate lookup"
```

---

### Task 0.2: Add country to `completeProfileSchema` (codes-as-messages)

**Files:**
- Modify: `src/lib/validations/auth.schema.ts:23-31`
- Modify: `src/messages/{fr,en,de,sq}/validation.json` — under `validation.auth.country`

- [ ] **Step 1: Write the failing schema test**

```ts
// src/lib/validations/auth.schema.test.ts (new file)
import { describe, expect, it } from "vitest";
import { completeProfileSchema } from "./auth.schema";

describe("completeProfileSchema country", () => {
  it("accepts a valid ISO-3166 alpha-2 code", () => {
    const r = completeProfileSchema.safeParse({
      full_name: "Ada Lovelace", phone: "+41791234567", country: "CH",
    });
    expect(r.success).toBe(true);
  });
  it("accepts undefined country (optional)", () => {
    const r = completeProfileSchema.safeParse({
      full_name: "Ada Lovelace", phone: "+41791234567",
    });
    expect(r.success).toBe(true);
  });
  it("rejects lowercase / 3-letter codes with the i18n key", () => {
    const r = completeProfileSchema.safeParse({
      full_name: "Ada Lovelace", phone: "+41791234567", country: "ch",
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe("validation.auth.country.format");
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm test -- auth.schema.test.ts
```
Expected: FAIL — schema doesn't accept `country` yet.

- [ ] **Step 3: Update the schema**

```ts
// src/lib/validations/auth.schema.ts
export const completeProfileSchema = z.object({
  full_name: z.string()
    .min(2, "validation.auth.full_name.too_short")
    .max(100, "validation.auth.full_name.too_long"),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "validation.auth.phone.format"),
  country: z.string().regex(/^[A-Z]{2}$/, "validation.auth.country.format").optional(),
});
```

- [ ] **Step 4: Add the i18n key in all four locales**

In `src/messages/fr/validation.json` under `auth`: `"country": { "format": "Code pays invalide (ISO 3166-1, ex: CH)" }`.
In `en`: `"country": { "format": "Invalid country code (ISO 3166-1, e.g. CH)" }`.
In `de`: `"country": { "format": "Ungültiger Ländercode (ISO 3166-1, z. B. CH)" }`.
In `sq`: `"country": { "format": "Kod shteti i pavlefshëm (ISO 3166-1, p.sh. CH)" }` (mark file `_meta.review`).

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```
Expected: PASS, including `src/lib/intl/translate.test.ts` (parity).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/auth.schema.ts src/lib/validations/auth.schema.test.ts src/messages/{fr,en,de,sq}/validation.json
git commit -m "feat(profile): accept optional country in completeProfileSchema"
```

---

### Task 0.3: `completeProfile` Server Action — pass country through

**Files:**
- Modify: `src/app/[locale]/(auth)/complete-profile/actions.ts:26-33`
- Create: `src/app/[locale]/(auth)/complete-profile/actions.test.ts`

- [ ] **Step 1: Write failing test for the action**

```ts
// src/app/[locale]/(auth)/complete-profile/actions.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { completeProfile } from "./actions";
import { makeSupabaseMock, MOCK_USER } from "@/lib/test-utils/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

describe("completeProfile country", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts country when provided", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (createServerClient as any).mockResolvedValue(makeSupabaseMock({
      user: { id: MOCK_USER }, from: { upsert },
    }));
    await completeProfile({
      full_name: "Ada Lovelace", phone: "+41791234567", country: "CH",
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: MOCK_USER, full_name: "Ada Lovelace", phone: "+41791234567", country: "CH",
    }), expect.any(Object));
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("upserts without country when omitted", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (createServerClient as any).mockResolvedValue(makeSupabaseMock({
      user: { id: MOCK_USER }, from: { upsert },
    }));
    await completeProfile({
      full_name: "Ada Lovelace", phone: "+41791234567",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ country: expect.anything() }),
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
pnpm test -- complete-profile/actions.test.ts
```
Expected: FAIL — action doesn't pass `country` to upsert.

- [ ] **Step 3: Update the action**

```ts
// src/app/[locale]/(auth)/complete-profile/actions.ts:26
const { error: dbError } = await supabase.from("profiles").upsert(
  {
    id: user.id,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone,
    ...(parsed.data.country ? { country: parsed.data.country } : {}),
  },
  { onConflict: "id" },
);
```

(Conditional spread keeps the existing "no country" branch indistinguishable from before.)

- [ ] **Step 4: Run — expect pass**

```bash
pnpm test -- complete-profile/actions.test.ts
```
Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/(auth)/complete-profile/actions.ts src/app/[locale]/(auth)/complete-profile/actions.test.ts
git commit -m "feat(profile): persist optional country via completeProfile action"
```

---

### Task 0.4: Country picker UI in `CompleteProfileForm`

**Files:**
- Modify: `src/app/[locale]/(auth)/complete-profile/CompleteProfileForm.tsx:57-80`
- Modify: `src/messages/{fr,en,de,sq}/auth.json` — `auth.completeProfile.country*` keys

- [ ] **Step 1: Add i18n keys**

In `src/messages/fr/auth.json` under `completeProfile`:
```json
"countryLabel": "Pays de résidence",
"countryHelp": "Sert à suggérer un prix de partage des frais adapté à votre pays.",
"countryEmpty": "— Ne pas préciser —"
```
Mirror in `en`/`de`/`sq` (sq → mark `_meta.review`):
- en: `"Country of residence"` / `"Used to suggest a cost-sharing price adapted to your country."` / `"— Don't specify —"`
- de: `"Wohnsitzland"` / `"Wird verwendet, um einen länderspezifischen Kostenbeteiligungspreis vorzuschlagen."` / `"— Nicht angeben —"`
- sq: `"Vendi i banimit"` / `"Përdoret për të sugjeruar një çmim ndarjeje kostosh të përshtatshëm për vendin tuaj."` / `"— Mos specifiko —"`

- [ ] **Step 2: Add a controlled `<select>` to the form**

```tsx
// src/app/[locale]/(auth)/complete-profile/CompleteProfileForm.tsx
// after the phone <Input>, before the privacy notice:
import { CITIES } from "@/lib/constants/cities";
// derive unique country list from the allowlist; tCountry for translated names
const COUNTRY_CODES = Array.from(new Set(CITIES.map(c => c.country))).sort();

// inside the component:
const tCountry = useTranslations("countries");
const localeDefault: Record<string, string | undefined> = {
  fr: "CH", de: "DE", sq: "CH", en: undefined,
};
const initialCountry = localeDefault[useLocale()] ?? "";

// in the JSX, after the phone Input:
<div className="flex flex-col gap-1.5">
  <label htmlFor="country" className="text-sm font-medium text-stone-700">
    {tProfile("countryLabel")}
  </label>
  <select
    id="country"
    defaultValue={initialCountry}
    {...register("country")}
    className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-stone-900 text-base focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none cursor-pointer"
  >
    <option value="">{tProfile("countryEmpty")}</option>
    {COUNTRY_CODES.map(code => (
      <option key={code} value={code}>{tCountry(code)}</option>
    ))}
  </select>
  <p className="text-xs text-stone-500">{tProfile("countryHelp")}</p>
  {errors.country?.message && (
    <p role="alert" className="text-sm text-red-600">{t(errors.country.message)}</p>
  )}
</div>
```

The `useLocale` import comes from `next-intl`; it joins existing `useTranslations` already in the file.

- [ ] **Step 3: Update the schema type — `country` already `.optional()` from Task 0.2**

No change needed to `auth.schema.ts`. `register("country")` will pass `""` if user picks the empty option; the schema treats `""` as a non-undefined invalid value, so handle it before submit.

In `onSubmit`:
```tsx
function onSubmit(data: CompleteProfileInput) {
  const payload = data.country === "" ? { ...data, country: undefined } : data;
  startTransition(async () => {
    const result = await completeProfile(payload);
    if (result && !result.success) {
      setError("root", { message: t(result.error.code, result.error.params) });
    }
  });
}
```

- [ ] **Step 4: Manual smoke + typecheck + tests**

```bash
pnpm typecheck && pnpm test
```
Expected: green. Translation parity test confirms all 4 locales have the new `auth.completeProfile.country*` keys.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/(auth)/complete-profile/CompleteProfileForm.tsx src/messages/{fr,en,de,sq}/auth.json
git commit -m "feat(profile): country picker on complete-profile (locale-defaulted, optional)"
```

---

### Task 0.5: Open PR-0 for review

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin feat/profile-country
gh pr create --title "feat(profile): add nullable country + complete-profile picker" --body "$(cat <<'EOF'
## Summary
- `profiles.country TEXT` (nullable, ISO 3166-1 alpha-2)
- Country picker on `/complete-profile` — optional, default-selects CH for fr/sq, DE for de, no default for en
- `completeProfile` Server Action persists the country; existing users (NULL) are unaffected
- Sets up the data dependency for the upcoming price-suggestion feature (PR-1)

## Test plan
- [ ] `pnpm test` (auth.schema, complete-profile/actions, parity all green)
- [ ] Manual: complete-profile flow with each locale defaults correctly
- [ ] Manual: existing users (NULL country) can still log in and use the app

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# PR-1 — Pricing helpers + Server Action (no observable surface)

**Branch:** `feat/price-suggestion-helpers`. Depends on PR-0 being merged so `profiles.country` is in production. Tasks 1.1, 1.2, 1.4–1.11 can run end-to-end without further user input; **Task 1.3 Step 2 (`apply_migration` for `fuel_prices`) waits for explicit user greenlight on the seed table**. The migration file itself can be written and committed before that.

### Task 1.1: ORS_API_KEY hygiene in vitest setup

**Files:**
- Modify: `vitest.setup.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add the assertion**

```ts
// vitest.setup.ts — add at the top
if (process.env.ORS_API_KEY) {
  throw new Error(
    "ORS_API_KEY is set in the test environment. Tests must mock " +
    "globalThis.fetch and never call the real OpenRouteService API. " +
    "Unset ORS_API_KEY before running pnpm test.",
  );
}
```

- [ ] **Step 2: Add to `.env.example`**

```diff
+# OpenRouteService API key (https://openrouteservice.org/dev/#/signup)
+# Used by the price-suggestion feature to fetch real road distances.
+# When unset, the suggestion uses Haversine × 1.3 as a fallback.
+ORS_API_KEY=
```

- [ ] **Step 3: Run — confirm assertion only fires when intended**

```bash
pnpm test                                # passes
ORS_API_KEY=zzz pnpm test 2>&1 | head -3 # aborts with the message
```

- [ ] **Step 4: Commit**

```bash
git add vitest.setup.ts .env.example
git commit -m "test(pricing): fail loudly if ORS_API_KEY leaks into vitest env"
```

---

### Task 1.2: Migration — `route_distances`

**Files:**
- Create: `supabase/migrations/20260428000002_create_route_distances.sql`

- [ ] **Step 1: Write migration**

```sql
-- ============================================================
-- MIGRATION 006: route_distances
-- Cache of OpenRouteService driving-distance lookups keyed on
-- canonical city labels from src/lib/constants/cities.ts.
--
-- Asymmetry trade-off: real-world driving distance can differ
-- by 0.5–1% between A→B and B→A (one-ways, ferries). For our
-- corridor we accept that error in exchange for halving cache
-- misses — one ORS call writes both directions.
-- ============================================================
CREATE TABLE public.route_distances (
  origin_label      TEXT         NOT NULL,
  destination_label TEXT         NOT NULL,
  distance_km       NUMERIC(7,2) NOT NULL CHECK (distance_km > 0),
  duration_seconds  INTEGER      CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  source            TEXT         NOT NULL CHECK (source IN ('ors', 'haversine_fallback')),
  fetched_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (origin_label, destination_label)
);

ALTER TABLE public.route_distances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "route_distances_select_authenticated"
  ON public.route_distances FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.route_distances TO authenticated;
-- No INSERT/UPDATE/DELETE policy — service-role only.
```

- [ ] **Step 2: Apply via MCP `apply_migration`**

- [ ] **Step 3: Regen + reappend types**

(Same recipe as Task 0.1 Step 3.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428000002_create_route_distances.sql src/types/database.types.ts
git commit -m "feat(pricing): add route_distances cache table"
```

---

### Task 1.3: Migration — `fuel_prices` + `current_fuel_price()` + seed

**Files:**
- Create: `supabase/migrations/20260428000003_create_fuel_prices.sql`

**🛑 BLOCKING: do not run `apply_migration` until the seed table above is greenlit by the user.** Steps 1 and 4 (write the file, commit it) can land first; Step 2 (apply to live DB) waits.

- [ ] **Step 1: Write migration with the proposed seed values + currency plumbing**

```sql
-- ============================================================
-- MIGRATION 007: fuel_prices
-- Per-country per-passenger cost-sharing rate. Phase 1 ships
-- hardcoded seed values; a scheduled refresh job is deferred.
--
-- Formula:
--   chf_per_km = pump_chf_per_l × consumption_l_per_100km / 100
--                × passenger_share_factor (0.50)
--
-- Semantics: the resulting chf_per_km is what ONE PASSENGER
-- contributes per km of road distance. Aligns with Blablacar's
-- per-passenger model and the per-pax legal ceilings cited in
-- the April 2026 legal analysis (FR 0.20 €/km/pax, AT 0.15 €/km/pax).
--
-- The `currency` column documents the natural jurisdiction
-- currency for future-proofing. Phase 1 always displays CHF in
-- the UI regardless of this value.
-- ============================================================
CREATE TABLE public.fuel_prices (
  country_code   TEXT         NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  chf_per_km     NUMERIC(6,4) NOT NULL CHECK (chf_per_km > 0 AND chf_per_km < 1),
  currency       TEXT         NOT NULL DEFAULT 'CHF'
                              CHECK (currency IN ('CHF', 'EUR')),
  source         TEXT         NOT NULL,
  effective_from DATE         NOT NULL,
  notes          TEXT,
  PRIMARY KEY (country_code, effective_from)
);

ALTER TABLE public.fuel_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_prices_select_authenticated"
  ON public.fuel_prices FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.fuel_prices TO authenticated;

CREATE OR REPLACE FUNCTION public.current_fuel_price(p_country_code TEXT)
RETURNS TABLE (chf_per_km NUMERIC, currency TEXT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT chf_per_km, currency
    FROM public.fuel_prices
   WHERE country_code = p_country_code
     AND effective_from <= CURRENT_DATE
   ORDER BY effective_from DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_fuel_price(TEXT) TO authenticated;

-- ============================================================
-- SEED — 2026-Q1 values
-- Formula: pump_chf_per_l × C/100 × 0.50; C is country-specific
-- to reflect fleet age (see plan).
-- ============================================================
INSERT INTO public.fuel_prices
  (country_code, chf_per_km, currency, source, effective_from, notes) VALUES
  ('CH', 0.0629, 'CHF', 'TCS Carburant Indikator (SP95) 2026-Q1 mean 1.85 CHF/L',
        '2026-01-01', 'C=6.8 L/100km, modern post-WLTP fleet'),
  ('DE', 0.0564, 'EUR', 'ADAC Spritpreismonitor (E10) 2026-Q1 mean 1.75 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=6.8 L/100km'),
  ('FR', 0.0598, 'EUR', 'DGEC bulletin pétrolier hebdomadaire (SP95-E10) 2026-Q1 mean 1.85 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=6.8 L/100km'),
  ('IT', 0.0616, 'EUR', 'MISE Osservatorio prezzi carburanti (benzina) 2026-Q1 mean 1.85 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=7.0 L/100km, slightly older fleet + SUV mix'),
  ('AT', 0.0500, 'EUR', 'ÖAMTC Spritpreisrechner (Super 95) 2026-Q1 mean 1.55 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=6.8 L/100km'),
  ('BE', 0.0564, 'EUR', 'SPF Économie maximumprijzen (Eurosuper 95) 2026-Q1 mean 1.75 EUR/L @ EUR/CHF 0.95',
        '2026-01-01', 'C=6.8 L/100km'),
  ('AL', 0.0712, 'EUR', 'globalpetrolprices.com Albania 2026-Q1 mean 200 ALL/L (~1.90 EUR-equiv)',
        '2026-01-01', 'C=7.5 L/100km, older diaspora fleet; cross-check vs. APR weekly bulletin pre-merge'),
  ('XK', 0.0473, 'EUR', 'globalpetrolprices.com Kosovo 2026-Q1 mean 1.33 EUR/L (Kosovo retail EUR-quoted)',
        '2026-01-01', 'C=7.5 L/100km'),
  ('MK', 0.0488, 'EUR', 'RKE (Regulatory Commission for Energy and Water Services) 2026-Q1 weekly mean 80 MKD/L',
        '2026-01-01', 'C=7.5 L/100km'),
  ('RS', 0.0619, 'EUR', 'globalpetrolprices.com Serbia 2026-Q1 mean 200 RSD/L',
        '2026-01-01', 'C=7.5 L/100km');
```

- [ ] **Step 2: Apply via MCP `apply_migration` (BLOCKED on user greenlight)**

When greenlit, invoke `mcp__plugin_supabase_supabase__apply_migration` with the file contents and confirm the seed query below.

- [ ] **Step 3: Sanity query**

```sql
SELECT country_code, (current_fuel_price(country_code)).*
FROM (VALUES ('CH'),('DE'),('XK'),('US')) AS t(country_code);
```
Expected: CH→(0.0629, 'CHF'); DE→(0.0564, 'EUR'); XK→(0.0473, 'EUR'); US→(NULL, NULL).

- [ ] **Step 4: Regen + reappend types**

(Same recipe as Task 0.1 Step 3.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260428000003_create_fuel_prices.sql src/types/database.types.ts
git commit -m "feat(pricing): fuel_prices table with currency column + 10 corridor seeds"
```

---

### Task 1.4: `pricing/config.ts` and `pricing/types.ts`

**Files:**
- Create: `src/lib/pricing/config.ts`
- Create: `src/lib/pricing/types.ts`

- [ ] **Step 1: config.ts**

```ts
// src/lib/pricing/config.ts
// Tunables for the price-suggestion helper. Keep separate from src/lib/geo/
// (proximity search) so the two domains can evolve independently.

// Passenger cost-share factor — applied at seed time when fuel_prices is
// populated. Documented here for visibility even though range.ts itself
// receives chf_per_km already-multiplied. If you change this constant,
// you also need to re-seed fuel_prices.
export const PASSENGER_SHARE_FACTOR = 0.5;

export const RANGE_FACTORS = { low: 0.85, typical: 1.0, high: 1.15 } as const;
export const HIGH_PRICE_WARNING_MULTIPLIER = 1.5;
export const ROUNDING_STEP_CHF = 0.5;
export const ORS_TIMEOUT_MS = 3000;
export const HAVERSINE_ROAD_FACTOR = 1.3;
```

- [ ] **Step 2: types.ts**

```ts
// src/lib/pricing/types.ts
export type DistanceSource = "ors" | "haversine_fallback";

// Forward-compat: documents the natural jurisdiction currency for the rate.
// Phase 1 always renders CHF in the UI regardless of this value (see plan).
export type PricingCurrency = "CHF" | "EUR";

export type RouteDistance = {
  km: number;
  source: DistanceSource;
  durationSeconds: number | null;
};

export type PriceRange = {
  currency: PricingCurrency;
  low: number;
  typical: number;
  high: number;
};

export type PriceRangeResult = {
  range: PriceRange;
  distanceKm: number;
  source: DistanceSource;
  fuelCountry: string;
  chfPerKm: number;
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/pricing/config.ts src/lib/pricing/types.ts
git commit -m "feat(pricing): scaffold config + types"
```

---

### Task 1.5: `pricing/range.ts` — pure calculator + tests

**Files:**
- Create: `src/lib/pricing/range.ts`
- Create: `src/lib/pricing/range.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/pricing/range.test.ts
import { describe, expect, it } from "vitest";
import { calculatePriceRange } from "./range";

describe("calculatePriceRange", () => {
  it("Bern→Lyon at 0.0629 CHF/km (CH per-pax), 280km → 15/17.5/20.5", () => {
    const r = calculatePriceRange({ distanceKm: 280, chfPerKm: 0.0629, currency: "CHF" });
    expect(r).toEqual({ currency: "CHF", low: 15, typical: 17.5, high: 20.5 });
  });
  it("Genève→Pristina at 0.0629 CHF/km, 1900km → 101.5/119.5/137.5", () => {
    const r = calculatePriceRange({ distanceKm: 1900, chfPerKm: 0.0629, currency: "CHF" });
    expect(r).toEqual({ currency: "CHF", low: 101.5, typical: 119.5, high: 137.5 });
  });
  it("carries the EUR currency tag for jurisdictions where it applies", () => {
    const r = calculatePriceRange({ distanceKm: 280, chfPerKm: 0.0598, currency: "EUR" });
    expect(r.currency).toBe("EUR");
    // base 280 × 0.0598 = 16.74; low 14.23→14, typical 16.74→16.5, high 19.25→19.5
    expect(r).toEqual({ currency: "EUR", low: 14, typical: 16.5, high: 19.5 });
  });
  it("rounds to nearest 0.5", () => {
    // 100 × 0.04 = 4.0 typical; low = 3.4 → 3.5; high = 4.6 → 4.5
    const r = calculatePriceRange({ distanceKm: 100, chfPerKm: 0.04, currency: "CHF" });
    expect(r).toEqual({ currency: "CHF", low: 3.5, typical: 4, high: 4.5 });
  });
  it("zero distance → 0/0/0", () => {
    expect(calculatePriceRange({ distanceKm: 0, chfPerKm: 0.05, currency: "CHF" }))
      .toEqual({ currency: "CHF", low: 0, typical: 0, high: 0 });
  });
  it("very large trip is monotonic low ≤ typical ≤ high", () => {
    const r = calculatePriceRange({ distanceKm: 5000, chfPerKm: 0.05, currency: "CHF" });
    expect(r.low).toBeLessThanOrEqual(r.typical);
    expect(r.typical).toBeLessThanOrEqual(r.high);
  });
  it("rejects negative inputs by returning all-zero", () => {
    expect(calculatePriceRange({ distanceKm: -10, chfPerKm: 0.04, currency: "CHF" }))
      .toEqual({ currency: "CHF", low: 0, typical: 0, high: 0 });
    expect(calculatePriceRange({ distanceKm: 100, chfPerKm: -0.04, currency: "CHF" }))
      .toEqual({ currency: "CHF", low: 0, typical: 0, high: 0 });
  });
});
```

- [ ] **Step 2: Run — expect fail (file doesn't exist)**

```bash
pnpm test -- pricing/range.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/pricing/range.ts
//
// Pure low/typical/high price-range calculator. Input semantics:
//   - distanceKm: road distance for the trip (not Haversine)
//   - chfPerKm: per-passenger cost-sharing rate from fuel_prices
//     (already includes the 0.50 passenger_share_factor — see migration 007)
//   - currency: jurisdiction tag for forward-compat. Phase 1 always
//     formats UI in CHF regardless. Carried through unchanged.
//
// Output is the per-passenger contribution range in CHF (numeric value;
// the UI applies Intl.NumberFormat). The driver's revenue when the car
// fills up is intentionally NOT modelled here — see project.md cost-
// sharing legal posture.
import { RANGE_FACTORS, ROUNDING_STEP_CHF } from "./config";
import type { PriceRange, PricingCurrency } from "./types";

function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function calculatePriceRange(input: {
  distanceKm: number;
  chfPerKm: number;
  currency: PricingCurrency;
}): PriceRange {
  if (input.distanceKm <= 0 || input.chfPerKm <= 0) {
    return { currency: input.currency, low: 0, typical: 0, high: 0 };
  }
  const base = input.distanceKm * input.chfPerKm;
  return {
    currency: input.currency,
    low: roundToStep(base * RANGE_FACTORS.low, ROUNDING_STEP_CHF),
    typical: roundToStep(base * RANGE_FACTORS.typical, ROUNDING_STEP_CHF),
    high: roundToStep(base * RANGE_FACTORS.high, ROUNDING_STEP_CHF),
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
pnpm test -- pricing/range.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/range.ts src/lib/pricing/range.test.ts
git commit -m "feat(pricing): pure price-range calculator with rounding"
```

---

### Task 1.6: `pricing/ors.ts` — ORS client + tests with mocked fetch

**Files:**
- Create: `src/lib/pricing/ors.ts`
- Create: `src/lib/pricing/ors.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/pricing/ors.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchOrsDistance, OrsConfigError, OrsRateLimitError, OrsResponseError, OrsTimeoutError } from "./ors";

const munich = { lat: 48.1351, lng: 11.5820 };
const augsburg = { lat: 48.3717, lng: 10.8983 };

describe("fetchOrsDistance", () => {
  beforeEach(() => {
    vi.stubEnv("ORS_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns parsed distance and duration on success", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        features: [{ properties: { summary: { distance: 57000, duration: 2400 } } }],
      }),
    });
    const r = await fetchOrsDistance(munich, augsburg);
    expect(r).toEqual({ km: 57, durationSeconds: 2400 });
  });

  it("throws OrsConfigError when ORS_API_KEY is missing", async () => {
    vi.stubEnv("ORS_API_KEY", "");
    await expect(fetchOrsDistance(munich, augsburg)).rejects.toThrow(OrsConfigError);
  });

  it("throws OrsRateLimitError on 429", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 429 });
    await expect(fetchOrsDistance(munich, augsburg)).rejects.toThrow(OrsRateLimitError);
  });

  it("throws OrsResponseError on other 4xx/5xx", async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchOrsDistance(munich, augsburg)).rejects.toThrow(OrsResponseError);
  });

  it("throws OrsTimeoutError when fetch is aborted", async () => {
    (fetch as any).mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_, reject) => {
        init.signal!.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
        );
      });
    });
    vi.useFakeTimers();
    const promise = fetchOrsDistance(munich, augsburg);
    vi.advanceTimersByTime(3001);
    await expect(promise).rejects.toThrow(OrsTimeoutError);
    vi.useRealTimers();
  });

  it("rejects responses with implausibly high distances", async () => {
    // 5000km between Munich and Augsburg = clearly bad routing
    (fetch as any).mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        features: [{ properties: { summary: { distance: 5000000, duration: 180000 } } }],
      }),
    });
    await expect(fetchOrsDistance(munich, augsburg)).rejects.toThrow(OrsResponseError);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/pricing/ors.ts
import { ORS_TIMEOUT_MS } from "./config";
import { haversineKm } from "@/lib/geo";

const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car";
const SANITY_FACTOR = 2.0; // ORS distance must not exceed 2× Haversine

export class OrsConfigError extends Error { constructor() { super("ORS_API_KEY missing"); } }
export class OrsRateLimitError extends Error { constructor() { super("ORS rate limit"); } }
export class OrsResponseError extends Error {
  constructor(public status: number, message?: string) { super(message ?? `ORS HTTP ${status}`); }
}
export class OrsTimeoutError extends Error { constructor() { super("ORS timeout"); } }

type LatLng = { lat: number; lng: number };

export async function fetchOrsDistance(
  origin: LatLng, destination: LatLng,
): Promise<{ km: number; durationSeconds: number }> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) throw new OrsConfigError();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ORS_TIMEOUT_MS);
  try {
    const url = `${ORS_URL}?api_key=${apiKey}` +
      `&start=${origin.lng},${origin.lat}&end=${destination.lng},${destination.lat}`;
    const res = await fetch(url, { signal: ctrl.signal }).catch((err) => {
      if (err?.name === "AbortError") throw new OrsTimeoutError();
      throw new OrsResponseError(0, err?.message);
    });
    if (res.status === 429) throw new OrsRateLimitError();
    if (!res.ok) throw new OrsResponseError(res.status);

    const json = await res.json();
    const summary = json?.features?.[0]?.properties?.summary;
    if (!summary || typeof summary.distance !== "number") {
      throw new OrsResponseError(res.status, "ORS response shape unexpected");
    }
    const km = summary.distance / 1000;
    const sanityKm = haversineKm(origin, destination);
    if (km > sanityKm * SANITY_FACTOR) {
      throw new OrsResponseError(res.status, `ORS sanity check failed: ${km}km vs ${sanityKm}km haversine`);
    }
    return { km, durationSeconds: Math.round(summary.duration ?? 0) };
  } finally { clearTimeout(timer); }
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/ors.ts src/lib/pricing/ors.test.ts
git commit -m "feat(pricing): ORS Directions client with timeout, 429, sanity-check"
```

---

### Task 1.7: `pricing/distance.ts` — cache + ORS + fallback

**Files:**
- Create: `src/lib/pricing/distance.ts`
- Create: `src/lib/pricing/distance.test.ts`
- Modify: `src/lib/test-utils/supabase-mock.ts` (extend if needed)

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/pricing/distance.test.ts — abbreviated, full code below
import { describe, expect, it, vi, beforeEach } from "vitest";
import { getRouteDistance } from "./distance";

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));
vi.mock("./ors", () => ({
  fetchOrsDistance: vi.fn(),
  OrsConfigError: class extends Error {},
  OrsRateLimitError: class extends Error {},
  OrsResponseError: class extends Error {},
  OrsTimeoutError: class extends Error {},
}));

import { createServerClient } from "@/lib/supabase/server";
import { fetchOrsDistance, OrsConfigError } from "./ors";

describe("getRouteDistance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached row without calling ORS", async () => {
    (createServerClient as any).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: () =>
            ({ data: { distance_km: 57, duration_seconds: 2400, source: "ors" }, error: null })
          })}),
        }),
      }),
    });
    const r = await getRouteDistance("München", "Augsburg");
    expect(r).toEqual({ km: 57, source: "ors", durationSeconds: 2400 });
    expect(fetchOrsDistance).not.toHaveBeenCalled();
  });

  it("on cache miss calls ORS and writes both directions", async () => {
    // ... see full test in implementation step
  });

  it("falls back to haversine × 1.3 when ORS throws OrsConfigError", async () => {
    // ... see full test in implementation step
  });

  it("never throws — returns fallback even when both ORS and the cache write fail", async () => {
    // ... see full test in implementation step
  });
});
```

(Full test bodies fleshed out in the implementation step — kept brief here so the plan stays scannable.)

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/pricing/distance.ts
//
// Cache layer: reads from public.route_distances; on miss, calls ORS;
// on ORS failure, falls back to haversineKm × HAVERSINE_ROAD_FACTOR.
// Writes BOTH directions on first fetch (one ORS call → two cache rows).
//
// Asymmetry note: real-world driving distance can differ ~0.5–1% between
// A→B and B→A (one-ways, ferries). For the Europe ↔ Balkans corridor we
// accept that error in exchange for halving cache misses.

import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { findCity } from "@/lib/constants/cities";
import { haversineKm } from "@/lib/geo";
import {
  fetchOrsDistance,
  OrsConfigError, OrsRateLimitError, OrsResponseError, OrsTimeoutError,
} from "./ors";
import { HAVERSINE_ROAD_FACTOR } from "./config";
import type { RouteDistance } from "./types";

function isOrsError(err: unknown): boolean {
  return err instanceof OrsConfigError
    || err instanceof OrsRateLimitError
    || err instanceof OrsResponseError
    || err instanceof OrsTimeoutError;
}

function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function getRouteDistance(
  originLabel: string,
  destinationLabel: string,
): Promise<RouteDistance> {
  // 1. Cache lookup
  const sb = await createServerClient();
  const cached = await sb
    .from("route_distances")
    .select("distance_km, duration_seconds, source")
    .eq("origin_label", originLabel)
    .eq("destination_label", destinationLabel)
    .maybeSingle();

  if (cached.data) {
    return {
      km: Number(cached.data.distance_km),
      durationSeconds: cached.data.duration_seconds ?? null,
      source: cached.data.source as RouteDistance["source"],
    };
  }

  // 2. Resolve coords
  const origin = findCity(originLabel);
  const destination = findCity(destinationLabel);
  if (!origin || !destination) {
    // Unknown city → fallback math is undefined; surface as a synthetic
    // haversine_fallback at distance 0 so callers can detect and skip.
    return { km: 0, durationSeconds: null, source: "haversine_fallback" };
  }

  // 3. Try ORS
  let result: RouteDistance;
  try {
    const ors = await fetchOrsDistance(origin, destination);
    result = { km: ors.km, durationSeconds: ors.durationSeconds, source: "ors" };
  } catch (err) {
    if (!isOrsError(err)) throw err;
    const km = haversineKm(origin, destination) * HAVERSINE_ROAD_FACTOR;
    result = { km, durationSeconds: null, source: "haversine_fallback" };
    if (process.env.NODE_ENV !== "test") {
      console.warn("[pricing] ORS unavailable, fell back:", (err as Error).message);
    }
  }

  // 4. Write both directions to cache (best-effort, never block)
  try {
    const writer = serviceRoleClient();
    await writer.from("route_distances").upsert([
      {
        origin_label: originLabel,
        destination_label: destinationLabel,
        distance_km: result.km,
        duration_seconds: result.durationSeconds,
        source: result.source,
      },
      {
        origin_label: destinationLabel,
        destination_label: originLabel,
        distance_km: result.km,
        duration_seconds: result.durationSeconds,
        source: result.source,
      },
    ], { onConflict: "origin_label,destination_label" });
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[pricing] route_distances cache write failed:", (err as Error).message);
    }
  }

  return result;
}
```

- [ ] **Step 4: Flesh out the deferred test bodies + run**

Full test for "cache miss calls ORS and writes both directions":
```ts
it("on cache miss calls ORS and writes both directions", async () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  (createServerClient as any).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }),
      }),
    }),
  });
  // service-role client mocked via mocking @supabase/supabase-js
  vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({ from: () => ({ upsert }) }),
  }));
  (fetchOrsDistance as any).mockResolvedValue({ km: 57, durationSeconds: 2400 });

  const r = await getRouteDistance("München", "Augsburg");

  expect(r).toEqual({ km: 57, source: "ors", durationSeconds: 2400 });
  expect(upsert).toHaveBeenCalledTimes(1);
  const rows = upsert.mock.calls[0][0];
  expect(rows).toHaveLength(2);
  expect(rows[0].origin_label).toBe("München");
  expect(rows[1].origin_label).toBe("Augsburg");
});
```

Full test for "falls back to haversine × 1.3 when ORS throws":
```ts
it("falls back to haversine × 1.3 when ORS throws OrsConfigError", async () => {
  (createServerClient as any).mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null }) }) }) }) }),
  });
  (fetchOrsDistance as any).mockRejectedValue(new OrsConfigError());

  const r = await getRouteDistance("München", "Augsburg");

  expect(r.source).toBe("haversine_fallback");
  // München-Augsburg haversine ≈ 57 km × 1.3 ≈ 74 km
  expect(r.km).toBeGreaterThan(70);
  expect(r.km).toBeLessThan(80);
});
```

```bash
pnpm test -- pricing/distance.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/distance.ts src/lib/pricing/distance.test.ts
git commit -m "feat(pricing): distance helper with cache, ORS call, haversine fallback"
```

---

### Task 1.8: `pricing/fuel.ts` — fuel rate lookup + tests

**Files:**
- Create: `src/lib/pricing/fuel.ts`
- Create: `src/lib/pricing/fuel.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/pricing/fuel.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { getFuelPrice } from "./fuel";

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));
import { createServerClient } from "@/lib/supabase/server";

describe("getFuelPrice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns CH rate with CHF currency tag", async () => {
    (createServerClient as any).mockResolvedValue({
      rpc: () => Promise.resolve({
        data: [{ chf_per_km: 0.0629, currency: "CHF" }], error: null,
      }),
    });
    expect(await getFuelPrice("CH")).toEqual({
      chfPerKm: 0.0629, currency: "CHF", source: "db",
    });
  });
  it("returns DE rate with EUR currency tag", async () => {
    (createServerClient as any).mockResolvedValue({
      rpc: () => Promise.resolve({
        data: [{ chf_per_km: 0.0564, currency: "EUR" }], error: null,
      }),
    });
    expect(await getFuelPrice("DE")).toEqual({
      chfPerKm: 0.0564, currency: "EUR", source: "db",
    });
  });
  it("returns null when the RPC returns no rows", async () => {
    (createServerClient as any).mockResolvedValue({
      rpc: () => Promise.resolve({ data: [], error: null }),
    });
    expect(await getFuelPrice("US")).toBeNull();
  });
  it("returns null on RPC error (defensive)", async () => {
    (createServerClient as any).mockResolvedValue({
      rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    });
    expect(await getFuelPrice("CH")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/pricing/fuel.ts
import { createServerClient } from "@/lib/supabase/server";
import type { PricingCurrency } from "./types";

export async function getFuelPrice(
  countryCode: string,
): Promise<{ chfPerKm: number; currency: PricingCurrency; source: "db" } | null> {
  const supabase = await createServerClient();
  // current_fuel_price returns SETOF (chf_per_km NUMERIC, currency TEXT) with LIMIT 1
  const { data, error } = await supabase.rpc("current_fuel_price", {
    p_country_code: countryCode,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.chf_per_km == null) return null;
  return {
    chfPerKm: Number(row.chf_per_km),
    currency: row.currency as PricingCurrency,
    source: "db",
  };
}
```

- [ ] **Step 4: Run — expect pass + Commit**

```bash
pnpm test -- pricing/fuel.test.ts
git add src/lib/pricing/fuel.ts src/lib/pricing/fuel.test.ts
git commit -m "feat(pricing): fuel rate lookup via current_fuel_price RPC"
```

---

### Task 1.9: `pricing/suggest.ts` — orchestrator + tests

**Files:**
- Create: `src/lib/pricing/suggest.ts`
- Create: `src/lib/pricing/suggest.test.ts`
- Create: `src/lib/pricing/index.ts` (barrel)

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/pricing/suggest.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { getSuggestedPriceRange } from "./suggest";

vi.mock("./distance", () => ({ getRouteDistance: vi.fn() }));
vi.mock("./fuel", () => ({ getFuelPrice: vi.fn() }));
import { getRouteDistance } from "./distance";
import { getFuelPrice } from "./fuel";

describe("getSuggestedPriceRange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("orchestrates distance + fuel into a price range", async () => {
    (getRouteDistance as any).mockResolvedValue({ km: 1900, source: "ors", durationSeconds: 80000 });
    (getFuelPrice as any).mockResolvedValue({ chfPerKm: 0.0629, currency: "CHF", source: "db" });

    const r = await getSuggestedPriceRange({
      originLabel: "Genève", destinationLabel: "Pristina", driverCountry: "CH",
    });
    expect(r).toEqual({
      range: { currency: "CHF", low: 101.5, typical: 119.5, high: 137.5 },
      distanceKm: 1900,
      source: "ors",
      fuelCountry: "CH",
      chfPerKm: 0.0629,
    });
  });

  it("falls back to trip-origin country when driverCountry is null", async () => {
    (getRouteDistance as any).mockResolvedValue({ km: 280, source: "ors", durationSeconds: 12600 });
    (getFuelPrice as any).mockImplementation((cc: string) =>
      cc === "CH" ? Promise.resolve({ chfPerKm: 0.0629, currency: "CHF", source: "db" }) : Promise.resolve(null),
    );
    // Bern is in CH per cities.ts
    const r = await getSuggestedPriceRange({
      originLabel: "Bern", destinationLabel: "Lyon", driverCountry: null,
    });
    expect(r?.fuelCountry).toBe("CH");
    expect(r?.range.currency).toBe("CHF");
  });

  it("returns null when neither driverCountry nor origin country has a fuel rate", async () => {
    (getRouteDistance as any).mockResolvedValue({ km: 280, source: "ors", durationSeconds: 12600 });
    (getFuelPrice as any).mockResolvedValue(null);
    const r = await getSuggestedPriceRange({
      originLabel: "Bern", destinationLabel: "Lyon", driverCountry: "US",
    });
    expect(r).toBeNull();
  });

  it("returns null when origin or destination is not in the allowlist", async () => {
    const r = await getSuggestedPriceRange({
      originLabel: "Atlantis", destinationLabel: "Lyon", driverCountry: "CH",
    });
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/lib/pricing/suggest.ts
import { findCity } from "@/lib/constants/cities";
import { getRouteDistance } from "./distance";
import { getFuelPrice } from "./fuel";
import { calculatePriceRange } from "./range";
import type { PriceRangeResult } from "./types";

export async function getSuggestedPriceRange(input: {
  originLabel: string;
  destinationLabel: string;
  driverCountry: string | null;
}): Promise<PriceRangeResult | null> {
  const origin = findCity(input.originLabel);
  const destination = findCity(input.destinationLabel);
  if (!origin || !destination) return null;

  const candidates = [input.driverCountry, origin.country].filter(
    (c): c is string => !!c,
  );

  let chosenCountry: string | null = null;
  let chosenFuel: { chfPerKm: number; currency: "CHF" | "EUR" } | null = null;
  for (const cc of candidates) {
    const fuel = await getFuelPrice(cc);
    if (fuel) {
      chosenCountry = cc;
      chosenFuel = { chfPerKm: fuel.chfPerKm, currency: fuel.currency };
      break;
    }
  }
  if (!chosenCountry || !chosenFuel) return null;

  const distance = await getRouteDistance(input.originLabel, input.destinationLabel);
  if (distance.km <= 0) return null;

  return {
    range: calculatePriceRange({
      distanceKm: distance.km,
      chfPerKm: chosenFuel.chfPerKm,
      currency: chosenFuel.currency,
    }),
    distanceKm: distance.km,
    source: distance.source,
    fuelCountry: chosenCountry,
    chfPerKm: chosenFuel.chfPerKm,
  };
}
```

```ts
// src/lib/pricing/index.ts
export {
  PASSENGER_SHARE_FACTOR,
  RANGE_FACTORS,
  HIGH_PRICE_WARNING_MULTIPLIER,
  ROUNDING_STEP_CHF,
  ORS_TIMEOUT_MS,
  HAVERSINE_ROAD_FACTOR,
} from "./config";
export type {
  DistanceSource, RouteDistance, PriceRange, PriceRangeResult, PricingCurrency,
} from "./types";
export { calculatePriceRange } from "./range";
export { getRouteDistance } from "./distance";
export { getFuelPrice } from "./fuel";
export { getSuggestedPriceRange } from "./suggest";
```

- [ ] **Step 4: Run — expect pass + Commit**

```bash
pnpm test -- pricing/
git add src/lib/pricing/suggest.ts src/lib/pricing/suggest.test.ts src/lib/pricing/index.ts
git commit -m "feat(pricing): orchestrator combining distance, fuel, and pure range"
```

---

### Task 1.10: Server Action `getSuggestedPriceRange` exported from `trips/actions.ts`

**Files:**
- Modify: `src/app/[locale]/(main)/trips/actions.ts` — append a new export
- Modify: `src/app/[locale]/(main)/trips/actions.test.ts` — add tests

- [ ] **Step 1: Write failing tests**

Add to `src/app/[locale]/(main)/trips/actions.test.ts`:
```ts
import { getSuggestedPriceRange as getSuggestedAction } from "./actions";
vi.mock("@/lib/pricing", async () => ({
  ...await vi.importActual<any>("@/lib/pricing"),
  getSuggestedPriceRange: vi.fn(),
}));
import { getSuggestedPriceRange as orchestrator } from "@/lib/pricing";

describe("getSuggestedPriceRange (Server Action)", () => {
  it("returns auth_required when not signed in", async () => {
    // mock createServerClient → user null
    const r = await getSuggestedAction({ originLabel: "Bern", destinationLabel: "Lyon" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe("errors.common.auth_required");
  });
  it("returns success with the orchestrator result for an authed user", async () => {
    (orchestrator as any).mockResolvedValue({
      range: { currency: "CHF", low: 15, typical: 17.5, high: 20.5 },
      distanceKm: 280, source: "ors", fuelCountry: "CH", chfPerKm: 0.0629,
    });
    // mock createServerClient → authed user with profile.country='CH'
    const r = await getSuggestedAction({ originLabel: "Bern", destinationLabel: "Lyon" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data?.range.typical).toBe(17.5);
      expect(r.data?.range.currency).toBe("CHF");
    }
  });
  it("returns success with data:null when orchestrator returns null", async () => {
    (orchestrator as any).mockResolvedValue(null);
    const r = await getSuggestedAction({ originLabel: "Atlantis", destinationLabel: "Lyon" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/app/[locale]/(main)/trips/actions.ts — append:
import { getSuggestedPriceRange as getRange } from "@/lib/pricing";
import type { PriceRangeResult } from "@/lib/pricing";

export async function getSuggestedPriceRange(input: {
  originLabel: string;
  destinationLabel: string;
}): Promise<ActionResult<PriceRangeResult | null>> {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: { code: "errors.common.auth_required" } };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", user.id)
    .maybeSingle();

  try {
    const result = await getRange({
      originLabel: input.originLabel,
      destinationLabel: input.destinationLabel,
      driverCountry: profile?.country ?? null,
    });
    return { success: true, data: result };
  } catch (err) {
    console.error("[getSuggestedPriceRange]", (err as Error).message);
    return { success: false, error: { code: "errors.pricing.suggestion_failed" } };
  }
}
```

- [ ] **Step 4: Add the error code to all 4 locales**

In `src/messages/{fr,en,de,sq}/errors.json` add:
```json
"pricing": {
  "suggestion_failed": "Impossible de calculer une suggestion de prix."  // fr
}
```
- en: `"Couldn't compute a price suggestion."`
- de: `"Preisempfehlung konnte nicht berechnet werden."`
- sq: `"Sugjerimi i çmimit nuk mund të llogaritet."` (mark `_meta.review`)

- [ ] **Step 5: Run — expect pass**

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/(main)/trips/actions.ts src/app/[locale]/(main)/trips/actions.test.ts src/messages/{fr,en,de,sq}/errors.json
git commit -m "feat(pricing): expose getSuggestedPriceRange as a Server Action"
```

---

### Task 1.11: Open PR-1 for review

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin feat/price-suggestion-helpers
gh pr create --title "feat(pricing): price-suggestion helpers + Server Action (no UI)" --body "$(cat <<'EOF'
## Summary
- Migrations: `route_distances` (cache, label-keyed) and `fuel_prices` (10 corridor seeds)
- New `src/lib/pricing/` module: `range.ts` (pure), `ors.ts` (ORS client w/ 3s timeout + sanity check), `distance.ts` (cache + symmetric write), `fuel.ts`, `suggest.ts` (orchestrator)
- New `getSuggestedPriceRange` Server Action in `trips/actions.ts`, returns `ActionResult<PriceRangeResult | null>`
- `vitest.setup.ts` aborts if `ORS_API_KEY` is set during tests
- `.env.example` documents the new env var
- 122 → ~150 tests, all green; parity test still passes

## Out of scope (intentional)
- No form integration → ships in PR-2
- No one-shot cache backfill → lazy-only

## Test plan
- [ ] `pnpm typecheck && pnpm test`
- [ ] `pnpm build` (no SSG impact expected)
- [ ] Hit the action manually from a one-off page (or via `npx tsx`) to verify ORS path with a real key
- [ ] Sanity-check fuel-price seeds before merge (see plan §"Seed fuel-price table")

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# PR-2 — Form integration + UX

**Branch:** `feat/price-suggestion-form`. Depends on PR-1 being merged.

### Task 2.1: `<PriceSuggestionHint />` component

**Files:**
- Create: `src/app/[locale]/(main)/trips/create/PriceSuggestionHint.tsx`
- Create: `src/app/[locale]/(main)/trips/create/PriceSuggestionHint.test.tsx`

- [ ] **Step 1: Add i18n keys** in `src/messages/fr/trips.json` under `create`:

```json
"priceSuggestion": {
  "idle": "Choisissez votre itinéraire pour voir un prix suggéré",
  "loading": "Calcul en cours…",
  "label": "Suggestion :",
  "estimated": "estimation",
  "unavailable": "Suggestion indisponible",
  "highWarning": "Au-dessus de l'usage habituel pour le partage des frais. Les prix élevés peuvent être considérés comme du transport commercial plutôt que du covoiturage."
}
```

Mirror in `en`/`de`/`sq` with the wording from the decision sheet (sq → mark `_meta.review`):
- en: `"Pick your route to see a suggested price"` / `"Calculating…"` / `"Suggested:"` / `"estimated"` / `"Suggestion unavailable"` / `"Above the usual cost-sharing range. Higher prices may be considered commercial transport rather than carpooling."`
- de: `"Wählen Sie Ihre Route, um einen Preisvorschlag zu sehen"` / `"Wird berechnet…"` / `"Vorschlag:"` / `"geschätzt"` / `"Vorschlag nicht verfügbar"` / `"Über dem üblichen Bereich für Kostenbeteiligung. Höhere Preise können als gewerblicher Transport statt Fahrgemeinschaft gewertet werden."`
- sq: `"Zgjidhni itinerarin tuaj për të parë çmimin e sugjeruar"` / `"Duke llogaritur…"` / `"Sugjerim:"` / `"vlerësim"` / `"Sugjerimi i padisponueshëm"` / `"Mbi përdorimin e zakonshëm për ndarjen e shpenzimeve. Çmimet e larta mund të konsiderohen si transport komercial në vend të bashkudhëtimit."`

- [ ] **Step 2: Write the failing component test**

```tsx
// src/app/[locale]/(main)/trips/create/PriceSuggestionHint.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { PriceSuggestionHint } from "./PriceSuggestionHint";
import frTrips from "@/messages/fr/trips.json";
import frCommon from "@/messages/fr/common.json";

vi.mock("@/app/[locale]/(main)/trips/actions", () => ({
  getSuggestedPriceRange: vi.fn(),
}));
import { getSuggestedPriceRange } from "@/app/[locale]/(main)/trips/actions";

function renderWith(props: any) {
  return render(
    <NextIntlClientProvider locale="fr" messages={{ trips: frTrips, common: frCommon }}>
      <PriceSuggestionHint {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PriceSuggestionHint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows idle copy when origin or destination missing", () => {
    renderWith({ originLabel: "", destinationLabel: "", enteredPrice: "" });
    expect(screen.getByText(/Choisissez votre itinéraire/)).toBeInTheDocument();
  });

  it("calls getSuggestedPriceRange and renders the range on success", async () => {
    (getSuggestedPriceRange as any).mockResolvedValue({
      success: true,
      data: { range: { currency: "CHF", low: 15, typical: 17.5, high: 20.5 }, source: "ors", distanceKm: 280, fuelCountry: "CH", chfPerKm: 0.0629 },
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "" });
    await waitFor(() => expect(screen.getByText(/CHF/)).toBeInTheDocument());
    expect(screen.getByText(/17.50/)).toBeInTheDocument();
  });

  it("appends 'estimation' tag when source = haversine_fallback", async () => {
    (getSuggestedPriceRange as any).mockResolvedValue({
      success: true,
      data: { range: { low: 11, typical: 12.5, high: 14.5 }, source: "haversine_fallback", distanceKm: 280, fuelCountry: "CH", chfPerKm: 0.0453 },
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "" });
    await waitFor(() => expect(screen.getByText(/estimation/)).toBeInTheDocument());
  });

  it("renders 'Suggestion indisponible' when data:null", async () => {
    (getSuggestedPriceRange as any).mockResolvedValue({ success: true, data: null });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "" });
    await waitFor(() => expect(screen.getByText(/indisponible/)).toBeInTheDocument());
  });

  it("shows the high-price warning when entered > 1.5× typical", async () => {
    (getSuggestedPriceRange as any).mockResolvedValue({
      success: true,
      data: { range: { currency: "CHF", low: 15, typical: 17.5, high: 20.5 }, source: "ors", distanceKm: 280, fuelCountry: "CH", chfPerKm: 0.0629 },
    });
    // typical=17.5 → threshold 1.5×17.5 = 26.25; 30 > 26.25
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "30" });
    await waitFor(() =>
      expect(screen.getByText(/transport commercial/)).toBeInTheDocument(),
    );
  });

  it("hides the high-price warning when entered ≤ 1.5× typical", async () => {
    (getSuggestedPriceRange as any).mockResolvedValue({
      success: true,
      data: { range: { currency: "CHF", low: 15, typical: 17.5, high: 20.5 }, source: "ors", distanceKm: 280, fuelCountry: "CH", chfPerKm: 0.0629 },
    });
    renderWith({ originLabel: "Bern", destinationLabel: "Lyon", enteredPrice: "20" });
    await waitFor(() => expect(screen.getByText(/17.50/)).toBeInTheDocument());
    expect(screen.queryByText(/transport commercial/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — expect fail**

- [ ] **Step 4: Implement**

```tsx
// src/app/[locale]/(main)/trips/create/PriceSuggestionHint.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getSuggestedPriceRange } from "@/app/[locale]/(main)/trips/actions";
import { HIGH_PRICE_WARNING_MULTIPLIER, type PriceRangeResult } from "@/lib/pricing";

const DEBOUNCE_MS = 300;

interface Props {
  originLabel: string;
  destinationLabel: string;
  enteredPrice: string | undefined;
}

export function PriceSuggestionHint({ originLabel, destinationLabel, enteredPrice }: Props) {
  const t = useTranslations("trips.create.priceSuggestion");
  const locale = useLocale();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; data: PriceRangeResult | null }
  >({ kind: "idle" });

  // Debounced fetch
  const tickRef = useRef(0);
  useEffect(() => {
    if (!originLabel || !destinationLabel) {
      setState({ kind: "idle" });
      return;
    }
    const myTick = ++tickRef.current;
    setState({ kind: "loading" });
    const timer = setTimeout(async () => {
      const result = await getSuggestedPriceRange({ originLabel, destinationLabel });
      if (tickRef.current !== myTick) return; // stale
      if (result.success) setState({ kind: "success", data: result.data ?? null });
      else setState({ kind: "success", data: null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [originLabel, destinationLabel]);

  if (state.kind === "idle") {
    return <p className="text-xs text-stone-500 mt-1">{t("idle")}</p>;
  }
  if (state.kind === "loading") {
    return <p className="text-xs text-stone-500 mt-1">{t("loading")}</p>;
  }
  if (state.data == null) {
    return <p className="text-xs text-stone-500 mt-1">{t("unavailable")}</p>;
  }

  // Phase 1: hardcode display to CHF regardless of state.data.range.currency.
  // The currency tag from fuel_prices is forward-compat plumbing for future
  // jurisdiction-aware pricing per the April 2026 legal analysis.
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency", currency: "CHF",
    maximumFractionDigits: 2, minimumFractionDigits: 0,
  });
  const { low, typical, high } = state.data.range;
  const isFallback = state.data.source === "haversine_fallback";
  const enteredNum = enteredPrice ? parseFloat(enteredPrice) : NaN;
  const isHigh =
    Number.isFinite(enteredNum) && enteredNum > typical * HIGH_PRICE_WARNING_MULTIPLIER;

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <p className="text-xs text-stone-500">
        <span className="font-semibold">{t("label")}</span>{" "}
        <span className="text-stone-700">
          {fmt.format(low)} – {fmt.format(typical)} – {fmt.format(high)}
        </span>
        {isFallback && (
          <span className="ml-1 text-stone-400">· {t("estimated")}</span>
        )}
      </p>
      {isHigh && (
        <p role="note" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t("highWarning")}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run — expect pass**

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/(main)/trips/create/PriceSuggestionHint.tsx src/app/[locale]/(main)/trips/create/PriceSuggestionHint.test.tsx src/messages/{fr,en,de,sq}/trips.json
git commit -m "feat(pricing): PriceSuggestionHint client component with soft warning"
```

---

### Task 2.2: Wire `<PriceSuggestionHint />` into `CreateTripForm`

**Files:**
- Modify: `src/app/[locale]/(main)/trips/create/CreateTripForm.tsx:336-349` (after the price `<Input>`)

- [ ] **Step 1: Add the hint below the price input**

```tsx
// inside Step 3, after the price <Input>:
<PriceSuggestionHint
  originLabel={originLabel ?? ""}
  destinationLabel={destinationLabel ?? ""}
  enteredPrice={watch("price_per_seat")}
/>
```

Add the import at the top:
```tsx
import { PriceSuggestionHint } from "./PriceSuggestionHint";
```

(`originLabel` and `destinationLabel` are already declared in the form via `watch()`.)

- [ ] **Step 2: Manual smoke check**

```bash
pnpm dev
# /fr/trips/create → step through to step 3 → enter route in step 1 → see suggestion appear → enter high price → see warning
```

- [ ] **Step 3: Run all tests + typecheck**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/(main)/trips/create/CreateTripForm.tsx
git commit -m "feat(pricing): mount PriceSuggestionHint under the price input"
```

---

### Task 2.3: project.md sync

**Files:**
- Modify: `project.md`

- [ ] **Step 1: Update header "Last synced" line**

Add a sentence noting the price-suggestion feature has shipped: tiered low/typical/high suggestion below the price input on `/trips/create`, computed from cached ORS distance + per-country `fuel_prices`, with a soft warning at 1.5× typical and a CHF-only `Intl.NumberFormat` render.

- [ ] **Step 2: Update Trips section**

Add a bullet to the existing **Trips** subsection:
```markdown
- **Price suggestion** — `/trips/create` shows a non-binding low/typical/high CHF range below the price input, computed by `getSuggestedPriceRange` Server Action: cached ORS driving distance (with Haversine × 1.3 fallback) × the driver's country **per-passenger** `chf_per_km` from the `fuel_prices` table (`pump × consumption/100 × 0.50`, country-specific consumption, seeded for CH/DE/FR/IT/AT/BE/AL/XK/MK/RS). Driver country defaults to `profiles.country`, falling back to the trip-origin country, falling through to `null` (renders "Suggestion indisponible"). The `fuel_prices.currency` column carries `CHF`/`EUR` jurisdiction tags through to `PriceRange.currency` for forward-compat with jurisdiction-aware pricing per the April 2026 legal analysis; Phase 1 displays CHF regardless. Soft warning at 1.5× typical frames the legal cost-sharing posture; suggestion is informational at every layer — never blocks submit, never validates server-side.
```

- [ ] **Step 3: Update Tech Stack table**

Add a row: `Distance | OpenRouteService Directions v2 (driving-car), 3 s timeout, Haversine × 1.3 fallback, label-keyed cache in route_distances`.

- [ ] **Step 4: Add to "Pending / WIP"**

```markdown
- **One-shot ORS backfill script** for the 1,128 (48 × 47) city pairs to warm the cache before any marketing push — currently lazy-only.
- **Scheduled refresh of `fuel_prices`** — Phase 1 ships hardcoded weekly seeds; a cron / edge function refresh is deferred.
- **Native review of the new `priceSuggestion` and country-picker copy** in `sq/*` (still flagged `_meta.review`).
```

- [ ] **Step 5: Update test count in Tests subsection**

Bump the "X tests, all green" line to the actual post-merge count (run `pnpm test` and update accordingly).

- [ ] **Step 6: Update directory layout** (under `src/lib/`)

```markdown
│   ├── pricing/                    # Cost-sharing suggestion (CHF/km × distance, range factors)
│   │   ├── config.ts               # RANGE_FACTORS, HIGH_PRICE_WARNING_MULTIPLIER, ORS_TIMEOUT_MS
│   │   ├── ors.ts                  # ORS Directions client w/ timeout + sanity check
│   │   ├── distance.ts             # cache → ORS → haversine fallback (label-keyed, symmetric writes)
│   │   ├── fuel.ts                 # current_fuel_price RPC wrapper
│   │   ├── range.ts                # pure low/typical/high calculator
│   │   └── suggest.ts              # orchestrator (driverCountry → fuel → distance → range)
```

- [ ] **Step 7: Commit**

```bash
git add project.md
git commit -m "docs(project): document price-suggestion feature in trip creation"
```

---

### Task 2.4: Open PR-2 for review

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin feat/price-suggestion-form
gh pr create --title "feat(pricing): price-suggestion UI on /trips/create" --body "$(cat <<'EOF'
## Summary
- New `<PriceSuggestionHint />` below the price input on Step 3 of the trip-creation wizard
- Calls `getSuggestedPriceRange` (PR-1) with 300 ms debounce on route changes
- Renders idle / loading / success / fallback ("estimation") / unavailable states
- Soft warning when typed price > 1.5× typical, framing the cost-sharing legal posture
- CHF currency formatted via `Intl.NumberFormat` with explicit currency code
- 5 new behavioural tests (vitest + jsdom + RTL); existing 122+ tests untouched

## Test plan
- [ ] `pnpm typecheck && pnpm test`
- [ ] Manual: pick Bern → Lyon, see "Suggestion : 11 CHF – 12.50 CHF – 14.50 CHF"
- [ ] Manual: type 25 in price input → see soft warning; type 12 → warning disappears
- [ ] Manual: pick a route with no fuel rate (e.g. driver country = US, no profile country) → see "Suggestion indisponible"
- [ ] Verify no `MISSING_MESSAGE` warnings in any of the four locales

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

**Spec coverage check:**

- ✅ Driver remains price-setter (suggestion below input, never auto-fill)
- ✅ ORS Directions API w/ free-tier key, cached in `route_distances`
- ✅ Haversine × 1.3 fallback, never blocks
- ✅ Per-country `fuel_prices` table, seed-only Phase 1
- ✅ Driver country source: `profiles.country` → trip origin → null/idle
- ✅ Range formula `distance × chf_per_km × {0.85, 1.0, 1.15}` rounded to 0.50, where `chf_per_km` is the per-passenger seed value from `fuel_prices` (formula: `pump × C/100 × 0.50`)
- ✅ `fuel_prices.currency` column (`CHF`/`EUR`) added in Phase 1 as forward-compat; `PriceRange` carries it through; UI hardcodes CHF
- ✅ Soft warning at 1.5× typical
- ✅ No platform fee
- ✅ No changes to existing trip creation that break Phase 1 proximity search or 122 tests
- ✅ ORS API key in env; tests mock fetch and abort if key leaks
- ✅ Two-PR split with optional PR-0 carve-out for the country picker
- ✅ project.md sync at end of PR-2
- ✅ Albanian copy marked `_meta.review` everywhere it's added

**Placeholder scan:** None — every step has actual code or commands.

**Type consistency:** `PriceRangeResult` defined in `types.ts`, used by `suggest.ts`, the Server Action in `actions.ts`, and the component in `PriceSuggestionHint.tsx`. `RouteDistance.source` is `"ors" | "haversine_fallback"` everywhere it appears.

**Open items resolved (2026-04-28):**

- ✅ Formula: `pump × C/100 × 0.50` (per-passenger), country-specific consumption.
- ✅ Currency column: added to `fuel_prices`, carried through `PriceRange`, UI hardcodes CHF for Phase 1.
- ✅ PR strategy: 3 PRs (PR-0 country picker, PR-1 helpers/Server Action, PR-2 form/UX).

**Still BLOCKING before PR-1 migration applies:**

1. **Greenlight on the proposed fuel_prices seed table** at the top of this plan, especially the AL/XK/MK/RS rows. Tasks 1.3 Step 1 (write the migration file) and Step 5 (commit) can land first; Task 1.3 Step 2 (`apply_migration`) waits for explicit greenlight.

PR-0 has no such gate — proceed when ready.
