---
change_id: srs-review-session
title: Spaced repetition review session with binary rating
status: impl_reviewed
created: 2026-06-24
updated: 2026-06-25
archived_at: null
---

## Notes

Roadmap slice S-04 (`context/foundation/roadmap.md`): user can start a spaced repetition review session over their accepted cards, rate each card as "knew it" / "didn't know it", and have the review schedule advance accordingly per FSRS. PRD refs: US-01, FR-009, FR-010.

- **Prerequisites:** S-02 (`atomic-save-to-deck`) — already shipped, so this slice is unblocked.
- **Parallel with:** S-03 (`deck-edit-delete`) — already shipped, no conflict expected.
- **Unknown to resolve before/during planning:** FSRS library integration — confirm the chosen library works in the Cloudflare Workers runtime (Node.js compat layer). Flagged in the roadmap as the main open question for this slice.
- **Risk:** Per the PRD guardrail, the review session must remain functional even when AI generation is unavailable — review must not depend on AI/OpenRouter uptime. Binary rating only for MVP (no graded Again/Hard/Good/Easy); graded mode is parked for v2.
- **Roadmap status at time of creation:** `proposed`, not yet planned.

Note: `context/foundation/tasks-github.md` was referenced as a file to keep in mind for this change, but it does not currently exist in the repo — nothing to incorporate from it yet.

External FSRS library research (exa.ai) is in [`srs-library-research.md`](./srs-library-research.md) — recommends `ts-fsrs`.
