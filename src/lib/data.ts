import { supabase } from './supabase';

export type Row = Record<string, any>;

// Henter alle rækker i sider på 1000 (Supabase afskærer ellers ved 1000).
export async function fetchAll(table: string, select = '*', order?: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (order) q = q.order(order);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const fullName = (c: Row | null | undefined) => (c ? [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') : '');

export const LOOKUP_TABLES: { name: string; label: string }[] = [
  { name: 'level', label: 'Niveau' },
  { name: 'job_function', label: 'Funktion' },
  { name: 'acquaintance', label: 'Kendskab (privat)' },
  { name: 'affiliation_type', label: 'Tilknytningstype' },
  { name: 'sector', label: 'Sektor' },
  { name: 'branch', label: 'Branche (træ)' },
  { name: 'group_role', label: 'Rolle i koncern' },
  { name: 'person_link_type', label: 'Persontilknytning (privat)' },
  { name: 'stage', label: 'Modenhed (på hold)' },
];
