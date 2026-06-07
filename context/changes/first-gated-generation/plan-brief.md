# First Gated Generation — Plan Brief

> Full plan: `context/changes/first-gated-generation/plan.md`

## What & Why

A signed-in learner should be able to paste source text, pick a card count, click Generate, and see AI-produced front/back card candidates immediately — with every candidate already persisted in the database so a refresh doesn't lose them. This is S-01: the first end-to-end proof that the AI generation path works before the accept/reject interaction (S-02) is built on top.

## Starting Point

Authentication is complete (Supabase email/password, middleware, API routes). There is no database schema for flashcards, no AI SDK installed, no `/generate` page, and no generation API endpoint. The middleware only gates `/dashboard`.

## Desired End State

`/generate` is a protected page. An authenticated user pastes text (up to 10 000 chars), sets a count (1–20, default 5), clicks Generate, and sees a read-only list of front/back card pairs. Each card is a `flashcard_drafts` row in Supabase (`state: pending`). Unauthenticated visits redirect to sign-in.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| AI provider | Direct `@anthropic-ai/sdk` | Roadmap specifies `anthropic/claude-haiku-4-5`; fewer moving parts than OpenRouter for MVP | Plan |
| Schema ownership | Included in this change | S-01 can't work without the table; keeping it in the same PR avoids a blocking inter-change dependency | Plan |
| AI response format | Buffered JSON (all cards, then return) | Simpler client code; atomic DB insert before responding; 30s Workers timeout is not a risk at Haiku speeds | Plan |
| Card count UI | Numeric input, 1–20, default 5 | Matches PRD's "picks a count" intent without over-constraining | Plan |
| Error handling | Banner + preserve form | Follows existing `ServerError` pattern; user doesn't lose their pasted text | Plan |
| Text cap enforcement | 10 000 chars, client + server | Client UX (counter + disable) plus server 400 to prevent abuse | Plan |
| Post-generation display | Read-only card list | Clean slice boundary; S-02 adds accept/reject on top | Plan |
| Middleware scope | Add only `/generate` | Gate routes when pages exist; `/deck` and `/review` added in their respective slices | Plan |

## Scope

**In scope:** `flashcard_drafts` table + RLS migration; POST `/api/generate` endpoint; `GenerationView` React island; `/generate` Astro page; `/generate` added to `PROTECTED_ROUTES`.

**Out of scope:** Accept/reject interaction (S-02); `flashcards`, `decks`, SRS tables; streaming AI response; manual card creation; `/deck` and `/review` route protection.

## Architecture / Approach

Standard Astro SSR + React island pattern. The Astro page at `/generate` mounts `<GenerationView client:load />`. The island POSTs to `/api/generate` (an Astro API route), which validates input, calls the Anthropic SDK (initialized with `ANTHROPIC_API_KEY` from `astro:env/server`), parses the JSON card array, bulk-inserts all rows into `flashcard_drafts` (one insert per generation request, grouped by `generation_session_id`), and returns the persisted cards with their UUIDs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database Schema | `flashcard_drafts` table with RLS | First migration; must apply cleanly to local and remote Supabase |
| 2. AI Generation API | POST `/api/generate` — validates, calls Haiku, persists, returns cards | AI JSON parsing fragility; model may wrap output in markdown fences |
| 3. React Generation Island | `GenerationView.tsx` — full form + result UX | React Compiler ESLint rule is error-level; all hooks must pass |
| 4. /generate Page + Middleware | Astro page + route protection | Build must pass with env vars present |

**Prerequisites:** Local Supabase running (`npx supabase start`); `.dev.vars` populated with `SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY`.

**Estimated effort:** ~2–3 coding sessions across 4 phases.

## Open Risks & Assumptions

- The 10 000-character cap is assumed from the change notes; if the PRD intends a different limit, adjust in Phase 2 validation and Phase 3 counter.
- AI response may return fewer cards than requested (e.g., sparse source text); the plan handles this by accepting whatever the model returns rather than erroring.
- `@anthropic-ai/sdk` works in Cloudflare Workers with `nodejs_compat` (already set) — verified via infrastructure doc.

## Success Criteria (Summary)

- An authenticated user can paste text, click Generate, and see a read-only card list — all within one page visit.
- Every rendered card is visible in Supabase Studio as a `flashcard_drafts` row with `state: pending` and the correct `user_id`.
- Unauthenticated visit to `/generate` redirects to sign-in; over-cap or over-count requests return 400.
