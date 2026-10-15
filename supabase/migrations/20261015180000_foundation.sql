-- Fundament: schema private, adgangshjælpere, opslagslister, delt lag, privat lag, views.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Brugere med adgang. Første bruger bliver ejer, alle senere er inaktive til ejeren aktiverer dem.
create table public.app_user (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('owner','member')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_user where user_id = (select auth.uid()) and active)
$$;

create function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_user where user_id = (select auth.uid()) and active and role = 'owner')
$$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  select count(*) into n from public.app_user;
  insert into public.app_user (user_id, display_name, role, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email),
          case when n = 0 then 'owner' else 'member' end, n = 0);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.normalize_linkedin(u text) returns text
language sql immutable set search_path = '' as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(u)), '^https?://', ''),
          '^(www|[a-z]{2})\.(linkedin\.com)', '\2'),
        '[?#].*$', ''),
      '/+$', ''),
    '')
$$;

create function private.touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create function private.lock_creator() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; end if;
  return new;
end $$;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_member(), private.is_owner() to authenticated;

-- Simple opslagslister (udvides af ejeren)
do $$
declare t text;
begin
  foreach t in array array['level','job_function','acquaintance','affiliation_type','sector',
                           'group_role','person_link_type','stage'] loop
    execute format('create table public.%I (
      id uuid primary key default gen_random_uuid(),
      code text not null unique,
      name text not null unique,
      sort_order int not null default 0,
      active boolean not null default true,
      is_system boolean not null default false)', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member())', t||'_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_owner())', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_owner()) with check (private.is_owner())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.is_owner() and not is_system)', t||'_del', t);
  end loop;
end $$;

-- Brancher (træ med to niveauer) og postnumre
create table public.branch (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.branch(id) on delete restrict,
  code text not null unique,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  is_system boolean not null default false
);
create unique index branch_name_uq on public.branch (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.postcode (
  postal_code text primary key check (postal_code ~ '^[0-9]{4}$'),
  city text not null,
  municipality text,
  region text
);

-- Delt lag
create table public.contact (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text,
  email text check (email is null or position('@' in email) > 1),
  phone text,
  linkedin_url text,
  linkedin_norm text generated always as (private.normalize_linkedin(linkedin_url)) stored,
  active boolean not null default true,
  created_by uuid default auth.uid() references public.app_user(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contact_linkedin_uq on public.contact (linkedin_norm) where linkedin_norm is not null;
create index contact_email_idx on public.contact (lower(email));
create index contact_name_idx on public.contact (lower(last_name), lower(first_name));

create table public.company (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  cvr text check (cvr is null or cvr ~ '^[0-9]{8}$'),
  website text,
  sector_id uuid references public.sector(id),
  is_own boolean not null default false,
  active boolean not null default true,
  created_by uuid default auth.uid() references public.app_user(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index company_cvr_uq on public.company (cvr) where cvr is not null;
create index company_name_idx on public.company (lower(name));

create table public.company_location (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  name text,
  is_hq boolean not null default false,
  address text,
  postal_code text,
  city text,
  country char(2) not null default 'DK',
  lat numeric(9,6) check (lat is null or lat between -90 and 90),
  lng numeric(9,6) check (lng is null or lng between -180 and 180),
  active boolean not null default true,
  created_by uuid default auth.uid() references public.app_user(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);
create unique index company_one_hq_uq on public.company_location (company_id) where is_hq;

create table public.contact_company (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contact(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete restrict,
  affiliation_type_id uuid not null references public.affiliation_type(id),
  level_id uuid references public.level(id),
  function_id uuid references public.job_function(id),
  location_id uuid,
  is_primary boolean not null default false,
  start_date date,
  end_date date,
  note text,
  created_by uuid default auth.uid() references public.app_user(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  foreign key (location_id, company_id) references public.company_location(id, company_id)
);
create unique index contact_one_primary_uq on public.contact_company (contact_id) where is_primary and end_date is null;
create index contact_company_company_idx on public.contact_company (company_id);

create table public.company_branch (
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id),
  is_primary boolean not null default false,
  primary key (company_id, branch_id)
);
create unique index company_one_primary_branch_uq on public.company_branch (company_id) where is_primary;

create table public.company_group (
  id uuid primary key default gen_random_uuid(),
  name text,
  note text,
  created_by uuid default auth.uid() references public.app_user(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_group_member (
  group_id uuid not null references public.company_group(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  role_id uuid not null references public.group_role(id),
  note text,
  primary key (group_id, company_id)
);

create function private.one_parent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select code from public.group_role where id = new.role_id) = 'parent'
     and exists (select 1 from public.company_group_member m
                 join public.group_role r on r.id = m.role_id
                 where m.group_id = new.group_id and r.code = 'parent' and m.company_id <> new.company_id) then
    raise exception 'Gruppen har allerede et moderselskab';
  end if;
  return new;
end $$;
create trigger group_one_parent before insert or update on public.company_group_member
  for each row execute function private.one_parent();

-- Privat lag (kun ejer). Peger kun på delte rækker.
create table public.contact_relation (
  owner_id uuid not null default auth.uid() references public.app_user(user_id) on delete cascade,
  contact_id uuid not null references public.contact(id) on delete cascade,
  acquaintance_id uuid references public.acquaintance(id),
  acquainted_since date,
  no_invitation boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, contact_id)
);

create table public.company_relation (
  owner_id uuid not null default auth.uid() references public.app_user(user_id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  stage_id uuid references public.stage(id),
  responsible_contact_id uuid references public.contact(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, company_id)
);

create table public.person_link (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.app_user(user_id) on delete cascade,
  contact_a uuid not null references public.contact(id) on delete cascade,
  contact_b uuid not null references public.contact(id) on delete cascade,
  type_id uuid not null references public.person_link_type(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_a <> contact_b),
  unique (owner_id, contact_a, contact_b, type_id)
);

-- Triggere: updated_at og uforanderlig created_by
do $$
declare t text;
begin
  foreach t in array array['contact','company','company_location','contact_company','company_group',
                           'contact_relation','company_relation','person_link'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch()', t||'_touch', t);
  end loop;
  foreach t in array array['contact','company','company_location','contact_company','company_group'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.lock_creator()', t||'_lock', t);
  end loop;
end $$;

-- Views (kører med den kaldende brugers rettigheder)
create view public.v_contact_overview with (security_invoker = true) as
select c.id as contact_id, c.first_name, c.last_name, c.email, c.phone, c.active,
       cc.company_id, co.name as company_name,
       aff.name as affiliation_type, lv.name as level, lv.sort_order as level_rank, fn.name as job_function,
       coalesce(l.id, hq.id) as location_id,
       coalesce(l.city, hq.city) as city,
       coalesce(l.postal_code, hq.postal_code) as postal_code,
       pc.municipality, pc.region,
       (cc.location_id is null and hq.id is not null) as location_assumed
from public.contact c
left join public.contact_company cc on cc.contact_id = c.id and cc.is_primary and cc.end_date is null
left join public.company co on co.id = cc.company_id
left join public.affiliation_type aff on aff.id = cc.affiliation_type_id
left join public.level lv on lv.id = cc.level_id
left join public.job_function fn on fn.id = cc.function_id
left join public.company_location l on l.id = cc.location_id
left join public.company_location hq on hq.company_id = cc.company_id and hq.is_hq and cc.location_id is null
left join public.postcode pc on pc.postal_code = coalesce(l.postal_code, hq.postal_code);

create view public.v_company_overview with (security_invoker = true) as
select co.id as company_id, co.name, co.cvr, co.is_own, co.active,
       s.name as sector,
       coalesce(pb.name, '') as primary_branch,
       hq.city as hq_city, hq.postal_code as hq_postal_code, pc.region,
       (select count(*) from public.contact_company cc
         where cc.company_id = co.id and cc.end_date is null) as current_contacts
from public.company co
left join public.sector s on s.id = co.sector_id
left join public.company_branch cb on cb.company_id = co.id and cb.is_primary
left join public.branch pb on pb.id = cb.branch_id
left join public.company_location hq on hq.company_id = co.id and hq.is_hq
left join public.postcode pc on pc.postal_code = hq.postal_code;

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
