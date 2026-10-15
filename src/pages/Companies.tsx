import { useMemo, useState } from 'react';
import { fetchAll, type Row } from '../lib/data';
import { onLink, href } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { arrowNav, SkeletonRows } from '../lib/ui';

export function Companies() {
  const { data, error, loading } = useAsync(async () => {
    const [cos, mem] = await Promise.all([
      fetchAll('v_company_overview', '*', 'name'),
      fetchAll('company_group_member', 'group_id, company_id, group_role(code, name)'),
    ]);
    const size = new Map<string, number>();
    for (const m of mem) size.set(m.group_id, (size.get(m.group_id) ?? 0) + 1);
    const byCo = new Map<string, { code: string; name: string; size: number }>();
    for (const m of mem) byCo.set(m.company_id, { code: m.group_role?.code ?? '', name: m.group_role?.name ?? '', size: size.get(m.group_id) ?? 1 });
    return cos.map((c): Row => ({ ...c, grp: byCo.get(c.company_id) ?? null }));
  }, [], 'companies');
  const [grp, setGrp] = useState('');
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [sector, setSector] = useState('');
  const [own, setOwn] = useState(false);
  const rows = data ?? [];
  const opts = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort() as string[];
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!s || [r.name, r.cvr, r.hq_city, r.primary_branch].join(' ').toLowerCase().includes(s)) &&
      (!region || r.region === region) && (!sector || r.sector === sector) && (!own || r.is_own) &&
      (!grp || (grp === 'parent' ? r.grp?.code === 'parent' : grp === 'in' ? !!r.grp : !r.grp)));
  }, [rows, q, region, sector, own, grp]);

  if (error) return <p className="err">{error}</p>;
  return (
    <>
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <h1>Virksomheder</h1>
        <a href={href('virksomhed-ny')} onClick={(e) => onLink(e, 'virksomhed-ny')}><button className="primary">Ny virksomhed</button></a>
      </div>
      <div className="filters">
        <input placeholder="Søg navn, CVR, by, branche" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Alle regioner</option>{opts('region').map((o) => <option key={o}>{o}</option>)}</select>
        <select value={sector} onChange={(e) => setSector(e.target.value)}><option value="">Alle sektorer</option>{opts('sector').map((o) => <option key={o}>{o}</option>)}</select>
        <select value={grp} onChange={(e) => setGrp(e.target.value)}>
          <option value="">Alle (koncern)</option><option value="parent">Kun koncerner (moderselskaber)</option><option value="in">Alle i en koncern</option><option value="none">Ikke i en koncern</option>
        </select>
        <label><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /> Kun egen virksomhed</label>
      </div>
      <div className="count">{loading ? '\u00a0' : `${shown.length} af ${rows.length} virksomheder`}</div>
      <div className="tablewrap" onKeyDown={arrowNav}>
        <table>
          <thead><tr><th>Navn</th><th>CVR</th><th>Sektor</th><th>Primær branche</th><th>Hovedkontor</th><th>Region</th><th>Koncern</th><th>Personer</th></tr></thead>
          <tbody>
            {loading && <SkeletonRows cols={8} />}
            {shown.map((r) => (
              <tr key={r.company_id}>
                <td><a href={href('virksomhed', r.company_id)} onClick={(e) => onLink(e, 'virksomhed', r.company_id)}>{r.name}</a>{r.is_own && <span className="tag">egen</span>}{!r.active && <span className="tag">inaktiv</span>}</td>
                <td>{r.cvr ?? ''}</td><td>{r.sector ?? ''}</td><td>{r.primary_branch}</td>
                <td>{[r.hq_postal_code, r.hq_city].filter(Boolean).join(' ')}</td><td>{r.region ?? ''}</td><td>{r.grp ? `${r.grp.name}, ${r.grp.size} selskaber` : ''}</td><td>{r.current_contacts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
