import { useState } from "react";
import { ServerError } from "@/components/auth/ServerError";

export default function DeleteAccountAction() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "Failed to delete account — please try again.");
        setDeleting(false);
        setConfirming(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Network error — please try again.");
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ServerError message={error} />

      {!confirming ? (
        <button
          onClick={() => {
            setConfirming(true);
          }}
          className="w-full rounded-lg border border-red-500/40 bg-red-900/40 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-900/60 sm:w-auto"
        >
          Delete my account
        </button>
      ) : (
        <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-4">
          <p className="mb-1 text-sm font-semibold text-red-300">Are you sure?</p>
          <p className="mb-4 text-sm text-blue-100/60">
            This permanently deletes your account, all flashcards, drafts, and review history. It cannot be undone.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              disabled={deleting}
              onClick={() => {
                setConfirming(false);
              }}
              className="w-full rounded-lg border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 sm:w-auto"
            >
              Cancel
            </button>
            <button
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="w-full rounded-lg border border-red-500/40 bg-red-900/40 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-900/60 disabled:opacity-50 sm:w-auto"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
