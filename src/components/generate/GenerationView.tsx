import { useState } from "react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";

const MAX_TEXT_LENGTH = 10000;
const MIN_COUNT = 1;
const MAX_COUNT = 20;

export interface DraftCardInput {
  id: string;
  front: string;
  back: string;
  generation_session_id: string;
}

interface Props {
  initialDrafts?: DraftCardInput[];
}

interface DraftCard {
  id: string;
  front: string;
  back: string;
  editedFront: string;
  editedBack: string;
  decision: "pending" | "accepted" | "rejected";
  isEditing: boolean;
}

type Phase = "idle" | "generating" | "reviewing" | "saving" | "saved";

function toDraftCard(d: DraftCardInput): DraftCard {
  return {
    id: d.id,
    front: d.front,
    back: d.back,
    editedFront: "",
    editedBack: "",
    decision: "pending",
    isEditing: false,
  };
}

export default function GenerationView({ initialDrafts }: Props) {
  const [text, setText] = useState("");
  const [count, setCount] = useState(5);
  const [phase, setPhase] = useState<Phase>(() => (initialDrafts && initialDrafts.length > 0 ? "reviewing" : "idle"));
  const [drafts, setDrafts] = useState<DraftCard[]>(() => initialDrafts?.map(toDraftCard) ?? []);
  const [sessionId, setSessionId] = useState<string | null>(initialDrafts?.[0]?.generation_session_id ?? null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const isOverCap = text.length > MAX_TEXT_LENGTH;
  const canGenerate = text.trim().length > 0 && !isOverCap && phase !== "generating";
  const acceptedCount = drafts.filter((d) => d.decision === "accepted").length;

  async function handleGenerate() {
    setPhase("generating");
    setGenerateError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, count }),
      });
      const json = (await res.json()) as {
        session_id?: string;
        cards?: { id: string; front: string; back: string }[];
        error?: string;
      };
      if (!res.ok) {
        setPhase("idle");
        setGenerateError(json.error ?? "Something went wrong — please try again.");
        return;
      }
      setSessionId(json.session_id ?? null);
      setDrafts(
        (json.cards ?? []).map((c) => ({
          id: c.id,
          front: c.front,
          back: c.back,
          editedFront: "",
          editedBack: "",
          decision: "pending" as const,
          isEditing: false,
        })),
      );
      setPhase("reviewing");
    } catch {
      setPhase("idle");
      setGenerateError("Network error — please check your connection and try again.");
    }
  }

  function handleAccept(id: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, decision: "accepted" as const, isEditing: false } : d)));
  }

  function handleReject(id: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, decision: "rejected" as const, isEditing: false } : d)));
  }

  function handleEdit(id: string) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, isEditing: true, editedFront: d.editedFront || d.front, editedBack: d.editedBack || d.back }
          : d,
      ),
    );
  }

  function handleConfirmEdit(id: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, isEditing: false, decision: "accepted" as const } : d)));
  }

  function handleFrontChange(id: string, value: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, editedFront: value } : d)));
  }

  function handleBackChange(id: string, value: string) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, editedBack: value } : d)));
  }

  async function handleSave() {
    if (!sessionId || acceptedCount === 0) return;
    setPhase("saving");
    setSaveError(null);
    const accepted = drafts
      .filter((d) => d.decision === "accepted")
      .map((d) => ({ id: d.id, front: d.editedFront || d.front, back: d.editedBack || d.back }));
    try {
      const res = await fetch("/api/drafts/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, accepted }),
      });
      const json = (await res.json()) as { saved?: number; error?: string };
      if (!res.ok) {
        setPhase("reviewing");
        setSaveError(json.error ?? "Failed to save cards — please try again.");
        return;
      }
      setSavedCount(json.saved ?? accepted.length);
      setDrafts([]);
      setSessionId(null);
      setText("");
      setCount(5);
      setGenerateError(null);
      setPhase("saved");
    } catch {
      setPhase("reviewing");
      setSaveError("Network error — please try again.");
    }
  }

  const showForm = phase === "idle" || phase === "generating" || phase === "saved";
  const showCards = (phase === "reviewing" || phase === "saving") && drafts.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {phase === "saved" && (
        <div className="rounded-xl border border-green-500/30 bg-green-900/30 p-4">
          <p className="text-sm font-medium text-green-300">
            {savedCount} card{savedCount !== 1 ? "s" : ""} saved to your deck.
          </p>
          <a href="/deck" className="mt-1 inline-block text-sm text-purple-300 underline hover:text-purple-200">
            View Deck →
          </a>
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-950/40 p-8 backdrop-blur-sm">
          <h1 className="mb-1 text-2xl font-bold text-white">Generate Flashcards</h1>
          <p className="mb-6 text-sm text-purple-100/60">
            Paste text, choose the number of cards, AI will propose them — you decide which go to your deck.
          </p>

          <ServerError message={generateError} />

          <div className="mb-4 flex flex-col gap-2">
            <label htmlFor="source-text" className="text-sm font-medium text-purple-100/80">
              Source text
            </label>
            <textarea
              id="source-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
              rows={12}
              placeholder="Paste the text from which AI should create flashcards…"
              className="w-full resize-none rounded-lg border border-purple-400/40 bg-purple-900/20 p-3 text-sm text-white placeholder-purple-200/30 outline-none focus:border-purple-400/70 focus:ring-1 focus:ring-purple-400/40"
            />
            <p className={`text-right text-xs ${isOverCap ? "text-red-400" : "text-purple-100/40"}`}>
              {text.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()} characters
            </p>
          </div>

          <div className="mb-6 flex flex-col gap-1">
            <label htmlFor="card-count" className="text-sm font-medium text-purple-100/80">
              Number of cards
            </label>
            <input
              id="card-count"
              type="number"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={count}
              onChange={(e) => {
                setCount(Number(e.target.value));
              }}
              className="w-24 rounded-lg border border-purple-400/40 bg-purple-900/20 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/70 focus:ring-1 focus:ring-purple-400/40"
            />
            <p className="text-xs text-purple-100/40">
              This is a suggestion for AI — you may get a few more or fewer cards.
            </p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full rounded-lg bg-purple-600 py-3 font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "generating" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
                  <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
                Generate flashcards
              </span>
            )}
          </Button>
        </div>
      )}

      {showCards && (
        <div className="flex flex-col gap-4">
          <ServerError message={saveError} />

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-blue-100/80">
              {drafts.length} card{drafts.length !== 1 ? "s" : ""} generated — review each one
            </h2>
            <span className="text-xs text-blue-100/50">{acceptedCount} accepted</span>
          </div>

          {drafts.map((card) => (
            <div
              key={card.id}
              className={`rounded-xl border p-4 backdrop-blur-sm transition-colors ${
                card.decision === "accepted"
                  ? "border-green-500/40 bg-green-900/20"
                  : card.decision === "rejected"
                    ? "border-white/5 bg-white/5 opacity-50"
                    : "border-white/10 bg-white/5"
              }`}
            >
              {card.isEditing ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold tracking-wide text-purple-300/70 uppercase">Front</span>
                    <textarea
                      value={card.editedFront}
                      onChange={(e) => {
                        handleFrontChange(card.id, e.target.value);
                      }}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold tracking-wide text-blue-300/70 uppercase">Back</span>
                    <textarea
                      value={card.editedBack}
                      onChange={(e) => {
                        handleBackChange(card.id, e.target.value);
                      }}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-white outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      handleConfirmEdit(card.id);
                    }}
                    className="self-start rounded-lg bg-green-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-600"
                  >
                    Confirm
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <span className="mb-1 block text-xs font-semibold tracking-wide text-purple-300/70 uppercase">
                      Front
                    </span>
                    <p className="text-sm text-white">{card.editedFront || card.front}</p>
                  </div>
                  <div className="mb-3 border-t border-white/10 pt-3">
                    <span className="mb-1 block text-xs font-semibold tracking-wide text-blue-300/70 uppercase">
                      Back
                    </span>
                    <p className="text-sm text-blue-100/80">{card.editedBack || card.back}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        handleAccept(card.id);
                      }}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                        card.decision === "accepted"
                          ? "bg-green-700 text-white hover:bg-green-600"
                          : "border border-green-500/30 bg-transparent text-green-300 hover:bg-green-900/30"
                      }`}
                    >
                      ✓ Accept
                    </Button>
                    <Button
                      onClick={() => {
                        handleReject(card.id);
                      }}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                        card.decision === "rejected"
                          ? "bg-white/20 text-white/60 hover:bg-white/25"
                          : "border border-white/20 bg-transparent text-blue-100/60 hover:bg-white/10"
                      }`}
                    >
                      ✗ Reject
                    </Button>
                    <Button
                      onClick={() => {
                        handleEdit(card.id);
                      }}
                      className="rounded-lg border border-white/20 bg-transparent px-3 py-1 text-xs font-medium text-blue-100/60 transition-colors hover:bg-white/10"
                    >
                      ✎ Edit
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}

          <Button
            onClick={handleSave}
            disabled={acceptedCount === 0 || phase === "saving"}
            className="rounded-lg bg-purple-600 px-6 py-2 font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {phase === "saving" ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Saving…
              </span>
            ) : (
              `Save to Deck (${acceptedCount})`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
