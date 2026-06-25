import { createClient } from "@/lib/supabase";
import { createEmptyCard, fsrs, Rating, State, TypeConvert, type Card, type CardInput } from "ts-fsrs";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export type ReviewRating = "again" | "hard" | "good" | "easy";

const RATING_MAP: Record<ReviewRating, Rating> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

// enable_short_term: false — without it, a fresh card's first-touch intervals land in
// minutes (FSRS's same-day learning steps) instead of the day-level intervals the
// previews and the schedule itself are meant to show.
const scheduler = fsrs({ enable_short_term: false });

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  origin: "ai" | "manual";
  previews: Record<ReviewRating, string>;
}

interface ScheduleFields {
  due: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  scheduled_days: number | null;
  learning_steps: number | null;
  reps: number | null;
  lapses: number | null;
  state: string | null;
  last_review: string | null;
}

interface DueCardRow extends ScheduleFields {
  id: string;
  front: string;
  back: string;
  origin: string;
}

interface PresentSchedule {
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

function hasSchedule(row: ScheduleFields): row is PresentSchedule {
  return row.due !== null;
}

function toCardInput(row: PresentSchedule): CardInput {
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

function cardFromSchedule(row: ScheduleFields): Card {
  return hasSchedule(row) ? TypeConvert.card(toCardInput(row)) : createEmptyCard();
}

// FSRS due dates can land within minutes (short-term learning steps) or months out,
// so the label granularity has to shift with the gap rather than always showing days.
function formatInterval(due: Date, now: Date): string {
  const diffMinutes = Math.round((due.getTime() - now.getTime()) / 60_000);
  if (diffMinutes < 60) return diffMinutes <= 1 ? "in 1 minute" : `in ${diffMinutes} minutes`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return diffHours === 1 ? "in 1 hour" : `in ${diffHours} hours`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays <= 1) return "tomorrow";
  return `in ${diffDays} days`;
}

export async function fetchDueCards(supabase: SupabaseClient): Promise<ReviewCard[]> {
  const { data, error } = (await supabase.rpc("get_due_cards")) as unknown as {
    data: DueCardRow[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);

  const now = new Date();
  return (data ?? []).map((row) => {
    const card = cardFromSchedule(row);
    const preview = scheduler.repeat(card, now);
    const previews: Record<ReviewRating, string> = {
      again: formatInterval(preview[Rating.Again].card.due, now),
      hard: formatInterval(preview[Rating.Hard].card.due, now),
      good: formatInterval(preview[Rating.Good].card.due, now),
      easy: formatInterval(preview[Rating.Easy].card.due, now),
    };
    return {
      id: row.id,
      front: row.front,
      back: row.back,
      origin: row.origin === "ai" ? "ai" : "manual",
      previews,
    };
  });
}

export async function submitReview(supabase: SupabaseClient, flashcardId: string, rating: ReviewRating): Promise<void> {
  const { data: existing, error: readError } = (await supabase
    .from("review_states")
    .select(
      "due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review",
    )
    .eq("flashcard_id", flashcardId)
    .maybeSingle()) as unknown as { data: ScheduleFields | null; error: { message: string } | null };
  if (readError) throw new Error(readError.message);

  const card = existing ? cardFromSchedule(existing) : createEmptyCard();
  const result = scheduler.next(card, new Date(), RATING_MAP[rating]);

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
