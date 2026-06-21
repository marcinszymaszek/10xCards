# Deck View with Per-Card Edit and Delete — Implementation Plan

## Overview

Implement the S-03 slice: a signed-in user navigates to `/deck`, sees all their accepted flashcards listed, can edit the front or back text of any card (with an explicit save step), and can delete a card after confirming the action.

## Current State Analysis

S-02 (`atomic-save-to-deck`) delivers the `flashcards` table — this plan builds directly on that output. What exists once S-02 ships:

- `flashcards` table: `id`, `user_id`, `front`, `back`, `created_at` (at minimum); RLS ensures users see only their own rows.
- `/generate` page and generation flow are live.
- Auth, middleware (`PROTECTED_ROUTES`), and the React island pattern (`client:load`, `FormField`, `ServerError`) are all established.

What is absent:

- No `/deck` page.
- No `PATCH /api/cards/[id]` or `DELETE /api/cards/[id]` endpoints.
- `/deck` is not in `PROTECTED_ROUTES`.

## Desired End State

`/deck` is a protected page. An authenticated user sees a list of all their accepted flashcards. Each card has an **Edit** action that puts the card into an editable state (front + back textareas) with an explicit **Save** button, and a **Delete** action that shows a confirmation prompt before permanently removing the card. Both actions call dedicated API endpoints. Unauthenticated visits redirect to `/auth/signin`.

### Key Discoveries

- `src/middleware.ts:3` — `PROTECTED_ROUTES`; add `/deck` here.
- `src/lib/supabase.ts` — nullable client; all API routes must guard `if (!supabase)`.
- `src/components/auth/` — `FormField`, `SubmitButton`, `ServerError` reusable in the edit UI.
- PRD FR-007: edit must use **explicit save** (not auto-save) to preserve review history integrity.
- PRD FR-008: delete must include a **confirmation step**; soft-delete is out of scope for MVP.
- `flashcards` schema assumed from S-02: `id uuid PK`, `user_id uuid FK auth.users`, `front text`, `back text`, `created_at timestamptz`.

## What We're NOT Doing

- Soft-delete (PRD §FR-008 Socrates; deferred to v2).
- Undo for edits (PRD §FR-007 Socrates; deferred to v2).
- Bulk edit or bulk delete.
- Auto-save / optimistic updates.
- Pagination or search within the deck (single-user MVP; deck size manageable without it).
- `/review` route protection — added in S-04.

## Implementation Approach

Two phases: API layer first (edit + delete endpoints), then the `/deck` page with the React island. The island manages per-card state (idle / editing / confirm-delete) without a full page reload.

---

## Phase 1: API Endpoints

### Overview

Two REST-style API routes operating on individual cards. Both require an authenticated session and verify row ownership via Supabase RLS — no manual user_id check needed beyond confirming Supabase returned a row.

### Changes Required

#### 1. Edit card endpoint

**File**: `src/pages/api/cards/[id].ts`

**Intent**: Accept updated `front` and `back` values for an existing card; persist the change; return the updated card.

**Contract**:

- Export `export const PATCH: APIRoute`.
- Path param `id` from `context.params.id`.
- Request body: JSON `{ front: string, back: string }`.
- Guard `if (!supabase)` → 500; guard `if (!user)` → 401.
- Validate: `front` and `back` non-empty strings (400 if either blank).
- `supabase.from("flashcards").update({ front, back }).eq("id", id).select().single()` — RLS blocks rows that don't belong to the user; a null result means not found or unauthorised → 404.
- Return updated row as JSON with 200.

#### 2. Delete card endpoint

**File**: `src/pages/api/cards/[id].ts` (same file — add alongside PATCH)

**Intent**: Permanently delete a card owned by the current user.

**Contract**:

- Export `export const DELETE: APIRoute` in the same file as PATCH.
- Guard `if (!supabase)` → 500; guard `if (!user)` → 401.
- `supabase.from("flashcards").delete().eq("id", id)` — RLS prevents deleting another user's card.
- Return 204 No Content on success.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes.
- `pnpm run build` succeeds.

#### Manual Verification

- `PATCH /api/cards/<id>` with valid auth and body returns 200 with updated card; card change visible in Supabase Studio.
- `PATCH` with blank `front` or `back` returns 400.
- `PATCH` without auth returns 401.
- `DELETE /api/cards/<id>` with valid auth returns 204; row gone from Supabase Studio.
- `DELETE` on a card belonging to a different user returns 404 (RLS blocks it).

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Deck Page + React Island

### Overview

The `/deck` Astro page mounts a React island (`DeckView`) that fetches the user's cards, renders the list, and handles per-card edit and delete interactions without a full page reload.

### Changes Required

#### 1. Deck island component

**File**: `src/components/deck/DeckView.tsx`

**Intent**: Render the full deck management experience — card list, per-card edit mode, and delete confirmation — in a single React island following the established auth form pattern.

**Contract**:

Default export `function DeckView()`.

On mount (`useEffect`): `GET /api/cards` (see item 3 below) → set `cards` state.

Per-card state machine (local to each card entry, no global state manager needed):
- `idle` — shows front/back text + Edit and Delete buttons.
- `editing` — shows front/back textareas pre-populated with current values + Save and Cancel buttons; Save calls `PATCH /api/cards/<id>`.
- `confirm-delete` — shows a confirmation prompt ("Delete this card? This cannot be undone.") + Confirm and Cancel buttons; Confirm calls `DELETE /api/cards/<id>`.

On successful PATCH: update the card in local `cards` array, return card to `idle`.
On successful DELETE: remove the card from `cards` array.
On any API error: show `<ServerError message={...} />` inline near the affected card; preserve current state so the user can retry.
Empty state: when `cards` is empty, show a message directing the user to `/generate`.

#### 2. List cards endpoint

**File**: `src/pages/api/cards/index.ts`

**Intent**: Return all accepted flashcards belonging to the current user, ordered newest-first.

**Contract**:

- Export `export const GET: APIRoute`.
- Guard `if (!supabase)` → 500; guard `if (!user)` → 401.
- `supabase.from("flashcards").select("id, front, back, created_at").order("created_at", { ascending: false })` — RLS scopes to the current user automatically.
- Return `{ cards: [...] }` with 200.

#### 3. Deck page

**File**: `src/pages/deck.astro`

**Intent**: Protected Astro page that mounts the deck island.

**Contract**: Reads `Astro.locals.user` (middleware handles redirect). Renders `<Layout title="My Deck">` containing `<DeckView client:load />`.

#### 4. Add `/deck` to PROTECTED_ROUTES

**File**: `src/middleware.ts`

**Intent**: Redirect unauthenticated users who visit `/deck` to sign-in.

**Contract**: Add `"/deck"` to the `PROTECTED_ROUTES` array.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes (React Compiler zero errors).
- `pnpm run build` exits 0.

#### Manual Verification

- Visiting `/deck` while signed out redirects to `/auth/signin`.
- After signing in, the deck page lists all accepted cards.
- Clicking Edit on a card shows editable textareas; clicking Save persists the change and returns to idle view.
- Clicking Edit then Cancel returns to idle without saving.
- Clicking Delete shows the confirmation prompt; clicking Confirm removes the card from the list.
- Clicking Delete then Cancel returns to idle with card intact.
- Emptying either field and saving shows an error (400 from API); card remains editable.
- Empty deck state shows a prompt linking to `/generate`.

**Implementation Note**: Pause here for final manual confirmation of the complete flow.

---

## Testing Strategy

### Automated

- `pnpm run lint` after each phase.
- `pnpm run build` after Phase 2.

### Manual Testing Steps

1. Sign in; navigate to `/deck` — verify existing cards appear.
2. Edit a card: change front text, click Save — verify update persists after refresh.
3. Edit a card: clear the back field, click Save — verify 400 error shown inline.
4. Edit a card: click Cancel — verify no change.
5. Delete a card: click Delete → Confirm — verify card disappears; verify row gone in Supabase Studio.
6. Delete a card: click Delete → Cancel — verify card remains.
7. Sign out; navigate to `/deck` — verify redirect to `/auth/signin`.

## References

- PRD: `context/foundation/prd.md` — FR-007, FR-008
- Roadmap: `context/foundation/roadmap.md` — S-03 deck-edit-delete
- Prerequisite plan: `context/changes/first-gated-generation/plan.md` (S-01; S-02 plan to follow)
- Auth island pattern: `src/components/auth/SignInForm.tsx`
- Supabase client: `src/lib/supabase.ts`
- Middleware: `src/middleware.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API Endpoints

#### Automated

- [x] 1.1 `pnpm run lint` passes after endpoints added — 1cb5df9
- [x] 1.2 `pnpm run build` succeeds — 1cb5df9

#### Manual

- [x] 1.3 PATCH returns 200 with updated card; change visible in Supabase Studio — 1cb5df9
- [x] 1.4 PATCH with blank field returns 400 — 1cb5df9
- [x] 1.5 PATCH without auth returns 401 — 1cb5df9
- [x] 1.6 DELETE returns 204; row removed from Supabase Studio — 1cb5df9
- [x] 1.7 DELETE on another user's card returns 404 — 1cb5df9

### Phase 2: Deck Page + React Island

#### Automated

- [x] 2.1 `pnpm run lint` passes (React Compiler zero errors)
- [x] 2.2 `pnpm run build` exits 0

#### Manual

- [x] 2.3 Unauthenticated visit to `/deck` redirects to `/auth/signin`
- [x] 2.4 Deck page lists all accepted cards
- [x] 2.5 Edit → Save persists change
- [x] 2.6 Edit → Cancel leaves card unchanged
- [x] 2.7 Delete → Confirm removes card
- [x] 2.8 Delete → Cancel leaves card intact
- [x] 2.9 Blank field save shows inline error; card remains editable
- [x] 2.10 Empty deck shows prompt linking to `/generate`
