import { NextRequest } from "next/server";

// TODO: GET — list/search nooks; POST — submit a new nook (auth required).
export async function GET(_req: NextRequest) {
  return Response.json({ message: "Nooks API — not yet implemented" }, { status: 501 });
}

export async function POST(_req: NextRequest) {
  return Response.json({ message: "Nooks API — not yet implemented" }, { status: 501 });
}
