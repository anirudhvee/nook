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
| Review scraping | Apify (Google Maps Reviews Scraper actor) |
| AI | OpenAI API (gpt-4o-mini) |
| Deployment | Vercel |

> **Note:** Most dependencies (Supabase, Mapbox GL, shadcn/ui, OpenAI SDK, etc.) are not yet installed. The project is currently a bare `create-next-app` scaffold.

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


## Project Structure

Target structure (not yet fully scaffolded — only `app/page.tsx`, `app/layout.tsx`, and `app/globals.css` exist currently):

```
nook/
├── app/                  # Next.js App Router pages
│   ├── page.tsx          # Home / discovery page
│   ├── nook/[id]/        # Individual nook detail page
│   ├── passport/         # User's visited nooks (stamp collection)
│   └── api/              # API routes
│       ├── places/       # Google Places proxy
│       ├── reviews/      # Apify review fetching + cache layer
│       ├── nooks/        # Nook CRUD
│       └── ai/           # OpenAI-powered search/parsing
├── components/           # Shared UI components
│   ├── ui/               # shadcn/ui primitives (do not edit directly)
│   ├── map/              # Mapbox components
│   └── nook/             # Nook-specific components (NookCard, NookDetail, etc.)
├── lib/                  # Utilities and clients
│   ├── supabase.ts       # Supabase client
│   ├── mapbox.ts         # Mapbox helpers
│   ├── places.ts         # Google Places API wrapper
│   ├── apify.ts          # Apify actor calls (Google Maps Reviews Scraper)
│   └── openai.ts         # OpenAI client
├── types/                # Shared TypeScript types
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
- All Google Places calls go through `/api/places` — never expose the API key client-side.
- All Apify calls go through `/api/reviews` — never call Apify client-side.
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
APIFY_API_TOKEN=
OPENAI_API_KEY=
```

`NEXT_PUBLIC_` variables are safe to expose. All others are server-only.

---

## Database

Schema lives in `/supabase/migrations/` — always read these files before writing any database-related code. Never infer schema from memory.

---

## Review Data Strategy

Reviews are fetched via Apify's Google Maps Reviews Scraper actor and cached aggressively in Supabase. The flow is:

```
User opens nook detail →
  Check reviews table for rows where nook_id matches AND fetched_at > now() - interval '7 days'
    Cache hit  → serve from Supabase, free
    Cache miss → call Apify actor → store in reviews table → pass to gpt-4o-mini for parsing → store in work_signals → serve
```

**Never re-fetch reviews for a place within 7 days.** This keeps Apify usage well within the free tier ($5/month = ~10,000 reviews) during early development.

gpt-4o-mini parses reviews once on ingest using this prompt pattern:
```
From these Google Maps reviews, extract any mentions of:
WiFi quality, outlet/plug availability, noise level, seating comfort,
laptop-friendliness, time limits, or being asked to leave.
Return a JSON object with keys: wifi, outlets, noise, laptopFriendly, notes.
```

Parsed signals are stored in work_signals and served directly on subsequent loads — gpt-4o-mini is not called again unless reviews are re-fetched.

---

## Important Notes

- **Do not one-shot the entire app.** Build feature by feature, one session per feature.
- **Always write tests alongside new features.**
- **Commit after each working feature** with a descriptive message.
- **Never hardcode API keys.** Always use environment variables.
- **Use `/compact`** if the session context gets long. Start a new session between features.
- The Mapbox style should use warm earth tones — reference the Mapbox Studio "Outdoors" style as a base.
- Google Places `nearbySearch` is the primary endpoint for finding nooks. Filter by `type`: `cafe`, `library`, `lodging`.
- Apify actor to use: `compass/Google-Maps-Reviews-Scraper`. Pass the Google Maps place URL. Free tier = $5/month ≈ 10,000 reviews.
- Always check Supabase cache before calling Apify. Cache TTL is 7 days. Never call Apify for a place that has fresh cached reviews.
- gpt-4o-mini parses reviews once on ingest and stores signals in `work_signals`. Do not re-parse on every page load.
