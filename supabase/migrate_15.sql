-- Inspector flag: full permissions (via owner role), hidden from the Team page list
alter table restaurant_members add column if not exists is_inspector boolean not null default false;
