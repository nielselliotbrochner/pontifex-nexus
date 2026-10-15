-- Skemaoversigt til Admin-siden: alle tabeller i public med kolonner, nøgler, relationer og rækkeantal.
-- Kun ejeren kan kalde funktionen.
create function public.schema_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not private.is_owner() then
    raise exception 'Kun ejeren har adgang' using errcode = '42501';
  end if;
  select jsonb_build_object('tables', coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb)) into res
  from (
    select jsonb_build_object(
      'name', c.relname,
      'rows', (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::int,
      'columns', (select jsonb_agg(jsonb_build_object(
                    'name', a.attname,
                    'type', format_type(a.atttypid, a.atttypmod),
                    'not_null', a.attnotnull,
                    'pk', coalesce(a.attnum = any (select unnest(i.indkey) from pg_index i where i.indrelid = c.oid and i.indisprimary), false))
                  order by a.attnum)
                  from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
      'fks', coalesce((select jsonb_agg(jsonb_build_object(
                    'columns', (select jsonb_agg(att.attname) from pg_attribute att where att.attrelid = k.conrelid and att.attnum = any (k.conkey)),
                    'ref_table', rc.relname,
                    'ref_columns', (select jsonb_agg(att.attname) from pg_attribute att where att.attrelid = k.confrelid and att.attnum = any (k.confkey))))
                  from pg_constraint k join pg_class rc on rc.oid = k.confrelid
                  where k.conrelid = c.oid and k.contype = 'f' and rc.relnamespace = 'public'::regnamespace), '[]'::jsonb)
    ) as t
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  ) s;
  return res;
end $$;
revoke execute on function public.schema_overview() from public, anon;
grant execute on function public.schema_overview() to authenticated;
