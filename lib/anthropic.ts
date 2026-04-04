import Anthropic from "@anthropic-ai/sdk";

// Instantiated once — import and use in /api/ai route handlers only.
// Never call this client-side.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export const AI_MODEL = "claude-sonnet-4-6";
