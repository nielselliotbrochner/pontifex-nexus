import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fullName, type Row } from '../lib/data';
import { go, href, onLink } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { takeFlash } from '../lib/form';
import { SkeletonCards } from '../lib/ui';

export function Activity({ id, priv }: { id: string; priv: boolean }) {
  const { data: a, error, loading } = useAsync(async () => {
    const { data, error: er } = await supabase.from('activity').select(`*, activity_type(code, name),
      activity_participant(contact_id, company_id, note, contact(id, first_name, middle_name, last_name), company(id, name)),
      activity_company(company(id, name)), activity_subject(contact(id, first_name, middle_name, last_name)), activity_file(*)`).eq('id', id).maybeSingle();
    if (er) throw new Error(er.message);
    return data as Row | null;
  }, [id], `activity:${id}`);
  const [msg, setMsg] = useState(takeFlash());

  async function open(f: Row) {
    const { data, error: er } = await supabase.storage.from('activity-files').createSignedUrl(f.path, 120);
    if (er || !data) return setMsg(`Kunne ikke åbne filen: ${er?.message ?? ''}`);
    window.open(data.signedUrl, '_blank', 'noopener');
  }
  async function remove() {
    if (!a || !window.confirm('Slet aktiviteten og dens filer?')) return;
    const paths = ((a.activity_file ?? []) as Row[]).map((f) => f.path);
    if (paths.length) await supabase.storage.from('activity-files').remove(paths);
    const { error: er } = await supabase.from('activity').delete().eq('id', id);
    if (er) return setMsg(`Kunne ikke slette: ${er.message}`);
    go('aktiviteter');
  }

  if (error) return <p className="err">{error}</p>;
  if (loading) return <SkeletonCards />;
  if (!a) return <p>Aktiviteten findes ikke, eller du har ikke adgang til den.</p>;
  const link = (v: string, r: Row, label: string) => <a key={r.id + label} href={href(v, r.id)} onClick={(e) => onLink(e, v, r.id)}>{label}</a>;
  const parts = (a.activity_participant ?? []) as Row[];
  const subs = (a.activity_subject ?? []) as Row[];
  const cos = (a.activity_company ?? []) as Row[];
  const files = (a.activity_file ?? []) as Row[];
  const sep = (items: React.ReactNode[]) => items.flatMap((x, i) => (i ? [', ', x] : [x]));

  return (
    <>
      <p className="back"><a href={href('aktiviteter')} onClick={(e) => onLink(e, 'aktiviteter')}>← Aktiviteter</a></p>
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <h1>{a.title} <span className="tag">{a.activity_type?.name}</span>{a.visibility === 'private' && <span className="tag">privat</span>}</h1>
        <span className="inline">
          <a href={href('aktivitet-ret', id)} onClick={(e) => onLink(e, 'aktivitet-ret', id)}><button className="primary">Redigér</button></a>
          <button className="danger" onClick={remove}>Slet</button>
        </span>
      </div>
      {msg && <p role="status" className={msg.startsWith('Kunne') ? 'err' : 'ok'}>{msg}</p>}
      <div className="grid">
        <div className="card"><h3>Oplysninger</h3>
          <dl className="kv">
            <dt>Dato</dt><dd>{a.occurred_on}</dd>
            <dt>Kilde</dt><dd>{a.source_url ? <a href={a.source_url.startsWith('http') ? a.source_url : 'https://' + a.source_url} target="_blank" rel="noreferrer">{a.source_url}</a> : '-'}</dd>
            {parts.length > 0 && <><dt>Deltagere</dt><dd>{sep(parts.map((p) => <span key={p.contact_id}>{link('person', p.contact, fullName(p.contact))}{p.company && <span className="muted"> ({p.company.name})</span>}</span>))}</dd></>}
            {subs.length > 0 && <><dt>Om personer</dt><dd>{sep(subs.map((s) => link('person', s.contact, fullName(s.contact))))}</dd></>}
            {cos.length > 0 && <><dt>Om virksomheder</dt><dd>{sep(cos.map((c) => link('virksomhed', c.company, c.company.name)))}</dd></>}
          </dl>
        </div>
        <div className="card"><h3>Filer ({files.length})</h3>
          {files.length === 0 && <span className="muted">Ingen filer.</span>}
          {files.map((f) => (
            <div key={f.id}><button className="small" onClick={() => open(f)}>Åbn</button> {f.file_name} <span className="muted">{f.size_bytes ? `${Math.max(1, Math.round(f.size_bytes / 1024))} kB` : ''}</span></div>
          ))}
        </div>
      </div>
      <h2>Tekst</h2>
      {priv
        ? <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{a.body || <span className="muted">Ingen tekst.</span>}</div>
        : <p className="muted">Teksten er skjult, fordi Privat visning er slået fra.</p>}
    </>
  );
}
