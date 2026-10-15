-- RLS, rettigheder og audit-log.

alter table public.app_user enable row level security;
create policy app_user_read on public.app_user for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member());
create policy app_user_upd on public.app_user for update to authenticated
  using (private.is_owner()) with check (private.is_owner());
create policy app_user_del on public.app_user for delete to authenticated
  using (private.is_owner());

-- Delte tabeller med created_by: alle medlemmer læser og redigerer, sletter gør skaberen eller ejeren.
do $$
declare t text;
begin
  foreach t in array array['contact','company','company_location','contact_company','company_group'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member())', t||'_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_member() and created_by = (select auth.uid()))', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_member()) with check (private.is_member())', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.is_owner() or (private.is_member() and created_by = (select auth.uid())))', t||'_del', t);
  end loop;
  -- Delte børnetabeller uden created_by: alle medlemmer
  foreach t in array array['company_branch','company_group_member'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (private.is_member()) with check (private.is_member())', t||'_all', t);
  end loop;
  -- Referencedata: medlemmer læser, ejer skriver
  foreach t in array array['branch','postcode'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member())', t||'_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (private.is_owner()) with check (private.is_owner())', t||'_write', t);
  end loop;
  -- Privat lag: kun ejeren af rækken
  foreach t in array array['contact_relation','company_relation','person_link'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (private.is_member() and owner_id = (select auth.uid())) with check (private.is_member() and owner_id = (select auth.uid()))', t||'_own', t);
  end loop;
end $$;

-- Audit-log: kun triggere skriver, kun ejeren læser.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (private.is_owner());
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare j jsonb; o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then
    o := to_jsonb(old); j := o;
  elsif tg_op = 'INSERT' then
    n := to_jsonb(new); j := n;
  else
    o := to_jsonb(old); n := to_jsonb(new); j := n;
  end if;
  insert into public.audit_log (user_id, table_name, row_id, action, old_row, new_row)
  values ((select auth.uid()), tg_table_name,
          coalesce(j->>'id', concat_ws('/', j->>'company_id', j->>'branch_id', j->>'group_id')),
          tg_op, o, n);
  return null;
end $$;
revoke execute on function private.audit() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['contact','company','company_location','contact_company','company_branch',
                           'company_group','company_group_member'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit()', t||'_audit', t);
  end loop;
end $$;
