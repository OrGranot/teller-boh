-- Yearly vacation entitlement per employee
alter table restaurant_members
  add column if not exists vacation_days_per_year integer;
