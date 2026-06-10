# Atomic Save to Deck — Plan Brief

> Full plan: `context/changes/atomic-save-to-deck/plan.md`

## What & Why

S-02 closes the AI-generation loop: after the user generates flashcard candidates in S-01, they now have per-card Accept / Reject / Edit controls and a "Save to Deck" button that atomically promotes accepted drafts into the permanent flashcards table. Without S-02, generated cards sit in `flashcard_drafts` forever — no card ever reaches the deck.

## Starting Point

S-01 is complete: `flashcard_drafts` is populated by `POST /api/generate`, and `GenerationView.tsx` renders the results as a read-only list. The `flashcards` table already exists (from S-03's early implementation) with an `origin` field that accepts `'ai'`. No promotion endpoint or interactive review UI exists yet.

## Desired End State

The user visits `/generate`, generates cards, decides on each (accept / reject / edit inline), clicks "Save to Deck", and sees a confirmation: "X cards saved to your deck." Accepted cards appear in `/deck` with an AI badge. Refreshing mid-review reloads the pending list from the DB so no data is lost (only in-memory decision state is gone).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Review UX | All cards at once, per-card controls | Natural extension of S-01's list; no stepping required by PRD |
| Edit during review | Yes — inline front/back edit, auto-accepts | PRD FR-004 explicitly lists edit alongside accept/reject |
| Save trigger | Explicit "Save to Deck" button | Required for atomicity — one commit point, matches roadmap contract |
| Pending on save | Treated as rejected (save proceeds) | No blocking gate; user can save as soon as ≥ 1 accepted |
| Post-save navigation | Stay on /generate, show confirmation + View Deck link | Keeps generation loop fast; no forced redirect |
| Manual card creation | Deferred (not in S-02 scope) | Belongs in deck management context; doesn't block the atomic-save story |
| Refresh state | Decisions lost; pending drafts reloaded from DB | In-memory only until Save; page SSR re-fetches the most recent session |
| Save error UX | ServerError banner; decisions preserved | Follows existing ServerError pattern; user can retry without re-reviewing |
| Atomicity mechanism | Supabase RPC (`promote_generation_session`) | Roadmap explicitly recommended this; single DB transaction prevents orphaned state |

## Scope

**In scope:**
- `promote_generation_session` PL/pgSQL function (new migration)
- `POST /api/drafts/promote` endpoint
- `session_id` added to `POST /api/generate` response
- Accept / Reject / Edit controls + Save button in `GenerationView.tsx`
- Pending-drafts SSR load in `generate.astro`

**Out of scope:**
- Manual card creation (FR-005) — deferred
- SRS scheduling fields on `flashcards` — S-04
- Per-card decision persistence before Save — in-memory only
- Undo for Save — v2

## Architecture / Approach

The promotion is a single Supabase RPC call (`SECURITY INVOKER` so RLS applies). The island holds accept/reject decisions in React state; on Save, it sends one POST with the full accepted array (including any edited front/back text). The RPC inserts into `flashcards`, marks accepted drafts, and marks remaining pending drafts as rejected — all in one transaction. The generate page loads the most recent pending session server-side and passes it as `initialDrafts` to the island.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. DB — RPC | `promote_generation_session` function in Supabase | `SECURITY INVOKER` + RLS must allow the insert/update |
| 2. API — Promote + Fix | `/api/drafts/promote` endpoint; `session_id` in generate response | Generate response change must not break existing island state |
| 3. UI — Review controls | Per-card Accept/Reject/Edit + Save flow in GenerationView | React Compiler compliance; island state complexity |
| 4. Page — SSR load | Pending drafts reload on refresh via `generate.astro` | Two-query Supabase pattern; silent fallback on error |

**Prerequisites:** S-01 fully complete (Phases 3 & 4 shipped — `GenerationView.tsx` and `/generate` page exist).
**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- The generate API response change (`session_id` added) is backwards-compatible (additive) — the existing island ignores unknown fields.
- `flashcards` RLS allows inserts by the authenticated user — confirmed from the existing migration.
- Supabase JS `supabase.rpc()` serialises a JS array as JSONB correctly — standard behaviour, confirmed by existing usage patterns in the codebase.

## Success Criteria (Summary)

- User can generate cards, accept/reject/edit each, and click Save — all accepted cards appear in `/deck` with `origin: 'ai'`.
- A failed Save shows an error banner without losing any in-progress decisions.
- Refreshing mid-review reloads the pending card list (all decisions reset to pending).
