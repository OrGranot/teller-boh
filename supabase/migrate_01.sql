-- Migration 01: Fix RLS for shift clock-in/out and profile editing

-- Allow users to clock out their own active shifts
-- (previously only managers could update time_records)
create policy "Users can update own shift" on time_records for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Allow users to update their own profile (e.g. change name)
-- (policy may already exist, using IF NOT EXISTS workaround)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'profiles' and policyname = 'Users can update own profile'
  ) then
    execute 'create policy "Users can update own profile" on profiles for update using (id = auth.uid())';
  end if;
end $$;
