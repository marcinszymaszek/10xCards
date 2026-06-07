-- Foundational `flashcards` table. This should have shipped with S-02
-- (atomic-save-to-deck), but S-02 was never implemented even though S-03
-- (deck-edit-delete) and later work already assumed the table existed.
-- Stopgap: create it now with the schema deck-edit-delete assumed, plus the
-- `origin` column needed to distinguish AI-generated from manually-entered cards.
-- S-02's full draft-to-deck promotion flow remains to be planned and built.
create table flashcards (
  id         uuid        not null default gen_random_uuid() primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  front      text        not null,
  back       text        not null,
  origin     text        not null default 'manual' check (origin in ('ai', 'manual')),
  created_at timestamptz not null default now()
);

alter table flashcards enable row level security;

create policy "Users manage their own flashcards"
  on flashcards
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
