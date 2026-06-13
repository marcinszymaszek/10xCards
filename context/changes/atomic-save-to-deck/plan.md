# Atomic Save to Deck Implementation Plan

## Overview

Implement S-02: after AI generation, the user reviews each candidate card with Accept / Reject / Edit controls, then clicks "Save to Deck" to atomically promote all accepted drafts into the permanent flashcards table. A Supabase RPC (`promote_generation_session`) handles the promotion in one transaction so no partial failures can leave orphaned drafts in the wrong state.

## Current State Analysis

**What S-01 delivered (or will deliver before S-02 starts):**
- `flashcard_drafts` table (`supabase/migrations/20260607221036_create_flashcard_drafts_table.sql`): columns `id`, `user_id`, `front`, `back`, `state` (`pending`|`accepted`|`rejected`), `generation_session_id`, `created_at`. RLS enforces user isolation.
- `POST /api/generate` (`src/pages/api/generate.ts`): validates input, calls Claude Haiku, inserts all cards into `flashcard_drafts` under one `generation_session_id`, returns `{ cards: [{id, front, back, state}] }`. **Note: does not currently return `session_id`** — Phase 2 of this plan adds it.
- `GenerationView.tsx` (`src/components/generate/GenerationView.tsx`): React island; on POST success transitions to a read-only card list (no interactive controls — added by this plan).
- `/generate` page and middleware protection: in place from S-01 Phase 4.

**What already exists (S-03 ahead of schedule):**
- `flashcards` table (`supabase/migrations/20260607180817_create_flashcards_table.sql`): columns `id`, `user_id`, `front`, `back`, `origin` (`ai`|`manual`, default `manual`), `created_at`. RLS enforces user isolation. **This plan does not recreate it.**
- `GET /api/cards`, `PATCH /api/cards/[id]`, `DELETE /api/cards/[id]` and `DeckBrowser.tsx` / `deck.astro` — the deck list is already functional.

**What is missing:**
- No `promote_generation_session` DB function.
- No promote API endpoint.
- No accept/reject/edit UI or save flow in `GenerationView.tsx`.
- `generate.astro` does not load pending drafts on page render.

## Desired End State

An authenticated user on `/generate`:
1. Generates cards (S-01 flow, unchanged) — a list of candidate cards appears with Accept, Reject, and Edit controls.
2. Acts on each card: Accept marks it green; Reject marks it crossed-out; Edit opens inline front/back textareas and auto-accepts on confirm.
3. Clicks "Save to Deck" (enabled when ≥ 1 card is accepted) — a single API call atomically creates the accepted cards in `flashcards` (with `origin: 'ai'`) and marks all session drafts as accepted or rejected.
4. Sees a success banner: "X cards saved to your deck." with a "View Deck →" link. The generate form resets to idle for a new session.
5. If the page is refreshed mid-review, the server re-loads the pending drafts from the most recent session — the user can start reviewing again (prior in-memory accept/reject decisions are gone, all cards shown as pending).
6. If Save fails, a `ServerError` banner appears; all in-progress decisions are preserved so the user can retry.

### Key Discoveries

- `src/middleware.ts:3` — `PROTECTED_ROUTES = ["/dashboard", "/deck"]`; `/generate` added in S-01 Phase 4. Confirmed before starting S-02.
- `supabase/migrations/20260607180817_create_flashcards_table.sql` — `flashcards` table already exists with `origin` CHECK (`'ai'` | `'manual'`). No new table migration needed.
- `src/lib/supabase.ts` — `createClient()` returns `null` when env vars absent; all API routes must guard with `if (!supabase)`.
- `src/components/auth/ServerError.tsx` + `SubmitButton.tsx` — reuse these primitives in the GenerationView extension.
- React Compiler ESLint rule is `error`; all hooks usage must pass the compiler. The Compiler handles memoization automatically — write plain inline functions for event handlers; do **not** add manual `useCallback` or `useMemo` (the S-01 island passes lint with none).
- `src/pages/deck.astro` pattern: server-side Supabase query → initial props to React island (`client:load`) — replicate this for pending drafts in `generate.astro`.

## What We're NOT Doing

- Manual card creation (FR-005) — deferred to a separate slice after S-02.
- Persisting per-card decisions (accept/reject) to the DB before Save — decisions are in-memory only until the atomic Save call.
- Streaming the promote operation — one synchronous RPC call.
- SRS scheduling fields on `flashcards` — those belong to S-04.
- Undo for Save — parked in roadmap, v2 scope.
- Soft-delete of rejected drafts — drafts are marked `rejected` in DB; no hard delete.

## Implementation Approach

Four sequential phases: DB function first (nothing can promote without it), then the API layer (endpoint + generate response fix), then the island UI extension (the largest phase), then the page update that enables load-on-refresh. Each phase can be verified before moving to the next.

## Critical Implementation Details

**RPC parameter encoding:** Supabase JS `supabase.rpc()` serialises a JavaScript array of objects as JSONB automatically. Pass `p_accepted` as a plain JS array — no manual JSON.stringify needed.

**`SECURITY INVOKER` on the RPC:** The function must run as the calling user (not the service role) so that RLS on both `flashcard_drafts` and `flashcards` applies. Declare with `SECURITY INVOKER` and do not set `search_path` to bypass schema resolution — let Postgres resolve `auth.uid()` normally.

**Session ID not in S-01 response:** The current `generate.ts` returns `{ cards: [...] }` with no `session_id`. The island cannot call the promote endpoint without it. Phase 2 adds `session_id` to the response and the island reads it.

---

## Phase 1: DB — `promote_generation_session` RPC

### Overview

Create a PL/pgSQL function that, in a single transaction, inserts accepted drafts into `flashcards`, marks them `accepted` in `flashcard_drafts`, and marks all remaining pending drafts in the session as `rejected`. The caller passes the accepted cards with their (potentially edited) front/back text.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260609000000_promote_generation_session.sql`

**Intent**: Define the atomic promotion function that S-02's API endpoint will call via `supabase.rpc()`.

**Contract**:

```sql
CREATE OR REPLACE FUNCTION promote_generation_session(
  p_session_id UUID,
  p_accepted   JSONB   -- [{id: uuid, front: text, back: text}, ...]
)
RETURNS INTEGER        -- count of flashcards inserted
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 1. Insert accepted drafts into permanent deck
  INSERT INTO flashcards (user_id, front, back, origin)
  SELECT
    auth.uid(),
    (item->>'front')::TEXT,
    (item->>'back')::TEXT,
    'ai'
  FROM jsonb_array_elements(p_accepted) AS item;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 2. Mark those drafts as accepted
  UPDATE flashcard_drafts
  SET state = 'accepted'
  WHERE id IN (
    SELECT (item->>'id')::UUID FROM jsonb_array_elements(p_accepted) AS item
  )
    AND user_id    = auth.uid()
    AND generation_session_id = p_session_id;

  -- 3. Mark any remaining pending drafts in the session as rejected
  UPDATE flashcard_drafts
  SET state = 'rejected'
  WHERE generation_session_id = p_session_id
    AND user_id = auth.uid()
    AND state   = 'pending';

  RETURN v_count;
END;
$$;
```

The function is idempotent for the UPDATE steps but not for the INSERT. The promote endpoint should be called exactly once per Save action; the island disables the button during the in-flight request to prevent double-submission.

### Success Criteria

#### Automated Verification

- `pnpm exec supabase db reset` exits 0 with all three migrations applied.
- `pnpm run lint` passes (no TypeScript changes in this phase).

#### Manual Verification

- Supabase Studio SQL editor: call the function with a known `session_id` and a JSON array of accepted cards; verify rows appear in `flashcards` and draft states update correctly.
- Call with a `user_id` mismatch: RLS on `flashcard_drafts` rejects the UPDATE; `flashcards` insert is scoped to `auth.uid()`.

**Implementation Note**: Pause here for manual DB verification before proceeding to Phase 2.

---

## Phase 2: API — Promote Endpoint + Generate Response Fix

### Overview

Add the `POST /api/drafts/promote` endpoint that calls the RPC. Also patch `POST /api/generate` to include `session_id` in its response — the island needs it to call promote.

### Changes Required

#### 1. Add `session_id` to generate API response

**File**: `src/pages/api/generate.ts`

**Intent**: Expose the `generation_session_id` alongside the cards array so the client can pass it to the promote endpoint.

**Contract**: Change the response shape from `{ cards: [...] }` to `{ session_id: string, cards: [...] }`. The `session_id` value is the `sessionId` constant already computed on line ~87 of the file (`const sessionId = crypto.randomUUID()`).

#### 2. Promote endpoint

**File**: `src/pages/api/drafts/promote.ts`

**Intent**: Accept the user's final decisions and delegate the atomic promotion to the Supabase RPC.

**Contract**:

- Export `export const POST: APIRoute`.
- Guard `if (!supabase)` → 500.
- Guard `if (!user)` → 401.
- Parse JSON body: `{ session_id: string, accepted: Array<{ id: string, front: string, back: string }> }`.
- Validate: `session_id` must be a non-empty string; `accepted` must be a non-empty array (0 accepted = 400 `{ error: "Must accept at least one card" }`).
- Call `await supabase.rpc('promote_generation_session', { p_session_id: session_id, p_accepted: accepted })`.
- On RPC error: return 500 `{ error: "Failed to save cards" }`.
- On success: return 200 `{ saved: data }` where `data` is the integer returned by the function.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes (TypeScript + React Compiler checks).
- `pnpm run build` succeeds.

#### Manual Verification

- `POST /api/generate` response now includes `session_id` alongside `cards`.
- `POST /api/drafts/promote` with a valid auth cookie, `session_id`, and 1+ accepted cards returns `{ saved: N }` and creates N rows in `flashcards`.
- Corresponding `flashcard_drafts` rows now have `state: 'accepted'`; remaining pending rows have `state: 'rejected'`.
- `POST /api/drafts/promote` without auth cookie returns 401.
- `POST /api/drafts/promote` with empty `accepted` array returns 400.

**Implementation Note**: Pause here for manual API verification before proceeding to Phase 3.

---

## Phase 3: UI — GenerationView with Accept/Reject/Edit + Save

### Overview

Extend the existing `GenerationView.tsx` island to add per-card decision controls, inline edit mode, the Save to Deck button, and post-save success/error states. Also accept an `initialDrafts` prop for the refresh-persistence behaviour added in Phase 4.

### Changes Required

#### 1. Extended GenerationView island

**File**: `src/components/generate/GenerationView.tsx`

**Intent**: Transform the read-only card list (S-01) into a fully interactive review flow with atomic save.

**Contract**:

Props interface (add):
```typescript
export interface DraftCardInput {
  id: string;
  front: string;
  back: string;
  generation_session_id: string;
}
interface Props {
  initialDrafts?: DraftCardInput[];
}
```

Internal `DraftCard` type:
```typescript
interface DraftCard {
  id: string;
  front: string;
  back: string;
  editedFront: string;
  editedBack: string;
  decision: 'pending' | 'accepted' | 'rejected';
  isEditing: boolean;
}
```

Phase state (replaces the old `status` + `cards` state):
- `phase: 'idle' | 'generating' | 'reviewing' | 'saving' | 'saved'` — starts `'reviewing'` when `initialDrafts` is non-empty, `'idle'` otherwise.
- `drafts: DraftCard[]` — initialized from `initialDrafts` (all `decision: 'pending'`) or set from generate response.
- `sessionId: string | null` — set from generate response or inferred from `initialDrafts[0].generation_session_id`.
- `generateError: string | null`
- `saveError: string | null`
- `savedCount: number`
- `text: string`, `count: number` — unchanged form state.

Behaviour additions:
- **Accept**: set `decision = 'accepted'` for the card; clear `isEditing`.
- **Reject**: set `decision = 'rejected'` for the card; clear `isEditing`.
- **Edit**: set `isEditing = true`; render front/back textareas prefilled with `editedFront`/`editedBack` (or original on first edit).
- **Confirm edit**: set `editedFront`/`editedBack` from textarea values, set `isEditing = false`, set `decision = 'accepted'`.
- **Save to Deck**: disabled when `drafts.filter(d => d.decision === 'accepted').length === 0` or `phase === 'saving'`. On click: set `phase = 'saving'`, `saveError = null`; POST `/api/drafts/promote` with `{ session_id: sessionId, accepted: drafts.filter(accepted).map(d => ({ id: d.id, front: d.editedFront || d.front, back: d.editedBack || d.back })) }`; on 200: set `phase = 'saved'`, `savedCount = data.saved`, `drafts = []`, `sessionId = null`, `text = ''`, `count = 5`, `generateError = null`; on error: set `phase = 'reviewing'`, `saveError = message`.
- **Post-generate**: on 200 from `/api/generate`, map `session_id` to `sessionId`, map `cards` to `DraftCard[]` with all `decision: 'pending'`, set `phase = 'reviewing'`.
- **Post-save success state**: render "X cards saved to your deck." and a `<a href="/deck">View Deck →</a>` link. The generate form resets so the user can start a new session immediately.
- **Save error**: render `<ServerError message={saveError} />` above the card list (not above the form); decisions are preserved.
- Reuse `<ServerError>` and `<SubmitButton>` from `@/components/auth/` where props contract fits.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes — React Compiler rule produces zero errors.

#### Manual Verification

- Accept button turns a card to "accepted" visual state (e.g., green border or checkmark).
- Reject button crosses out / greys the card.
- Edit opens inline textareas; Confirm updates the text and auto-accepts.
- "Save to Deck" is disabled when zero cards are accepted.
- Clicking Save shows a saving/pending state on the button.
- Successful save shows the "X cards saved" banner and "View Deck →" link.
- Save failure (force a 500 from the endpoint temporarily) shows `ServerError`; card decisions remain intact; user can retry.
- Passing `initialDrafts` (non-empty) starts the component in reviewing state with all cards pending.

**Implementation Note**: Pause here for manual UI verification before proceeding to Phase 4.

---

## Phase 4: Page — Generate Page Loads Pending Drafts

### Overview

Update `generate.astro` to query the user's most recent pending session from the DB on every server render and pass the drafts as `initialDrafts` to `GenerationView`. On browser refresh, the user sees the pending list again (all decisions reset to pending — in-memory state was lost, DB state is preserved).

### Changes Required

#### 1. `generate.astro` — add pending draft query

**File**: `src/pages/generate.astro`

**Intent**: Restore the review list on page refresh by loading the most recent pending session's drafts server-side and passing them to the island.

**Contract**: After obtaining the Supabase client (it may be `null` — guard before querying), run two sequential queries:
1. Fetch the most recent `generation_session_id` where `state = 'pending'` for the current user (`.select('generation_session_id').eq('state','pending').order('created_at',{ascending:false}).limit(1).maybeSingle()`). `.maybeSingle()` returns `{ data: null, error: null }` when no rows exist, so the absence of a pending session is not conflated with a DB error.
2. If `data !== null` (a session exists), fetch all pending drafts for that `generation_session_id` ordered by `created_at ASC`.

Pass the resulting array (or `[]` on null/error) as `initialDrafts` to `<GenerationView client:load initialDrafts={initialDrafts} />`. Import `DraftCardInput` from `@/components/generate/GenerationView` (it is exported there — see Phase 3 contract).

On any Supabase error in these queries: silently fall back to `initialDrafts={[]}` — the page must not throw; the user loses refresh-persistence for that visit but the form still works.

### Success Criteria

#### Automated Verification

- `pnpm run build` exits 0.
- `pnpm run lint` passes.

#### Manual Verification

- Generate cards → do not save → refresh the page: the card list appears (all pending) and the "Save to Deck" button is disabled (zero accepted).
- Generate a second session while first session's cards are pending: the new cards replace the old display; old drafts remain pending in the DB.
- Generate cards → save → refresh the page: no pending drafts exist; page loads in idle state.
- Visiting `/generate` while unauthenticated redirects to `/auth/signin` (unchanged from S-01).

**Implementation Note**: Pause here for final end-to-end manual verification of the full accept/reject/save/refresh flow.

---

## Testing Strategy

### Automated (lint + type-check only — no test framework configured)

- `pnpm run lint` must pass after each phase.
- `pnpm run build` must pass after Phase 2 and Phase 4 (requires env vars).
- `pnpm exec supabase db reset` must exit 0 after Phase 1.

### Manual Testing Steps

1. Sign in. Navigate to `/generate`. Verify idle state (form visible, no cards).
2. Generate 5 cards from a short text snippet.
3. Accept 2, reject 1, edit front/back of 1 and confirm, leave 1 pending.
4. Verify "Save to Deck" is enabled (2 accepted + 1 edited/accepted = 3).
5. Click Save. Verify saving state on button.
6. Verify success banner: "3 cards saved to your deck."
7. Navigate to `/deck`. Verify 3 new cards appear with AI badge (`origin: 'ai'`).
8. Open Supabase Studio → `flashcard_drafts`: verify accepted/rejected states; no orphaned pending rows for this session.
9. Return to `/generate`. Generate 5 more cards. Do NOT save. Refresh the page.
10. Verify the 5 cards reappear (all pending). Verify Save is disabled.
11. Click Save without accepting any card — button should remain disabled.
12. Accept 1, click Save. Verify 1 card created; remaining 4 now rejected in DB.

## Migration Notes

This is the third migration in the project. The function targets the existing `flashcards` and `flashcard_drafts` tables — no schema changes to those tables. Apply locally with `pnpm exec supabase db reset`. For the remote Supabase cloud project, apply via `pnpm exec supabase db push` or the Supabase dashboard SQL editor.

## References

- PRD: `context/foundation/prd.md` — US-01, FR-004, FR-005, FR-006
- Roadmap: `context/foundation/roadmap.md` — S-02 atomic-save-to-deck
- S-01 plan: `context/changes/first-gated-generation/plan.md`
- Flashcards migration: `supabase/migrations/20260607180817_create_flashcards_table.sql`
- Drafts migration: `supabase/migrations/20260607221036_create_flashcard_drafts_table.sql`
- Generate API: `src/pages/api/generate.ts`
- DeckBrowser island (pattern reference): `src/components/deck/DeckBrowser.tsx`
- Supabase client factory: `src/lib/supabase.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB — promote_generation_session RPC

#### Automated

- [x] 1.1 `pnpm exec supabase db reset` exits 0 with all three migrations applied — dbd8e9a
- [x] 1.2 `pnpm run lint` passes — dbd8e9a

#### Manual

- [x] 1.3 Function callable in Supabase Studio; creates flashcards and updates draft states correctly — dbd8e9a
- [x] 1.4 RLS enforcement: user_id mismatch rejects UPDATE on flashcard_drafts — dbd8e9a

### Phase 2: API — Promote Endpoint + Generate Response Fix

#### Automated

- [x] 2.1 `pnpm run lint` passes — 30ad1e5
- [x] 2.2 `pnpm run build` succeeds — 30ad1e5

#### Manual

- [x] 2.3 `POST /api/generate` response includes `session_id` — 30ad1e5
- [x] 2.4 `POST /api/drafts/promote` with valid auth returns `{ saved: N }` and creates flashcards — 30ad1e5
- [x] 2.5 Draft states updated to accepted/rejected in Supabase Studio — 30ad1e5
- [x] 2.6 `POST /api/drafts/promote` without auth returns 401 — 30ad1e5
- [x] 2.7 `POST /api/drafts/promote` with empty accepted array returns 400 — 30ad1e5

### Phase 3: UI — GenerationView with Accept/Reject/Edit + Save

#### Automated

- [x] 3.1 `pnpm run lint` passes (React Compiler zero errors) — 8fef939

#### Manual

- [x] 3.2 Accept/Reject buttons change card visual state — 8fef939
- [x] 3.3 Edit opens inline textareas; Confirm auto-accepts with edited text — 8fef939
- [x] 3.4 Save disabled when zero accepted; enabled when ≥ 1 accepted — 8fef939
- [x] 3.5 Successful save shows "X cards saved" banner and View Deck link — 8fef939
- [x] 3.6 Save failure shows ServerError banner; card decisions preserved — 8fef939
- [x] 3.7 initialDrafts prop starts component in reviewing state — 8fef939

### Phase 4: Page — Generate Page Loads Pending Drafts

#### Automated

- [x] 4.1 `pnpm run build` exits 0
- [x] 4.2 `pnpm run lint` passes

#### Manual

- [x] 4.3 Refresh after generating shows pending cards (all decisions reset)
- [x] 4.4 Generate second session: new cards replace old display
- [x] 4.5 Refresh after saving: idle state (no pending drafts)
- [x] 4.6 Unauthenticated visit redirects to /auth/signin
