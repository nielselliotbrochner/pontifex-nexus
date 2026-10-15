import { useMemo, useState } from 'react';
import { go, href, onLink } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { loadAllActivities, who } from '../lib/activity';
import { arrowNav, SkeletonRows } from '../lib/ui';

export function Activities({ priv }: { priv: boolean }) {
  const { data, error, loading } = useAsync(loadAllActivities, [], 'activities');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const rows = data ?? [];
  const types = useMemo(() => [...new Set(rows.map((r) => r.activity_type?.name as string).filter(Boolean))].sort(), [rows]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((a) => (!type || a.activity_type?.name === type) && (!s || [a.title, who(a, 99), priv ? a.body : ''].join(' ').toLowerCase().includes(s)));
  }, [rows, q, type, priv]);

  if (error) return <p className="err">{error}</p>;
  return (
    <>
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <h1>Aktiviteter</h1>
        <button className="primary" onClick={() => go('aktivitet-ny')}>Ny aktivitet</button>
      </div>
      <div className="filters">
        <input placeholder="Søg titel, person, virksomhed" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">Alle typer</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <div className="count">{loading ? ' ' : `${shown.length} af ${rows.length} aktiviteter`}</div>
      <div className="tablewrap" onKeyDown={arrowNav}>
        <table>
          <thead><tr><th style={{ width: 90 }}>Dato</th><th style={{ width: 90 }}>Type</th><th>Titel</th><th>Med / om</th><th>Filer</th></tr></thead>
          <tbody>
            {loading && <SkeletonRows cols={5} />}
            {shown.map((a) => (
              <tr key={a.id}>
                <td>{a.occurred_on}</td>
                <td><span className="tag" style={{ marginLeft: 0 }}>{a.activity_type?.name}</span></td>
                <td><a href={href('aktivitet', a.id)} onClick={(e) => onLink(e, 'aktivitet', a.id)}>{a.title}</a>{a.visibility === 'private' && <span className="tag">privat</span>}</td>
                <td>{who(a, 5)}</td>
                <td>{a.activity_file?.length || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
