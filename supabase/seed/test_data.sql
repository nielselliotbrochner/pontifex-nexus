-- Testdata: 10 virksomheder og 10 personer, alle med TEST foran navnet. Opfundne e-mails (.example) og CVR (9000000x).
-- Fjernes igen med: supabase/seed/remove_test_data.sql

create function pg_temp.lk(t text, cd text) returns uuid language plpgsql as $$
declare r uuid;
begin
  execute format('select id from public.%I where code = %L', t, cd) into r;
  if r is null then raise exception 'Mangler opslag % %', t, cd; end if;
  return r;
end $$;

create function pg_temp.add_company(n text, cvr_ text, sec text, own boolean, b1 text, b2 text,
  pc text, city_ text, addr text, la numeric, ln numeric, out company_id uuid, out hq_id uuid)
language plpgsql as $$
begin
  insert into public.company (name, cvr, sector_id, is_own, website)
  values (n, cvr_, pg_temp.lk('sector', sec), own, 'https://' || lower(regexp_replace(n, '[^A-Za-z]+', '', 'g')) || '.example')
  returning id into company_id;
  insert into public.company_branch (company_id, branch_id, is_primary) values (company_id, pg_temp.lk('branch', b1), true);
  if b2 is not null then
    insert into public.company_branch (company_id, branch_id, is_primary) values (company_id, pg_temp.lk('branch', b2), false);
  end if;
  insert into public.company_location (company_id, name, is_hq, address, postal_code, city, lat, lng)
  values (company_id, 'Hovedkontor', true, addr, pc, city_, la, ln) returning id into hq_id;
end $$;

create function pg_temp.add_office(cid uuid, n text, pc text, city_ text, addr text, la numeric, ln numeric)
returns uuid language plpgsql as $$
declare r uuid;
begin
  insert into public.company_location (company_id, name, is_hq, address, postal_code, city, lat, lng)
  values (cid, n, false, addr, pc, city_, la, ln) returning id into r;
  return r;
end $$;

create function pg_temp.add_person(f text, l text, e text, ph text, li text) returns uuid
language sql as $$
  insert into public.contact (first_name, last_name, email, phone, linkedin_url) values (f, l, e, ph, li) returning id
$$;

create function pg_temp.affil(cid uuid, coid uuid, typ text, lvl text, fn text, loc uuid,
  prim boolean, s date, e date) returns void language sql as $$
  insert into public.contact_company (contact_id, company_id, affiliation_type_id, level_id, function_id, location_id, is_primary, start_date, end_date)
  values (cid, coid, pg_temp.lk('affiliation_type', typ),
          case when lvl is null then null else pg_temp.lk('level', lvl) end,
          case when fn is null then null else pg_temp.lk('job_function', fn) end,
          loc, prim, s, e)
$$;

do $$
declare
  nb record; na record; rg record; km record; ab record; ar record; ri record; ad record; pi record; eg record;
  o_cph uuid; o_aar uuid; o_vej uuid;
  g1 uuid; g2 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid;
begin
  select * into nb from pg_temp.add_company('TEST Nordbyg Totalentreprenør A/S','90000001','private',false,'general_contractor','contractor','8000','Aarhus C','Testvej 1',56.1500,10.2000);
  o_cph := pg_temp.add_office(nb.company_id,'København','2100','København Ø','Testgade 2',55.7100,12.5800);
  select * into na from pg_temp.add_company('TEST Nordbyg Anlæg ApS','90000002','private',false,'trade_contractor',null,'8200','Aarhus N','Testvej 3',56.1900,10.2100);
  select * into rg from pg_temp.add_company('TEST Region Bygherre','90000003','public',false,'region',null,'2100','København Ø','Testallé 4',55.7000,12.5700);
  select * into km from pg_temp.add_company('TEST Kommune Odense','90000004','public',false,'municipality',null,'5000','Odense C','Testtorvet 5',55.4000,10.3900);
  select * into ab from pg_temp.add_company('TEST Almen Bolig Selskab','90000005','housing',false,'housing_assoc',null,'6000','Kolding','Testboulevard 6',55.4900,9.4700);
  select * into ar from pg_temp.add_company('TEST Arkitekter A/S','90000006','private',false,'architect','engineer','1560','København V','Testplads 7',55.6700,12.5500);
  o_aar := pg_temp.add_office(ar.company_id,'Aarhus','8000','Aarhus C','Teststræde 8',56.1600,10.2100);
  select * into ri from pg_temp.add_company('TEST Rådgivende Ingeniører A/S','90000007','private',false,'engineer',null,'2800','Kongens Lyngby','Testparken 9',55.7700,12.5000);
  select * into ad from pg_temp.add_company('TEST Advokatfirma I/S','90000008','private',false,'lawyer',null,'1050','København K','Testkaj 10',55.6800,12.5900);
  select * into pi from pg_temp.add_company('TEST Pension & Investor A/S','90000009','private',false,'pension','investor','2300','København S','Testbro 11',55.6500,12.6100);
  select * into eg from pg_temp.add_company('TEST Egen Rådgiver A/S','90000010','private',true,'engineer',null,'4000','Roskilde','Testgade 12',55.6400,12.0800);
  o_vej := pg_temp.add_office(eg.company_id,'Vejle','7100','Vejle','Testvej 13',55.7100,9.5300);

  -- Grupper: én med navn og moderselskab, én uden navn
  insert into public.company_group (name) values ('TEST Nordbyg-koncernen') returning id into g1;
  insert into public.company_group_member (group_id, company_id, role_id) values
    (g1, nb.company_id, pg_temp.lk('group_role','parent')), (g1, na.company_id, pg_temp.lk('group_role','subsidiary'));
  insert into public.company_group (name) values (null) returning id into g2;
  insert into public.company_group_member (group_id, company_id, role_id) values
    (g2, ar.company_id, pg_temp.lk('group_role','sister')), (g2, ri.company_id, pg_temp.lk('group_role','sister'));

  p1  := pg_temp.add_person('TEST Anna','Madsen','anna.madsen@test-nordbyg.example','+45 00 00 00 01','https://www.linkedin.com/in/test-anna-madsen/');
  p2  := pg_temp.add_person('TEST Bo','Jensen','bo.jensen@test-nordbyg.example','+45 00 00 00 02','https://dk.linkedin.com/in/test-bo-jensen?trk=x');
  p3  := pg_temp.add_person('TEST Carla','Nielsen','carla.nielsen@test-region.example',null,null);
  p4  := pg_temp.add_person('TEST Dan','Sørensen','dan.soerensen@test-odense.example','+45 00 00 00 04',null);
  p5  := pg_temp.add_person('TEST Eva','Kristensen','eva.kristensen@test-raadgivende.example',null,'https://www.linkedin.com/in/test-eva-kristensen');
  p6  := pg_temp.add_person('TEST Frank','Larsen',null,'+45 00 00 00 06',null);
  p7  := pg_temp.add_person('TEST Gitte','Poulsen','gitte.poulsen@test-arkitekter.example','+45 00 00 00 07','https://www.linkedin.com/in/test-gitte-poulsen/');
  p8  := pg_temp.add_person('TEST Henrik','Olsen','henrik.olsen@test-advokat.example',null,null);
  p9  := pg_temp.add_person('TEST Ida','Berg','ida.berg@test-pension.example','+45 00 00 00 09',null);
  p10 := pg_temp.add_person('TEST Jonas','Holm','jonas.holm@test-egen.example','+45 00 00 00 10',null);

  -- Primære ansættelser (med og uden eksplicit kontor) og sekundære roller
  perform pg_temp.affil(p1, nb.company_id,'employment','owner_top','leadership', nb.hq_id, true,  '2015-01-01', null);
  perform pg_temp.affil(p1, ab.company_id,'board',null,null, null, false, '2020-06-01', null);
  perform pg_temp.affil(p2, nb.company_id,'employment','manager','bid', o_cph, true, '2018-03-01', null);
  perform pg_temp.affil(p3, rg.company_id,'employment','lead','procurement_client', null, true, '2023-01-01', null);
  perform pg_temp.affil(p4, km.company_id,'employment','executive','procurement_client', km.hq_id, true, '2012-09-01', null);
  perform pg_temp.affil(p4, ar.company_id,'advisory_board',null,null, null, false, '2022-01-01', null);
  perform pg_temp.affil(p5, ri.company_id,'employment','senior_specialist','technical_advisory', null, true, '2019-05-01', null);
  perform pg_temp.affil(p6, na.company_id,'employment','manager','project_execution', na.hq_id, true, '2016-02-01', null);
  perform pg_temp.affil(p7, ar.company_id,'employment','owner_top','leadership', ar.hq_id, true, '2008-01-01', null);
  perform pg_temp.affil(p7, pi.company_id,'board',null,null, null, false, '2021-04-01', null);
  perform pg_temp.affil(p8, ad.company_id,'employment','senior_specialist','other', null, true, '2014-08-01', null);
  perform pg_temp.affil(p9, pi.company_id,'employment','executive','leadership', null, true, '2023-01-01', null);
  perform pg_temp.affil(p9, rg.company_id,'employment','lead','development', null, false, '2017-01-01', '2022-12-31');
  perform pg_temp.affil(p10, eg.company_id,'employment','lead','project_execution', o_vej, true, '2020-01-01', null);
end $$;
