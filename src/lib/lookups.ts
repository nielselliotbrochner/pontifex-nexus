import { fetchAll, type Row } from './data';
import { useAsync } from './useAsync';

export const LOOKUP_NAMES = ['level', 'job_function', 'acquaintance', 'affiliation_type', 'sector', 'group_role', 'person_link_type', 'branch'] as const;
export type Lookups = Record<(typeof LOOKUP_NAMES)[number], Row[]>;

// Opslagslister til dropdowns. Kun aktive værdier, sorteret efter rækkefølge.
export function useLookups() {
  return useAsync(async () => {
    const res = await Promise.all(LOOKUP_NAMES.map((n) => fetchAll(n, '*', 'sort_order')));
    return Object.fromEntries(LOOKUP_NAMES.map((n, i) => [n, res[i].filter((r) => r.active)])) as Lookups;
  }, [], 'lookups');
}

export function lookupByCode(list: Row[], code: string): string {
  return list.find((r) => r.code === code)?.id ?? '';
}
