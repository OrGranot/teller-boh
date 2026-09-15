-- Shift change requests: employees can request time corrections or new shifts
create table shift_change_requests (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id),
  restaurant_id   uuid not null references restaurants(id),
  shift_id        uuid references time_records(id) on delete cascade,
  requested_in    timestamptz not null,
  requested_out   timestamptz not null,
  reason          text not null,
  status          text not null default 'pending',
  reviewed_by     uuid references profiles(id),
  reviewed_at     timestamptz,
  created_at      timestamptz default now()
);

alter table shift_change_requests enable row level security;

create policy "Users can read own requests" on shift_change_requests for select
  using (profile_id = auth.uid());
create policy "Users can create own requests" on shift_change_requests for insert
  with check (profile_id = auth.uid());
create policy "Managers can read requests" on shift_change_requests for select
  using (has_permission(restaurant_id, 'can_view_all_shifts'));
create policy "Managers can update requests" on shift_change_requests for update
  using (has_permission(restaurant_id, 'can_edit_shifts'));
