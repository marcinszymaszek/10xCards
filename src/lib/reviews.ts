import { createClient } from "@/lib/supabase";
import { createEmptyCard, fsrs, Rating, State, TypeConvert, type Card, type CardInput } from "ts-fsrs";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
}

export type ReviewRating = "again" | "good";

interface ReviewStateRow {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: string;
  last_review: string | null;
}

export async function fetchDueCards(supabase: SupabaseClient): Promise<ReviewCard[]> {
  const { data, error } = (await supabase.rpc("get_due_cards")) as unknown as {
    data: ReviewCard[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return data ?? [];
}

function toCardInput(row: ReviewStateRow): CardInput {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as CardInput["state"],
    last_review: row.last_review,
  };
}

export async function submitReview(supabase: SupabaseClient, flashcardId: string, rating: ReviewRating): Promise<void> {
  const { data: existing, error: readError } = (await supabase
    .from("review_states")
    .select(
      "due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review",
    )
    .eq("flashcard_id", flashcardId)
    .maybeSingle()) as unknown as { data: ReviewStateRow | null; error: { message: string } | null };
  if (readError) throw new Error(readError.message);

  const card: Card = existing ? TypeConvert.card(toCardInput(existing)) : createEmptyCard();
  const grade = rating === "good" ? Rating.Good : Rating.Again;
  const result = fsrs().next(card, new Date(), grade);

  const { error: writeError } = (await supabase.rpc("record_review", {
    p_flashcard_id: flashcardId,
    p_due: result.card.due.toISOString(),
    p_stability: result.card.stability,
    p_difficulty: result.card.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- ts-fsrs 5.x still requires elapsed_days on Card; only removed in 6.0
    p_elapsed_days: result.card.elapsed_days,
    p_scheduled_days: result.card.scheduled_days,
    p_learning_steps: result.card.learning_steps,
    p_reps: result.card.reps,
    p_lapses: result.card.lapses,
    p_state: State[result.card.state],
    p_last_review: result.card.last_review ? result.card.last_review.toISOString() : null,
  })) as unknown as { error: { message: string } | null };
  if (writeError) throw new Error(writeError.message);
}
