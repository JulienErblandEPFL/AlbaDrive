# AlbaDrive — Project Memory

> **Single source of truth** for the current state of this repo.
> Kept in sync by Claude per the directive in `CLAUDE.md` (Repository Memory section).
> Last synced: 2026-04-27 against branch `main` — Phases A, B, and C of the i18n migration (`/home/julienerbland/.claude/plans/zany-squishing-graham.md`) are complete. Routes live under `src/app/[locale]/...`, the four locale tracks (`fr`, `en`, `de`, `sq`) have populated message bundles, all Server Actions return error codes (`ActionResult.error: { code, params? }`), and a `LocaleSwitcher` is reachable from both shells (Navbar + `(auth)` layout). The persistence column (`profiles.preferred_locale`) was pulled forward from Phase D, applied to the linked Supabase project, and wired into `setLocale` + sign-in/OAuth callback for cross-device locale memory. DM Sans now ships the `latin-ext` subset so German umlauts and Albanian ç/ë render in the brand font. The Albanian bundle is still flagged `_meta.review = "needs-native-speaker-review"`. The rest of Phase D (recipient-locale WhatsApp, SEO `hreflang` / sitemap) is not started.

---

## Project Overview

AlbaDrive is a carpooling web app for the Albanian diaspora in Europe, connecting drivers and passengers on the Europe ↔ Balkans corridor (e.g. Genève → Pristina, München → Tirana, Zürich → Shkodër, Berlin → Sarajevo). It is a first-MVP product with three hard constraints:

- **No online payments** — the optional per-seat price is informational cost-sharing only.
  *Why:* Processing fares can reclassify drivers as paid-transport providers (commercial permit, insurance upgrade, possible taxi licensing in CH/DE/FR) and the platform as a payment institution / transport intermediary (PSD2, EMI licensing, VAT per country). Keeping cost-sharing informational preserves the "covoiturage / Mitfahrgelegenheit" legal framing and keeps drivers' personal auto insurance valid. Revisit only after legal advice for each target market.
- **No in-app chat** — once a driver accepts a booking, both parties get a pre-filled WhatsApp (`wa.me`) deep link to coordinate offline.
  *Why:* Storing user messages would make AlbaDrive a data controller for conversation content (GDPR), introduce moderation/abuse liability, and require a notification backend (email/push) to be usable — without which users silently fall back to WhatsApp anyway. WhatsApp already solves coordination; re-implementing it adds surface without adding value at MVP scale.
- **Phone numbers are private until acceptance** — enforced at RLS, Server Action, and query level.

UI is now multilingual. Four locales are wired (`fr` default, `en`, `de`, `sq`); every route is prefixed (`/fr/...`, `/en/...`, …), `/` 307-redirects to the `Accept-Language`-detected default, and `NEXT_LOCALE` cookie carries the user's choice forward. The `LocaleSwitcher` (`src/components/i18n/LocaleSwitcher.tsx`) is mounted in two places: leading the right cluster of `Navbar.tsx` (desktop + mobile, both authenticated and anonymous) and pinned `absolute top-4 right-4` on the form panel of `[locale]/(auth)/layout.tsx`. Selection writes the cookie via the `setLocale` Server Action and, for authenticated users, also upserts `profiles.preferred_locale` (best-effort — DB failures are logged, never surfaced). On sign-in (email/password and OAuth callback) the column is read back to seed the cookie, so a returning user lands in their last-chosen language regardless of device. Code identifiers remain English; user-visible copy lives in `src/messages/{locale}/{namespace}.json`.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.4 (App Router, RSC) |
| Runtime | React 19.2.4 / Node (Vercel) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 |
| Auth + DB | Supabase (Postgres + RLS), `@supabase/ssr` 0.10.2 |
| Forms | `react-hook-form` 7 + `zod` 4 (via `@hookform/resolvers` 5) |
| Dates | `date-fns` 4 + locale-aware wrapper (`src/lib/intl/date.ts` selects fr/enGB/de/sq) |
| i18n | `next-intl` 4 (App Router-native, ICU MessageFormat, RSC + Server Action support) |
| Icons | `lucide-react` 1.8 |
| Fonts | `next/font/google` — DM Sans (`--font-dm-sans`) |
| Unit tests | Vitest 4 + `@testing-library/react` 16 + jsdom |
| Lint | ESLint 9 with `eslint-config-next` (Core Web Vitals + TS) |
| Deployment | Vercel |
| Package manager | pnpm (lockfile committed) |

`src/*` is aliased to `@/*` via `tsconfig.json`.

---

## Architecture

### Directory layout

```
src/
├── middleware.ts                   # next-intl locale routing + Supabase session refresh + auth redirects
├── i18n/
│   ├── routing.ts                  # locales (fr|en|de|sq), defaultLocale, NAMESPACES (12)
│   ├── request.ts                  # getRequestConfig — dynamic-imports message bundles
│   ├── navigation.ts               # locale-aware <Link>, redirect, useRouter
│   ├── actions.ts                  # setLocale Server Action (cookie + best-effort profile upsert)
│   └── server-locale.ts            # seedLocaleCookieFromProfile (called from sign-in / OAuth callback)
├── app/
│   ├── globals.css
│   ├── auth/callback/route.ts      # OAuth code exchange (locale-agnostic)
│   └── [locale]/
│       ├── layout.tsx              # generateStaticParams + setRequestLocale + NextIntlClientProvider, dynamic <html lang>
│       ├── page.tsx                # Public landing (hero, how-it-works, driver CTA)
│       ├── (auth)/                 # Unauth shell (split-screen brand panel)
│       │   ├── layout.tsx          # async — getTranslations("auth.layout")
│       │   ├── login/          (page + LoginForm + actions.ts:signIn)
│       │   ├── register/       (page + RegisterForm + actions.ts:signUp)
│       │   └── complete-profile/(page + CompleteProfileForm + actions.ts:completeProfile)
│       └── (main)/                 # App shell with Navbar (handles public + auth)
│           ├── layout.tsx
│           ├── trips/
│           │   ├── page.tsx        # Public search w/ from/to/date searchParams
│           │   ├── [id]/           # Public detail + BookingSection (Client)
│           │   ├── create/         # Auth-only CreateTripForm
│           │   ├── components/     # TripCard, SearchBar, CityCombobox
│           │   ├── actions.ts      # createTrip, cancelTrip
│           │   └── actions.test.ts
│           ├── bookings/
│           │   ├── actions.ts      # requestBooking, acceptBooking, cancelBooking, getWhatsAppLink
│           │   └── actions.test.ts
│           ├── reviews/
│           │   ├── actions.ts      # submitReview, getPassengerReviewSummary, getDriverReviewDetails
│           │   ├── actions.test.ts
│           │   └── ReviewModal.tsx
│           └── dashboard/
│               ├── page.tsx        # RSC, parallel queries, delegates to DashboardTabs
│               ├── DashboardTabs.tsx
│               ├── DriverTripCard.tsx
│               └── PassengerBookingCard.tsx
├── messages/
│   ├── fr/  (12 namespaces)         common, navbar, landing, auth, trips,
│   ├── en/  (12 namespaces)         bookings, reviews, dashboard, status,
│   ├── de/  (12 namespaces)         errors, validation, countries
│   └── sq/  (12 namespaces, _meta.review = "needs-native-speaker-review")
├── components/
│   ├── i18n/LocaleSwitcher.tsx     # Client popover — globe + ISO code, 4 native endonyms, keyboard nav
│   ├── layout/Navbar.tsx           # Desktop top nav + mobile bottom tabs (i18n via "navbar")
│   └── ui/                         # Button, Input, StatusBadge (i18n via "status"), StarRating
├── lib/
│   ├── supabase/{server,client}.ts # Session-aware SSR + browser client factories
│   ├── auth/actions.ts             # signOut (redirect-only)
│   ├── validations/{auth,trip,booking,review}.schema.ts   # codes-as-messages
│   ├── reviews/display-name.ts     # pseudonymizeName helper (+ tests)
│   ├── constants/cities.ts         # 48 pre-geocoded cities; country = ISO-3166 code
│   ├── intl/date.ts                # locale-aware date-fns wrapper + useFormatLocalizedDate
│   ├── intl/translate.test.ts      # parity test — every fr/* key exists in en/de/sq
│   └── test-utils/supabase-mock.ts
└── types/
    ├── actions.ts                  # ActionResult<T> with ActionError = { code; params? }
    └── database.types.ts           # Hand-written (see Known Issues)

supabase/
├── migrations/
│   ├── 20260415000001_create_profiles.sql
│   ├── 20260415000002_create_trips.sql
│   ├── 20260415000003_create_bookings.sql
│   └── 20260424120000_create_reviews.sql
└── functions/expire-trips/index.ts # Deno edge fn — mark past trips 'completed'
```

### Request lifecycle

1. **`src/middleware.ts`** runs on every matched route. It (a) hands the request to next-intl's middleware first — locale prefix detection, `Accept-Language` matching, `NEXT_LOCALE` cookie, redirect of bare paths to `/{locale}/...`, (b) refreshes the Supabase session via `getUser()` on the same response so cookie writes survive — required, do not remove, (c) redirects unauth users off `/{locale}/dashboard` and `/{locale}/trips/create`, (d) redirects authenticated users away from `/{locale}/login` and `/{locale}/register`, (e) redirects authenticated users without a `profiles` row to `/{locale}/complete-profile`. The auth-prefix matchers are locale-aware. The OAuth callback `/auth/callback` stays outside the locale tree.
2. **Route visibility**: `/{locale}/`, `/{locale}/trips`, `/{locale}/trips/[id]`, `/auth/*`, `/{locale}/login`, `/{locale}/register` are public; `/{locale}/dashboard` and `/{locale}/trips/create` require auth + profile; `/{locale}/complete-profile` requires auth only.
3. **Server Components** fetch via `createServerClient()` (`@/lib/supabase/server.ts`) and call `await getTranslations({ locale, namespace })` for copy.
4. **Mutations** go through **Server Actions only** (`app/**/actions.ts`), each returning `ActionResult<T>` where `error` is now `{ code: string; params?: Record<string, string|number> }`. Action callers do `t(result.error.code, result.error.params)` at the render site. Actions re-verify auth + ownership before touching the DB and never throw.
5. **Client Components** are leaf-only (`CreateTripForm`, `BookingSection`, `Navbar`, `DashboardTabs`, combobox, forms). They call Server Actions via `useTransition` and consume `useTranslations()` for copy. Field-level errors are zod codes (e.g. `"validation.auth.email.invalid"`) translated in render.

### Data model (Postgres, all RLS-enabled)

- **`profiles`** — `id` = `auth.users.id`, `full_name`, `phone` (E.164, CHECK-constrained, unique per active user), `avatar_url`, soft `deleted_at`.
  - Public view **`profiles_public`** exposes only `id, full_name, avatar_url` for trip listings (bypasses RLS via `SECURITY DEFINER` — contains no PII).
  - RLS: owner reads own profile; anyone with an **accepted booking** with that profile reads it too (gating WhatsApp phone exposure).
- **`trips`** — `driver_id`, `origin`/`destination` (JSONB `{label, lat, lng, place_id}`), `departure_at`, `total_seats` (1–9), `available_seats`, `price_per_seat`, `status` (`open | full | cancelled | completed`).
  - Trigger `on_trip_cancelled`: when driver sets `cancelled`, all `pending`/`accepted` bookings are set to `trip_cancelled`.
  - RLS: anyone reads `open|full` non-deleted trips; driver reads own trips; passenger reads trips they have a booking on.
- **`bookings`** — `trip_id`, `passenger_id`, `seats_requested`, `status` (`pending | accepted | declined | cancelled | trip_cancelled`), `passenger_message`.
  - Trigger `on_booking_accepted`: atomically decrements `trips.available_seats`; if it hits 0, sets trip `status='full'` and auto-declines all other `pending` bookings on that trip.
  - Trigger `on_booking_seat_return`: when a passenger cancels an `accepted` booking, seats are returned and trip re-opens if it was `full`.
  - Unique index prevents duplicate active bookings for (trip, passenger).
- **`reviews`** — `trip_id`, `reviewer_id`, `reviewee_id`, `rating` (1–5 SMALLINT, CHECK-constrained), optional `comment` (max 1000 chars).
  - `UNIQUE(reviewer_id, reviewee_id, trip_id)` + `CHECK(reviewer_id <> reviewee_id)`.
  - Role of the reviewee (driver vs passenger) is **derived at query time** from `trips.driver_id`, never stored.
  - RLS: `reviews_select_own` (reviewer or reviewee can read their own rows); `reviews_insert_eligible` uses `can_review(...)` as the WITH CHECK.
  - New helpers: `can_review_reason(reviewee, trip) → text` (returns a specific error code consumed by the Server Action), `can_review(reviewee, trip) → bool`, `has_booking_on_my_trip(passenger) → bool`.
  - New RPCs: `get_passenger_review_summary(passenger) → jsonb | null` (gated on `has_booking_on_my_trip`), `get_driver_review_details(driver) → jsonb | null` (gated on `has_accepted_booking_with`).
- **`profiles_public`** view was dropped and recreated — now also exposes `driver_rating_avg` and `driver_rating_count` (computed via correlated subquery; no triggers, no materialised data). Passenger aggregate is deliberately NOT exposed here and must be fetched via `get_passenger_review_summary`.
- **Security-definer helpers** — `is_trip_driver`, `is_trip_passenger`, `has_accepted_booking_with`, `can_review`, `can_review_reason`, `has_booking_on_my_trip`. Used in cross-table RLS to avoid infinite recursion.

### Background job

- **`supabase/functions/expire-trips`** — Deno edge function; marks `open|full` trips with `departure_at < now()` as `completed`. Uses the service role key. Scheduled via `supabase/config.toml` at `0 2 * * *` UTC daily (`verify_jwt = false`). Applied to the linked project on `supabase functions deploy`.

---

## Current State — Implemented & Functional

### Auth
- Email/password register → `signUp` (handles "already registered", returns `needsEmailConfirmation` flag).
- Email/password login → `signIn` (generic "email ou mot de passe incorrect" to avoid enumeration).
- Complete-profile flow (`full_name` + `phone` as strict E.164).
- OAuth callback route at `/auth/callback` (wired, ready for Google; no providers configured in env yet).
- `signOut` Server Action (redirect to `/login`).

### Trips
- **Create** (`createTrip`) — zod-validated, sets `available_seats = total_seats`, driver enforced to `auth.uid()`.
- **Cancel** (`cancelTrip`) — ownership + non-terminal status check; DB trigger cascades to bookings.
- **Browse** (`/trips`) — public search with `from`/`to`/`date` query params; ILIKE on JSONB labels; excludes the current user's own trips; batch-fetches driver names from `profiles_public`.
- **Detail** (`/trips/[id]`) — public; shows route, departure, seats, price, vehicle, notes, driver first-initial avatar, `BookingSection`; handles cancelled / full / own-trip / unauth states.
- **List of cities** — 48 pre-geocoded cities across CH, DE, FR, AT, IT, BE, AL, XK, MK, RS (`src/lib/constants/cities.ts`).

### Bookings
- **Request** (`requestBooking`) — verifies passenger has phone; blocks self-booking, closed trips, oversized requests; handles duplicate-unique-violation with a human message.
- **Accept** (`acceptBooking`) — driver-only; DB trigger handles seat decrement + auto-full + auto-decline.
- **Cancel** (`cancelBooking`) — passenger-only; DB trigger handles seat return + trip re-open.
- **WhatsApp link** (`getWhatsAppLink`) — **critical privacy path**: re-verifies `status='accepted'` server-side, then fetches the other party's phone (gated by RLS), strips non-digits, encodes a French pre-filled message, returns an opaque `wa.me` URL. Bidirectional (driver ↔ passenger).

### Reviews
- **Submit** (`submitReview`) — zod-validated; pre-checks via `can_review_reason` RPC for clean French error messages; insert is defence-in-depth-gated by the `reviews_insert_eligible` RLS policy using the same `can_review(...)` boolean wrapper.
- **Driver aggregate** — flows through `profiles_public.driver_rating_avg` / `driver_rating_count`. Displayed on `/trips` TripCards and `/trips/[id]` detail page. "Nouveau conducteur" pill when count < 3.
- **Passenger summary** (`getPassengerReviewSummary`) — RPC-gated so only drivers with a pending/accepted booking from that passenger see it. Rendered inline on the driver's dashboard booking rows.
- **Driver details** (`getDriverReviewDetails`) — RPC-gated on `has_accepted_booking_with`. Rendered on the passenger's dashboard alongside accepted bookings.
- **ReviewModal** (`src/app/(main)/reviews/ReviewModal.tsx`) — dashboard CTAs on `completed` trips open this modal; uses react-hook-form + zod + `StarRating` interactive variant.
- **Pseudonymisation** — reviewer display names returned by the two `get_*` actions go through `pseudonymizeName("Jean Dupont")` → `"Jean D."` in Node before reaching the client.
- **Window** — submissions accepted up to 30 days after `departure_at` (enforced in `can_review_reason`).

### Dashboard (`/dashboard`)
- RSC runs 3 parallel queries (driver trips, own bookings, own profile name), then fetches trip-booking joins and public profile names in batch.
- Client tab switcher (driver / passenger views).
- `DriverTripCard` groups bookings per trip and exposes accept/decline/cancel controls.
- `PassengerBookingCard` shows status and, when `accepted`, triggers `getWhatsAppLink`.

### Landing page (`/`)
- Hero with background photo (`albania_up_sea.webp`) + glass SearchBar + route shortcut chips.
- 3-step "How it works" section with photo banner.
- Driver-CTA block + footer.
- Adapts navigation based on session (Connexion / Tableau de bord).

### Navbar (`components/layout/Navbar.tsx`)
- Desktop top nav + mobile bottom tab bar; user menu with signout.

### i18n
- 4 locales (`fr` default, `en`, `de`, `sq`) × 12 namespaces = 48 message bundles in `src/messages/**/*.json`. Empty namespaces have been retired during Phase A.
- `next-intl` v4. Path-based routing with `localePrefix: "always"` (`/fr/...`, `/en/...`, etc.). `/` 307-redirects to the detected default. Locale persists in `NEXT_LOCALE` cookie.
- `setRequestLocale` is called in the `[locale]` root layout for static rendering. `generateStaticParams` emits all 4 locale params at build time.
- Server Components/Actions use `getTranslations({ locale, namespace })`; Client Components use `useTranslations(namespace)` with the request locale provided by `<NextIntlClientProvider>`.
- ICU MessageFormat for plurals (`{count, plural, one {…} other {…}}`) and selects (`{status, select, cancelled {…} other {…}}`) — used in error messages and seat counters.
- All Server-Action errors are codes (`{ code: "errors.booking.self_booking", params? }`); zod `.message` arguments are also codes (`"validation.auth.email.invalid"`). The `errors` and `validation` namespaces hold the human strings. This decouples action contracts from copy permanently — copy can change without rewriting any test.
- Country labels live in `messages/{locale}/countries.json` keyed on ISO-3166 codes. City names themselves stay canonical (Genève, München, Shkodër) — diaspora users recognise and search those forms.
- Date format strings are locale-specific copy (`"EEEE d MMMM yyyy 'à' HH'h'mm"` for fr, `"EEEE, d. MMMM yyyy 'um' HH:mm 'Uhr'"` for de, etc.) and live in `common.dateFormat`. Resolved through `formatLocalizedDate` (server) / `useFormatLocalizedDate` (client).
- WhatsApp pre-filled bodies are translated in the **caller's** locale (Phase A). Switching to **recipient's** locale needs the `profiles.preferred_locale` migration (Phase D).

### Tests
- `src/app/[locale]/(main)/trips/actions.test.ts` — createTrip, cancelTrip.
- `src/app/[locale]/(main)/bookings/actions.test.ts` — all 4 booking actions, including security checks. Stubs `next-intl/server.getTranslations` so the WhatsApp link tests pass outside a real Next request.
- `src/app/[locale]/(main)/reviews/actions.test.ts` — submitReview happy + rejection paths, getPassengerReviewSummary, getDriverReviewDetails (pseudonymisation round-trip).
- `src/lib/reviews/display-name.test.ts` — pseudonymizeName edge cases.
- `src/lib/intl/translate.test.ts` — parity check: every key path in `fr/{ns}.json` must exist in `en/`, `de/`, `sq/`. Catches missing translations at test time.
- Shared Supabase mock factory (`src/lib/test-utils/supabase-mock.ts`) — `MOCK_USER`/`MOCK_PASSENGER` IDs are RFC 4122 UUID-v4 shape so they pass zod's `.uuid()` check.
- `vitest.setup.ts` stubs `next/cache` and `next/headers`.
- Server-action assertions are now keyed on error **codes** (`expect(result.error.code).toBe("errors.booking.self_booking")`) — locale-agnostic. 77 tests, all green.

---

## Pending / WIP

**Phases A, B, and C** of the i18n migration (`/home/julienerbland/.claude/plans/zany-squishing-graham.md`) are complete on `main` — `fr` is fully populated, all routes are locale-prefixed, the error-code contract is in force, `en/de/sq` bundles are populated to translate-test parity (Albanian flagged for native review), the `LocaleSwitcher` is wired into both the Navbar and the `(auth)` layout, and DM Sans is configured with the `["latin", "latin-ext"]` subset set. The `profiles.preferred_locale` column (originally Phase D) was pulled forward as part of B.4 to enable cross-device locale memory. Only Phase D-remainder (recipient-locale WhatsApp + SEO `hreflang`/sitemap) is **not started**.

The ratings & reviews plan (`docs/superpowers/plans/2026-04-24-ratings-and-reviews.md`) is fully executed.

Natural next candidates (not started):
- **i18n Phase D (remaining)**: switch `getWhatsAppLink` to read the **recipient's** `preferred_locale` so the message is composed in the other party's language; emit `metadata.alternates.languages` and a `sitemap.ts` for SEO `hreflang` coverage.
- **Native review of `sq/*`** before serving to real users — every Albanian bundle carries `_meta.review = "needs-native-speaker-review"`.
- Driver can edit a trip (only cancel + create today).
- Pagination / infinite scroll on `/trips` (currently unbounded list).
- Notifications (email on booking accepted/declined — no provider wired).
- OAuth provider config (Google) — the callback route exists but no `.env.local` entries.
- Avatar upload (`profiles.avatar_url` is present in the schema but no upload path).
- Playwright E2E suite (not scaffolded).
- Realtime updates on the dashboard (Supabase Realtime not yet enabled on any table).

---

## Known Issues / Technical Debt

1. **`src/types/database.types.ts` mixes generated + hand-maintained content.**
   The top block is emitted by Supabase (regenerate via MCP `generate_typescript_types` or `supabase gen types typescript --linked`). The bottom block (`TripStatus`, `BookingStatus`, `LocationJsonb`, `TripRow`, `BookingRow`) narrows Postgres `text`/`jsonb` columns into their application-level literal unions / shapes and is **NOT emitted by the generator** — it must be re-appended after every regeneration. The block is fenced with a banner comment to make this obvious. Because `Row.status` is `string` (the CHECK constraint is not surfaced to the type generator), consumers of `TripRow` / `BookingRow` must cast at assignment (`data as TripRow`) — done today at `trips/actions.ts:39`, `bookings/actions.ts:87`, `bookings/actions.ts:148`.

2. **`README.md` is still the default `create-next-app` template.**
   Contains no project description, setup steps, env-var list, migration order, or deployment notes. `CLAUDE.md` and `project.md` carry that knowledge instead; a public-facing README is missing.

3. **`signOut` Server Action is inconsistent with the `ActionResult` contract.**
   Every other action returns `{ success, error? }`; `signOut` is typed `Promise<never>` and just calls `redirect()`. Defensible (there's no failure surface worth reporting), but worth noting if consumers start trying `.success` on its result.

4. **Search on `/trips` is unbounded.**
   Query does `ILIKE '%{from}%'` on JSONB labels without `.limit()`. With the existing partial indexes on `(lower(origin->>'label'))` / `(lower(destination->>'label'))` performance is fine for the MVP, but pagination will be needed before opening beyond a test group.

5. **No observability.**
   Errors are `console.error`'d server-side (e.g. `[createTrip]`, `[requestBooking]`) but no Sentry / Log Drain. On Vercel Functions these land in platform logs only.

6. **Next.js 16 is current but `next.config.ts` is empty.**
   No `images.remotePatterns`, no `experimental` flags. Fine today (all images are local to `/public/images`), but any external asset (avatar CDN, Supabase Storage) will require config.

7. **Layout `params` type asymmetry between pages and layouts.**
   Next.js's auto-generated `LayoutProps<"/[locale]">` constraint pins `params.locale` to `string`, not the narrowed `SupportedLocale` union. Pages don't have this constraint. Result: layouts (e.g. `[locale]/layout.tsx`, `[locale]/(auth)/layout.tsx`) must accept `{ locale: string }` and cast inside (`locale as SupportedLocale`); pages can use the narrow type directly. Two-line workaround per file, but worth knowing if the pattern proliferates.

8. **Albanian copy is best-effort.**
   Every `sq/*.json` carries `_meta.review = "needs-native-speaker-review"`. Strings were generated by Claude based on plausible Albanian phrasing for the diaspora context but have not been reviewed by a native speaker. Sample non-trivial choices the reviewer should sanity-check: pronoun politeness on the auth pages, "shoferin tuaj"/"pasagjerin tuaj" definite-form choice, Kosovo/Albania orthography conventions in city labels (we kept "Genevë", "Mynih", "Cyrih" which may not all be canonical), and pluralisation behaviour in ICU plurals (Albanian is `one|other`, but the natural phrasing in the `other` branch may need adjustments).

9. **WhatsApp body uses caller locale, not recipient locale.**
   `getWhatsAppLink` currently calls `await getTranslations("bookings.whatsapp")` against the request's locale — i.e. the locale of whoever clicked "Contact". The dependency that blocked the fix is now lifted: `profiles.preferred_locale` exists (Phase B.4 pulled it forward from Phase D) and is populated for any user who has touched the `LocaleSwitcher` while signed in. Remaining work is a one-call edit in `getWhatsAppLink` to look up the *other party's* preference and render the body against that locale. Mitigation today: short, structurally similar bodies across all four locales — no information loss, just a slight tone mismatch.
