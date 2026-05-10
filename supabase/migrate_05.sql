-- Add balance-tracking columns to restaurant_members
alter table restaurant_members
  add column if not exists days_per_week  integer,
  add column if not exists vacation_days  numeric(5, 1) not null default 0,
  add column if not exists sick_days      numeric(5, 1) not null default 0;
