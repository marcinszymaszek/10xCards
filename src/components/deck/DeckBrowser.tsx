import { useEffect, useRef, useState } from "react";
import { ServerError } from "@/components/auth/ServerError";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";

interface FlashCard {
  id: string;
  front: string;
  back: string;
  origin: "ai" | "manual";
  created_at: string;
}

interface CardsPage {
  items: FlashCard[];
  total: number;
}

type CardMode = "idle" | "editing" | "confirm-delete";

interface PendingDelete {
  card: FlashCard;
  index: number;
  timer: ReturnType<typeof setTimeout>;
}

const UNDO_WINDOW_MS = 5000;

async function fetchCardsPage(page: number, pageSize: number, q: string): Promise<CardsPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q) params.set("q", q);
  const res = await fetch(`/api/cards?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load cards");
  const raw: unknown = await res.json();
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    items: Array.isArray(obj.items) ? (obj.items as FlashCard[]) : [],
    total: typeof obj.total === "number" ? obj.total : 0,
  };
}

function OriginBadge({ origin }: { origin: FlashCard["origin"] }) {
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

function CardItem({
  card,
  onUpdate,
  onDelete,
}: {
  card: FlashCard;
  onUpdate: (updated: FlashCard) => void;
  onDelete: (card: FlashCard) => void;
}) {
  const [mode, setMode] = useState<CardMode>("idle");
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) {
      setError("Front and back cannot be blank");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: front.trim(), back: back.trim() }),
      });
      if (!res.ok) {
        const raw: unknown = await res.json();
        const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
        setError(typeof body.error === "string" ? body.error : "Failed to save card");
        return;
      }
      const raw: unknown = await res.json();
      onUpdate(raw as FlashCard);
      setMode("idle");
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setFront(card.front);
    setBack(card.back);
    setError(null);
    setMode("idle");
  };

  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      {error && (
        <div className="mb-3">
          <ServerError message={error} />
        </div>
      )}

      {mode === "idle" && (
        <>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div>
                <span className="text-xs font-semibold tracking-wider text-blue-300/70 uppercase">Front</span>
                <p className="mt-1 text-white">{card.front}</p>
              </div>
              <div>
                <span className="text-xs font-semibold tracking-wider text-purple-300/70 uppercase">Back</span>
                <p className="mt-1 text-blue-100/80">{card.back}</p>
              </div>
            </div>
            <OriginBadge origin={card.origin} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => {
                setMode("editing");
              }}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20 sm:w-auto"
            >
              Edit
            </button>
            <button
              onClick={() => {
                setMode("confirm-delete");
              }}
              className="w-full rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-900/40 sm:w-auto"
            >
              Delete
            </button>
          </div>
        </>
      )}

      {mode === "editing" && (
        <>
          <div className="mb-3 space-y-3">
            <div>
              <label className="text-xs font-semibold tracking-wider text-blue-300/70 uppercase">Front</label>
              <textarea
                value={front}
                onChange={(e) => {
                  setFront(e.target.value);
                }}
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-blue-400/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wider text-purple-300/70 uppercase">Back</label>
              <textarea
                value={back}
                onChange={(e) => {
                  setBack(e.target.value);
                }}
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-lg border border-blue-400/40 bg-blue-600/30 px-3 py-1.5 text-sm text-blue-200 transition-colors hover:bg-blue-600/50 disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={saving}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {mode === "confirm-delete" && (
        <>
          <p className="mb-3 text-sm text-red-300">Delete this card? This cannot be undone.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => {
                onDelete(card);
              }}
              className="w-full rounded-lg border border-red-500/40 bg-red-900/40 px-3 py-1.5 text-sm text-red-200 transition-colors hover:bg-red-900/60 sm:w-auto"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setError(null);
                setMode("idle");
              }}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </li>
  );
}

interface DeckBrowserProps {
  initialItems: FlashCard[];
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
  initialQ: string;
}

export default function DeckBrowser({
  initialItems,
  initialTotal,
  initialPage,
  initialPageSize,
  initialQ,
}: DeckBrowserProps) {
  const pageSize = initialPageSize;
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [q, setQ] = useState(initialQ);
  const [searchInput, setSearchInput] = useState(initialQ);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFront, setAddFront] = useState("");
  const [addBack, setAddBack] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const pendingDeleteRef = useRef<PendingDelete | null>(null);
  useEffect(() => {
    pendingDeleteRef.current = pendingDelete;
  }, [pendingDelete]);

  // The 5s undo window is client-side only — if the tab is hidden or the page
  // unloads before it elapses, flush the queued delete immediately so it
  // isn't silently dropped (the card would otherwise survive server-side
  // despite having visually disappeared).
  useEffect(() => {
    const flushPendingDelete = () => {
      const current = pendingDeleteRef.current;
      if (!current) return;
      clearTimeout(current.timer);
      fetch(`/api/cards/${current.card.id}`, { method: "DELETE" }).catch(() => {
        // Best-effort: the page is already closing/hidden, nothing to surface.
      });
      pendingDeleteRef.current = null;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPendingDelete();
    };
    window.addEventListener("beforeunload", flushPendingDelete);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushPendingDelete);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadPage = (nextPage: number, nextQ: string) => {
    setLoading(true);
    setListError(null);
    fetchCardsPage(nextPage, pageSize, nextQ)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setPage(nextPage);
        setQ(nextQ);
      })
      .catch(() => {
        setListError("Failed to load cards");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    if (q === "" && page === 1) return;
    loadPage(1, "");
  };

  const handleUpdate = (updated: FlashCard) => {
    setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const commitDelete = (card: FlashCard) => {
    fetch(`/api/cards/${card.id}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) {
          setListError("Failed to delete a card — refresh the page to see the current state");
        }
      })
      .catch(() => {
        setListError("Failed to delete a card — refresh the page to see the current state");
      });
  };

  const handleDeleteConfirm = (card: FlashCard) => {
    setPendingDelete((current) => {
      if (current) {
        clearTimeout(current.timer);
        commitDelete(current.card);
      }
      const index = items.findIndex((c) => c.id === card.id);
      const timer = setTimeout(() => {
        commitDelete(card);
        setPendingDelete((latest) => (latest?.card.id === card.id ? null : latest));
      }, UNDO_WINDOW_MS);
      return { card, index, timer };
    });
    setItems((prev) => prev.filter((c) => c.id !== card.id));
    setTotal((prev) => prev - 1);
  };

  const handleAddCard = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const front = addFront.trim();
    const back = addBack.trim();
    if (!front || !back) {
      setAddError("Front and back cannot be blank");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back }),
      });
      if (!res.ok) {
        const raw: unknown = await res.json();
        const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
        setAddError(typeof body.error === "string" ? body.error : "Failed to create card");
        return;
      }
      const created = (await res.json()) as FlashCard;
      setItems((prev) => [created, ...prev]);
      setTotal((prev) => prev + 1);
      setAddFront("");
      setAddBack("");
      setShowAddForm(false);
    } catch {
      setAddError("Network error — please try again");
    } finally {
      setAddSaving(false);
    }
  };

  const handleUndo = () => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timer);
    const { card, index } = pendingDelete;
    setItems((prev) => {
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, card);
      return next;
    });
    setTotal((prev) => prev + 1);
    setPendingDelete(null);
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = searchInput.trim();
          if (trimmed === q && page === 1) return;
          loadPage(1, trimmed);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-blue-100/40" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
            }}
            placeholder="Search front or back text…"
            className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pr-3 pl-9 text-sm text-white placeholder-white/30 focus:border-blue-400/50 focus:outline-none"
          />
        </div>
        {q && (
          <button
            type="button"
            onClick={handleClearSearch}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            <X className="size-4" />
            Clear
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg border border-blue-400/40 bg-blue-600/30 px-4 py-2 text-sm text-blue-200 transition-colors hover:bg-blue-600/50 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {!showAddForm && (
        <div className="flex sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setShowAddForm(true);
              setAddError(null);
            }}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 sm:w-auto"
          >
            + Add manually
          </button>
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={handleAddCard}
          className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
        >
          {addError && (
            <div className="mb-1">
              <ServerError message={addError} />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold tracking-wider text-blue-300/70 uppercase">Front</label>
            <textarea
              value={addFront}
              onChange={(e) => {
                setAddFront(e.target.value);
              }}
              rows={2}
              placeholder="Question or concept…"
              className="mt-1 w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-blue-400/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wider text-purple-300/70 uppercase">Back</label>
            <textarea
              value={addBack}
              onChange={(e) => {
                setAddBack(e.target.value);
              }}
              rows={2}
              placeholder="Answer or definition…"
              className="mt-1 w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={addSaving}
              className="w-full rounded-lg border border-purple-500/40 bg-purple-600/30 px-4 py-1.5 text-sm font-medium text-purple-200 transition-colors hover:bg-purple-600/50 disabled:opacity-50 sm:w-auto"
            >
              {addSaving ? "Saving…" : "Save card"}
            </button>
            <button
              type="button"
              disabled={addSaving}
              onClick={() => {
                setShowAddForm(false);
                setAddFront("");
                setAddBack("");
                setAddError(null);
              }}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {listError && <ServerError message={listError} />}

      {loading && (
        <ul className="space-y-3" aria-busy="true" aria-label="Loading cards">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-3 h-3 w-1/2" />
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length === 0 && q && (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-center">
          <p className="text-blue-100/60">No cards match “{q}”.</p>
          <button
            onClick={handleClearSearch}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
          >
            Clear search
          </button>
        </div>
      )}

      {!loading && items.length === 0 && !q && (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-4 text-center">
          <p className="text-blue-100/60">No cards in your deck yet.</p>
          <a
            href="/generate"
            className="rounded-lg border border-blue-400/40 bg-blue-600/30 px-4 py-2 text-sm text-blue-200 transition-colors hover:bg-blue-600/50"
          >
            Generate your first cards
          </a>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <ul className="space-y-3">
            {items.map((card) => (
              <CardItem key={card.id} card={card} onUpdate={handleUpdate} onDelete={handleDeleteConfirm} />
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm text-blue-100/60">
            <span>
              Page {page} of {totalPages} · {total} card{total === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  loadPage(page - 1, q);
                }}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
                Prev
              </button>
              <button
                onClick={() => {
                  loadPage(page + 1, q);
                }}
                disabled={page >= totalPages || loading}
                className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {pendingDelete && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-white/20 bg-slate-900/95 px-4 py-3 text-sm text-white shadow-xl backdrop-blur-sm">
          <span>Card deleted.</span>
          <button
            onClick={handleUndo}
            className="rounded-lg border border-blue-400/40 bg-blue-600/30 px-3 py-1.5 font-semibold text-blue-200 transition-colors hover:bg-blue-600/50"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
