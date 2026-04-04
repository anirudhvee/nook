import { NextRequest } from "next/server";

// TODO: check Supabase reviews cache (TTL 7 days) before calling Apify.
// Cache hit → return cached rows. Cache miss → call Apify actor
// (compass/Google-Maps-Reviews-Scraper), store in reviews table, trigger AI parsing.
export async function GET(_req: NextRequest) {
  return Response.json({ message: "Reviews API — not yet implemented" }, { status: 501 });
}
