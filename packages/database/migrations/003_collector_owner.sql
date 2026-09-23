ALTER TABLE pairing_codes ADD COLUMN owner_member_id uuid REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE collectors ADD COLUMN owner_member_id uuid REFERENCES members(id) ON DELETE SET NULL;
