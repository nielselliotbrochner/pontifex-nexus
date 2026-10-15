import { useMemo, useState } from 'react';
import { fetchAll, fullName, type Row } from '../lib/data';
import { onLink, href } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { arrowNav, SkeletonRows } from '../lib/ui';

type SortKey = 'first' | 'last' | 'company' | 'level' | 'function' | 'city' | 'region' | 'acq';
const collator = new Intl.Collator('da', { sensitivity: 'base', numeric: true });

function sortValue(r: Row, k: SortKey): string | number {
  switch (k) {
    case 'first': return `${r.first_name ?? ''} ${r.middle_name ?? ''} ${r.last_name ?? ''}`;
    case 'last': return `${r.last_name ?? ''} ${r.first_name ?? ''} ${r.middle_name ?? ''}`;
    case 'company': return r.company_name ?? '';
    case 'level': return r.level_rank ?? 99;
    case 'function': return r.job_function ?? '';
    case 'city': return r.city ?? '';
    case 'region': return r.region ?? '';
    case 'acq': return r.acq?.sort_order ?? 0;
  }
}

export function Persons({ priv }: { priv: boolean }) {
  const { data, error, loading } = useAsync(async () => {
    const [people, rel] = await Promise.all([
      fetchAll('v_contact_overview', '*', 'last_name'),
      fetchAll('contact_relation', 'contact_id, acquaintance(name, sort_order)'),
    ]);
    const acq = new Map<string, Row>(rel.map((r) => [r.contact_id, r.acquaintance]));
    return people.map((p): Row => ({ ...p, acq: acq.get(p.contact_id) ?? null }));
  }, [], 'persons');
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [level, setLevel] = useState('');
  const [fn, setFn] = useState('');
  const [acq, setAcq] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'last', dir: 1 });

  const rows = data ?? [];
  const opts = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort() as string[];
  const acqOpts = [...new Set(rows.map((r) => r.acq?.name).filter(Boolean))] as string[];

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = rows.filter((r) =>
      (!s || [fullName(r), r.company_name, r.email, r.city].join(' ').toLowerCase().includes(s)) &&
      (!region || r.region === region) && (!level || r.level === level) && (!fn || r.job_function === fn) &&
      (!priv || !acq || r.acq?.name === acq));
    return out.sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
      return c * sort.dir;
    });
  }, [rows, q, region, level, fn, acq, priv, sort]);

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <button className={sort.key === k ? 'on' : ''} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}
      title={`Sortér på ${label.toLowerCase()}`}>{label}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
  );

  if (error) return <p className="err">{error}</p>;
  return (
    <>
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <h1>Personer</h1>
        <a href={href('person-ny')} onClick={(e) => onLink(e, 'person-ny')}><button className="primary">Ny person</button></a>
      </div>
      <div className="filters">
        <input placeholder="Søg navn, virksomhed, e-mail, by" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Alle regioner</option>{opts('region').map((o) => <option key={o}>{o}</option>)}</select>
        <select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Alle niveauer</option>{opts('level').map((o) => <option key={o}>{o}</option>)}</select>
        <select value={fn} onChange={(e) => setFn(e.target.value)}><option value="">Alle funktioner</option>{opts('job_function').map((o) => <option key={o}>{o}</option>)}</select>
        {priv && <select value={acq} onChange={(e) => setAcq(e.target.value)}><option value="">Alt kendskab</option>{acqOpts.map((o) => <option key={o}>{o}</option>)}</select>}
      </div>
      <div className="count">{loading ? ' ' : `${shown.length} af ${rows.length} personer`}</div>
      <div className="tablewrap" onKeyDown={arrowNav}>
        <table>
          <thead><tr className="sorthead">
            <th>Navn <span className="muted" style={{ fontWeight: 400 }}>sortér:</span> <Th k="first" label="Fornavn" /> <Th k="last" label="Efternavn" /></th>
            <th><Th k="company" label="Virksomhed" /></th><th><Th k="level" label="Niveau" /></th><th><Th k="function" label="Funktion" /></th>
            <th><Th k="city" label="By" /></th><th><Th k="region" label="Region" /></th>{priv && <th><Th k="acq" label="Kendskab" /></th>}
          </tr></thead>
          <tbody>
            {loading && <SkeletonRows cols={priv ? 7 : 6} />}
            {shown.map((r) => (
              <tr key={r.contact_id}>
                <td><a href={href('person', r.contact_id)} onClick={(e) => onLink(e, 'person', r.contact_id)}>{fullName(r)}</a>{!r.active && <span className="tag">inaktiv</span>}</td>
                <td>{r.company_id ? <a href={href('virksomhed', r.company_id)} onClick={(e) => onLink(e, 'virksomhed', r.company_id)}>{r.company_name}</a> : <span className="muted">-</span>}</td>
                <td>{r.level ?? ''}</td><td>{r.job_function ?? ''}</td>
                <td>{r.city ?? ''}{r.location_assumed && <span className="muted" title="Hovedkontor antaget"> *</span>}</td>
                <td>{r.region ?? ''}</td>
                {priv && <td>{r.acq?.name ?? ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
