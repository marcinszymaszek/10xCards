import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { OPENROUTER_API_KEY } from "astro:env/server";

const MAX_TEXT_LENGTH = 10000;
const MIN_COUNT = 1;
const MAX_COUNT = 20;

// OpenRouter tries each model in order — first available wins.
// All listed models are currently free (:free suffix).
const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "openai/gpt-oss-20b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

interface GenerateRequestBody {
  text?: unknown;
  count?: unknown;
}

interface GeneratedCard {
  front: string;
  back: string;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message: string; code: number };
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

async function callOpenRouter(apiKey: string, count: number, text: string): Promise<GeneratedCard[]> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      // Pass all models — OpenRouter automatically falls back to the next
      // if the first is rate-limited or unavailable.
      models: FREE_MODELS,
      route: "fallback",
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content:
            "You are a flashcard generator. Read the provided source text and produce exactly the requested " +
            "number of flashcards, each capturing one discrete concept. Respond with ONLY a JSON array of " +
            'objects shaped as {"front": string, "back": string} — no markdown fences, no commentary, no additional keys.',
        },
        {
          role: "user",
          content: `Generate ${count} flashcards from this text:\n\n${text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 403) {
      console.error("[generate] OpenRouter AUTH FAILURE — check OPENROUTER_API_KEY in .dev.vars:", res.status, err);
    } else {
      console.error("[generate] OpenRouter error:", res.status, err);
    }
    throw new Error(`OpenRouter ${res.status}`);
  }

  const json = (await res.json()) as OpenRouterResponse;
  const raw = json.choices?.[0]?.message?.content ?? "";
  const parsed: unknown = JSON.parse(stripMarkdownFences(raw));
  if (!Array.isArray(parsed) || !parsed.every(isGeneratedCard)) {
    throw new Error("Unexpected generation response shape");
  }
  return parsed;
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

  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = crypto.randomUUID();

  let cards: GeneratedCard[];
  try {
    cards = await callOpenRouter(OPENROUTER_API_KEY, count, text);
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      console.error("[generate] OpenRouter request timed out after 10s");
      return new Response(JSON.stringify({ error: "Generation timed out — please try again" }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("[generate] error:", e);
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

  return new Response(JSON.stringify({ session_id: sessionId, cards: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
