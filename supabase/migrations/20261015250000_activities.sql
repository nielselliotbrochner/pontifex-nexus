-- Fase 3: aktiviteter (møder, research, nyheder m.m.), deltagere, emner og filer.
-- Delt lag: alle medlemmer læser og redigerer. Valgfrit 'private': kun skaberen ser aktiviteten.

create table public.activity_type (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  is_system boolean not null default false
);
alter table public.activity_type enable row level security;
create policy activity_type_read on public.activity_type for select to authenticated using (private.is_member());
create policy activity_type_ins on public.activity_type for insert to authenticated with check (private.is_owner());
create policy activity_type_upd on public.activity_type for update to authenticated using (private.is_owner()) with check (private.is_owner());
create policy activity_type_del on public.activity_type for delete to authenticated using (private.is_owner() and not is_system);

insert into public.activity_type (code, name, sort_order, is_system) values
 ('meeting','Møde',1,true),('call','Opkald',2,true),('email','Mail',3,true),
 ('research','Research',4,true),('news','Nyhed',5,true),('note','Note',6,true);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.activity_type(id),
  occurred_on date not null default current_date,
  title text not null check (btrim(title) <> ''),
  body text,
  source_url text,
  visibility text not null default 'shared' check (visibility in ('shared','private')),
  created_by uuid default auth.uid() references public.app_user(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activity_date_idx on public.activity (occurred_on desc);

-- Deltagere (personer). company_id er den virksomhed personen repræsenterede på dagen.
create table public.activity_participant (
  activity_id uuid not null references public.activity(id) on delete cascade,
  contact_id uuid not null references public.contact(id) on delete cascade,
  company_id uuid references public.company(id) on delete set null,
  note text,
  primary key (activity_id, contact_id)
);
create index activity_participant_contact_idx on public.activity_participant (contact_id);
create index activity_participant_company_idx on public.activity_participant (company_id);

-- Emne-virksomheder uden deltager (fx en nyhed om en virksomhed).
create table public.activity_company (
  activity_id uuid not null references public.activity(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  primary key (activity_id, company_id)
);
create index activity_company_company_idx on public.activity_company (company_id);

-- Emne-personer uden deltagelse (fx research om en person man ikke har mødt).
create table public.activity_subject (
  activity_id uuid not null references public.activity(id) on delete cascade,
  contact_id uuid not null references public.contact(id) on delete cascade,
  primary key (activity_id, contact_id)
);
create index activity_subject_contact_idx on public.activity_subject (contact_id);

create table public.activity_file (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity(id) on delete cascade,
  path text not null unique,
  file_name text not null,
  mime text,
  size_bytes bigint,
  created_by uuid default auth.uid() references public.app_user(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index activity_file_activity_idx on public.activity_file (activity_id);

create trigger activity_touch before update on public.activity for each row execute function private.touch();
create trigger activity_lock before update on public.activity for each row execute function private.lock_creator();

alter table public.activity enable row level security;
create policy activity_read on public.activity for select to authenticated
  using (private.is_member() and (visibility = 'shared' or created_by = (select auth.uid())));
create policy activity_ins on public.activity for insert to authenticated
  with check (private.is_member() and created_by = (select auth.uid()));
create policy activity_upd on public.activity for update to authenticated
  using (private.is_member() and (visibility = 'shared' or created_by = (select auth.uid())))
  with check (private.is_member() and (visibility = 'shared' or created_by = (select auth.uid())));
create policy activity_del on public.activity for delete to authenticated
  using (private.is_owner() or (private.is_member() and created_by = (select auth.uid())));

-- Børnetabeller følger forælderens synlighed (RLS på activity gælder i underforespørgslen).
do $$
declare t text;
begin
  foreach t in array array['activity_participant','activity_company','activity_subject','activity_file'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (private.is_member() and exists (select 1 from public.activity a where a.id = activity_id)) with check (private.is_member() and exists (select 1 from public.activity a where a.id = activity_id))', t||'_all', t);
  end loop;
  foreach t in array array['activity','activity_participant','activity_company','activity_subject','activity_file'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit()', t||'_audit', t);
  end loop;
end $$;

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare j jsonb; o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then o := to_jsonb(old); j := o;
  elsif tg_op = 'INSERT' then n := to_jsonb(new); j := n;
  else o := to_jsonb(old); n := to_jsonb(new); j := n; end if;
  insert into public.audit_log (user_id, table_name, row_id, action, old_row, new_row)
  values ((select auth.uid()), tg_table_name,
          coalesce(j->>'id', concat_ws('/', j->>'activity_id', j->>'contact_id', j->>'company_id', j->>'branch_id', j->>'group_id')),
          tg_op, o, n);
  return null;
end $$;
revoke execute on function private.audit() from public, anon, authenticated;

revoke all on all tables in schema public from anon;

-- Filer: privat lagerbøtte. Sti: <activity_id>/<filnavn>. Adgang følger aktivitetens synlighed.
insert into storage.buckets (id, name, public, file_size_limit)
values ('activity-files', 'activity-files', false, 26214400)
on conflict (id) do nothing;

create policy activity_files_read on storage.objects for select to authenticated
  using (bucket_id = 'activity-files' and private.is_member()
         and exists (select 1 from public.activity a where a.id::text = (storage.foldername(name))[1]));
create policy activity_files_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-files' and private.is_member()
         and exists (select 1 from public.activity a where a.id::text = (storage.foldername(name))[1]));
create policy activity_files_del on storage.objects for delete to authenticated
  using (bucket_id = 'activity-files' and private.is_member()
         and exists (select 1 from public.activity a where a.id::text = (storage.foldername(name))[1]));
