-- EasyBOH Schema
-- Run this in Supabase SQL editor

-- Drop old tables (clean slate)
drop table if exists time_records cascade;
drop table if exists department_members cascade;
drop table if exists departments cascade;
drop table if exists invitations cascade;
drop table if exists restaurant_members cascade;
drop table if exists roles cascade;
drop table if exists restaurants cascade;
drop table if exists profiles cascade;
drop table if exists employees cascade;

-- Drop old teller-clock functions if any
drop function if exists is_restaurant_member cascade;
drop function if exists has_permission cascade;
drop function if exists handle_new_user cascade;

-- Profiles (extends auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz default now()
);

-- Restaurants
create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Custom roles per restaurant
-- permissions keys:
--   can_invite, can_approve_invitations, can_approve_shifts,
--   can_edit_shifts, can_view_all_shifts, can_manage_departments, can_manage_roles
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  is_owner boolean default false,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Restaurant members (profile ↔ restaurant, with role + contract)
create table if not exists restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role_id uuid not null references roles(id),
  salary numeric,
  hours_per_week numeric,
  contract_start date,
  contract_end date,
  created_at timestamptz default now(),
  unique(restaurant_id, profile_id)
);

-- Departments
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Department members (profile ↔ department)
create table if not exists department_members (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  is_manager boolean default false,
  created_at timestamptz default now(),
  unique(department_id, profile_id)
);

-- Invitations
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  department_id uuid references departments(id),
  role_id uuid references roles(id),
  email text not null,
  name text,
  salary numeric,
  hours_per_week numeric,
  contract_start date,
  status text not null default 'pending_approval',
  -- 'pending_approval' | 'approved' | 'sent' | 'accepted'
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now()
);

-- Time records (shifts)
create table if not exists time_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  department_id uuid references departments(id),
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  status text not null default 'active',
  -- 'active' | 'pending' | 'approved' | 'rejected'
  edited_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- ─── RLS ───────────────────────────────────────────────

alter table profiles enable row level security;
alter table restaurants enable row level security;
alter table roles enable row level security;
alter table restaurant_members enable row level security;
alter table departments enable row level security;
alter table department_members enable row level security;
alter table invitations enable row level security;
alter table time_records enable row level security;

-- Helper: is the current user a member of this restaurant?
create or replace function is_restaurant_member(rid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from restaurant_members
    where restaurant_id = rid and profile_id = auth.uid()
  );
$$;

-- Helper: does the current user have a permission in this restaurant?
create or replace function has_permission(rid uuid, perm text)
returns boolean language sql security definer as $$
  select exists (
    select 1 from restaurant_members rm
    join roles r on r.id = rm.role_id
    where rm.restaurant_id = rid
      and rm.profile_id = auth.uid()
      and (r.is_owner = true or (r.permissions->>perm)::boolean = true)
  );
$$;

-- Profiles
create policy "Users can read own profile" on profiles for select using (id = auth.uid());
create policy "Users can update own profile" on profiles for update using (id = auth.uid());
create policy "Users can insert own profile" on profiles for insert with check (id = auth.uid());
-- Members of same restaurant can see each other's profiles
create policy "Restaurant members can see each other" on profiles for select using (
  exists (
    select 1 from restaurant_members rm1
    join restaurant_members rm2 on rm1.restaurant_id = rm2.restaurant_id
    where rm1.profile_id = auth.uid() and rm2.profile_id = profiles.id
  )
);

-- Restaurants
create policy "Members can read their restaurant" on restaurants for select
  using (is_restaurant_member(id));

-- Roles
create policy "Members can read their restaurant roles" on roles for select
  using (is_restaurant_member(restaurant_id));
create policy "Owners can manage roles" on roles for all
  using (has_permission(restaurant_id, 'can_manage_roles'));

-- Restaurant members
create policy "Members can read fellow members" on restaurant_members for select
  using (is_restaurant_member(restaurant_id));
create policy "Owners can manage members" on restaurant_members for all
  using (has_permission(restaurant_id, 'can_manage_roles'));

-- Departments
create policy "Members can read departments" on departments for select
  using (is_restaurant_member(restaurant_id));
create policy "Managers can manage departments" on departments for all
  using (has_permission(restaurant_id, 'can_manage_departments'));

-- Department members
create policy "Members can read dept members" on department_members for select
  using (
    exists (
      select 1 from departments d
      where d.id = department_members.department_id
        and is_restaurant_member(d.restaurant_id)
    )
  );

-- Invitations
create policy "Can view invitations for own restaurant" on invitations for select
  using (is_restaurant_member(restaurant_id));
create policy "Can create invitations with invite permission" on invitations for insert
  with check (has_permission(restaurant_id, 'can_invite'));
create policy "Owners can approve invitations" on invitations for update
  using (has_permission(restaurant_id, 'can_approve_invitations'));

-- Time records
create policy "Users can read own time records" on time_records for select
  using (profile_id = auth.uid());
create policy "Users can insert own active record" on time_records for insert
  with check (profile_id = auth.uid());
create policy "Managers can read restaurant time records" on time_records for select
  using (has_permission(restaurant_id, 'can_view_all_shifts'));
create policy "Managers can update shifts" on time_records for update
  using (has_permission(restaurant_id, 'can_edit_shifts'));

-- ─── Triggers ───────────────────────────────────────────

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
