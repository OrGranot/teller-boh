-- migrate_11.sql
-- Multiple contracts per employee
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE member_contracts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            uuid        NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  restaurant_id         uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  valid_from            date        NOT NULL,
  valid_until           date,                  -- NULL = currently active
  hours_per_week        numeric,
  days_per_week         integer,
  vacation_days_per_year integer,
  salary                numeric,
  sick_days             integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_contracts_dates_check CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX member_contracts_profile_idx    ON member_contracts (profile_id);
CREATE INDEX member_contracts_restaurant_idx ON member_contracts (restaurant_id);

ALTER TABLE member_contracts ENABLE ROW LEVEL SECURITY;

-- Any restaurant member can read contracts for their restaurant
CREATE POLICY "restaurant members read contracts"
  ON member_contracts FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM restaurant_members WHERE profile_id = auth.uid()
    )
  );

-- Only owners can insert
CREATE POLICY "owners insert contracts"
  ON member_contracts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurant_members rm
      JOIN roles r ON r.id = rm.role_id
      WHERE rm.restaurant_id = member_contracts.restaurant_id
        AND rm.profile_id    = auth.uid()
        AND r.is_owner       = true
    )
  );

-- Only owners can update
CREATE POLICY "owners update contracts"
  ON member_contracts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_members rm
      JOIN roles r ON r.id = rm.role_id
      WHERE rm.restaurant_id = member_contracts.restaurant_id
        AND rm.profile_id    = auth.uid()
        AND r.is_owner       = true
    )
  );

-- Only owners can delete
CREATE POLICY "owners delete contracts"
  ON member_contracts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_members rm
      JOIN roles r ON r.id = rm.role_id
      WHERE rm.restaurant_id = member_contracts.restaurant_id
        AND rm.profile_id    = auth.uid()
        AND r.is_owner       = true
    )
  );

-- ── Migrate existing data ─────────────────────────────────────────────────────
-- One contract per employee who has hours_per_week set.
-- Employees without hours data get no contract row (owner must add one).
INSERT INTO member_contracts (
  profile_id, restaurant_id,
  valid_from, valid_until,
  hours_per_week, days_per_week, vacation_days_per_year,
  salary, sick_days,
  created_at
)
SELECT
  profile_id,
  restaurant_id,
  COALESCE(contract_start::date, created_at::date),
  NULL,                                    -- currently active
  hours_per_week,
  days_per_week,
  vacation_days_per_year,
  salary,
  COALESCE(sick_days::integer, 0),
  now()
FROM restaurant_members
WHERE hours_per_week IS NOT NULL
ON CONFLICT DO NOTHING;
