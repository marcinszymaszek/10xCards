# Deck View with Per-Card Edit and Delete — Plan Brief

> Full plan: `context/changes/deck-edit-delete/plan.md`

## What & Why

Users who have accepted AI-generated cards (via S-02) need a place to view their deck and correct cards that landed with wrong or imprecise text. This slice adds the `/deck` page with a card list and per-card edit and delete actions, completing the card management loop before the SRS review session (S-04) is built.

## Starting Point

S-02 delivers a `flashcards` table (id, user_id, front, back, created_at) with RLS. The auth system, React island pattern, and middleware route guard are all established. No `/deck` page or card mutation endpoints exist yet.

## Desired End State

`/deck` is a protected page showing all of the user's accepted cards. Each card can be edited (front/back textareas, explicit Save) or deleted (confirmation step required). Both actions call REST API endpoints. Unauthenticated visits redirect to sign-in.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Save mode | Explicit save button (not auto-save) | PRD FR-007 requires explicit save to protect review history integrity |
| Delete | Confirmation prompt, hard delete | PRD FR-008 requires confirmation; soft-delete is v2 scope |
| State management | Per-card local state in React (idle/editing/confirm-delete) | No global state manager needed for a flat list of independent items |
| Empty state | Message + link to `/generate` | Guides user back into the generation flow when deck is empty |
| Pagination | None for MVP | Single-user MVP; deck size manageable without it |

## Scope

**In scope:** `GET /api/cards` (list), `PATCH /api/cards/[id]` (edit), `DELETE /api/cards/[id]` (delete); `DeckView.tsx` React island; `/deck` Astro page; `/deck` added to `PROTECTED_ROUTES`.

**Out of scope:** Soft-delete, undo, bulk actions, auto-save, pagination, `/review` route protection (S-04).

## Architecture / Approach

`DeckView` React island fetches cards on mount via `GET /api/cards`, renders a list, and handles edit/delete state transitions locally per card. API endpoints rely on Supabase RLS for ownership — no manual user_id filtering in application code. Same file (`src/pages/api/cards/[id].ts`) exports both PATCH and DELETE handlers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API Endpoints | PATCH + DELETE for individual cards; GET list | RLS must correctly block cross-user access |
| 2. Deck Page + React Island | `/deck` page with full edit/delete UX | React Compiler ESLint rule is error-level |

**Prerequisites:** S-02 (`atomic-save-to-deck`) must be shipped — `flashcards` table must exist.
**Estimated effort:** ~1–2 coding sessions across 2 phases.

## Open Risks & Assumptions

- `flashcards` table schema is assumed from S-02 context; adjust field names if S-02 delivers different column names.
- RLS policy on `flashcards` must cover UPDATE and DELETE operations (not just SELECT/INSERT); verify when S-02 migration is written.

## Success Criteria (Summary)

- An authenticated user can view, edit, and delete their flashcards from `/deck`.
- Edits persist after page refresh; deleted cards are permanently gone.
- Unauthenticated visit to `/deck` redirects to sign-in.
