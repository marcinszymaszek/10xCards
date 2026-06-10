import { useState } from "react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";

const MAX_TEXT_LENGTH = 10000;
const MIN_COUNT = 1;
const MAX_COUNT = 20;

interface DraftCard {
  id: string;
  front: string;
  back: string;
  state: string;
}

type Status = "idle" | "loading" | "success" | "error";

export default function GenerationView() {
  const [text, setText] = useState("");
  const [count, setCount] = useState(5);
  const [status, setStatus] = useState<Status>("idle");
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOverCap = text.length > MAX_TEXT_LENGTH;
  const canGenerate = text.trim().length > 0 && !isOverCap && status !== "loading";

  async function handleGenerate() {
    setStatus("loading");
    setErrorMessage(null);
    setCards([]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, count }),
      });

      const json = (await res.json()) as { cards?: DraftCard[]; error?: string };

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(json.error ?? "Something went wrong — please try again.");
        return;
      }

      setStatus("success");
      setCards(json.cards ?? []);
    } catch {
      setStatus("error");
      setErrorMessage("Network error — please check your connection and try again.");
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <ServerError message={errorMessage} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="source-text" className="text-sm font-medium text-blue-100/80">
            Source text
          </label>
          <span className={`text-xs ${isOverCap ? "text-red-400" : "text-blue-100/50"}`}>
            {text.length} / {MAX_TEXT_LENGTH}
          </span>
        </div>
        <textarea
          id="source-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          rows={8}
          placeholder="Paste your source text here…"
          className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder-blue-100/30 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="card-count" className="text-sm font-medium text-blue-100/80">
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
            className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
          />
        </div>

        <Button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="mt-5 rounded-lg bg-purple-600 px-6 py-2 font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          {status === "loading" ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Generating…
            </span>
          ) : (
            "Generate"
          )}
        </Button>
      </div>

      {status === "success" && cards.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-blue-100/80">
            {cards.length} card{cards.length !== 1 ? "s" : ""} generated
          </h2>
          {cards.map((card) => (
            <div key={card.id} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="mb-3">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-purple-300/70 uppercase">
                  Front
                </span>
                <p className="text-sm text-white">{card.front}</p>
              </div>
              <div className="border-t border-white/10 pt-3">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-blue-300/70 uppercase">Back</span>
                <p className="text-sm text-blue-100/80">{card.back}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
