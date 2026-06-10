import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase";
import { ANTHROPIC_API_KEY } from "astro:env/server";

const MAX_TEXT_LENGTH = 10000;
const MIN_COUNT = 1;
const MAX_COUNT = 20;

interface GenerateRequestBody {
  text?: unknown;
  count?: unknown;
}

interface GeneratedCard {
  front: string;
  back: string;
}

const FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = FENCE_PATTERN.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

function isGeneratedCard(value: unknown): value is GeneratedCard {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).front === "string" &&
    typeof (value as Record<string, unknown>).back === "string"
  );
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: GenerateRequestBody;
  try {
    body = (await context.request.json()) as GenerateRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return new Response(JSON.stringify({ error: "Text exceeds 10 000 character limit" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const count = typeof body.count === "number" ? body.count : NaN;
  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    return new Response(JSON.stringify({ error: "Count must be between 1 and 20" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = crypto.randomUUID();
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let cards: GeneratedCard[];
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
      max_tokens: 4096,
      system:
        "You are a flashcard generator. Read the provided source text and produce exactly the requested " +
        "number of flashcards, each capturing one discrete concept. Respond with ONLY a JSON array of " +
        'objects shaped as {"front": string, "back": string} — no markdown fences, no commentary, no ' +
        "additional keys.",
      messages: [
        {
          role: "user",
          content: `Generate ${count} flashcards from this text:\n\n${text}`,
        },
      ],
    });

    const block = response.content[0];
    const raw = block.type === "text" ? block.text : "";
    const parsed: unknown = JSON.parse(stripMarkdownFences(raw));
    if (!Array.isArray(parsed) || !parsed.every(isGeneratedCard)) {
      throw new Error("Unexpected generation response shape");
    }
    cards = parsed;
  } catch {
    return new Response(JSON.stringify({ error: "Failed to generate flashcards — please try again" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("flashcard_drafts")
    .insert(
      cards.map((card) => ({
        user_id: user.id,
        front: card.front,
        back: card.back,
        generation_session_id: sessionId,
      })),
    )
    .select("id, front, back, state");

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to save generated flashcards" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ cards: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
