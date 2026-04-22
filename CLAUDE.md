# Nook

A web-first app for finding places to work from — cafés, libraries, coworking spaces, and other remote-work-friendly spots.

**Live site:** findanook.com  
**Repo:** github.com/anirudhvee/nook  
**Status:** Early development

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database + Auth | Supabase (Postgres + Supabase Auth) |
| Maps rendering | MapLibre GL JS |
| Geocoding + autocomplete | Geoapify |
| Venue data | Overture Maps seeded into Supabase |
| Work signals | Supabase `work_signal_reports` + `work_signal_summary` |
| Deployment | Vercel |

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Structure

```
nook/
├── app/                  # Next.js App Router pages
│   ├── page.tsx          # Home / discovery page
│   ├── nook/[id]/        # Discovery page with canonical /nook/<slug> URLs
│   ├── passport/         # User's visited nooks
│   └── api/              # API routes
│       ├── places/       # Supabase/PostGIS nearby nook search
│       ├── places/[id]/  # Supabase nook detail by slug
│       ├── geocode/      # Geoapify geocoding proxy for search autocomplete
│       ├── passport/     # Passport stamp data
│       └── seed/         # Overture seed trigger endpoint
├── components/           # Shared UI components
│   ├── ui/               # shadcn/ui primitives (do not edit directly)
│   ├── map/              # Map components
│   ├── nook/             # Nook-specific components
│   └── passport/         # Passport UI
├── lib/                  # Utilities and clients
├── scripts/              # Data seeding scripts
├── supabase/migrations/  # Database schema and RPCs
├── tests/                # Lightweight unit tests
├── types/                # Shared TypeScript types
└── public/               # Static assets
```

---

## Design

**Aesthetic:** Earth palette, plant-coded, warm. Think moss greens, warm tans, terracotta, off-white. Not sterile or corporate.
**Target user:** Remote worker, freelancer, student — someone who knows the pain of showing up to a café with no outlets and laptop-hostile seating.
**Component library:** shadcn/ui. Use existing shadcn components before building custom ones.
**Icons:** lucide-react.

---

## Key Features

1. **Discovery map** — MapLibre map showing nearby nooks, filterable by type.
2. **Nook detail panel** — Address, contact links, map link, and community work signals.
3. **Passport** — Stamp collection of places the user has worked from.
4. **Seeding** — Empty-area searches can trigger Overture-backed seeding via GitHub Actions.

---

## Development Commands

```
npm run dev    # start dev server (localhost:3000)
npm run build  # production build
npm run lint   # run ESLint
npx tsc --noEmit
```

There is not yet a standardized `npm test` script; current lightweight logic tests live under `tests/unit/`.

---

## Conventions

- Use server components by default. Only add `"use client"` when interactivity is required.
- Read `node_modules/next/dist/docs/` before changing Next.js route handlers or conventions.
- Browser Supabase calls go through `lib/supabase.ts`.
- Server/service-role Supabase calls go through the server/admin Supabase helpers.
- Venue discovery should use `/api/places`, which queries Supabase/PostGIS.
- Nook details should use `/api/places/[slug]`, which joins `nooks`, `nook_details`, and `work_signal_summary`.
- Use Tailwind utility classes for styling. No CSS modules.
- Tailwind v4 is in use. There is no `tailwind.config.js`; custom tokens live in `app/globals.css`.
- The `@/` path alias maps to the repo root.
- Use shadcn/ui components from `components/ui/` and do not modify those files directly.
- TypeScript strict mode is on. No `any` types.
- Prefer named exports over default exports except for Next.js page/layout files.

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEOAPIFY_API_KEY=
GITHUB_TOKEN=
GITHUB_REPO_OWNER=
GITHUB_REPO_NAME=
SEED_TRIGGER_SECRET=
```

`NEXT_PUBLIC_` variables are safe to expose. All others are server-only.

GitHub Actions also needs repo secrets:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Auth

- **Auth:** Supabase Auth — Google OAuth + email magic link.
- **Shared UI:** `components/auth/AuthControls.tsx`.
- **Callback:** `app/auth/callback/route.ts`.
- **Session refresh:** `proxy.ts`.

---

## Database

Schema lives in `supabase/migrations/`. Always read the migrations before writing database-related code.

Current venue data flow:

1. `scripts/seed-overture.py` queries Overture Maps places for configured bounding boxes.
2. The script normalizes rows into `nooks` and `nook_details`.
3. `/api/places` queries nearby nooks through the `search_nooks_nearby` PostGIS RPC.
4. If `/api/places` finds no rows for a searched area, it can call `/api/seed/trigger` server-side.
5. `/api/seed/trigger` atomically claims `seeded_regions` and dispatches `.github/workflows/seed-region.yml`.

Important tables:

| Table | Purpose |
|---|---|
| `nooks` | Canonical Overture-backed venues |
| `nook_details` | Supplemental links/details such as Google Maps URL and community hours |
| `work_signal_reports` | Append-only community work-signal reports |
| `work_signal_summary` | Per-nook aggregate work-signal counts |
| `stamps` | Passport check-ins by authenticated users |
| `seeded_regions` | Tracks bbox seed status and venue counts |

Important RPCs:

| RPC | Purpose |
|---|---|
| `search_nooks_nearby` | Nearby PostGIS nook search |
| `claim_seeded_region` | Atomic seed-region claim/dedupe |
| `create_passport_check_in` | Atomic passport check-in with cooldown |

---

## Work Signals

Work signals are community-report driven. Do not fetch third-party reviews to infer them.

The detail endpoint joins `work_signal_summary` and returns compact work-signal labels for the UI. New signal-report submission flows should write to `work_signal_reports` and update or refresh `work_signal_summary` consistently.

---

## Important Notes

- Do not one-shot the entire app. Build feature by feature.
- Always write tests alongside new features when there is stable logic to test.
- Commit after each working feature with a descriptive message.
- Never hardcode API keys. Always use environment variables.
- The map style should use warm earth tones and preserve Nook's custom globe presentation.
- `components/map/searchPillMatch.ts` contains the direct-enter search matching logic; keep that logic generic and data-driven.
