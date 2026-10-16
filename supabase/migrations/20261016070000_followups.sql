-- Opfølgninger på aktiviteter. Synlighed følger aktiviteten (RLS via exists-subquery).
create table public.activity_followup (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity(id) on delete cascade,
  text text not null check (btrim(text) <> ''),
  due_on date,
  assigned_to uuid default auth.uid() references public.app_user(user_id) on delete set null,
  done_at timestamptz,
  created_by uuid default auth.uid() references public.app_user(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activity_followup_open_idx on public.activity_followup (due_on) where done_at is null;
create index activity_followup_act_idx on public.activity_followup (activity_id);
alter table public.activity_followup enable row level security;
create policy activity_followup_all on public.activity_followup for all to authenticated
  using (private.is_member() and exists (select 1 from public.activity a where a.id = activity_id))
  with check (private.is_member() and exists (select 1 from public.activity a where a.id = activity_id));
create trigger activity_followup_touch before update on public.activity_followup for each row execute function private.touch();
create trigger activity_followup_audit after insert or update or delete on public.activity_followup for each row execute function private.audit();
revoke all on public.activity_followup from anon;
