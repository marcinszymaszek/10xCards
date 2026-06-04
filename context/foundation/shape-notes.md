---
project: "10xCards"
context_type: greenfield
created: 2026-05-27
updated: 2026-05-28
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved: []
  frs_drafted: 10
  quality_check_status: accepted
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 2
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Self-directed adult learners (people studying for courses, certifications, or language acquisition on their own) already know spaced repetition works — the bottleneck is the time cost of authoring high-quality flashcards manually. When a learner has a block of source text in hand, the gap between "I have material" and "I have a study deck" is pure friction: identifying what to card, writing the question, writing the answer, repeating for every concept. That friction is large enough to cause most learners to skip card creation entirely and fall back to passive re-reading, which is less effective.

The insight: existing tools (Anki, Quizlet, Remnote) treat AI generation as an add-on feature to a manual workflow, not as the primary creation path. The AI-to-review pipeline is fragmented — users generate cards in one place, review in another, and the generation quality is too low to accept without heavy manual correction. An app that makes AI generation the first-class path, surfaces the generated cards for fast accept/reject/edit, and feeds accepted cards directly into spaced repetition would close this gap.

## Success Criteria

### Primary
- ≥ 75% of AI-generated flashcard candidates are accepted by the user (with or without edits), measured across all generation sessions in the first cohort.
- ≥ 75% of all flashcards added to a user's deck were created via the AI path (not manual entry), measured by card origin across active users.

### Secondary
- A user can go from pasting raw text to completing their first AI-assisted review session in under 10 minutes on first use.

### Guardrails
- A user's existing cards and review history are never lost due to a bug or system error — data integrity is non-negotiable.
- The review session must remain functional even when AI generation is unavailable — a user with existing cards can always continue reviewing.

## Access Control

Multi-user web app. Users authenticate via email + password only (OAuth deferred to v2). Registration and login are required to access any card or deck data. No role separation for MVP — all authenticated users have equal capabilities (create, view, edit, delete their own cards). No admin panel in scope for MVP.

## User & Persona

**Primary persona: The self-directed learner**
A working adult or student studying on their own schedule — preparing for a certification exam, learning a new programming language, acquiring vocabulary in a foreign language. They are familiar with spaced repetition (at least in concept) and motivated to use it, but have abandoned previous attempts because building and maintaining a card deck is too slow relative to the learning benefit. They have text-heavy source material (articles, documentation, lecture notes, textbook excerpts) and want to convert it into a review-ready deck in minutes, not hours.

## Functional Requirements

> **Deck model (from Socrates round):** A single default deck is created automatically on registration. There is no deck creation, deck list, or deck rename in MVP. Multi-deck support deferred to v2.

### Authentication

- FR-001: User can register an account with email + password. Priority: must-have
  > Socrates: Counter-argument considered: "email+password adds reset/verification
  > overhead — OAuth-only ships faster." Resolution: OAuth dropped instead;
  > email+password only adopted. Single auth method chosen to reduce scope while
  > keeping the app self-contained without third-party dependency.

- FR-002: User can log in with email + password. Priority: must-have
  > Socrates: Counter-argument considered: "supporting both OAuth AND
  > email+password doubles the auth surface." Resolution: OAuth dropped;
  > email+password is the sole auth method for MVP.

### AI Generation

- FR-003: User can paste source text to trigger AI flashcard candidate generation.
  Priority: must-have
  > Socrates: Counter-argument considered: "paste-only limits input to short texts;
  > PDF/DOCX upload covers real-world study material better." Resolution: kept
  > as-is. PDF/DOCX import is explicitly out of MVP scope per non-goals. Copy-paste
  > covers the primary persona's workflow; document upload is a v2 feature.

- FR-004: User can review AI-generated candidates one by one, choosing to accept,
  edit, or reject each. Priority: must-have
  > Socrates: Counter-argument considered: "one-by-one review is slow for large
  > sets — bulk-accept-all with opt-out would be faster and still hit the 75%
  > acceptance criterion." Resolution: kept one-by-one. Deliberate per-card
  > acceptance is the mechanism that produces the quality signal the success
  > criterion measures. Bulk mode deferred to v2.

### Card Management

- FR-005: User can manually create a flashcard (front + back). Priority: must-have
  > Socrates: Counter-argument considered: "a prominent manual path competes with
  > AI-first habit formation — users who default to manual never reach 75% AI
  > usage." Resolution: kept as a fallback for gaps AI misses. UI priority
  > (placement, discoverability) should favour the AI path over manual creation
  > without removing the capability.

- FR-006: User can view all their flashcards. Priority: must-have
  > Socrates: Counter-argument considered: "a card list view is browsing overhead
  > — if the primary loop is generate → review, the list view may be unused."
  > Resolution: kept; users need to audit the deck after generation. This view
  > also provides the entry point for edit and delete actions.

- FR-007: User can edit the front or back text of an existing flashcard.
  Priority: must-have
  > Socrates: Counter-argument considered: "edit without undo silently destroys a
  > card and its SRS history — violates the data-integrity guardrail." Resolution:
  > kept; undo deferred to v2, but edit must use explicit save (not auto-save)
  > to satisfy the data-integrity guardrail.

- FR-008: User can delete a flashcard. Priority: must-have
  > Socrates: Counter-argument considered: "deletion without confirmation
  > permanently removes the card and its SRS history — violates the
  > data-integrity guardrail." Resolution: kept; deletion must include a
  > confirmation step. Soft-delete deferred to v2.

### Review Session

- FR-009: User can start a spaced repetition review session. Priority: must-have
  > Socrates: Counter-argument considered: "per-deck sessions are limiting when
  > multiple decks are due." Resolution: moot — deck model simplified to a single
  > default deck per user. Cross-deck sessions deferred to v2 alongside multi-deck
  > support.

- FR-010: During a review session, user can rate each card as 'knew it' or
  'didn't know it', advancing the card's SRS schedule. Priority: must-have
  > Socrates: Counter-argument considered: "binary rating loses nuance — 'almost
  > knew it' cases land in the same bucket as complete misses, degrading SRS
  > accuracy." Resolution: kept binary for MVP. Simpler UX; graded rating
  > (Again / Hard / Good / Easy) deferred to v2 if SRS quality proves inadequate.

## User Stories

### US-01: AI generation to first review session
**Given** I have pasted an article into the generation form and accepted at least
one AI-generated flashcard candidate
**When** I navigate to start a review session
**Then** the accepted cards are immediately available for review and my first SRS
session begins without additional steps

## Business Logic

**Primary rule — generation:** The app extracts flashcard candidates (each a
front/back pair) from unstructured text the user pastes, deciding what concepts
are worth carding and how to phrase both sides. The user approves, corrects, or
discards each candidate; the app produces the initial proposal without requiring
the user to identify or phrase anything themselves.

**Secondary rule — scheduling:** The app calculates the next review date for each
accepted card based on the user's binary recall rating ('knew it' / 'didn't know
it'). The user rates; the app determines when each card reappears. No manual
scheduling or interval input is required from the user.

## Non-Functional Requirements

- **AI generation latency:** AI flashcard candidates must be returned to the user
  within 10 seconds of text submission for a typical paste. Anything beyond this
  threshold is perceived as a hang, not a load.

- **Data durability:** Accepted cards and their SRS history must not be lost due
  to application bugs, server restarts, or deploys. Commitment: zero card or
  history loss from system-side causes.

- **Review session availability:** A user with existing accepted cards can always
  start and complete a review session regardless of AI service availability.
  Review must not depend on AI uptime.

- **Responsive web:** The application must be usable on a modern smartphone
  browser — no horizontal scrolling, tap targets reachable without zoom. Applies
  to all primary user flows (generation, card list, review session).

## Non-Goals

- **No custom SRS algorithm:** Use a ready-made library (e.g. SM-2, FSRS). Reason:
  custom algorithm is a multi-week research problem unrelated to the core
  differentiator (AI generation quality).

- **No document import (PDF, DOCX, URL):** Text paste only. Reason: file/URL
  parsing adds significant complexity and is out of scope per the original
  idea notes; it is a v2 feature.

- **No deck sharing between users:** Single-user data model only; no public or
  collaborative decks. Reason: sharing requires trust, moderation, and social
  features entirely separate from the generation and review loop.

- **No native mobile app (iOS / Android):** Responsive web only for MVP. Reason:
  App Store / Play Store release cycle would consume the entire 2-week budget
  before any user value is delivered.
