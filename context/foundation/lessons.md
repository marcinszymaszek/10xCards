# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Apply the Inclusion Test Before Adding Any Agent Rule

- **Context**: Any phase that writes to rules-for-AI files (CLAUDE.md, AGENTS.md)
- **Problem**: Agent fills rules-for-AI files with framework defaults and generic advice the agent already knows, wasting context budget.
- **Rule**: Before adding a line to CLAUDE.md or AGENTS.md, ask: could the agent know this from public training data? If yes, drop it.
- **Applies to**: all

## Give Every Feature Flag a Kill Date

- **Context**: Any plan or implement phase that introduces a feature flag
- **Problem**: Flags accumulate indefinitely, creating dead code paths and conditional logic that nobody dares remove.
- **Rule**: Every feature flag must include a kill date (comment or ticket reference). Flag and removal must be planned at the same time the flag is introduced.
- **Applies to**: plan, implement, impl-review
