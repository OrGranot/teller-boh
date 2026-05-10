-- Prevent duplicate shifts: same employee cannot have two records with the same clock-in time
alter table time_records
  add constraint time_records_unique_profile_clocked_in
  unique (profile_id, clocked_in_at);
