import { createClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export interface FlashCard {
  id: string;
  front: string;
  back: string;
  origin: "ai" | "manual";
  created_at: string;
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return max ? Math.min(parsed, max) : parsed;
}

// PostgREST `.or()` filter strings treat %, _, comma and parens specially — escape them
// so search terms containing these characters are matched literally, not as filter syntax.
function escapeForOrFilter(value: string): string {
  return value.replace(/[%_,()]/g, (match) => `\\${match}`);
}

export async function listCards(
  supabase: SupabaseClient,
  { page, pageSize, q }: { page: number; pageSize: number; q: string },
): Promise<{ items: FlashCard[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("flashcards").select("id, front, back, origin, created_at", { count: "exact" });
  if (q) {
    const escaped = escapeForOrFilter(q);
    query = query.or(`front.ilike.%${escaped}%,back.ilike.%${escaped}%`);
  }

  const { data, count, error } = (await query.order("created_at", { ascending: false }).range(from, to)) as unknown as {
    data: FlashCard[] | null;
    count: number | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);

  return { items: data ?? [], total: count ?? 0 };
}
