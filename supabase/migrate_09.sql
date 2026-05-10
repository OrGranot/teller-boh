-- Hours adjustments: record overtime payouts that reduce an employee's balance
create table if not exists hours_adjustments (
  id              uuid        primary key default gen_random_uuid(),
  profile_id      uuid        not null references profiles(id)     on delete cascade,
  restaurant_id   uuid        not null references restaurants(id)  on delete cascade,
  hours           numeric(8, 2) not null check (hours > 0),
  note            text,
  adjustment_date date        not null default current_date,
  created_by      uuid        references profiles(id),
  created_at      timestamptz not null default now()
);

alter table hours_adjustments enable row level security;

-- Members of the restaurant can read adjustments for their colleagues
create policy "Members can read adjustments" on hours_adjustments for select
  using (
    exists (
      select 1 from restaurant_members
      where restaurant_members.restaurant_id = hours_adjustments.restaurant_id
        and restaurant_members.profile_id = auth.uid()
    )
  );

-- Only owners can insert / delete adjustments
create policy "Owners can manage adjustments" on hours_adjustments for all
  using (
    exists (
      select 1 from restaurant_members rm
      join roles r on r.id = rm.role_id
      where rm.restaurant_id = hours_adjustments.restaurant_id
        and rm.profile_id = auth.uid()
        and r.is_owner = true
    )
  );
