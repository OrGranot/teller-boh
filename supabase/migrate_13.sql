-- OTP-based password reset codes (replaces link-based reset that fails on iOS)
create table password_reset_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code       text not null,
  expires_at timestamptz not null,
  used       boolean not null default false,
  created_at timestamptz default now()
);

create index idx_reset_codes_email on password_reset_codes(email, used, expires_at);
