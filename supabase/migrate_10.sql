-- Helper: find an auth user UUID by email, including soft-deleted rows.
-- Supabase soft-deletes auth users (sets deleted_at) instead of removing them,
-- so the email stays locked and createUser fails with "Database error".
-- This function queries auth.users directly (security definer) to find any
-- matching row regardless of deleted_at, so the join route can call
-- updateUserById instead of createUser when the email is "in use".
create or replace function get_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
$$;

-- Grant execution to the service role only (admin client uses this)
grant execute on function get_auth_user_id_by_email(text) to service_role;

-- Helper: delete auth.identities rows for a given email.
-- auth.identities is what actually locks an email for re-use — Supabase keeps it
-- separate from auth.users and doesn't clean it up on soft-delete.
create or replace function delete_auth_identity_by_email(p_email text)
returns void
language sql
security definer
set search_path = auth, public
as $$
  delete from auth.identities where lower(email) = lower(p_email);
$$;

grant execute on function delete_auth_identity_by_email(text) to service_role;
