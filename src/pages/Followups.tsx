import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Row } from '../lib/data';
import { href, onLink } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { today } from '../lib/form';
import { SkeletonRows } from '../lib/ui';

const cmpDue = (a: Row, b: Row) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999');

async function toggle(f: Row) {
  return supabase.from('activity_followup').update({ done_at: f.done_at ? null : new Date().toISOString() }).eq('id', f.id);
}

// Opfølgninger på tværs af aktiviteter.
export function Followups() {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [showDone, setShowDone] = useState(false);
  const { data, error, loading, reload } = useAsync(async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: rows, error: er } = await supabase.from('activity_followup')
      .select('id, text, due_on, done_at, assigned_to, activity_id, activity(id, title, occurred_on)').order('created_at', { ascending: false }).limit(1000);
    if (er) throw new Error(er.message);
    return { me: u.user?.id ?? '', rows: (rows ?? []) as unknown as Row[] };
  }, [], 'followups');
  const [err, setErr] = useState('');
  if (error) return <p className="err">{error}</p>;
  const t = today();
  const all = data?.rows ?? [];
  const mine = (r: Row) => scope === 'all' || r.assigned_to === data?.me;
  const open = all.filter((r) => !r.done_at && mine(r)).sort(cmpDue);
  const done = all.filter((r) => r.done_at && mine(r));
  const shown = showDone ? [...open, ...done] : open;
  const overdue = open.filter((r) => r.due_on && r.due_on < t).length;

  async function flip(r: Row) {
    const { error: er } = await toggle(r);
    if (er) return setErr(er.message);
    setErr('');
    reload();
  }
  return (
    <>
      <h1>Opfølgninger</h1>
      <div className="filters">
        <select value={scope} onChange={(e) => setScope(e.target.value as 'mine' | 'all')}><option value="mine">Mine</option><option value="all">Alle kolleger</option></select>
        <label><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Vis afsluttede</label>
      </div>
      <div className="count">{loading ? ' ' : `${open.length} åbne${overdue ? `, ${overdue} forfaldne` : ''}`}</div>
      {err && <p className="err">{err}</p>}
      <div className="tablewrap">
        <table>
          <thead><tr><th style={{ width: 30 }}></th><th style={{ width: 100 }}>Frist</th><th>Opfølgning</th><th>Aktivitet</th></tr></thead>
          <tbody>
            {loading && <SkeletonRows cols={4} />}
            {!loading && shown.length === 0 && <tr><td colSpan={4} className="muted">Ingen opfølgninger.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={!!r.done_at} onChange={() => flip(r)} aria-label="Afsluttet" /></td>
                <td style={r.due_on && r.due_on < t && !r.done_at ? { color: 'var(--accent)', fontWeight: 600 } : undefined}>{r.due_on ?? '-'}</td>
                <td style={r.done_at ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{r.text}</td>
                <td><a href={href('aktivitet', r.activity.id)} onClick={(e) => onLink(e, 'aktivitet', r.activity.id)}>{r.activity.title}</a> <span className="muted">{r.activity.occurred_on}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Opfølgninger på én aktivitet (tilføj, afslut, slet).
export function ActivityFollowups({ activityId }: { activityId: string }) {
  const { data, reload } = useAsync(async () => {
    const { data: rows, error: er } = await supabase.from('activity_followup').select('*').eq('activity_id', activityId).order('created_at');
    if (er) throw new Error(er.message);
    return (rows ?? []) as Row[];
  }, [activityId], `fu:${activityId}`);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [err, setErr] = useState('');
  const t = today();

  async function add() {
    if (!text.trim()) return;
    const { error: er } = await supabase.from('activity_followup').insert({ activity_id: activityId, text: text.trim(), due_on: due || null });
    if (er) return setErr(er.message);
    setText(''); setDue(''); setErr(''); reload();
  }
  async function flip(f: Row) { const { error: er } = await toggle(f); if (er) setErr(er.message); else reload(); }
  async function del(f: Row) {
    const { error: er } = await supabase.from('activity_followup').delete().eq('id', f.id);
    if (er) setErr(er.message); else reload();
  }
  return (
    <>
      <h2>Opfølgninger</h2>
      <div className="card">
        {(data ?? []).length === 0 && <span className="muted">Ingen opfølgninger.</span>}
        {(data ?? []).map((f) => (
          <div key={f.id} className="inline" style={{ marginBottom: 4 }}>
            <input type="checkbox" checked={!!f.done_at} onChange={() => flip(f)} aria-label="Afsluttet" />
            <span style={f.done_at ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{f.text}</span>
            {f.due_on && <span className={f.due_on < t && !f.done_at ? 'tag' : 'muted'}>{f.due_on}</span>}
            <button className="small" onClick={() => del(f)}>Slet</button>
          </div>
        ))}
        <div className="inline" style={{ marginTop: 6 }}>
          <input placeholder="Ny opfølgning" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} style={{ flex: '1 1 220px' }} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Frist" />
          <button className="primary" onClick={add}>Tilføj</button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
    </>
  );
}
