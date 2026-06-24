CREATE TABLE review_states (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  flashcard_id    UUID NOT NULL REFERENCES flashcards (id) ON DELETE CASCADE,
  due             TIMESTAMPTZ NOT NULL,
  stability       DOUBLE PRECISION NOT NULL,
  difficulty      DOUBLE PRECISION NOT NULL,
  elapsed_days    INTEGER NOT NULL,
  scheduled_days  INTEGER NOT NULL,
  learning_steps  INTEGER NOT NULL,
  reps            INTEGER NOT NULL,
  lapses          INTEGER NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('New', 'Learning', 'Review', 'Relearning')),
  last_review     TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, flashcard_id)
);

ALTER TABLE review_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own review states"
  ON review_states
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
