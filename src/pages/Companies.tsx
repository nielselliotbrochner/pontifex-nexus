import { useMemo, useState } from 'react';
import { fetchAll } from '../lib/data';
import { onLink, href } from '../lib/nav';
import { useAsync } from '../lib/useAsync';

export function Companies() {
  const { data, error, loading } = useAsync(() => fetchAll('v_company_overview', '*', 'name'), []);
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
      (!region || r.region === region) && (!sector || r.sector === sector) && (!own || r.is_own));
  }, [rows, q, region, sector, own]);

  if (error) return <p className="err">{error}</p>;
  return (
    <>
      <h1>Virksomheder</h1>
      <div className="filters">
        <input placeholder="Søg navn, CVR, by, branche" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Alle regioner</option>{opts('region').map((o) => <option key={o}>{o}</option>)}</select>
        <select value={sector} onChange={(e) => setSector(e.target.value)}><option value="">Alle sektorer</option>{opts('sector').map((o) => <option key={o}>{o}</option>)}</select>
        <label><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /> Kun egen virksomhed</label>
      </div>
      <div className="count">{loading ? 'Henter...' : `${shown.length} af ${rows.length} virksomheder`}</div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Navn</th><th>CVR</th><th>Sektor</th><th>Primær branche</th><th>Hovedkontor</th><th>Region</th><th>Personer</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.company_id}>
                <td><a href={href('virksomhed', r.company_id)} onClick={(e) => onLink(e, 'virksomhed', r.company_id)}>{r.name}</a>{r.is_own && <span className="tag">egen</span>}{!r.active && <span className="tag">inaktiv</span>}</td>
                <td>{r.cvr ?? ''}</td><td>{r.sector ?? ''}</td><td>{r.primary_branch}</td>
                <td>{[r.hq_postal_code, r.hq_city].filter(Boolean).join(' ')}</td><td>{r.region ?? ''}</td><td>{r.current_contacts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
