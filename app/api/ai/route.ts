import { NextRequest } from "next/server";

// TODO: parse review text with Claude and return work_signals JSON.
// Store result in work_signals table — do not re-parse on every page load.
export async function POST(_req: NextRequest) {
  return Response.json({ message: "AI API — not yet implemented" }, { status: 501 });
}
