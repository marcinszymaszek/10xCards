import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

interface PromoteRequestBody {
  session_id?: unknown;
  accepted?: unknown;
}

interface AcceptedCard {
  id: string;
  front: string;
  back: string;
}

function isAcceptedCard(value: unknown): value is AcceptedCard {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
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

  let body: PromoteRequestBody;
  try {
    body = (await context.request.json()) as PromoteRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { session_id, accepted } = body;

  if (typeof session_id !== "string" || !session_id) {
    return new Response(JSON.stringify({ error: "session_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(accepted) || accepted.length === 0 || !accepted.every(isAcceptedCard)) {
    return new Response(JSON.stringify({ error: "Must accept at least one card" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = (await supabase.rpc("promote_generation_session", {
    p_session_id: session_id,
    p_accepted: accepted,
  })) as unknown as { data: number | null; error: { message: string } | null };

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to save cards" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ saved: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
