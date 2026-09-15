-- Multiple business profiles per restaurant
alter table company_settings add column if not exists label text;
alter table company_settings add column if not exists is_default boolean not null default false;

-- Mark existing rows as default
update company_settings set is_default = true where is_default = false;

-- Link invoices to a specific business profile
alter table invoices add column if not exists company_settings_id uuid references company_settings(id);
