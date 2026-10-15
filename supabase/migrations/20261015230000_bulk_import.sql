-- Bulk-import via staging. Claude lægger rækker fra et regneark i public.import_row og kører private.import_batch.
-- Først som prøvekørsel (p_dry = true: alt rulles tilbage, resultatet vises), derefter rigtigt.
-- Regler: findes posten allerede, udfyldes kun tomme felter. Intet overskrives. Personer matches på LinkedIn, derefter e-mail.
-- Samme navn uden LinkedIn eller e-mail giver action 'review' og oprettes ikke, medmindre rækken har force = ja.
create table public.import_row (
  id bigint generated always as identity primary key,
  batch text not null,
  kind text not null check (kind in ('company', 'contact')),
  data jsonb not null,
  status text not null default 'pending',
  message text,
  result_id uuid,
  created_at timestamptz not null default now()
);
create index import_row_batch_idx on public.import_row (batch, kind, id);
alter table public.import_row enable row level security;
revoke all on public.import_row from anon, authenticated;

create function private.imp_lookup(t text, v text) returns uuid
language plpgsql stable set search_path = '' as $$
declare r uuid; s text := nullif(btrim(v), '');
begin
  if s is null then return null; end if;
  execute format('select id from public.%I where lower(code) = lower(%L) or lower(name) = lower(%L) order by sort_order limit 1', t, s, s) into r;
  if r is null then raise exception 'Ukendt værdi i %: "%"', t, s; end if;
  return r;
end $$;

create function private.imp_branch(v text) returns uuid
language plpgsql stable set search_path = '' as $$
declare s text := nullif(btrim(v), ''); r uuid; n int; par text; chi text;
begin
  if s is null then return null; end if;
  if position('/' in s) > 0 then
    par := btrim(split_part(s, '/', 1)); chi := btrim(split_part(s, '/', 2));
    select b.id into r from public.branch b join public.branch p on p.id = b.parent_id
      where lower(p.name) = lower(par) and lower(b.name) = lower(chi);
  else
    select count(*), min(id::text)::uuid into n, r from public.branch where lower(name) = lower(s) or lower(code) = lower(s);
    if n > 1 then raise exception 'Branchen "%" er tvetydig, skriv Hovedbranche / Branche', s; end if;
  end if;
  if r is null then raise exception 'Ukendt branche: "%"', s; end if;
  return r;
end $$;

create function private.imp_bool(v text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(lower(btrim(v)) in ('ja', 'j', 'yes', 'y', 'true', '1', 'x'), false)
$$;

create function private.import_batch(p_batch text, p_owner uuid, p_dry boolean default true)
returns table (o_row_id bigint, o_kind text, o_action text, o_message text)
language plpgsql set search_path = '' as $$
#variable_conflict use_column
declare
  r record; d jsonb; rep jsonb := '[]'::jsonb;
  act text; msg text; rid uuid;
  v_name text; v_cvr text; v_sector uuid; cid uuid; n int; v_pc text; v_city text; gid uuid; v_grp text;
  v_first text; v_middle text; v_last text; v_email text; v_li text; v_norm text; v_ref text; v_comp uuid;
  v_type uuid; v_level uuid; v_fn uuid; v_start date; v_end date; v_prim boolean; v_acq uuid;
begin
  if not exists (select 1 from public.app_user where user_id = p_owner and role = 'owner' and active) then
    raise exception 'p_owner skal være en aktiv ejer';
  end if;
  perform set_config('request.jwt.claim.sub', p_owner::text, true);

  begin
    -- Virksomheder
    for r in select * from public.import_row where batch = p_batch and kind = 'company' order by id loop
      begin
        d := r.data; act := null; msg := null; rid := null; v_name := null;
        v_name := nullif(btrim(d->>'name'), '');
        if v_name is null then raise exception 'Navn mangler'; end if;
        v_cvr := nullif(regexp_replace(coalesce(d->>'cvr', ''), '\D', '', 'g'), '');
        if v_cvr is not null and length(v_cvr) <> 8 then raise exception 'CVR skal være 8 cifre: %', d->>'cvr'; end if;
        v_sector := private.imp_lookup('sector', d->>'sector');

        if v_cvr is not null then
          select id into cid from public.company where cvr = v_cvr;
          if cid is null then select id into cid from public.company where lower(btrim(name)) = lower(v_name) and cvr is null limit 1; end if;
        else
          select count(*), min(id::text)::uuid into n, cid from public.company where lower(btrim(name)) = lower(v_name);
          if n > 1 then raise exception 'Flere virksomheder hedder "%", angiv CVR', v_name; end if;
        end if;

        if cid is null then
          insert into public.company (name, cvr, website, sector_id, is_own, created_by)
          values (v_name, v_cvr, nullif(btrim(d->>'website'), ''), v_sector, private.imp_bool(d->>'is_own'), p_owner)
          returning id into cid;
          act := 'created';
        else
          update public.company set cvr = coalesce(cvr, v_cvr), website = coalesce(website, nullif(btrim(d->>'website'), '')),
                 sector_id = coalesce(sector_id, v_sector) where id = cid;
          act := 'matched';
        end if;
        rid := cid;

        if nullif(d->>'branch', '') is not null then
          insert into public.company_branch (company_id, branch_id, is_primary)
          values (cid, private.imp_branch(d->>'branch'), not exists (select 1 from public.company_branch where company_id = cid and is_primary))
          on conflict do nothing;
        end if;
        if nullif(d->>'branch2', '') is not null then
          insert into public.company_branch (company_id, branch_id, is_primary)
          values (cid, private.imp_branch(d->>'branch2'), false) on conflict do nothing;
        end if;

        v_pc := nullif(btrim(d->>'postal_code'), '');
        if (v_pc is not null or nullif(btrim(d->>'address'), '') is not null)
           and not exists (select 1 from public.company_location where company_id = cid and is_hq) then
          v_city := nullif(btrim(d->>'city'), '');
          if v_pc is not null then
            if not exists (select 1 from public.postcode where postal_code = v_pc) then raise exception 'Ukendt postnummer: %', v_pc; end if;
            v_city := coalesce(v_city, (select city from public.postcode where postal_code = v_pc));
          end if;
          insert into public.company_location (company_id, name, is_hq, address, postal_code, city, created_by)
          values (cid, 'Hovedkontor', true, nullif(btrim(d->>'address'), ''), v_pc, v_city, p_owner);
        end if;

        v_grp := nullif(btrim(d->>'group_name'), '');
        if v_grp is not null then
          select id into gid from public.company_group where lower(name) = lower(v_grp) limit 1;
          if gid is null then insert into public.company_group (name, created_by) values (v_grp, p_owner) returning id into gid; end if;
          insert into public.company_group_member (group_id, company_id, role_id)
          values (gid, cid, private.imp_lookup('group_role', coalesce(nullif(d->>'group_role', ''), 'member')))
          on conflict do nothing;
        end if;

        msg := v_name;
        update public.import_row set status = act, message = msg, result_id = rid where id = r.id;
        rep := rep || jsonb_build_object('row_id', r.id, 'kind', 'company', 'action', act, 'message', msg);
      exception when others then
        rep := rep || jsonb_build_object('row_id', r.id, 'kind', 'company', 'action', 'error', 'message', coalesce(v_name, '?') || ': ' || sqlerrm);
        update public.import_row set status = 'error', message = sqlerrm where id = r.id;
      end;
    end loop;

    -- Personer
    for r in select * from public.import_row where batch = p_batch and kind = 'contact' order by id loop
      begin
        d := r.data; act := null; msg := null; rid := null; cid := null; v_comp := null; v_first := null; v_last := null;
        v_first := nullif(btrim(d->>'first_name'), '');
        if v_first is null then raise exception 'Fornavn mangler'; end if;
        v_middle := nullif(btrim(d->>'middle_name'), '');
        v_last := nullif(btrim(d->>'last_name'), '');
        v_email := nullif(lower(btrim(d->>'email')), '');
        if v_email is not null and position('@' in v_email) < 2 then raise exception 'Ugyldig e-mail: %', v_email; end if;
        v_li := nullif(btrim(d->>'linkedin'), '');
        v_norm := private.normalize_linkedin(v_li);

        if v_norm is not null then select id into cid from public.contact where linkedin_norm = v_norm; end if;
        if cid is null and v_email is not null then select id into cid from public.contact where lower(email) = v_email limit 1; end if;
        if cid is null and exists (select 1 from public.contact where lower(first_name) = lower(v_first) and lower(coalesce(last_name, '')) = lower(coalesce(v_last, ''))) then
          if not private.imp_bool(d->>'force') then
            act := 'review';
            msg := v_first || ' ' || coalesce(v_last, '') || ' ligner en eksisterende person (samme navn). Tilføj force = ja for at oprette alligevel.';
          end if;
        end if;

        if act is null then
          v_ref := nullif(btrim(d->>'company'), '');
          if v_ref is not null then
            if v_ref ~ '^[0-9]{8}$' then select count(*), min(id::text)::uuid into n, v_comp from public.company where cvr = v_ref;
            else select count(*), min(id::text)::uuid into n, v_comp from public.company where lower(btrim(name)) = lower(v_ref); end if;
            if n = 0 then raise exception 'Virksomheden findes ikke: "%"', v_ref; end if;
            if n > 1 then raise exception 'Flere virksomheder hedder "%", brug CVR', v_ref; end if;
          end if;
          v_type := private.imp_lookup('affiliation_type', coalesce(nullif(d->>'affiliation_type', ''), 'employment'));
          v_level := private.imp_lookup('level', d->>'level');
          v_fn := private.imp_lookup('job_function', d->>'function');
          v_start := nullif(btrim(d->>'start_date'), '')::date;
          v_end := nullif(btrim(d->>'end_date'), '')::date;
          v_acq := private.imp_lookup('acquaintance', d->>'acquaintance');

          if cid is null then
            insert into public.contact (first_name, middle_name, last_name, email, phone, linkedin_url, created_by)
            values (v_first, v_middle, v_last, v_email, nullif(btrim(d->>'phone'), ''), v_li, p_owner) returning id into cid;
            act := 'created';
          else
            update public.contact set middle_name = coalesce(middle_name, v_middle), email = coalesce(email, v_email), phone = coalesce(phone, nullif(btrim(d->>'phone'), '')),
                   linkedin_url = coalesce(linkedin_url, v_li) where id = cid;
            act := 'matched';
          end if;
          rid := cid;

          if v_comp is not null and not exists (
               select 1 from public.contact_company where contact_id = cid and company_id = v_comp and affiliation_type_id = v_type
                 and start_date is not distinct from v_start) then
            v_prim := case when nullif(btrim(d->>'is_primary'), '') is not null then private.imp_bool(d->>'is_primary') and v_end is null
                           else v_end is null and not exists (select 1 from public.contact_company where contact_id = cid and is_primary and end_date is null) end;
            insert into public.contact_company (contact_id, company_id, affiliation_type_id, level_id, function_id, is_primary, start_date, end_date, note, created_by)
            values (cid, v_comp, v_type, v_level, v_fn, v_prim, v_start, v_end, nullif(btrim(d->>'affiliation_note'), ''), p_owner);
          end if;

          if v_acq is not null or nullif(d->>'acquainted_since', '') is not null or nullif(d->>'notes', '') is not null or nullif(d->>'no_invitation', '') is not null then
            insert into public.contact_relation (owner_id, contact_id, acquaintance_id, acquainted_since, no_invitation, notes)
            values (p_owner, cid, v_acq, nullif(btrim(d->>'acquainted_since'), '')::date, private.imp_bool(d->>'no_invitation'), nullif(btrim(d->>'notes'), ''))
            on conflict (owner_id, contact_id) do update set
              acquaintance_id = coalesce(excluded.acquaintance_id, public.contact_relation.acquaintance_id),
              acquainted_since = coalesce(excluded.acquainted_since, public.contact_relation.acquainted_since),
              no_invitation = public.contact_relation.no_invitation or excluded.no_invitation,
              notes = coalesce(excluded.notes, public.contact_relation.notes);
          end if;
          msg := v_first || ' ' || coalesce(v_last, '');
        end if;

        update public.import_row set status = act, message = msg, result_id = rid where id = r.id;
        rep := rep || jsonb_build_object('row_id', r.id, 'kind', 'contact', 'action', act, 'message', msg);
      exception when others then
        rep := rep || jsonb_build_object('row_id', r.id, 'kind', 'contact', 'action', 'error', 'message', coalesce(v_first, '?') || ' ' || coalesce(v_last, '') || ': ' || sqlerrm);
        update public.import_row set status = 'error', message = sqlerrm where id = r.id;
      end;
    end loop;

    if p_dry then raise exception 'dry_run' using errcode = 'P0001'; end if;
  exception when others then
    if sqlerrm <> 'dry_run' then raise; end if;
  end;

  return query select (x->>'row_id')::bigint, x->>'kind', x->>'action', x->>'message'
               from jsonb_array_elements(rep) x order by 1;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(), private.is_owner(), private.normalize_linkedin(text) to authenticated;
