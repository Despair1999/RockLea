-- Rebuild derived record caches; preserve original matches, registrations and pairing.
ALTER TABLE guilds ADD COLUMN record_rebuild_pending boolean NOT NULL DEFAULT false;
UPDATE guilds SET record_rebuild_pending=true;
-- Valid speed records may outlive detailed event retention. Keep these measurements.
DELETE FROM automatic_records r WHERE metric NOT IN ('FastestGoal','StrongestBallHit') OR NOT EXISTS (
  SELECT 1 FROM matches m WHERE m.id=r.match_id AND m.ended_at IS NOT NULL
  AND m.state->>'status'='complete' AND m.state->>'sawEnd'='true'
  AND m.state->>'winner' IN ('0','1') AND COALESCE(m.state->'game'->>'bReplay','false')<>'true'
);
DELETE FROM personal_records r WHERE metric NOT IN ('FastestGoal','StrongestBallHit') OR NOT EXISTS (
  SELECT 1 FROM matches m WHERE m.id=r.match_id AND m.ended_at IS NOT NULL
  AND m.state->>'status'='complete' AND m.state->>'sawEnd'='true'
  AND m.state->>'winner' IN ('0','1') AND COALESCE(m.state->'game'->>'bReplay','false')<>'true'
);
DELETE FROM notifications WHERE kind='record' AND sent_at IS NULL;
