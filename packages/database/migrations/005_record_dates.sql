ALTER TABLE automatic_records ADD COLUMN achieved_at timestamptz;
UPDATE automatic_records r SET achieved_at=COALESCE(m.ended_at,m.started_at) FROM matches m WHERE m.id=r.match_id;
ALTER TABLE personal_records ADD COLUMN achieved_at timestamptz;
UPDATE personal_records r SET achieved_at=COALESCE(m.ended_at,m.started_at) FROM matches m WHERE m.id=r.match_id;
