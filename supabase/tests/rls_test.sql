-- To-bruger-test af adgangsregler. Kører i én transaktion og ruller tilbage via en exception, så intet gemmes.
-- Resultatet står i fejlbeskeden (linjer med PASS eller FAIL).
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  if uid is null then
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

do $$
declare
  a uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  b uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  c uuid := 'cccccccc-0000-0000-0000-00000000000c';
  res text[] := '{}';
  n int; x uuid; cid uuid; coid uuid; coid2 uuid; locid uuid; gid uuid;
begin
  -- Nye brugere får ingen adgang, før ejeren aktiverer dem
  insert into auth.users (id, email, aud, role) values (a, 'a@test.example', 'authenticated', 'authenticated');
  insert into auth.users (id, email, aud, role) values (b, 'b@test.example', 'authenticated', 'authenticated');
  insert into auth.users (id, email, aud, role) values (c, 'c@test.example', 'authenticated', 'authenticated');
  select count(*) into n from public.app_user where user_id in (a, b, c) and role = 'member' and not active;
  res := res || (case when n = 3 then 'PASS' else 'FAIL ('||n||')' end || ' 1 nye brugere er inaktive medlemmer uden adgang');
  update public.app_user set role = 'owner', active = true where user_id = a;
  update public.app_user set active = true where user_id = b;

  select id into cid from public.contact where first_name = 'TEST Anna';
  select id into coid from public.company where name = 'TEST Nordbyg Totalentreprenør A/S';
  select id into coid2 from public.company where name = 'TEST Arkitekter A/S';

  -- Delt lag
  perform pg_temp.act_as(b);
  select count(*) into n from public.contact;
  res := res || (case when n = 10 then 'PASS' else 'FAIL ('||n||')' end || ' 3 B ser de delte personer');
  perform pg_temp.act_as(c);
  select count(*) into n from public.contact;
  res := res || (case when n = 0 then 'PASS' else 'FAIL ('||n||')' end || ' 4 inaktiv bruger ser ingen personer');
  perform pg_temp.act_as(null);
  begin select count(*) into n from public.contact; res := res || (case when n = 0 then 'PASS' else 'FAIL' end || ' 5 anon ser ingen personer');
  exception when others then res := res || 'PASS 5 anon afvises'; end;

  -- Privat lag
  perform pg_temp.act_as(a);
  insert into public.contact_relation (contact_id, acquaintance_id, notes)
    values (cid, (select id from public.acquaintance where code = 'knows_well'), 'A privat note');
  perform pg_temp.act_as(b);
  select count(*) into n from public.contact_relation;
  res := res || (case when n = 0 then 'PASS' else 'FAIL' end || ' 6 B ser ikke A''s private relation');
  begin
    insert into public.contact_relation (owner_id, contact_id, notes) values (a, cid, 'spoof');
    res := res || 'FAIL 7 B kan skrive i A''s navn';
  exception when others then res := res || 'PASS 7 B kan ikke skrive private rækker i A''s navn'; end;
  insert into public.contact_relation (contact_id, notes) values (cid, 'B privat note');
  select count(*) into n from public.contact_relation;
  res := res || (case when n = 1 then 'PASS' else 'FAIL' end || ' 8 B ser kun sin egen relation til samme person');
  perform pg_temp.act_as(a);
  select count(*) into n from public.contact_relation where notes = 'B privat note';
  res := res || (case when n = 0 then 'PASS' else 'FAIL' end || ' 9 A ser ikke B''s note');

  -- Redigering og audit
  perform pg_temp.act_as(b);
  update public.contact set phone = '+45 99 99 99 99' where id = cid;
  select count(*) into n from public.audit_log;
  res := res || (case when n = 0 then 'PASS' else 'FAIL' end || ' 10 B kan ikke læse audit-log');
  perform pg_temp.act_as(a);
  select count(*) into n from public.audit_log where table_name = 'contact' and action = 'UPDATE' and user_id = b;
  res := res || (case when n = 1 then 'PASS' else 'FAIL ('||n||')' end || ' 11 ejeren ser B''s ændring i audit-log');

  -- Sletning
  perform pg_temp.act_as(b);
  delete from public.contact where id = cid;
  get diagnostics n = row_count;
  res := res || (case when n = 0 then 'PASS' else 'FAIL' end || ' 12 B kan ikke slette andres delte person');
  insert into public.contact (first_name, last_name) values ('TEST Bs', 'Egen') returning id into x;
  delete from public.contact where id = x;
  get diagnostics n = row_count;
  res := res || (case when n = 1 then 'PASS' else 'FAIL' end || ' 13 B kan slette sin egen oprettede person');
  begin
    insert into public.contact (first_name, created_by) values ('TEST Spoof', a);
    res := res || 'FAIL 14 created_by kan forfalskes';
  exception when others then res := res || 'PASS 14 created_by kan ikke forfalskes'; end;

  -- Dubletter og integritet
  begin
    insert into public.contact (first_name, linkedin_url) values ('TEST Dublet', 'http://linkedin.com/in/test-anna-madsen?x=1');
    res := res || 'FAIL 15 dublet LinkedIn accepteret';
  exception when unique_violation then res := res || 'PASS 15 dublet LinkedIn afvist (normaliseret)'; end;
  begin
    insert into public.company (name, cvr) values ('TEST Dublet CVR', '90000001');
    res := res || 'FAIL 16 dublet CVR accepteret';
  exception when unique_violation then res := res || 'PASS 16 dublet CVR afvist'; end;
  begin
    insert into public.contact_company (contact_id, company_id, affiliation_type_id, is_primary)
    values (cid, coid2, (select id from public.affiliation_type where code = 'employment'), true);
    res := res || 'FAIL 17 to primære aktuelle tilknytninger';
  exception when unique_violation then res := res || 'PASS 17 kun én primær aktuel tilknytning'; end;
  select id into locid from public.company_location where company_id = coid2 and is_hq;
  begin
    insert into public.contact_company (contact_id, company_id, affiliation_type_id, location_id)
    values (cid, coid, (select id from public.affiliation_type where code = 'board'), locid);
    res := res || 'FAIL 18 kontor fra anden virksomhed accepteret';
  exception when foreign_key_violation then res := res || 'PASS 18 kontor skal tilhøre samme virksomhed'; end;
  select id into gid from public.company_group where name = 'TEST Nordbyg-koncernen';
  begin
    insert into public.company_group_member (group_id, company_id, role_id)
    values (gid, coid2, (select id from public.group_role where code = 'parent'));
    res := res || 'FAIL 19 to moderselskaber';
  exception when others then res := res || 'PASS 19 højst ét moderselskab pr. gruppe'; end;

  -- Opslagslister
  begin
    insert into public.level (code, name, sort_order) values ('x', 'X', 9);
    res := res || 'FAIL 20 medlem kan udvide opslagsliste';
  exception when others then res := res || 'PASS 20 medlem kan ikke udvide opslagslister'; end;
  perform pg_temp.act_as(a);
  insert into public.level (code, name, sort_order) values ('x', 'X', 9);
  res := res || 'PASS 21 ejer kan udvide opslagslister';

  -- Views følger rettigheder
  perform pg_temp.act_as(b);
  select count(*) into n from public.v_contact_overview where region is not null;
  res := res || (case when n >= 8 then 'PASS' else 'FAIL ('||n||')' end || ' 22 oversigt udleder region fra postnummer');
  select count(*) into n from public.v_contact_overview where location_assumed;
  res := res || (case when n >= 1 then 'PASS' else 'FAIL' end || ' 23 antaget sted markeres');

  perform pg_temp.act_as(null);
  execute 'reset role';
  raise exception E'RESULTS\n%', array_to_string(res, E'\n');
end $$;
