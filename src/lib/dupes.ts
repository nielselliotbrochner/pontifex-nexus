import { supabase } from './supabase';
import type { Row } from './data';
import { normalizeLinkedin } from './linkedin';

export type Dupe = { kind: 'linkedin' | 'cvr' | 'email' | 'name'; row: Row };

const esc = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export async function personDupes(p: { id?: string | null; first: string; last: string; email: string; linkedin: string }): Promise<Dupe[]> {
  const sel = 'id, first_name, middle_name, last_name, email';
  const out: Dupe[] = [];
  const norm = normalizeLinkedin(p.linkedin);
  const jobs: PromiseLike<void>[] = [];
  const add = (kind: Dupe['kind'], q: PromiseLike<{ data: Row[] | null }>) =>
    jobs.push(q.then(({ data }) => { for (const row of data ?? []) if (row.id !== p.id && !out.some((o) => o.row.id === row.id && o.kind === kind)) out.push({ kind, row }); }));
  if (norm) add('linkedin', supabase.from('contact').select(sel).eq('linkedin_norm', norm).limit(5));
  if (p.email.trim()) add('email', supabase.from('contact').select(sel).ilike('email', esc(p.email.trim())).limit(5));
  if (p.first.trim()) {
    let q = supabase.from('contact').select(sel).ilike('first_name', esc(p.first.trim()));
    q = p.last.trim() ? q.ilike('last_name', esc(p.last.trim())) : q.is('last_name', null);
    add('name', q.limit(5));
  }
  await Promise.all(jobs);
  return out;
}

export async function companyDupes(p: { id?: string | null; name: string; cvr: string }): Promise<Dupe[]> {
  const sel = 'id, name, cvr';
  const out: Dupe[] = [];
  const jobs: PromiseLike<void>[] = [];
  const add = (kind: Dupe['kind'], q: PromiseLike<{ data: Row[] | null }>) =>
    jobs.push(q.then(({ data }) => { for (const row of data ?? []) if (row.id !== p.id) out.push({ kind, row }); }));
  if (/^\d{8}$/.test(p.cvr.trim())) add('cvr', supabase.from('company').select(sel).eq('cvr', p.cvr.trim()).limit(5));
  if (p.name.trim()) add('name', supabase.from('company').select(sel).ilike('name', esc(p.name.trim())).limit(5));
  await Promise.all(jobs);
  return out;
}
