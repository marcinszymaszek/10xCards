import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

interface FlashCard {
  id: string;
  front: string;
  back: string;
  created_at: string;
}
interface QueryList {
  data: FlashCard[];
  error: { message: string } | null;
}

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

  const { data: cards, error } = (await supabase
    .from("flashcards")
    .select("id, front, back, created_at")
    .order("created_at", { ascending: false })) as unknown as QueryList;

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch cards" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ cards }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
