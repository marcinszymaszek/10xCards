---
change_id: deck-edit-delete
title: Deck view with per-card edit and delete
status: implementing
created: 2026-06-06
updated: 2026-06-06
archived_at: null
---

## Notes

Roadmap slice S-03 from `context/foundation/roadmap.md`. Outcome: a signed-in user navigates to `/deck`, sees all their accepted flashcards listed, can edit the front or back of any card (explicit save, not auto-save), and can delete a card after a confirmation step. Prerequisites: S-02 (atomic-save-to-deck) — cards must exist in the `flashcards` table before this page has anything to show. PRD refs: FR-007, FR-008. Parallel with S-04 (srs-review-session).
