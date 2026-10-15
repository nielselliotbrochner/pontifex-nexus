-- To-bruger-test af adgangsregler mod de to rigtige logins. Kører i én transaktion og ruller tilbage via en exception.
-- Resultatet står i fejlbeskeden (linjer med PASS eller FAIL). Intet gemmes.
-- Ikke dækket: sletteregler (værktøjet kræver bekræftelse af DELETE). Test dem i SQL Editor efter behov.
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

do $$
declare
  a uuid; b uuid;
  res text[] := '{}';
  n int; cid uuid; coid uuid; coid2 uuid; locid uuid; gid uuid;
begin
  select user_id into a from public.app_user where display_name = 'nebr@niras.dk';
  select user_id into b from public.app_user where display_name = 'nielsbrochner@gmail.com';
  if a is null or b is null then raise exception 'Brugere ikke fundet: % %', a, b; end if;
  update public.app_user set role = 'member', active = true where user_id = b;  -- kun i denne transaktion

  select id into cid from public.contact where first_name = 'TEST Anna';
  select id into coid from public.company where name = 'TEST Nordbyg Totalentreprenør A/S';
  select id into coid2 from public.company where name = 'TEST Arkitekter A/S';

  perform pg_temp.act_as(b);
  select count(*) into n from public.contact;
  res := array_append(res, (case when n = 10 then 'PASS' else 'FAIL ('||n||')' end || ' 1 medlem B ser de delte personer'));

  perform pg_temp.act_as(a);
  insert into public.contact_relation (contact_id, acquaintance_id, notes)
    values (cid, (select id from public.acquaintance where code = 'knows_well'), 'A privat note');
  perform pg_temp.act_as(b);
  select count(*) into n from public.contact_relation;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end || ' 2 B ser ikke A''s private relation'));
  begin
    insert into public.contact_relation (owner_id, contact_id, notes) values (a, cid, 'spoof');
    res := array_append(res, 'FAIL 3 B kan skrive i A''s navn');
  exception when others then res := array_append(res, 'PASS 3 B kan ikke skrive private rækker i A''s navn'); end;
  insert into public.contact_relation (contact_id, notes) values (cid, 'B privat note');
  select count(*) into n from public.contact_relation;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL' end || ' 4 B ser kun sin egen relation til samme person'));
  perform pg_temp.act_as(a);
  select count(*) into n from public.contact_relation where notes = 'B privat note';
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end || ' 5 A ser ikke B''s note'));

  perform pg_temp.act_as(b);
  update public.contact set phone = '+45 99 99 99 99' where id = cid;
  select count(*) into n from public.audit_log;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL' end || ' 6 medlem B kan ikke læse audit-log'));
  perform pg_temp.act_as(a);
  select count(*) into n from public.audit_log where table_name = 'contact' and action = 'UPDATE' and user_id = b;
  res := array_append(res, (case when n = 1 then 'PASS' else 'FAIL ('||n||')' end || ' 7 ejer ser B''s ændring i audit-log'));

  perform pg_temp.act_as(b);
  begin
    insert into public.contact (first_name, created_by) values ('TEST Spoof', a);
    res := array_append(res, 'FAIL 8 created_by kan forfalskes');
  exception when others then res := array_append(res, 'PASS 8 created_by kan ikke forfalskes'); end;
  begin
    insert into public.contact (first_name, linkedin_url) values ('TEST Dublet', 'http://linkedin.com/in/test-anna-madsen?x=1');
    res := array_append(res, 'FAIL 9 dublet LinkedIn accepteret');
  exception when unique_violation then res := array_append(res, 'PASS 9 dublet LinkedIn afvist (normaliseret)'); end;
  begin
    insert into public.company (name, cvr) values ('TEST Dublet CVR', '90000001');
    res := array_append(res, 'FAIL 10 dublet CVR accepteret');
  exception when unique_violation then res := array_append(res, 'PASS 10 dublet CVR afvist'); end;
  begin
    insert into public.contact_company (contact_id, company_id, affiliation_type_id, is_primary)
    values (cid, coid2, (select id from public.affiliation_type where code = 'employment'), true);
    res := array_append(res, 'FAIL 11 to primære aktuelle tilknytninger');
  exception when unique_violation then res := array_append(res, 'PASS 11 kun én primær aktuel tilknytning'); end;
  select id into locid from public.company_location where company_id = coid2 and is_hq;
  begin
    insert into public.contact_company (contact_id, company_id, affiliation_type_id, location_id)
    values (cid, coid, (select id from public.affiliation_type where code = 'board'), locid);
    res := array_append(res, 'FAIL 12 kontor fra anden virksomhed accepteret');
  exception when foreign_key_violation then res := array_append(res, 'PASS 12 kontor skal tilhøre samme virksomhed'); end;
  select id into gid from public.company_group where name = 'TEST Nordbyg-koncernen';
  begin
    insert into public.company_group_member (group_id, company_id, role_id)
    values (gid, coid2, (select id from public.group_role where code = 'parent'));
    res := array_append(res, 'FAIL 13 to moderselskaber');
  exception when others then res := array_append(res, 'PASS 13 højst ét moderselskab pr. gruppe'); end;
  begin
    insert into public.level (code, name, sort_order) values ('x', 'X', 9);
    res := array_append(res, 'FAIL 14 medlem kan udvide opslagsliste');
  exception when others then res := array_append(res, 'PASS 14 medlem kan ikke udvide opslagslister'); end;
  perform pg_temp.act_as(a);
  insert into public.level (code, name, sort_order) values ('x', 'X', 9);
  res := array_append(res, 'PASS 15 ejer kan udvide opslagslister');

  perform pg_temp.act_as(b);
  select count(*) into n from public.v_contact_overview where region is not null;
  res := array_append(res, (case when n >= 8 then 'PASS' else 'FAIL ('||n||')' end || ' 16 oversigt udleder region fra postnummer'));
  select count(*) into n from public.v_contact_overview where location_assumed;
  res := array_append(res, (case when n >= 1 then 'PASS' else 'FAIL' end || ' 17 antaget sted markeres'));

  execute 'reset role';
  update public.app_user set active = false where user_id = b;
  perform pg_temp.act_as(b);
  select count(*) into n from public.contact;
  res := array_append(res, (case when n = 0 then 'PASS' else 'FAIL ('||n||')' end || ' 18 inaktiv bruger ser ingen personer'));

  execute 'reset role';
  raise exception E'RESULTS\n%', array_to_string(res, E'\n');
end $$;
