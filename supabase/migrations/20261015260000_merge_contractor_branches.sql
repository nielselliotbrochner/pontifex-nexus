-- Entreprenør er én branche. Underbrancherne Totalentreprenør, Hovedentreprenør og Fagentreprenør er flettet ind i den.
-- Kørt manuelt i SQL Editor 15. okt 2026 (sletninger kræver ejerens godkendelse). Filen dokumenterer ændringen.
do $$
declare p uuid := (select id from public.branch where code = 'contractor');
begin
  -- Har en virksomhed både Entreprenør og en underbranche, beholdes underbranchens række (kan være primær).
  delete from public.company_branch cb
   where cb.branch_id = p
     and exists (select 1 from public.company_branch x join public.branch b on b.id = x.branch_id
                  where x.company_id = cb.company_id and b.parent_id = p);
  update public.company_branch cb set branch_id = p
    from public.branch b where b.id = cb.branch_id and b.parent_id = p;
  delete from public.branch where parent_id = p;
end $$;
