# Nook

A web-first app for finding places to work from — cafés, libraries, hotel lobbies, coworking spaces, parks. Targeted at remote workers and people who just need a good spot to get things done.

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
| Maps rendering | Mapbox GL JS |
| Venue data | Google Places API |
| Review data | Google Places API (New) — `reviewSummary`, `generativeSummary`, `reviews` |
| AI | OpenAI API (gpt-4o-mini) |
| Deployment | Vercel |

> **Note on Apify:** Apify integration was built and is preserved on the `feature/apify-reviews` branch, but is **not active on `main`**. Reviews are sourced directly from the Google Places API (New).

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
│   ├── nook/[id]/        # Individual nook detail page
│   ├── passport/         # User's visited nooks (stamp collection)
│   └── api/              # API routes
│       ├── places/       # Google Places (New) proxy — nearby search
│       ├── places/[id]/  # Google Places (New) detail — reviews, hours, summary
│       ├── nooks/        # Nook CRUD
│       ├── reviews/      # (stub — unused on main; active on feature/apify-reviews)
│       └── ai/           # OpenAI work-signal parsing + Supabase cache
├── components/           # Shared UI components
│   ├── ui/               # shadcn/ui primitives (do not edit directly)
│   ├── map/              # Mapbox components
│   └── nook/             # Nook-specific components (NookCard, NookDetailPanel, etc.)
├── lib/                  # Utilities and clients
│   ├── supabase.ts       # Supabase client (browser, server, service-role)
│   ├── mapbox.ts         # Mapbox helpers
│   └── utils.ts          # cn() and other shared utilities
├── types/                # Shared TypeScript types
│   └── nook.ts           # NookPlace, NookType, FilterType
└── public/               # Static assets
```

---

## Design

**Aesthetic:** Earth palette, plant-coded, warm. Think moss greens, warm tans, terracotta, off-white. Not sterile or corporate.  
**Target user:** Remote worker, freelancer, student — someone who knows the pain of showing up to a "café" with no outlets and laptop-hostile seating.  
**Component library:** shadcn/ui. Use existing shadcn components before building custom ones.  
**Icons:** lucide-react (already included with shadcn).

---

## Key Features (build in this order)

1. **Discovery map** — Mapbox map showing nearby nooks, filterable by type (café, library, coworking, other)
2. **Nook detail page** — WiFi quality, outlet availability, noise level, hours, laptop-friendliness, AI-parsed review highlights
3. **Submit a nook** — User can submit a spot they've enjoyed working at
4. **Passport** — Stamp collection of places the user has worked from (Flighty-style)
5. **Share** — "I'm working from [Nook] today" shareable card

---

## Development Commands

```
npm run dev    # start dev server (localhost:3000)
npm run build  # production build
npm run lint   # run ESLint
```

---

## Conventions

- Use **server components by default**. Only add `"use client"` when interactivity is required.
- All Supabase calls go through `lib/supabase.ts` — never import the client directly in components.
- All Google Places calls go through `/api/places` or `/api/places/[id]` — never expose the API key client-side.
- All OpenAI calls go through `/api/ai` — never call the OpenAI API client-side.
- Use **Tailwind utility classes** for styling. No inline styles, no CSS modules.
- **Tailwind v4** is in use. There is no `tailwind.config.js` — configuration (custom colors, fonts, tokens) lives in `app/globals.css` via `@import "tailwindcss"` and an `@theme {}` block.
- The `@/` path alias maps to the repo root (e.g. `@/components/ui/button`, `@/lib/supabase`).
- Use **shadcn/ui components** from `/components/ui/` — never modify these files directly.
- TypeScript strict mode is on. No `any` types.
- Prefer named exports over default exports except for Next.js page/layout files.

---

## Environment Variables

```
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_PLACES_API_KEY=
OPENAI_API_KEY=
```

`APIFY_API_TOKEN` is only needed on the `feature/apify-reviews` branch — not required on `main`.

`NEXT_PUBLIC_` variables are safe to expose. All others are server-only.

---

## Database

Schema lives in `/supabase/migrations/` — always read these files before writing any database-related code. Never infer schema from memory.

---

## Review Data Strategy

Reviews come directly from the **Google Places API (New)**. The detail endpoint (`/api/places/[id]`) requests these fields:

- `reviewSummary` — AI-generated summary text with attribution (shown in the panel)
- `generativeSummary` — fallback overview if `reviewSummary` is absent
- `reviews` — up to 5 individual reviews passed to OpenAI for work-signal extraction

**Work signals flow:**

```
User opens nook detail →
  NookDetailPanel fetches /api/places/[id]  →  renders review summary + hours
  NookDetailPanel POSTs /api/ai with { place_id, reviews (5 max), generateSummary? }
    Check work_signals table for existing row (nook_id = place_id)
      Cache hit, fresh →
        signals + summary both present  → return both immediately
        signals present, summary null, generateSummary true  → generate summary, update row, return
        signals present, no summary needed  → return signals
      Cache hit, stale (TTL or empty retry, see below)  → full re-parse
      Cache miss  → full re-parse
    Full re-parse: call gpt-4o-mini for signals + (if generateSummary) summary in parallel
      → single upsert into work_signals with both values
```

gpt-4o-mini receives up to 5 reviews and returns a constrained enum array using structured outputs (`json_schema`). Allowed signal values:

```
good wifi | weak wifi | no wifi |
plenty of outlets | few outlets | no outlets |
quiet | moderate noise | loud |
laptop-friendly | not laptop-friendly
```

**work_signals cache behaviour:**

- Signals (`jsonb`) and summary (`text`) are stored together in a single row per `place_id`.
- **Full re-parse TTL:** 30 days from `parsed_at` — both signals and summary are re-generated together via a single upsert.
- **Empty signals retry:** if `signals` is `[]` and `parsed_at` is older than 24 hours, trigger a full re-parse (in case the first parse had no reviews available).
- **Partial update:** if signals are present but `summary` is `null` and `generateSummary: true` is passed, generate the summary only and update the row — no signals re-parse.
- Summary is never generated independently of a request; it is always demand-driven and cached after first generation.

**Active Supabase tables on `main`:**

| Table | Purpose |
|---|---|
| `work_signals` | Cached OpenAI signals + summary per place (`nook_id text PK`, `signals jsonb`, `summary text`, `parsed_at`) |
| `stamps` | Passport stamps — user ↔ nook visits (future feature) |
| `nooks` | Submitted venue records (schema exists, not yet wired to UI) |

> The `reviews` table existed for Apify caching and has been truncated; it is effectively unused on `main`. Its schema is preserved in migrations for reference.

---

## Important Notes

- **Do not one-shot the entire app.** Build feature by feature, one session per feature.
- **Always write tests alongside new features.**
- **Commit after each working feature** with a descriptive message.
- **Never hardcode API keys.** Always use environment variables.
- **Use `/compact`** if the session context gets long. Start a new session between features.
- The Mapbox style should use warm earth tones — reference the Mapbox Studio "Outdoors" style as a base.
- Google Places API (New) `nearbySearch` is the primary endpoint for finding nooks. Filter by `type`: `cafe`, `library`, `lodging`.
- Google Places API (New) detail endpoint fields in use: `displayName`, `formattedAddress`, `addressComponents`, `rating`, `types`, `regularOpeningHours`, `reviewSummary`, `generativeSummary`, `reviews`.
- gpt-4o-mini parses reviews and stores signals + summary in `work_signals`. Do not re-parse on every page load.
- Always check `work_signals` cache before calling OpenAI. See cache behaviour above for TTL and retry rules.
