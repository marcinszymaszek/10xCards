# Spaced Repetition Review Session (S-04) — Plan Brief

> Full plan: `context/changes/srs-review-session/plan.md`
> Research: `context/changes/srs-review-session/research.md`

## What & Why

Implement `/review`: a spaced-repetition review session over the user's accepted flashcards, scheduled by the `ts-fsrs` library, with binary "knew it" / "didn't know it" rating per FR-009/FR-010 and US-01. This is the last piece of the generate → accept → review loop the PRD's success criteria depend on, and currently doesn't exist at all — no schema, route, or UI.

## Starting Point

No SRS schema exists anywhere (confirmed deferred to this slice by two prior plans). `/review` is also missing from `PROTECTED_ROUTES` in `src/middleware.ts` despite a prior change log incorrectly claiming it was gated — a real bug fixed as part of this plan. `ts-fsrs` is not yet a dependency. Everything else this slice needs (the RPC pattern, the SSR-page-plus-island pattern, the API-route boilerplate) already has a working precedent to copy.

## Desired End State

A signed-in user opens `/review` from the nav, sees the front of their oldest-due card, reveals the back, rates it, and watches the queue advance until a completion screen appears — all independent of AI/OpenRouter availability, per the PRD's review-availability guardrail.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| `review_states` row creation | Lazy — created on first review | Keeps this slice fully self-contained; the two existing flashcard-creation paths (`promote_generation_session`, `POST /api/cards`) stay untouched | Plan |
| `state` column type | `text` + check constraint | Matches every existing state-like column convention in this schema (`origin`, `flashcard_drafts.state`) | Plan |
| Review history (`review_logs`) | Deferred to v2 | FR-010's minimum is "advance the schedule"; no PRD requirement asks for history | Plan |
| Session scope | No cap — all due cards in one sitting | Matches the PRD's already-locked single-deck, binary-rating simplicity; MVP scale is small | Plan |
| New vs. due cards | Unified queue, no separation | Simplest model, matches FR-009's framing of one undifferentiated session | Plan |
| Reveal interaction | Explicit "Show Answer" button | Matches this codebase's explicit-action UX pattern (explicit save/delete-confirm elsewhere) | Plan |
| Nav entry point | Plain "Review" link, no due-count badge | `Nav.astro` currently does zero data fetching on every page load; a badge would be the most invasive single change in the plan | Plan |
| Due-card ordering | Oldest-due-first | Standard SRS practice; trivial `ORDER BY` | Plan |
| FSRS library | `ts-fsrs` (base package only) | Canonical, zero-dependency, Workers-safe per external research; never the WASM `binding`/`fsrs-rs` packages | Research |
| Where FSRS math runs | Server-side, inside the API route | Client never computes or sends scheduling fields — only the rating choice is trusted from the client | Plan |

## Scope

**In scope:**
- `review_states` table + RLS, `get_due_cards` and `record_review` RPCs
- `ts-fsrs` dependency, `src/lib/reviews.ts` scheduling/data-access helper
- `POST /api/review/[id].ts` rating endpoint
- `/review` added to `PROTECTED_ROUTES` (bug fix)
- `src/pages/review.astro` + `src/components/review/ReviewSession.tsx`
- "Review" link in `Nav.astro`

**Out of scope:**
- `review_logs` history table (v2)
- Graded rating (Again/Hard/Good/Easy) — binary only
- Session pagination/capping, daily new-card limits
- Due-count nav badge
- Any change to `promote_generation_session` or `POST /api/cards`

## Architecture / Approach

Standard 3-layer pattern already used by `/deck` and `/generate`: Astro SSR page (fetches all due cards once) → React island (pages through them client-side, reveal-then-rate) → JSON API route → RPC for the one write that needs an ownership guard (`record_review` writes a row keyed by a foreign `flashcard_id`, so it must verify ownership before upserting — the only RPC in this schema that needs to).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database Schema & RPCs | `review_states` table + `get_due_cards`/`record_review` RPCs | First nullable column and first `ON CONFLICT` upsert in this schema — both deliberate, not risky, but worth knowing going in |
| 2. Backend | `ts-fsrs` wired up, rating API route, middleware fix | Confirms `ts-fsrs` actually executes inside `workerd` at request time, not just at build — the roadmap's stated open question |
| 3. Frontend | `/review` page, session UI, nav link | None significant — follows existing visual/UX conventions closely |

**Prerequisites:** S-02 (`atomic-save-to-deck`) already shipped — unblocked.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- A race between two simultaneous reviews of the same card (e.g., two open tabs) isn't guarded against — accepted as low-priority given MVP single-user scale; the second write simply overwrites the first.
- Never-reviewed cards are ordered by `created_at` as a due-now proxy; this is a cosmetic ordering choice, not a correctness concern, since FR-010 doesn't specify precision here.

## Success Criteria (Summary)

- A user with due cards can complete a full reveal → rate → advance → completion cycle at `/review`, on both desktop and mobile viewports.
- Rescheduling is verifiably correct: rating the same card "Knew it" twice in a row pushes its due date further out the second time.
- `/review` is unreachable while signed out (redirects to `/auth/signin`).
