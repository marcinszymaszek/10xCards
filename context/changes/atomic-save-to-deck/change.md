---
change_id: atomic-save-to-deck
title: Accept/reject AI candidates and atomically save to deck
status: implemented
created: 2026-06-09
updated: 2026-06-13
archived_at: null
---

## Notes

S-02 from the roadmap. Builds directly on S-01 (`first-gated-generation`): the generate API and `flashcard_drafts` schema are already in place. The `flashcards` table also already exists (from S-03's ahead-of-schedule implementation). S-02's job is to wire the accept/reject/edit UI and the atomic promotion step that moves accepted drafts into the permanent deck.
