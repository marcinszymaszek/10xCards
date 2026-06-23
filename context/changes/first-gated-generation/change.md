---
change_id: first-gated-generation
title: First gated generation — paste produces persisted candidate drafts
status: impl_reviewed
created: 2026-06-06
updated: 2026-06-23
archived_at: null
---

## Notes

Roadmap slice S-01 from `context/foundation/roadmap.md`. Outcome: a signed-in learner navigates to `/generate`, pastes text within the 10,000-character cap, picks a preferred card count, clicks "Generate", and sees candidate cards rendered — each already persisted as a `FlashcardDraft` row with `state: pending` so a refresh doesn't lose them. Prerequisites: F-01 (done). PRD refs: US-01 (first half), FR-006, FR-007, FR-008, FR-009.
