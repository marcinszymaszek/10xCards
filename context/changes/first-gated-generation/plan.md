# First Gated Generation Implementation Plan

## Overview

Implement the S-01 slice: a signed-in user navigates to `/generate`, pastes up to 10 000 characters of source text, picks a card count (1–20), clicks "Generate", and sees all AI-produced candidate cards rendered on the same page — each already persisted as a `FlashcardDraft` row with `state: pending` so a browser refresh loses nothing.

## Current State Analysis

The authentication system (Supabase email/password, middleware, API routes) and the React island infrastructure (FormField, SubmitButton, ServerError primitives, client:load pattern) are complete. What is entirely absent:

- **No database schema**: `supabase/migrations/` doesn't exist; no `flashcard_drafts` table.
- **No AI SDK**: `@anthropic-ai/sdk` is not in `package.json`.
- **No `/generate` page or API endpoint**.
- **`/generate` is not in `PROTECTED_ROUTES`** (F-01 gated `/dashboard` only).

## Desired End State

`/generate` is a protected page. An authenticated user can paste text, choose a count, click Generate, and see a read-only list of front/back card pairs. Every rendered card is a `flashcard_drafts` row in Supabase with `state: pending`. Refreshing the page does **not** re-trigger generation; the cards are already persisted. Unauthenticated visits redirect to `/auth/signin`.

### Key Discoveries

- `src/middleware.ts:3` — `PROTECTED_ROUTES = ["/dashboard"]`; add `/generate` here.
- `src/lib/supabase.ts` — `createSupabaseServerClient()` returns `null` when env vars absent; all API routes must guard with `if (!supabase)`.
- `astro.config.mjs` — env schema uses `envField.string({ context: "server", access: "secret", optional: true })`; `ANTHROPIC_API_KEY` must follow the same pattern.
- `wrangler.jsonc` — `nodejs_compat` flag already present; required for the Anthropic SDK's use of Node crypto.
- React Compiler ESLint rule is set to `error`; all hooks usage must pass the compiler.
- `src/components/auth/` pattern: one React island file per page, mounts via `<Component client:load />` in the Astro page, uses `useFormStatus()` for submit state.

## What We're NOT Doing

- Accept/reject/edit per card — that is S-02 (`atomic-save-to-deck`).
- `decks` table, `flashcards` (accepted) table, SRS scheduling — those come in S-02 and beyond.
- Streaming AI response via SSE — buffered JSON for MVP.
- Document import (PDF, DOCX, URL) — text paste only.
- Manual card creation — not part of this slice.
- `/deck` and `/review` route protection — added when those pages are built.
- `card-and-srs-schema` change folder — schema work is absorbed into this plan; that folder can be closed.

## Implementation Approach

Four sequential phases: schema first (nothing works without it), then the API endpoint (validates schema + SDK integration), then the React island (validates API integration), then the page + middleware wiring (validates the full flow).

## Critical Implementation Details

**`crypto.randomUUID()` in Workers**: Available as a global — no import needed. Use it server-side in the API route to generate `generation_session_id` once per POST request, not per card.

**Anthropic SDK in Cloudflare Workers**: Initialise with `new Anthropic({ apiKey: ANTHROPIC_API_KEY })` where `ANTHROPIC_API_KEY` is imported from `"astro:env/server"`. Do NOT use `process.env` — that is not how secrets surface in the Workers runtime when configured via `astro:env`.

**AI JSON parsing**: Ask the model to return only a JSON array; the model may still wrap output in markdown fences (` ```json … ``` `). Strip fences before calling `JSON.parse`. Treat any parse failure as a generation error — respond with 500 and a user-friendly message.

**Return card IDs**: The API must return each card's `id` (UUID from the database). S-02 needs these IDs to update `state` from `pending` to `accepted`/`rejected`.

---

## Phase 1: Database Schema

### Overview

Create the `flashcard_drafts` table with row-level security so each user can only read and write their own rows.

### Changes Required

#### 1. Supabase migration file

**File**: `supabase/migrations/0001_flashcard_drafts.sql`

**Intent**: Define the `flashcard_drafts` table that persists AI-generated card candidates before a user accepts or rejects them.

**Contract**:

```sql
CREATE TABLE flashcard_drafts (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front                TEXT        NOT NULL,
  back                 TEXT        NOT NULL,
  state                TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (state IN ('pending', 'accepted', 'rejected')),
  generation_session_id UUID       NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE flashcard_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own drafts"
  ON flashcard_drafts
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

The `generation_session_id` groups all cards from a single POST to `/api/generate`, enabling S-02 to accept/reject by batch.

### Success Criteria

#### Automated Verification

- Migration applies without errors: `pnpm exec supabase db reset` (local) exits 0.
- `pnpm run lint` passes after migration is in place.

#### Manual Verification

- Supabase Studio (`http://localhost:54323`) shows `flashcard_drafts` with the correct columns and RLS enabled.
- An insert attempt with a mismatched `user_id` is rejected by the RLS policy.
- An authenticated insert with a matching `user_id` succeeds.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: AI Generation API

### Overview

Install the Anthropic SDK, register the API key in the env schema, and implement the POST endpoint that validates input, calls the AI, persists results, and returns the card array.

### Changes Required

#### 1. Install Anthropic SDK

**File**: `package.json`

**Intent**: Add `@anthropic-ai/sdk` as a runtime dependency.

**Contract**: Run `npm install @anthropic-ai/sdk`. No version pin required beyond semver default; `nodejs_compat` in `wrangler.jsonc` already satisfies the SDK's Node API requirements.

#### 2. Register `ANTHROPIC_API_KEY` in env schema

**File**: `astro.config.mjs`

**Intent**: Declare the AI API key as a server-only secret so astro:env validates its presence and makes it importable.

**Contract**: Add one entry to the existing `env.schema` object:

```js
ANTHROPIC_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
```

Mirror the `SUPABASE_URL` and `SUPABASE_KEY` entries exactly.

#### 3. Add `ANTHROPIC_API_KEY` to local dev secrets

**File**: `.dev.vars`

**Intent**: Make the key available during `pnpm run dev` (Cloudflare workerd runtime reads `.dev.vars`).

**Contract**: Add the line `ANTHROPIC_API_KEY=<your-key>` to `.dev.vars`. This is a manual step; the file is git-ignored.

#### 4. Generation API endpoint

**File**: `src/pages/api/generate.ts`

**Intent**: Accept a source text and card count from an authenticated user, call Claude Haiku to generate front/back pairs, persist all pairs as `flashcard_drafts` rows in a single insert, and return the persisted cards including their database IDs.

**Contract**:

- Export `export const POST: APIRoute`.
- Request body: JSON `{ text: string, count: number }`.
- Guard `if (!supabase)` — return 500 if Supabase client is null.
- Guard `if (!user)` — return 401 if no authenticated session.
- Validate `text`: required, `text.length ≤ 10000` (return 400 with `{ error: "Text exceeds 10 000 character limit" }` if over).
- Validate `count`: integer, `1 ≤ count ≤ 20` (return 400 with `{ error: "Count must be between 1 and 20" }` if invalid).
- Generate `const sessionId = crypto.randomUUID()`.
- Construct Anthropic messages call: model `"claude-haiku-4-5-20251001"`, temperature 0, max_tokens 4096; system prompt instructs the model to respond with ONLY a JSON array of `{front: string, back: string}` objects; user message is the source text with the requested count.
- Strip markdown fences from the response content before parsing; catch JSON parse errors and return 500.
- Insert all cards via `supabase.from("flashcard_drafts").insert(cards.map(...))`.
- Return `{ cards: [{id, front, back, state}] }` with status 200.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes (type errors and React Compiler checks).
- `pnpm run build` succeeds (requires env vars; use `.dev.vars` + `.env`).

#### Manual Verification

- POST to `/api/generate` with a valid auth cookie and a short text returns `{ cards: [...] }` with the expected array.
- Each returned card appears in Supabase Studio `flashcard_drafts` table with `state: pending` and matching `generation_session_id`.
- POST without auth cookie returns 401.
- POST with `text` exceeding 10 000 characters returns 400.
- POST with `count` outside 1–20 returns 400.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: React Generation Island

### Overview

Build the `GenerationView` island: a textarea, count input, generate button, and result card list — all in one React component following the auth island pattern.

### Changes Required

#### 1. Generation island component

**File**: `src/components/generate/GenerationView.tsx`

**Intent**: Encapsulate the full client-side generation interaction — form input, submission, loading feedback, result display, and error recovery — in a single React island.

**Contract**:

Default export `function GenerationView()`.

Internal state:
- `text: string` — source textarea value, starts empty.
- `count: number` — card count, starts at 5.
- `status: 'idle' | 'loading' | 'success' | 'error'` — starts `'idle'`.
- `cards: { id: string; front: string; back: string; state: string }[]` — starts `[]`.
- `errorMessage: string | null` — starts `null`.

Behaviour:
- Textarea: `value={text}`, `onChange` updates `text`; show a live counter `{text.length} / 10 000` that turns red when `text.length > 10000`.
- Count input: `type="number"`, `min={1}`, `max={20}`, `value={count}`.
- Generate button: disabled when `text.trim().length === 0 || text.length > 10000 || status === 'loading'`; on click, set status to `'loading'`, POST to `/api/generate` with `{ text, count }`, update state on response.
- On 200 response: set `status = 'success'`, set `cards` from response.
- On error response: set `status = 'error'`, set `errorMessage` from response body or generic fallback; leave `text` and `count` intact.
- Error display: render `<ServerError message={errorMessage} />` above the form when `status === 'error'`.
- Cards display: when `status === 'success'`, render a list below the form; each card shows `front` and `back` in a visually distinct pair (two labelled text blocks); no interactive controls (S-02 adds those).
- Reuse `SubmitButton` and `ServerError` from `@/components/auth/` if the props contract fits; otherwise inline equivalent markup.

### Success Criteria

#### Automated Verification

- `pnpm run lint` passes — React Compiler rule must produce zero errors.

#### Manual Verification

- Char counter updates on every keystroke; turns red above 10 000.
- Generate button is disabled when textarea is empty or over cap.
- Clicking Generate shows a loading/pending state on the button.
- A successful response renders the card list below the form.
- A simulated API error (e.g., temporarily break the endpoint) shows the error banner; textarea content is preserved.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: /generate Page + Middleware

### Overview

Wire everything together: create the Astro page, mount the island, and add `/generate` to the protected routes list.

### Changes Required

#### 1. Generate page

**File**: `src/pages/generate.astro`

**Intent**: Create the protected `/generate` route that mounts the generation island.

**Contract**: SSR Astro page; reads `Astro.locals.user` (populated by middleware — no additional auth check needed in the page itself). Renders `<Layout title="Generate Flashcards">` containing `<GenerationView client:load />`.

#### 2. Protect `/generate` in middleware

**File**: `src/middleware.ts`

**Intent**: Ensure unauthenticated requests to `/generate` are redirected to sign-in.

**Contract**: Add `"/generate"` to the `PROTECTED_ROUTES` array at line 3. No other changes to the middleware.

### Success Criteria

#### Automated Verification

- `pnpm run build` exits 0.
- `pnpm run lint` passes.

#### Manual Verification

- Visiting `/generate` while signed out redirects to `/auth/signin`.
- After signing in, the user lands on the generate page and sees the form.
- End-to-end flow works: paste text → set count → click Generate → see card list → refresh page → card list is gone (form is back in idle state, but cards remain in Supabase).

**Implementation Note**: Pause here for final manual confirmation of the complete flow.

---

## Testing Strategy

### Automated (lint + type-check only — no test framework configured)

- `pnpm run lint` must pass after each phase.
- `pnpm run build` must pass after Phase 4 (requires env vars).

### Manual Testing Steps

1. Sign in with a test account.
2. Navigate to `/generate`.
3. Paste 200–500 characters of text; verify counter increments.
4. Paste 10 001+ characters; verify counter turns red and Generate button is disabled.
5. Set count to 5, click Generate; verify loading state appears.
6. Verify cards appear with front and back text.
7. Open Supabase Studio → `flashcard_drafts`; verify rows exist with `state: pending` and the correct `user_id` and `generation_session_id`.
8. Refresh the page; verify the form returns to idle (no auto-re-generation).
9. Sign out; attempt to visit `/generate` directly; verify redirect to `/auth/signin`.

## Migration Notes

First migration in the project. Apply locally with `pnpm exec supabase db reset`. For the remote Supabase cloud project, apply via Supabase dashboard SQL editor or `pnpm exec supabase db push`.

## References

- PRD: `context/foundation/prd.md` — FR-003, FR-004, US-01
- Roadmap: `context/foundation/roadmap.md` — S-01 first-gated-generation
- Infrastructure risk register: `context/foundation/infrastructure.md`
- Auth island pattern: `src/components/auth/SignInForm.tsx`
- Supabase client factory: `src/lib/supabase.ts`
- Middleware route guard: `src/middleware.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database Schema

#### Automated

- [x] 1.1 `pnpm exec supabase db reset` exits 0 with migration applied — 6ebc2c4

#### Manual

- [x] 1.2 `flashcard_drafts` table visible in Supabase Studio with RLS enabled — 6ebc2c4
- [x] 1.3 Insert with mismatched user_id is rejected by RLS policy — 6ebc2c4

### Phase 2: AI Generation API

#### Automated

- [x] 2.1 `pnpm run lint` passes after endpoint is added — 79a60a5
- [ ] 2.2 `pnpm run build` succeeds

#### Manual

- [ ] 2.3 POST to `/api/generate` with valid auth returns 200 with cards array
- [ ] 2.4 Cards appear in Supabase Studio with `state: pending`
- [ ] 2.5 Unauthenticated POST returns 401
- [ ] 2.6 Over-cap text returns 400
- [ ] 2.7 Out-of-range count returns 400

### Phase 3: React Generation Island

#### Automated

- [x] 3.1 `pnpm run lint` passes (React Compiler zero errors) — 79a60a5

#### Manual

- [ ] 3.2 Char counter updates live; turns red above 10 000
- [ ] 3.3 Generate button disabled when empty or over cap
- [ ] 3.4 Loading state shows during API call
- [ ] 3.5 Card list renders on success
- [ ] 3.6 Error banner shows on failure; form values preserved

### Phase 4: /generate Page + Middleware

#### Automated

- [ ] 4.1 `pnpm run build` exits 0
- [x] 4.2 `pnpm run lint` passes — 79a60a5

#### Manual

- [ ] 4.3 Unauthenticated visit to `/generate` redirects to `/auth/signin`
- [ ] 4.4 Full end-to-end flow works: paste → generate → card list visible
- [ ] 4.5 Cards persist in Supabase after page refresh
