-- Fjerner alle TEST-rækker (kun ejeren kan køre dette).
delete from public.contact_company where company_id in (select id from public.company where name like 'TEST %');
delete from public.company_group where id in (
  select group_id from public.company_group_member where company_id in (select id from public.company where name like 'TEST %'));
delete from public.contact where first_name like 'TEST %';
delete from public.company where name like 'TEST %';
