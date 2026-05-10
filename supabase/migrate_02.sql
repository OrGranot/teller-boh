-- Add expires_at to invitations (7 days from creation by default)
alter table invitations
  add column if not exists expires_at timestamptz not null default now() + interval '7 days';

-- Backfill existing rows: treat created_at + 7 days as the expiry
update invitations
  set expires_at = created_at + interval '7 days'
  where expires_at = now() + interval '7 days'; -- only rows that just got the default
