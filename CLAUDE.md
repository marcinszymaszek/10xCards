# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: 10xCards

AI-powered flashcard app. Astro 6 + React 19 islands, Supabase auth (email/password), Cloudflare Workers deployment. Single-developer MVP; AI generation (FR-003/FR-004) not yet implemented.

Key docs: @README.md · @context/foundation/prd.md · @context/foundation/tech-stack.md

## Conventions

- **Import alias:** use `@/` for everything under `src/` (e.g. `@/lib/supabase`, `@/components/auth/SignInForm`)
- **Supabase client is nullable:** `createSupabaseServerClient()` returns `null` when env vars are absent — always guard before use
- **Route protection:** add entries to the `PROTECTED_ROUTES` array in `@src/middleware.ts`, not inside individual pages
- **React Compiler is mandatory:** `react-compiler/react-compiler` is set to ESLint `error` — all React code must pass React 19 Compiler checks
- **Tailwind v4 uses Vite plugin**, not PostCSS — don't add a PostCSS config

## Gotchas

- `pnpm exec astro sync` must run before type checking if `.astro/types.d.ts` is missing or stale
- `pnpm run build` fails without `SUPABASE_URL` and `SUPABASE_KEY` — copy `.env.example` → `.env` and populate
- Pre-commit gate (Husky + lint-staged) blocks commits with lint errors; run `pnpm run lint:fix` first
- Vite is pinned to `^7.3.2` in `package.json` `pnpm.overrides` — don't remove this pin when upgrading deps
- No test framework configured; pre-commit linting is the only automated quality gate
- **Package manager:** pnpm only — do not use `npm` or `yarn`; a `packageManager` field enforces this

## Commands

| Command | Use |
|---------|-----|
| `pnpm run dev` | Astro dev server with Cloudflare workerd runtime |
| `pnpm run lint` | Full type-aware ESLint (slow — runs tsc) |
| `pnpm run lint:fix` | Auto-fix ESLint violations + Prettier format |
| `pnpm run build` | Production build (requires env vars — see Gotchas) |
| `pnpm exec astro sync` | Regenerate Astro types — run if imports break |

---

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
