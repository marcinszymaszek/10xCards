CREATE OR REPLACE FUNCTION promote_generation_session(
  p_session_id UUID,
  p_accepted   JSONB   -- [{id: uuid, front: text, back: text}, ...]
)
RETURNS INTEGER        -- count of flashcards inserted
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 1. Insert accepted drafts into permanent deck
  INSERT INTO flashcards (user_id, front, back, origin)
  SELECT
    auth.uid(),
    (item->>'front')::TEXT,
    (item->>'back')::TEXT,
    'ai'
  FROM jsonb_array_elements(p_accepted) AS item;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 2. Mark those drafts as accepted
  UPDATE flashcard_drafts
  SET state = 'accepted'
  WHERE id IN (
    SELECT (item->>'id')::UUID FROM jsonb_array_elements(p_accepted) AS item
  )
    AND user_id               = auth.uid()
    AND generation_session_id = p_session_id;

  -- 3. Mark any remaining pending drafts in the session as rejected
  UPDATE flashcard_drafts
  SET state = 'rejected'
  WHERE generation_session_id = p_session_id
    AND user_id = auth.uid()
    AND state   = 'pending';

  RETURN v_count;
END;
$$;
