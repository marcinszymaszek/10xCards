# Spaced Repetition Review Session (S-04) Implementation Plan

## Overview

Implement `/review`: a spaced-repetition review session over the user's accepted flashcards, scheduled by `ts-fsrs` (FSRS algorithm), with binary "knew it" / "didn't know it" rating per FR-009/FR-010. This is a net-new vertical slice — no review-related schema, route, or UI exists today.

## Current State Analysis

- No SRS schema exists: zero columns on `flashcards` and no `review_states` table. Confirmed deferred to S-04 by `atomic-save-to-deck/plan.md` and `first-gated-generation/plan.md`.
- `/review` is **not** in `PROTECTED_ROUTES` (`src/middleware.ts:4` — currently `["/dashboard", "/deck", "/generate"]`), despite `gate-product-routes/change.md` incorrectly claiming it was already gated. This is a real bug that must be fixed here.
- `ts-fsrs` is not in `package.json` — confirmed absent from dependencies.
- Two existing code paths create flashcards today and would need to change under an eager-scheduling-row design: `promote_generation_session` RPC (AI-accepted cards) and `POST /api/cards` (manual add, inside `DeckBrowser.tsx`). The lazy-creation decision below means **neither needs to change**.
- `Nav.astro` (global nav, rendered on every page via `Layout.astro`) currently does zero data fetching beyond `Astro.locals.user`, and links only `/generate` and `/deck`.
- Established conventions confirmed by reading the actual migrations and RPC: plural snake_case tables, `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, RLS via a single `for all` policy `using/with check (auth.uid() = user_id)`, state-like columns as `text` + inline `check`, RPCs as `SECURITY INVOKER` `plpgsql` with `p_`/`v_` naming and ownership filters on every write.

## Desired End State

A signed-in user with at least one due flashcard can open `/review` (linked from the global nav), see the front of the oldest-due card, click "Show Answer" to reveal the back, rate it "Didn't know it" or "Knew it", and have the schedule advance via FSRS — repeating until the due queue is empty, at which point a completion state is shown. A user with zero accepted cards, or zero due cards, sees a clear empty/done state rather than an error. The review session works independently of AI/OpenRouter availability (no AI calls in this slice).

Verification: manually exercise the full flow against `pnpm run dev` (real Cloudflare `workerd` runtime), confirm scheduling fields persist and advance correctly across two consecutive reviews of the same card, and confirm `/review` redirects unauthenticated visitors to `/auth/signin`.

### Key Discoveries:

- `supabase/migrations/20260609000000_promote_generation_session.sql` is the exact RPC template to mirror for `record_review` — `SECURITY INVOKER`, `p_`-prefixed params, `auth.uid()`-filtered writes.
- Lazy row creation (chosen below) means the due-cards query needs a `LEFT JOIN` to treat flashcards with no `review_states` row as immediately due — not expressible via the Supabase JS client's filter builder across an embedded resource, hence a `get_due_cards` RPC rather than a plain `.select()`.
- `review_states.last_review` will be this schema's first nullable column, and `record_review`'s `ON CONFLICT` will be its first upsert — both confirmed via grep as having zero existing precedent. Not a problem, just worth knowing going in.
- Because `record_review` writes a row keyed by a `flashcard_id` that isn't itself RLS-scoped, it needs an explicit ownership check before upserting (see Critical Implementation Details) — none of the existing RPCs needed this since they only ever wrote rows already shaped by `user_id = auth.uid()` filters on the same table being written.

## What We're NOT Doing

- No `review_logs` history table — only the current schedule (`review_states`) persists; deferred to v2.
- No eager `review_states` row creation on flashcard create/promote — rows are created lazily on first review.
- No per-session cap or pagination — a session always loads every due card at once.
- No separate "new cards" intro batch or daily new-card limit — new and due cards share one queue.
- No graded rating (Again/Hard/Good/Easy) — binary only, per FR-010 (mapped to FSRS `Rating.Again` / `Rating.Good`).
- No due-count badge in the nav — a plain "Review" link only.
- No client-side FSRS computation — scheduling math runs server-side in the API route, never trusting client input beyond the rating choice.
- No changes to `promote_generation_session` or `POST /api/cards` — the lazy-creation design means both existing write paths are untouched.

## Implementation Approach

Follow this codebase's established 3-layer pattern exactly: Astro SSR page → React island (`client:load`) → JSON API route → RPC for the one write that needs an ownership guard and upsert semantics. Three phases, bottom-up: schema/RPCs first, then the backend glue that calls `ts-fsrs` and exposes the rating endpoint, then the page/island/nav UI on top.

## Critical Implementation Details

- **Ownership guard + read-before-write sequencing in `record_review`**: unlike every prior RPC in this schema, `record_review` writes a row keyed by a foreign `flashcard_id` not itself scoped by the calling RLS context. The RPC must verify `EXISTS (SELECT 1 FROM flashcards WHERE id = p_flashcard_id AND user_id = auth.uid())` before upserting — otherwise a user could write a scheduling row against another user's flashcard ID, since the FK alone doesn't check ownership. Separately, the API route calling this RPC must **read** the flashcard's current `review_states` row (or treat it as absent → `createEmptyCard()`) *before* calling `fsrs().next()`, so the scheduling math always starts from the persisted state, not from a stale value in the request.

## Phase 1: Database Schema & RPCs

### Overview

Add `review_states` (lazy, one row per flashcard once first reviewed), plus two RPCs: `get_due_cards` (read) and `record_review` (ownership-checked upsert).

### Changes Required:

#### 1. `review_states` table

**File**: `supabase/migrations/20260624150000_create_review_states_table.sql`

**Intent**: Persist the FSRS `Card` schedule per flashcard, one row per `(user_id, flashcard_id)`, created lazily on first review.

**Contract**: Columns in fixed order matching the existing `flashcards`/`flashcard_drafts` convention: `id uuid not null default gen_random_uuid() primary key`, `user_id uuid not null references auth.users(id) on delete cascade`, `flashcard_id uuid not null references flashcards(id) on delete cascade`, then every `Card` field — `due timestamptz not null`, `stability double precision not null`, `difficulty double precision not null`, `elapsed_days integer not null`, `scheduled_days integer not null`, `learning_steps integer not null`, `reps integer not null`, `lapses integer not null`, `state text not null check (state in ('New','Learning','Review','Relearning'))`, `last_review timestamptz null` (first nullable column in this schema — intentional, matches `Card.last_review?`), `created_at timestamptz not null default now()`. Add `unique (user_id, flashcard_id)` to support the `record_review` upsert. Enable RLS; single `for all` policy named `"Users manage their own review states"` using/with check `auth.uid() = user_id`.

#### 2. `get_due_cards` RPC

**File**: `supabase/migrations/20260624150100_get_due_cards.sql`

**Intent**: Return the calling user's due flashcards — a flashcard with no `review_states` row counts as due immediately; a flashcard with a row counts as due when `due <= now()`. Ordered oldest-due-first.

**Contract**: `get_due_cards() RETURNS TABLE (id uuid, front text, back text)`, `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`. Body: `SELECT f.id, f.front, f.back FROM flashcards f LEFT JOIN review_states rs ON rs.flashcard_id = f.id AND rs.user_id = auth.uid() WHERE f.user_id = auth.uid() AND (rs.id IS NULL OR rs.due <= now()) ORDER BY COALESCE(rs.due, f.created_at) ASC`.

#### 3. `record_review` RPC

**File**: `supabase/migrations/20260624150200_record_review.sql`

**Intent**: Upsert the post-review `Card` snapshot for one flashcard, with an explicit ownership check (see Critical Implementation Details) since this is the first RPC writing a row keyed by a foreign id not already scoped by the table's own `user_id`.

**Contract**: `record_review(p_flashcard_id uuid, p_due timestamptz, p_stability double precision, p_difficulty double precision, p_elapsed_days integer, p_scheduled_days integer, p_learning_steps integer, p_reps integer, p_lapses integer, p_state text, p_last_review timestamptz) RETURNS void`, `LANGUAGE plpgsql`, `SECURITY INVOKER`. Body: raise/no-op if `NOT EXISTS (SELECT 1 FROM flashcards WHERE id = p_flashcard_id AND user_id = auth.uid())`; otherwise `INSERT INTO review_states (...) VALUES (auth.uid(), p_flashcard_id, ...) ON CONFLICT (user_id, flashcard_id) DO UPDATE SET <every field> = EXCLUDED.<field>`.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `pnpm exec supabase db reset` (or `pnpm exec supabase migration up` against local stack)
- Type checking passes: `pnpm run lint` (runs `tsc` as part of type-aware ESLint)

#### Manual Verification:

- In Supabase Studio SQL editor: call `get_due_cards()` as a test user with zero `review_states` rows — confirms all their flashcards return as due.
- Call `record_review(...)` once, then `get_due_cards()` again — confirms the reviewed card drops out of the due set when `p_due` is in the future, and reappears once `now() >= due`.
- Attempt `record_review` with a `p_flashcard_id` belonging to a different user — confirms it raises/no-ops rather than writing a row.

---

## Phase 2: Backend — `ts-fsrs` Integration & API Route

### Overview

Add the `ts-fsrs` dependency, the data-access/scheduling helper module, the rating-submission API route, and fix the `/review` middleware gap.

### Changes Required:

#### 1. Add dependency

**File**: `package.json`

**Intent**: Add the scheduler library selected in `srs-library-research.md` / `ts-fsrs-api-docs.md`.

**Contract**: `pnpm add ts-fsrs` — only the base package, never `@open-spaced-repetition/binding`/`fsrs-rs`/`fsrs-browser` (WASM/native, not Workers-safe, and not needed for scheduling).

#### 2. Fix route protection

**File**: `src/middleware.ts`

**Intent**: Close the gating gap identified in research — `/review` must require auth like every other product route.

**Contract**: Add `"/review"` to the `PROTECTED_ROUTES` array (`src/middleware.ts:4`).

#### 3. Review data-access & scheduling helper

**File**: `src/lib/reviews.ts`

**Intent**: Sibling to `src/lib/cards.ts`, same `SupabaseClient` type-alias pattern. Owns: fetching due cards, reading a flashcard's current schedule (or treating it as new), computing the next schedule via `ts-fsrs`, and persisting it.

**Contract**:
- `type SupabaseClient = NonNullable<ReturnType<typeof createClient>>` (same alias as `cards.ts`).
- `export interface ReviewCard { id: string; front: string; back: string }`.
- `export async function fetchDueCards(supabase: SupabaseClient): Promise<ReviewCard[]>` — calls `supabase.rpc("get_due_cards")`.
- `export type ReviewRating = "again" | "good"` — the binary PRD ratings, mapped internally to `Rating.Again` / `Rating.Good`.
- `export async function submitReview(supabase: SupabaseClient, flashcardId: string, rating: ReviewRating): Promise<void>` — reads the existing `review_states` row for `(flashcardId)` scoped by RLS (`maybeSingle()`); builds a `Card` via `TypeConvert.card(existingRowAsCardInput)` if present, else `createEmptyCard()`; calls `fsrs().next(card, new Date(), rating === "good" ? Rating.Good : Rating.Again)`; calls `supabase.rpc("record_review", { p_flashcard_id: flashcardId, ...fields from result.card })`. Throws on any Supabase error, matching `cards.ts`'s `if (error) throw new Error(error.message)` convention.

#### 4. Rating submission API route

**File**: `src/pages/api/review/[id].ts`

**Intent**: Accept a binary rating for one flashcard and advance its schedule. Mirrors the existing API route boilerplate exactly (null-guard → 401 check → hand-rolled validation → lib call).

**Contract**: `POST` handler. Null-guards `createClient(...)` → 500 `{ error: "Service unavailable" }`. Checks `context.locals.user` → 401 `{ error: "Unauthorized" }`. Parses `context.params.id` as the flashcard id. Validates JSON body has `rating: "again" | "good"` via a hand-rolled type guard (no Zod, per repo convention) → 400 `{ error: "Invalid rating" }` otherwise. Calls `submitReview(supabase, id, rating)`; on success returns `200 {}`; on thrown error returns `500 { error: "Failed to record review" }`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `pnpm run lint`
- `pnpm exec astro sync` runs cleanly (regenerates types after the new route)

#### Manual Verification:

- With `pnpm run dev` running (real Cloudflare `workerd` runtime, resolving the roadmap's open "does `ts-fsrs` execute in Workers" question): `curl -X POST http://localhost:<port>/api/review/<flashcard-id>` (authenticated session cookie) with `{"rating":"good"}` twice in a row for the same card — confirm the second call's resulting `due` is further in the future than the first (state is genuinely advancing, not just being overwritten with the same value).
- Confirm visiting `/review` while signed out redirects to `/auth/signin` (middleware fix took effect).

---

## Phase 3: Frontend — Review Page & Session UI

### Overview

The user-facing review flow: SSR page fetching all due cards once, a React island paging through them with explicit reveal-then-rate interaction, and a nav entry point.

### Changes Required:

#### 1. Review page

**File**: `src/pages/review.astro`

**Intent**: SSR-fetch the full due-card queue once (no pagination, per the "no cap" decision) and hydrate the session island. Mirrors `src/pages/deck.astro`'s null-guard-and-try/catch-to-empty-state pattern.

**Contract**: `createClient(Astro.request.headers, Astro.cookies)` → if present, `fetchDueCards(supabase)` inside a try/catch (empty array on failure, matching `deck.astro`'s SSR-failure handling) → render `<Layout title="Review"><ReviewSession client:load initialCards={cards} /></Layout>`.

#### 2. Review session island

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Hold the due-card queue in state; for the current card, show the front only; on "Show Answer" reveal the back plus the two rating buttons; on rating, POST to the API route, then advance to the next card regardless of network latency-sensitivity (await the response and surface an error inline on failure rather than advancing optimistically, since a failed write must not be silently treated as scheduled). When the queue is exhausted, show a completion state with a link back to `/deck`. When `initialCards` is empty, show an empty-deck-style state distinguishing "no cards at all" (link to `/generate`, matching `DeckBrowser`'s empty state) from "no cards due right now" (no due cards but the deck isn't empty — needs a flag passed from the page, or simply: if `initialCards.length === 0`, render one generic "Nothing to review right now" message, since the page doesn't separately know total deck size and adding that lookup is unwarranted scope for this state).

**Contract**: `interface ReviewSessionProps { initialCards: ReviewCard[] }`. Internal state: `queue` (remaining cards), `revealed` (boolean), `submitting`, `error`. Reuses the existing visual language from `CardItem`/`DeckBrowser` (`rounded-xl border border-white/10 bg-white/5` card surface, `rounded-lg border ... bg-blue-600/30`/`bg-red-900/20`-style action buttons — no new design system, per the project's glass-surface/purple-CTA convention). "Didn't know it" maps to `rating: "again"`, "Knew it" maps to `rating: "good"`.

#### 3. Nav entry point

**File**: `src/components/Nav.astro`

**Intent**: Add the missing `/review` link alongside the existing `/generate` and `/deck` links, no due-count badge.

**Contract**: A third `<a href="/review">Review</a>` inside the existing authenticated-user nav block (`src/components/Nav.astro:11-28`), same `class:list` active-state pattern as the other two links, positioned after "Deck".

### Success Criteria:

#### Automated Verification:

- Type checking passes: `pnpm run lint`
- Production build succeeds: `pnpm run build`

#### Manual Verification:

- As a signed-in user with at least one accepted flashcard never reviewed before: visit `/review`, confirm the front renders, click "Show Answer", confirm the back and both rating buttons appear, click "Knew it", confirm the session advances to the next due card (or to the completion state if it was the only one).
- Re-visit `/review` immediately after completing a session where every card was just rated "Knew it" with a multi-day interval — confirm the queue is now empty (those cards are no longer due) and the completion state renders.
- As a signed-in user with zero flashcards at all, visit `/review` and confirm a clear empty state renders (no error, no blank screen).
- Resize to a mobile viewport and confirm no horizontal scroll and tap targets are reachable without zoom, per the PRD's responsive-web NFR.

---

## Testing Strategy

### Unit Tests:

- No test framework is configured in this repo (confirmed in `CLAUDE.md` gotchas) — none added by this plan, consistent with the rest of the codebase.

### Integration Tests:

- None — same reasoning as above; verification is via the manual steps per phase plus `pnpm run lint`/`pnpm run build`.

### Manual Testing Steps:

1. Fresh flashcard, never reviewed: front shown → Show Answer → rate "Didn't know it" → confirm it reappears as due again soon (short FSRS relearning interval) rather than far in the future.
2. Same card, rate "Knew it" repeatedly across multiple sessions (manually advancing system clock or waiting) → confirm `stability`/`scheduled_days` trend upward and `reps` increments each time.
3. Multiple due cards → confirm oldest-due (or, for never-reviewed cards, oldest-created) appears first.
4. Sign out, visit `/review` directly → redirected to `/auth/signin`.
5. Attempt to call `POST /api/review/<id>` for a flashcard ID belonging to another user (e.g., via a second test account) → confirm it fails closed rather than writing a schedule row.

## Performance Considerations

No pagination or batching is introduced — at this app's expected scale (single-user MVP, small decks) loading the full due set in one SSR fetch is well within the existing per-request budget already used by `deck.astro`'s paginated list query.

## Migration Notes

Three new, additive migrations (`review_states` table + two RPCs); nothing alters or backfills existing tables. No data migration needed since this is a net-new feature with no prior review data to reconcile.

## References

- Related research: `context/changes/srs-review-session/research.md`
- External library research: `context/changes/srs-review-session/srs-library-research.md`
- API reference: `context/changes/srs-review-session/ts-fsrs-api-docs.md`
- RPC template: `supabase/migrations/20260609000000_promote_generation_session.sql`
- Existing full-stack precedent: `src/pages/deck.astro`, `src/lib/cards.ts`, `src/pages/api/drafts/promote.ts`
- Nav surface to extend: `src/components/Nav.astro:11-28`
- Middleware to fix: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database Schema & RPCs

#### Automated

- [ ] 1.1 Migrations apply cleanly
- [x] 1.2 Type checking passes

#### Manual

- [ ] 1.3 get_due_cards returns all flashcards as due for a user with zero review_states rows
- [ ] 1.4 record_review advances and then correctly removes/restores a card from the due set
- [ ] 1.5 record_review fails closed for a flashcard owned by a different user

### Phase 2: Backend — ts-fsrs Integration & API Route

#### Automated

- [ ] 2.1 Type checking passes
- [ ] 2.2 astro sync runs cleanly

#### Manual

- [ ] 2.3 Two consecutive POST /api/review/[id] calls against the real dev (workerd) runtime show advancing due dates
- [ ] 2.4 Signed-out visit to /review redirects to /auth/signin

### Phase 3: Frontend — Review Page & Session UI

#### Automated

- [ ] 3.1 Type checking passes
- [ ] 3.2 Production build succeeds

#### Manual

- [ ] 3.3 Full reveal → rate → advance flow works for a never-reviewed card
- [ ] 3.4 Completion state renders once all due cards are reviewed
- [ ] 3.5 Empty state renders for a user with zero flashcards
- [ ] 3.6 Mobile viewport has no horizontal scroll and reachable tap targets
