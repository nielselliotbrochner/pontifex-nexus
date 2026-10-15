import { useMemo, useState } from 'react';
import { go, href, onLink } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { loadTimeline, who } from '../lib/activity';
import { SkeletonRows } from '../lib/ui';

// Kronologi over al aktivitet om en person eller virksomhed. Bruges på deres sider.
export function Timeline({ kind, id, priv }: { kind: 'p' | 'c'; id: string; priv: boolean }) {
  const { data, error, loading } = useAsync(() => loadTimeline(kind, id), [kind, id], `timeline:${kind}:${id}`);
  const [type, setType] = useState('');
  const rows = data ?? [];
  const types = useMemo(() => [...new Set(rows.map((r) => r.activity_type?.name as string).filter(Boolean))].sort(), [rows]);
  const shown = rows.filter((r) => !type || r.activity_type?.name === type);

  return (
    <section className="sec">
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <h2>Aktivitet ({rows.length})</h2>
        <span className="inline">
          {types.length > 1 && <select value={type} onChange={(e) => setType(e.target.value)}><option value="">Alle typer</option>{types.map((t) => <option key={t}>{t}</option>)}</select>}
          <button className="primary" onClick={() => go('aktivitet-ny', `${kind}:${id}`)}>Ny aktivitet</button>
        </span>
      </div>
      {error && <p className="err">{error}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th style={{ width: 90 }}>Dato</th><th style={{ width: 90 }}>Type</th><th>Titel</th><th>Med / om</th><th>Filer</th></tr></thead>
        <tbody>
          {loading && <SkeletonRows cols={5} rows={3} />}
          {!loading && shown.length === 0 && <tr><td colSpan={5} className="muted">Ingen aktivitet endnu.</td></tr>}
          {shown.map((a) => (
            <tr key={a.id}>
              <td>{a.occurred_on}</td>
              <td><span className="tag" style={{ marginLeft: 0 }}>{a.activity_type?.name}</span></td>
              <td>
                <a href={href('aktivitet', a.id)} onClick={(e) => onLink(e, 'aktivitet', a.id)}>{a.title}</a>
                {a.visibility === 'private' && <span className="tag">privat</span>}
                {priv && a.body && <div className="muted">{String(a.body).slice(0, 140)}{String(a.body).length > 140 ? '...' : ''}</div>}
              </td>
              <td>{who(a)}</td>
              <td>{a.activity_file?.length ? a.activity_file.length : ''}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}
