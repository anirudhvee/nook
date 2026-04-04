import { NextRequest } from "next/server";

// TODO: proxy Google Places nearbySearch — never expose GOOGLE_PLACES_API_KEY client-side.
// Params: lat, lng, type (cafe | library | lodging), radius
export async function GET(_req: NextRequest) {
  return Response.json({ message: "Places API — not yet implemented" }, { status: 501 });
}
