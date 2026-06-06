import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

interface FlashCard {
  id: string;
  front: string;
  back: string;
  created_at: string;
}
interface QuerySingle {
  data: FlashCard | null;
  error: { message: string } | null;
}

export const PATCH: APIRoute = async (context) => {
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

  const id = context.params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing card ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody: unknown = await context.request.json().catch(() => null);
  const obj = typeof rawBody === "object" && rawBody !== null ? (rawBody as Record<string, unknown>) : {};
  const front = typeof obj.front === "string" ? obj.front.trim() : "";
  const back = typeof obj.back === "string" ? obj.back.trim() : "";

  if (!front || !back) {
    return new Response(JSON.stringify({ error: "Front and back are required and cannot be blank" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = (await supabase
    .from("flashcards")
    .update({ front, back })
    .eq("id", id)
    .select()
    .single()) as unknown as QuerySingle;

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Card not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async (context) => {
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

  const id = context.params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing card ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = (await supabase.from("flashcards").delete().eq("id", id)) as unknown as {
    error: { message: string } | null;
  };

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to delete card" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(null, { status: 204 });
};
