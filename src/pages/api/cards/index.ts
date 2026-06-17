import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { listCards, parsePositiveInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type FlashCard } from "@/lib/cards";

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
    .insert({ user_id: user.id, front, back, origin: "manual" })
    .select("id, front, back, origin, created_at")
    .single()) as unknown as { data: FlashCard | null; error: { message: string } | null };

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Failed to create card" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: APIRoute = async (context) => {
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

  const params = context.url.searchParams;
  const page = parsePositiveInt(params.get("page"), 1);
  const pageSize = parsePositiveInt(params.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const q = (params.get("q") ?? "").trim();

  try {
    const { items, total } = await listCards(supabase, { page, pageSize, q });
    return new Response(JSON.stringify({ items, total, page, pageSize }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to fetch cards" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
