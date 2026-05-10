-- Allow profiles without auth users (for imported/placeholder employees)
alter table profiles drop constraint if exists profiles_id_fkey;

-- Track whether a profile is a placeholder (no auth account yet)
alter table profiles add column if not exists is_placeholder boolean not null default false;

-- Store placeholder profile ID in invitations so we can migrate data on join
alter table invitations add column if not exists placeholder_profile_id uuid;
