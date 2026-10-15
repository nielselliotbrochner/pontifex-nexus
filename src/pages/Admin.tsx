import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { LOOKUP_TABLES, fetchAll, type Row } from '../lib/data';
import { useAsync } from '../lib/useAsync';

type Tab = 'lister' | 'skema' | 'brugere';

export function Admin({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>('lister');
  return (
    <>
      <h1>Admin</h1>
      <div className="tabs">
        <button className={tab === 'lister' ? 'on' : ''} onClick={() => setTab('lister')}>Opslagslister</button>
        <button className={tab === 'skema' ? 'on' : ''} onClick={() => setTab('skema')}>Tabeller og relationer</button>
        <button className={tab === 'brugere' ? 'on' : ''} onClick={() => setTab('brugere')}>Brugere</button>
      </div>
      {tab === 'lister' && <Lookups />}
      {tab === 'skema' && <Schema />}
      {tab === 'brugere' && <Users userId={userId} />}
    </>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function Lookups() {
  const [table, setTable] = useState(LOOKUP_TABLES[0].name);
  const { data, error, reload } = useAsync(() => fetchAll(table, '*', 'sort_order'), [table]);
  const [name, setName] = useState('');
  const [sort, setSort] = useState('');
  const [parent, setParent] = useState('');
  const [msg, setMsg] = useState('');
  const isBranch = table === 'branch';
  const rows = data ?? [];
  const roots = rows.filter((r) => !r.parent_id);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const next = sort !== '' ? Number(sort) : (rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) + 10);
    const rec: Row = { code: slug(name), name: name.trim(), sort_order: next };
    if (isBranch) rec.parent_id = parent || null;
    const { error: er } = await supabase.from(table).insert(rec);
    setMsg(er ? `Kunne ikke tilføje: ${er.message}` : `Tilføjet: ${name.trim()}`);
    if (!er) { setName(''); setSort(''); reload(); }
  }
  async function update(id: string, patch: Row) {
    const { error: er } = await supabase.from(table).update(patch).eq('id', id);
    setMsg(er ? `Kunne ikke gemme: ${er.message}` : 'Gemt');
    reload();
  }
  async function remove(r: Row) {
    if (!window.confirm(`Slet »${r.name}«?`)) return;
    const { error: er } = await supabase.from(table).delete().eq('id', r.id);
    setMsg(er ? `Kunne ikke slette (er værdien i brug?): ${er.message}` : `Slettet: ${r.name}`);
    reload();
  }
  const parentName = (id: string | null) => rows.find((r) => r.id === id)?.name ?? '';

  return (
    <>
      <div className="filters">
        <select value={table} onChange={(e) => { setTable(e.target.value); setMsg(''); }}>
          {LOOKUP_TABLES.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
        </select>
        <span className="muted">Tilføj, omdøb, sortér eller deaktiver værdier. Systemværdier kan ikke slettes.</span>
      </div>
      <form className="filters" onSubmit={add}>
        <input placeholder="Ny værdi" value={name} onChange={(e) => setName(e.target.value)} />
        {isBranch && <select value={parent} onChange={(e) => setParent(e.target.value)}><option value="">Hovedbranche</option>{roots.map((r) => <option key={r.id} value={r.id}>Under: {r.name}</option>)}</select>}
        <input placeholder="Rækkefølge" type="number" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 110 }} />
        <button className="primary" type="submit">Tilføj</button>
      </form>
      {msg && <p role="status" className={msg.startsWith('Kunne') ? 'err' : 'ok'}>{msg}</p>}
      {error && <p className="err">{error}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Navn</th>{isBranch && <th>Under</th>}<th>Kode</th><th>Rækkefølge</th><th>Aktiv</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Editable value={r.name} onSave={(v) => update(r.id, { name: v })} />{r.is_system && <span className="tag">system</span>}</td>
              {isBranch && <td className="muted">{parentName(r.parent_id)}</td>}
              <td className="muted">{r.code}</td>
              <td><Editable value={String(r.sort_order)} type="number" onSave={(v) => update(r.id, { sort_order: Number(v) })} width={80} /></td>
              <td><input type="checkbox" checked={r.active} onChange={(e) => update(r.id, { active: e.target.checked })} /></td>
              <td>{!r.is_system && <button onClick={() => remove(r)}>Slet</button>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}

function Editable({ value, onSave, type = 'text', width }: { value: string; onSave: (v: string) => void; type?: string; width?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input type={type} value={v} style={{ width: width ?? 220, border: 'none', background: 'transparent' }}
    onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value && v.trim() !== '') onSave(v.trim()); else setV(value); }}
    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

type Tbl = { name: string; rows: number; columns: { name: string; type: string; not_null: boolean; pk: boolean }[]; fks: { columns: string[]; ref_table: string; ref_columns: string[] }[] };

function mermaidSource(tables: Tbl[], showCols: boolean, hideOwner: boolean): string {
  const lines = ['erDiagram'];
  const fkCols = (t: Tbl) => new Set(t.fks.flatMap((f) => f.columns));
  for (const t of tables) {
    if (!showCols) { lines.push(`  ${t.name}`); continue; }
    lines.push(`  ${t.name} {`);
    const fk = fkCols(t);
    for (const c of t.columns) {
      const ty = c.type.replace(/[^a-zA-Z0-9]+/g, '_').replace(/_$/, '') || 'x';
      lines.push(`    ${ty} ${c.name}${c.pk ? ' PK' : fk.has(c.name) ? ' FK' : ''}`);
    }
    lines.push('  }');
  }
  for (const t of tables) {
    for (const f of t.fks) {
      if (hideOwner && f.ref_table === 'app_user') continue;
      const nullable = f.columns.some((c) => !t.columns.find((x) => x.name === c)?.not_null);
      lines.push(`  ${t.name} }o--${nullable ? 'o|' : '||'} ${f.ref_table} : "${f.columns.join('+')}"`);
    }
  }
  return lines.join('\n');
}

function Schema() {
  const { data, error } = useAsync(async () => {
    const { data, error } = await supabase.rpc('schema_overview');
    if (error) throw new Error(error.message);
    return (data as { tables: Tbl[] }).tables;
  }, []);
  const [showCols, setShowCols] = useState(false);
  const [hideOwner, setHideOwner] = useState(true);
  const [svg, setSvg] = useState('');
  const [zoom, setZoom] = useState(150);
  const [renderErr, setRenderErr] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    if (!data) return;
    const n = ++seq.current;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'strict', er: { useMaxWidth: false },
          themeVariables: { primaryColor: '#F2E2D5', primaryBorderColor: '#BA1223', primaryTextColor: '#241c1b', lineColor: '#700B15', fontFamily: 'Aptos, Segoe UI, system-ui, sans-serif' } });
        const out = await mermaid.render(`er${n}`, mermaidSource(data, showCols, hideOwner));
        if (n === seq.current) { setSvg(out.svg); setRenderErr(''); }
      } catch (e) { if (n === seq.current) setRenderErr(e instanceof Error ? e.message : String(e)); }
    })();
  }, [data, showCols, hideOwner]);

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="muted">Henter...</p>;
  const referencedBy = (name: string) => data.flatMap((t) => t.fks.filter((f) => f.ref_table === name).map((f) => `${t.name}.${f.columns.join('+')}`));

  return (
    <>
      <div className="filters">
        <label><input type="checkbox" checked={showCols} onChange={(e) => setShowCols(e.target.checked)} /> Vis kolonner i diagram</label>
        <label><input type="checkbox" checked={hideOwner} onChange={(e) => setHideOwner(e.target.checked)} /> Skjul relationer til brugertabel (created_by, owner_id)</label>
        <label>Zoom <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>{[100, 150, 200, 300].map((z) => <option key={z} value={z}>{z === 100 ? 'Tilpas bredde' : `${z} %`}</option>)}</select></label>
        <span className="muted">{data.length} tabeller</span>
      </div>
      {renderErr && <p className="err">Diagram kunne ikke tegnes: {renderErr}</p>}
      <div className="diagram"><div className="diagram-inner" style={{ width: `${zoom}%` }} dangerouslySetInnerHTML={{ __html: svg }} /></div>
      <h2>Alle tabeller</h2>
      <div className="grid">
        {data.map((t) => (
          <div className="card" key={t.name}>
            <h3>{t.name} <span className="muted">({t.rows} rækker)</span></h3>
            <div style={{ fontSize: 13 }}>
              {t.columns.map((c) => <div key={c.name}><strong>{c.name}</strong>{c.pk && <span className="tag">PK</span>} <span className="muted">{c.type}{c.not_null ? '' : ', valgfri'}</span></div>)}
            </div>
            {t.fks.length > 0 && <p style={{ marginBottom: 0 }}><span className="muted">Peger på:</span> {t.fks.map((f, i) => <span key={i} className="tag">{f.columns.join('+')} → {f.ref_table}</span>)}</p>}
            {referencedBy(t.name).length > 0 && <p style={{ marginBottom: 0 }}><span className="muted">Bruges af:</span> {referencedBy(t.name).map((r) => <span key={r} className="tag">{r}</span>)}</p>}
          </div>
        ))}
      </div>
    </>
  );
}

function Users({ userId }: { userId: string }) {
  const { data, error, reload } = useAsync(() => fetchAll('app_user', '*', 'created_at'), []);
  const [msg, setMsg] = useState('');
  async function update(id: string, patch: Row) {
    const { error: er } = await supabase.from('app_user').update(patch).eq('user_id', id);
    setMsg(er ? `Kunne ikke gemme: ${er.message}` : 'Gemt');
    reload();
  }
  return (
    <>
      <p className="muted">Nye brugere oprettes i Supabase (Authentication, Users). Her aktiverer du dem og vælger rolle.</p>
      {msg && <p role="status" className={msg.startsWith('Kunne') ? 'err' : 'ok'}>{msg}</p>}
      {error && <p className="err">{error}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Navn</th><th>Rolle</th><th>Aktiv</th><th>Oprettet</th></tr></thead>
        <tbody>
          {(data ?? []).map((u) => (
            <tr key={u.user_id}>
              <td>{u.display_name}</td>
              <td><select disabled={u.user_id === userId} title={u.user_id === userId ? 'Du kan ikke ændre din egen rolle' : ''} value={u.role} onChange={(e) => update(u.user_id, { role: e.target.value })}><option value="owner">Ejer</option><option value="member">Medlem</option></select></td>
              <td><input type="checkbox" disabled={u.user_id === userId} checked={u.active} onChange={(e) => update(u.user_id, { active: e.target.checked })} /></td>
              <td className="muted">{String(u.created_at).slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}
