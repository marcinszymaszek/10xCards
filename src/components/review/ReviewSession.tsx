import { useState } from "react";
import { ServerError } from "@/components/auth/ServerError";

type ReviewRating = "again" | "hard" | "good" | "easy";

interface ReviewCard {
  id: string;
  front: string;
  back: string;
  origin: "ai" | "manual";
  previews: Record<ReviewRating, string>;
}

interface ReviewSessionProps {
  initialCards: ReviewCard[];
}

const RATING_BUTTONS: { rating: ReviewRating; label: string; className: string }[] = [
  { rating: "again", label: "Repeat", className: "border-red-500/30 bg-red-900/20 text-red-300 hover:bg-red-900/40" },
  {
    rating: "hard",
    label: "Hard",
    className: "border-orange-500/30 bg-orange-900/20 text-orange-300 hover:bg-orange-900/40",
  },
  {
    rating: "good",
    label: "Good",
    className: "border-blue-400/40 bg-blue-600/30 text-blue-200 hover:bg-blue-600/50",
  },
  {
    rating: "easy",
    label: "Easy",
    className: "border-purple-500/40 bg-purple-600/30 text-purple-200 hover:bg-purple-600/50",
  },
];

function OriginBadge({ origin }: { origin: ReviewCard["origin"] }) {
  if (origin === "ai") {
    return (
      <span className="shrink-0 rounded-full border border-purple-400/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-purple-200 uppercase">
        AI
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-blue-100/60 uppercase">
      Manual
    </span>
  );
}

async function postReview(cardId: string, rating: ReviewRating): Promise<void> {
  const res = await fetch(`/api/review/${cardId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) throw new Error("Failed to record review");
}

// Progress lives only in component state, which a page reload wipes — but the server
// has already persisted any reviews submitted before the reload. Without this, the
// completion count silently understates a session that spanned a reload.
const REVIEWED_COUNT_KEY = "reviewSessionReviewedCount";

function getStoredReviewedCount(): number {
  if (typeof sessionStorage === "undefined") return 0;
  const parsed = Number(sessionStorage.getItem(REVIEWED_COUNT_KEY));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function fetchDue(): Promise<ReviewCard[]> {
  const res = await fetch("/api/review/due");
  if (!res.ok) throw new Error("Failed to fetch due cards");
  const json = (await res.json()) as { cards: ReviewCard[] };
  return json.cards;
}

export default function ReviewSession({ initialCards }: ReviewSessionProps) {
  const [queue, setQueue] = useState(initialCards);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(initialCards.length === 0);
  const [reviewedCount, setReviewedCount] = useState(() => (initialCards.length === 0 ? 0 : getStoredReviewedCount()));
  const [total, setTotal] = useState(initialCards.length);

  const current = queue[0];

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const cards = await fetchDue();
      setQueue(cards);
      setTotal(cards.length);
      setRevealed(false);
      setReviewedCount(0);
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(REVIEWED_COUNT_KEY);
      setDone(cards.length === 0);
    } catch {
      setError("Failed to check for more cards — please try again");
    } finally {
      setResetting(false);
    }
  };

  const handleRate = async (rating: ReviewRating) => {
    if (queue.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await postReview(current.id, rating);
      const rest = queue.slice(1);
      setQueue(rest);
      setRevealed(false);
      setReviewedCount((count) => {
        const next = count + 1;
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(REVIEWED_COUNT_KEY, String(next));
        return next;
      });
      if (rest.length === 0) {
        setDone(true);
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(REVIEWED_COUNT_KEY);
      }
    } catch {
      setError("Failed to record review — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  if (done || queue.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm">
        {error && (
          <div className="mb-4">
            <ServerError message={error} />
          </div>
        )}
        <p className="text-lg font-semibold text-white">
          {reviewedCount === 0
            ? "Nothing to review right now."
            : `Session finished — ${reviewedCount} flashcard${reviewedCount === 1 ? "" : "s"} reviewed.`}
        </p>
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={() => {
              void handleReset();
            }}
            disabled={resetting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50 sm:w-auto"
          >
            {resetting && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {resetting ? "Checking…" : "Check for more cards"}
          </button>
          <a
            href="/deck"
            className="inline-block w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 sm:w-auto"
          >
            Back to deck
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <ServerError message={error} />}

      <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <span className="text-sm text-blue-100/60">
            {total - queue.length + 1} / {total}
          </span>
          <OriginBadge origin={current.origin} />
        </div>

        <div className="space-y-4">
          <div>
            <span className="text-xs font-semibold tracking-wider text-blue-300/70 uppercase">Front</span>
            <p className="mt-1 text-white">{current.front}</p>
          </div>
          {revealed && (
            <div>
              <span className="text-xs font-semibold tracking-wider text-purple-300/70 uppercase">Back</span>
              <p className="mt-1 text-blue-100/80">{current.back}</p>
            </div>
          )}
        </div>

        {!revealed && (
          <button
            onClick={() => {
              setRevealed(true);
            }}
            className="mt-5 w-full rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Show Answer
          </button>
        )}

        {revealed && (
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-4">
            {RATING_BUTTONS.map(({ rating, label, className }) => (
              <button
                key={rating}
                onClick={() => {
                  void handleRate(rating);
                }}
                disabled={submitting}
                className={`flex flex-col items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${className}`}
              >
                {submitting ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                ) : (
                  <>
                    <span>{label}</span>
                    <span className="text-xs font-normal opacity-80">{current.previews[rating]}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
