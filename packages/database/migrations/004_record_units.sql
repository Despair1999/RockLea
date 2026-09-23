ALTER TABLE automatic_records ADD COLUMN unit text NOT NULL DEFAULT 'count';
ALTER TABLE personal_records ADD COLUMN unit text NOT NULL DEFAULT 'count';
