-- Run this in your Supabase SQL Editor

-- Company settings (single row)
create table if not exists company_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  display_name text,
  address text not null default '',
  phone text,
  vat text,
  tax text,
  iban text,
  bic text,
  email text,
  logo_url text,
  updated_at timestamptz default now()
);

-- Contacts
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  email text,
  phone text,
  notes text,
  created_at timestamptz default now()
);

-- Item catalog
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2),
  vat_rate numeric(5,2) default 7,
  created_at timestamptz default now()
);

-- Invoice counter (single row, id must always be 1)
create table if not exists invoice_counter (
  id integer primary key default 1,
  last_number integer not null default 1034
);
insert into invoice_counter (id, last_number) values (1, 1034) on conflict (id) do nothing;

-- Invoices
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number integer not null unique,
  date text not null,
  due_date text,
  customer_name text not null,
  customer_address text,
  tip_percent numeric(5,2) default 0,
  lang text default 'de',
  status text default 'draft',
  total numeric(10,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Invoice line items
create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  qty numeric(10,2),
  description text,
  price numeric(10,2),
  vat_rate numeric(5,2) default 7,
  sort_order integer default 0
);

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- Require authentication for all tables

alter table company_settings enable row level security;
alter table contacts enable row level security;
alter table catalog_items enable row level security;
alter table invoice_counter enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;

-- company_settings
create policy "auth users can read company_settings" on company_settings for select using (auth.uid() is not null);
create policy "auth users can insert company_settings" on company_settings for insert with check (auth.uid() is not null);
create policy "auth users can update company_settings" on company_settings for update using (auth.uid() is not null);

-- contacts
create policy "auth users can all contacts" on contacts for all using (auth.uid() is not null);

-- catalog_items
create policy "auth users can all catalog_items" on catalog_items for all using (auth.uid() is not null);

-- invoice_counter
create policy "auth users can read counter" on invoice_counter for select using (auth.uid() is not null);
create policy "auth users can update counter" on invoice_counter for update using (auth.uid() is not null);

-- invoices
create policy "auth users can all invoices" on invoices for all using (auth.uid() is not null);

-- invoice_items
create policy "auth users can all invoice_items" on invoice_items for all using (auth.uid() is not null);

-- ── Supabase Storage ──────────────────────────────────────────────────────────
-- Create a public "logos" bucket in Storage (do this in the Supabase dashboard
-- or uncomment the line below if using supabase CLI):
-- insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict do nothing;

-- ── Seed company settings ────────────────────────────────────────────────────
insert into company_settings (name, display_name, address, phone, vat, tax, iban, bic, email)
values (
  'Belhans & Shuva GbR',
  'Teller Berlin',
  'Pappelallee 29, 10437 Berlin',
  '+4915166245222',
  'DE367026042',
  '31/223/00739',
  'DE48100701000349420000',
  'DEUTDEBB101',
  'hello@tellerberlin.com'
) on conflict do nothing;
