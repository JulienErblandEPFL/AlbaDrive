# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project: AlbaDrive

Carpooling web app for the Albanian diaspora in Europe (Switzerland → Pristina, Germany → Tirana, etc.). An MVP connecting drivers and passengers on the Europe ↔ Balkans corridor.

**Non-negotiable MVP constraints:**
- No online payments — cost-sharing price is informational only.
- No internal chat — communication happens via WhatsApp after a driver accepts a booking.
- Phone numbers are private until a booking is accepted (see Security section).

---

## Commands

```bash
# Development
pnpm dev               # Start Next.js dev server
pnpm build             # Production build
pnpm typecheck         # tsc --noEmit (run before every PR)

# Testing
pnpm test              # Run all vitest tests
pnpm test -- path/to/file.test.ts  # Run a single test file
pnpm test:e2e          # Run Playwright E2E tests

# Supabase
supabase start                          # Start local Supabase stack
supabase migration new <name>           # Create a new migration
supabase db push                        # Apply migrations to linked project
supabase gen types typescript --linked > types/database.types.ts  # Regenerate types after migration
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ App Router (Pages Router is forbidden) |
| Language | TypeScript strict mode — no `any` without justification |
| Styling | Tailwind CSS only — no CSS modules or styled-components |
| Backend | Supabase (Auth, PostgreSQL, RLS, Storage) |
| Forms | `react-hook-form` + `zod` |
| Supabase client | `@supabase/ssr` — never `@supabase/supabase-js` directly in Server Components |
| Dates | `date-fns` |
| Icons | `lucide-react` |
| Testing | `vitest` + `@testing-library/react` |
| Deployment | Vercel |

Do not introduce new major dependencies without explicit approval.

---

## Architecture

### Server vs. Client Components

Default to **Server Components**. Add `"use client"` only when needed for interactivity, event handlers, `useState`/hooks, or browser APIs. Push `"use client"` as far down the component tree as possible (leaf components).

Never fetch data from Supabase inside a Client Component — pass data as props from a Server Component or use a Server Action.

### Data Mutations → Server Actions Only

All INSERT/UPDATE/DELETE operations must go through Next.js Server Actions. Never call Supabase `.insert()/.update()/.delete()` from a Client Component.

```typescript
// app/trips/actions.ts
"use server";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createTrip(formData: FormData) {
  const supabase = createServerClient();
  // 1. Validate with zod
  // 2. Insert into DB
  revalidatePath("/trips");  // Always revalidate after mutations
}
```

Server Actions files are always named `actions.ts` and co-located with their feature (e.g., `app/trips/actions.ts`).

#### Error Handling in Server Actions — Mandatory

**Server Actions must NEVER `throw` a raw error to the client.** They must always return a standardized response object:

```typescript
type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };
```

- Use `zod`'s `.safeParse()` — **never** `.parse()` — inside Server Actions. Catch validation errors and return `{ success: false, error: parsed.error.errors[0].message }`.
- Never expose raw database error messages to the client. Return a generic user-readable string; log the full error server-side.
- The `error` field must always be a plain `string`, not an error object or array.

```typescript
// ✅ CORRECT
export async function createTrip(formData: FormData): Promise<ActionResult> {
  const parsed = createTripSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("trips").insert(parsed.data);
    if (error) return { success: false, error: "Database error. Please try again." };
    revalidatePath("/trips");
    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error. Please try again." };
  }
}
```

### Supabase Session Management — `middleware.ts` Only

**The Supabase session refresh (cookie read/write via `@supabase/ssr`) must be handled exclusively in `middleware.ts`** at the project root.

- **Never** refresh the session manually inside a Server Component, Server Action, or API route.
- The middleware must call `supabase.auth.getUser()` on every request — this is what keeps sessions alive by rewriting the cookie. Do not remove this call.
- Route protection (redirect unauthenticated users) belongs here, not in individual pages.

```typescript
// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  // IMPORTANT: do not remove — refreshes session on every request
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### Folder Structure

```
app/
├── (auth)/               # login, register
├── (main)/               # authenticated app
│   ├── trips/
│   │   ├── page.tsx          # Server Component
│   │   ├── [id]/page.tsx
│   │   ├── actions.ts        # Server Actions
│   │   └── components/       # Feature-scoped components
│   └── bookings/
├── components/
│   ├── ui/               # Shared primitives (Button, Input…)
│   └── layout/           # Header, Footer
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Browser client
│   │   └── server.ts     # Server client (Server Components & Actions)
│   └── utils.ts
└── types/
    └── database.types.ts # Auto-generated — never write manually
```

**Naming:** `PascalCase` for components, `camelCase` for variables/functions, `kebab-case` for routes/files, `SCREAMING_SNAKE_CASE` for constants. Zod schemas suffixed with `Schema` (e.g., `createTripSchema`). TypeScript DB types use Supabase-generated patterns: `Database["public"]["Tables"]["trips"]["Row"]`.

---

## Security Rules

### RLS — Every Table, Always

Every Supabase table must have RLS enabled. A table without RLS is a critical bug.

```sql
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

When writing a migration: enable RLS, write minimum required policies (least privilege), verify anonymous users cannot access protected data.

### Phone Number Privacy — Critical

The passenger's phone number must never be exposed until a driver accepts a booking.

| Layer | Rule |
|---|---|
| Database (RLS) | `profiles.phone` only accessible to the profile owner OR a driver with an `accepted` booking with that passenger |
| Server Action | Re-verify server-side that `booking.status = 'accepted'` AND the requesting user is the driver or passenger before generating the WhatsApp link |
| Queries | Never `SELECT *` — always use explicit column lists. Never select `phone` in trip listings or pending booking queries |
| Client Components | Never receive or store phone numbers in state. WhatsApp links are generated server-side and passed as opaque URLs |

WhatsApp link generation happens **server-side only** in a Server Action, after validating booking status.

**Phone number format — E.164 mandatory:** All phone numbers must be stored in the database in strict E.164 format (e.g., `+41791234567`). This guarantees `wa.me` deep-links are always valid.

- Validate and normalize to E.164 **before** any `INSERT`/`UPDATE` on `profiles`. Use zod: `z.string().regex(/^\+[1-9]\d{6,14}$/)`.
- Never store a number without a country code (`0791234567` is forbidden).
- Display formatting is UI-layer only — the raw E.164 value is always what gets stored and retrieved.

```typescript
const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Phone number must be in E.164 format (e.g. +41791234567)");
```

### General

- Never use `SELECT *` — always list explicit columns.
- Validate all inputs with `zod` before touching the database.
- Use `SUPABASE_SERVICE_ROLE_KEY` only in Server Actions/API routes — never pass to client.
- `NEXT_PUBLIC_` variables are exposed to the browser; never put secrets there.

---

## Development Workflow

1. **Plan** — state the approach before writing code.
2. **Test first** — write tests before implementation for Server Actions, utility functions, and components that handle booking state.
3. **Implement** — minimal code to pass the test.
4. **Verify** — run `pnpm test` and `pnpm typecheck`.

Test files are co-located as `*.test.ts` / `*.test.tsx`. E2E tests live in `e2e/`. Mock Supabase with `vitest` mocks in unit tests — never call the real DB.

**Pre-commit security checklist:**
- Does this feature touch user data? → RLS in place?
- Does this feature involve phone numbers? → Access restricted server-side?
- Input validated with `zod` before DB?
- Mutations go through Server Actions?
- Any `SELECT *`? Replace with explicit columns.
- Does the UI expose any data before booking acceptance?

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # Server-side only
NEXT_PUBLIC_APP_URL=
```
