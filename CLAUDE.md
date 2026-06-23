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

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
