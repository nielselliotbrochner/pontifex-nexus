import { supabase } from './supabase';
import { fullName, type Row } from './data';

// Typer hvor personerne er med (deltagere). Andre typer (research, nyhed, note) handler om personerne.
export const INTERACTION = new Set(['meeting', 'call', 'email']);

const NAME = 'first_name, middle_name, last_name';
export const ACT_SELECT = `id, occurred_on, title, body, source_url, visibility, created_by, created_at, type_id, activity_type(code, name),
  activity_participant(contact_id, company_id, contact(${NAME}), company(name)),
  activity_company(company_id, company(name)),
  activity_subject(contact_id, contact(${NAME})),
  activity_file(id)`;

const byDate = (a: Row, b: Row) => (b.occurred_on as string).localeCompare(a.occurred_on) || (b.created_at as string).localeCompare(a.created_at);

// Al aktivitet om en person ('p') eller virksomhed ('c'), nyeste først.
export async function loadTimeline(kind: 'p' | 'c', id: string): Promise<Row[]> {
  const q = (table: string, col: string) => supabase.from(table).select(`activity!inner(${ACT_SELECT})`).eq(col, id);
  const jobs = kind === 'p'
    ? [q('activity_participant', 'contact_id'), q('activity_subject', 'contact_id')]
    : [q('activity_company', 'company_id'), q('activity_participant', 'company_id')];
  const res = await Promise.all(jobs);
  const seen = new Map<string, Row>();
  for (const r of res) {
    if (r.error) throw new Error(r.error.message);
    for (const row of (r.data ?? []) as unknown as Row[]) seen.set(row.activity.id, row.activity);
  }
  return [...seen.values()].sort(byDate);
}

export async function loadAllActivities(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('activity').select(ACT_SELECT).order('occurred_on', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Hvem og hvad aktiviteten angår, som kort tekst.
export function who(a: Row, max = 4): string {
  const names: string[] = [];
  for (const p of (a.activity_participant ?? []) as Row[]) names.push(fullName(p.contact) + (p.company?.name ? ` (${p.company.name})` : ''));
  for (const s of (a.activity_subject ?? []) as Row[]) names.push(fullName(s.contact));
  for (const c of (a.activity_company ?? []) as Row[]) names.push(c.company?.name);
  const uniq = [...new Set(names.filter(Boolean))];
  return uniq.slice(0, max).join(', ') + (uniq.length > max ? ` +${uniq.length - max}` : '');
}

export const safeName = (n: string) => n.replace(/[^\w.\-]+/g, '_');
export const MAX_FILE = 25 * 1024 * 1024;
