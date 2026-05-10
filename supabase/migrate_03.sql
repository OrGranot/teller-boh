-- Add personal info fields to profiles
alter table profiles
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists birthdate date;
