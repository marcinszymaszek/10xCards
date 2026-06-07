-- S-01 (first-gated-generation): persists AI-generated card candidates
-- before a user accepts or rejects them. `generation_session_id` groups all
-- cards from a single POST to /api/generate so S-02 can accept/reject by batch.
create table flashcard_drafts (
  id                    uuid        not null default gen_random_uuid() primary key,
  user_id               uuid        not null references auth.users (id) on delete cascade,
  front                 text        not null,
  back                  text        not null,
  state                 text        not null default 'pending'
                                    check (state in ('pending', 'accepted', 'rejected')),
  generation_session_id uuid        not null,
  created_at            timestamptz not null default now()
);

alter table flashcard_drafts enable row level security;

create policy "Users manage their own drafts"
  on flashcard_drafts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
