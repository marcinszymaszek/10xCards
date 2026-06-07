import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { listCards, parsePositiveInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/cards";

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
