import { useMemo, useState } from 'react';
import { fetchAll, fullName, type Row } from '../lib/data';
import { onLink, href } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { arrowNav, SkeletonRows } from '../lib/ui';

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

  const rows = data ?? [];
  const opts = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort() as string[];
  const acqOpts = [...new Set(rows.map((r) => r.acq?.name).filter(Boolean))] as string[];

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!s || [fullName(r), r.company_name, r.email, r.city].join(' ').toLowerCase().includes(s)) &&
      (!region || r.region === region) && (!level || r.level === level) && (!fn || r.job_function === fn) &&
      (!priv || !acq || r.acq?.name === acq));
  }, [rows, q, region, level, fn, acq, priv]);

  if (error) return <p className="err">{error}</p>;
  return (
    <>
      <h1>Personer</h1>
      <div className="filters">
        <input placeholder="Søg navn, virksomhed, e-mail, by" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Alle regioner</option>{opts('region').map((o) => <option key={o}>{o}</option>)}</select>
        <select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Alle niveauer</option>{opts('level').map((o) => <option key={o}>{o}</option>)}</select>
        <select value={fn} onChange={(e) => setFn(e.target.value)}><option value="">Alle funktioner</option>{opts('job_function').map((o) => <option key={o}>{o}</option>)}</select>
        {priv && <select value={acq} onChange={(e) => setAcq(e.target.value)}><option value="">Alt kendskab</option>{acqOpts.map((o) => <option key={o}>{o}</option>)}</select>}
      </div>
      <div className="count">{loading ? '\u00a0' : `${shown.length} af ${rows.length} personer`}</div>
      <div className="tablewrap" onKeyDown={arrowNav}>
        <table>
          <thead><tr><th>Navn</th><th>Virksomhed</th><th>Niveau</th><th>Funktion</th><th>By</th><th>Region</th>{priv && <th>Kendskab</th>}</tr></thead>
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
