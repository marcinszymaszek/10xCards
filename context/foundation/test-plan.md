# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-25 (Phase 1 change opened)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   developer is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|--------------------------|--------|------------|--------------------------------|
| 1 | "Save" promotes accepted candidates but a card is lost, duplicated, or the deck is left partially written | High | High | interview Q1; hot-spot dir `src/pages/api` (19 commits/30d); PRD data-durability NFR |
| 2 | A change to route gating/middleware exposes a protected product route or drops a valid session | High | High | interview Q2 (burned before); hot-spot dir `src/middleware.ts` (5 commits/30d), `src/components/auth` (6) |
| 3 | (abuse — IDOR) A user reads, edits, or deletes another user's card or review; login is verified but ownership is not | High | Medium | PRD Access Control ("own cards only"); per-user endpoint surface (`cards/[id]`, `review/[id]`) |
| 4 | Candidate review loses an individual accept/reject decision when a bulk action runs | Medium | High | interview Q3; hot-spot dir `src/components/generate` (12 commits/30d — highest file churn); 3 recent S-06 bulk-action fix commits |
| 5 | OpenRouter is down/slow or returns malformed JSON, and generation hangs or persists garbage instead of a clean error | Medium | Medium | hot-spot dir `src/pages/api` (`generate` — 6 commits/30d); PRD 10s-latency NFR |
| 6 | (abuse — untrusted input) Over-cap text, out-of-range count, or malformed body bypasses the client and reaches the LLM or DB | Medium | Medium | PRD generation rule (text cap); existing server-side guards in the generate/promote write paths (evidence the boundary matters) |

**Impact × Likelihood rubric.** Score both axes on a coarse High / Medium /
Low scale so two readers agree on the same row.

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

High × High protected first (Risks #1, #2). The abuse rows (#3, #6) are
required by the security lens — the product has auth and accepts user-pasted
text, so ownership and input-parity scenarios are in scope even though they
did not surface from the happy-path interview.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | After Save, every accepted card appears in the deck exactly once (re-queried, not just the returned `saved` count); rejected/pending drafts absent from the deck; a double-submit/retry does not duplicate cards | Atomicity is *answered* (research: one plpgsql RPC = one transaction). Now challenge **idempotency** ("a retry/double-click won't re-insert") and **id↔draft linkage** ("`accepted` content is trusted without verifying each id is a pending draft in the session") | The idempotency of the promote RPC and whether the INSERT is guarded by draft state; whether `saved` reflects matched drafts vs. payload length | integration (handler + local Supabase) | asserting only the returned `saved` count without re-querying `flashcards`; forced-rollback test (low signal — transaction already guarantees it); happy-path-only |
| #2 | An unauthenticated request to a product route redirects/401s; a valid session reaches it | "Login works ⇒ gating works" — middleware order and `PROTECTED_ROUTES` membership | Middleware entry point, redirect-vs-401 contract, the protected-path list | integration (middleware + route handler) | testing one route and assuming the list; mirroring the route array in the assertion |
| #3 | User A cannot GET/PUT/DELETE User B's card or review (gets 403/404, never B's data) | "Authenticated ⇒ authorized" — is ownership enforced by RLS or an explicit query filter? | Whether ownership is enforced (RLS policy vs. query filter) on the per-user resource endpoints | integration (two-user fixtures) | only testing the owner path; assuming RLS without exercising the cross-user request |
| #4 | After individual accept/reject decisions, a bulk accept/reject preserves prior individual decisions where intended | "Bulk action is a simple map over all candidates" — does it clobber per-card state? | The candidate state model and how bulk actions fold over individual decisions | component (React Testing Library) | snapshot-without-meaning; asserting render output instead of decision state |
| #5 | A malformed/empty/error model response yields a clean 4xx/5xx and persists nothing | "Non-200 from OpenRouter still got handled" — does it write partial drafts on parse failure? | The parse → validate → persist path and what happens when parsing fails | integration (mocked OpenRouter edge) | testing only valid JSON; oracle copied from the parser's own output |
| #6 | Over-cap text / out-of-range count / malformed body returns 4xx before any LLM call or DB write | `generate` validation already holds (research). Live gap is the **promote write path**: no length cap on front/back, no `accepted` array-size cap, no DB CHECK — over-cap content reaches the deck | The server-side guards on the **promote** request body (the under-guarded path) vs. `generate`; what caps the deck write enforces | handler-level (generate: fetch-spy, no DB needed; promote caps: handler + local Supabase) | re-asserting the client's validation; skipping the "no side-effect occurred" check; testing only `generate` and assuming `promote` is equally guarded |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Bootstrap + save-to-deck integrity | Stand up the test runner; prove accepted candidates land in the deck exactly once and invalid writes are rejected before persistence | #1, #6 | unit + integration | researched | context/changes/testing-bootstrap-save-to-deck-integrity/ |
| 2 | Auth gating + cross-user authorization | Protected routes reject the unauthenticated; no user can touch another's card or review | #2, #3 | integration | not started | — |
| 3 | Generation resilience | A failed or garbage LLM response yields a clean error and persists nothing | #5 | integration | not started | — |
| 4 | Candidate-review UI behavior | Bulk actions preserve individual accept/reject decisions | #4 | component | not started | — |

**Status vocabulary** (fixed — parser literals):

| Value | Meaning |
|-------|---------|
| `not started` | No change folder for this rollout phase yet. |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched` | `research.md` exists in the change folder. |
| `planned` | `plan.md` exists with a `## Progress` section. |
| `implementing` | Progress section has at least one `[x]` and at least one `[ ]`. |
| `complete` | Progress section is fully `[x]`. |

Order rationale: Risk #1 is the data-integrity guardrail (highest priority)
and also forces the runner bootstrap because the test base is `none`. Phase 2
establishes the security floor on the highest-churn directory. Phase 3
protects the core AI path's failure mode. Phase 4 covers the highest-churn UI
file but lands last because its impact is recoverable (the user can
regenerate) and it introduces a separate component-test layer.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest (recommended) | none yet — see Phase 1 | No runner configured; Phase 1 bootstraps it. Astro-native; pairs with Vite already in the stack. |
| API / network mocking | MSW (recommended) | none yet — see Phase 3 | Mock the OpenRouter HTTP edge only; never mock internal modules. |
| DB fixtures | local Supabase | n/a | Integration tests for #1/#3 need a real Postgres + RLS — use `supabase start` (see README), not a mock. |
| e2e | Playwright | none yet — optional | Not required by any current phase; only if a redirect/cookie flow can't be proven at integration level. |
| component | React Testing Library | none yet — see Phase 4 | For GenerationView candidate-state behavior (#4). |
| (optional) AI-native | not used | n/a | No vision/AI-native layer justified under cost × signal for the current risk set. |

If a row reads "none yet — see Phase N", that gap is addressed by the named
rollout phase.

**Stack grounding tools (current session):**
- Docs: Context7 MCP — available; use to ground Vitest/MSW/Playwright/Supabase test setup and FSRS scheduling APIs at plan time; checked: 2026-06-25
- Search: Exa MCP — available; use to confirm current Astro 6 + Vitest integration guidance and Cloudflare Workers test-runner support; checked: 2026-06-25
- Runtime/browser: Playwright MCP — not available in current session; e2e remains optional and unblocked by it; checked: 2026-06-25
- Provider/platform: Supabase (local CLI per README) — relevant for RLS/ownership fixtures in Phases 1–2; no GitHub/Cloudflare MCP used; checked: 2026-06-25

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout phase
lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local (pre-commit) + CI | required (already wired — Husky + lint-staged, GitHub Actions) | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | save/promote integrity, auth, validation regressions |
| component tests | local + CI | required after §3 Phase 4 | candidate-review state regressions |
| e2e on critical flows | CI on PR | optional | broken critical user paths the integration layer can't prove |
| pre-prod smoke | between merge + prod | optional | environment-specific failures (Cloudflare Workers runtime) |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, the sub-section reads "TBD — see
§3 Phase N."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 (Vitest bootstrap).

### 6.2 Adding an integration test

- TBD — see §3 Phase 1 for the save-to-deck integrity pattern (accepted-candidate exactly-once / no-partial-write) and the server-side validation-parity pattern.

### 6.3 Adding an e2e test

- TBD — optional; no current phase requires it (see §4).

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 2 for the auth-gating and cross-user (IDOR) authorization patterns on per-user resource endpoints.

### 6.5 Adding a test for the generation / LLM path

- TBD — see §3 Phase 3 for the malformed/error-response → clean-error, persist-nothing pattern (mock the OpenRouter edge only).

### 6.6 Adding a component test for candidate review

- TBD — see §3 Phase 4 for the bulk-action decision-preservation pattern.

### 6.7 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Static landing / marketing pages** — copy and layout, low blast radius, breaks tests constantly and catches little. Re-evaluate if a landing page gains interactive or auth-gated behavior. (Source: Phase 2 interview Q5.)
- **Supabase auth SDK internals** — sign-in/up/out mechanics are the library's responsibility; test our gating and ownership logic, not the SDK. Re-evaluate if we add a custom auth flow. (Source: Phase 2 interview Q5 + scope.)
- **Exact LLM-generated card content** — non-deterministic; assert structure and failure handling, never specific wording. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-25
- Stack versions last verified: 2026-06-25
- AI-native tool references last verified: 2026-06-25

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
