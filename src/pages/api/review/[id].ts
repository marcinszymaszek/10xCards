import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { submitReview, type ReviewRating } from "@/lib/reviews";

function isReviewRating(value: unknown): value is ReviewRating {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
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

  const id = context.params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing flashcard ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody: unknown = await context.request.json().catch(() => null);
  const obj = typeof rawBody === "object" && rawBody !== null ? (rawBody as Record<string, unknown>) : {};

  if (!isReviewRating(obj.rating)) {
    return new Response(JSON.stringify({ error: "Invalid rating" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await submitReview(supabase, id, obj.rating);
  } catch {
    return new Response(JSON.stringify({ error: "Failed to record review" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
