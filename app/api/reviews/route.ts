import { NextRequest } from "next/server";

// TODO: This route is intentionally unused on main.
// Reviews are sourced directly from Google Places in /api/places/[id].
export async function GET(_req: NextRequest) {
  return Response.json({ message: "Reviews API — not yet implemented" }, { status: 501 });
}
