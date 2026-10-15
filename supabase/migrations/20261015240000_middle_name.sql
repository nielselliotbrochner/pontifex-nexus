-- Mellemnavn som eget felt. Visning er fuldt navn, sortering kan ske på fornavn eller efternavn.
alter table public.contact add column middle_name text;

create or replace view public.v_contact_overview with (security_invoker = true) as
select c.id as contact_id, c.first_name, c.last_name, c.email, c.phone, c.active,
       cc.company_id, co.name as company_name,
       aff.name as affiliation_type, lv.name as level, lv.sort_order as level_rank, fn.name as job_function,
       coalesce(l.id, hq.id) as location_id,
       coalesce(l.city, hq.city) as city,
       coalesce(l.postal_code, hq.postal_code) as postal_code,
       pc.municipality, pc.region,
       (cc.location_id is null and hq.id is not null) as location_assumed,
       c.middle_name
from public.contact c
left join public.contact_company cc on cc.contact_id = c.id and cc.is_primary and cc.end_date is null
left join public.company co on co.id = cc.company_id
left join public.affiliation_type aff on aff.id = cc.affiliation_type_id
left join public.level lv on lv.id = cc.level_id
left join public.job_function fn on fn.id = cc.function_id
left join public.company_location l on l.id = cc.location_id
left join public.company_location hq on hq.company_id = cc.company_id and hq.is_hq and cc.location_id is null
left join public.postcode pc on pc.postal_code = coalesce(l.postal_code, hq.postal_code);
