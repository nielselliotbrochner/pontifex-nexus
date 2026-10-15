import { supabase } from '../lib/supabase';
import { fullName, type Row } from '../lib/data';
import { onLink, href } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { SkeletonCards } from '../lib/ui';

export function Person({ id, priv }: { id: string; priv: boolean }) {
  const { data, error, loading } = useAsync(async () => {
    const ok = <T,>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
    const [c, aff, rel, links] = await Promise.all([
      supabase.from('contact').select('*').eq('id', id).maybeSingle().then(ok),
      supabase.from('contact_company').select('*, company(id,name), affiliation_type(name), level(name), job_function:function_id(name), company_location(name,city,postal_code)').eq('contact_id', id).order('is_primary', { ascending: false }).order('end_date', { nullsFirst: true }).then(ok),
      supabase.from('contact_relation').select('*, acquaintance(name)').eq('contact_id', id).maybeSingle().then(ok),
      supabase.from('person_link').select('*, person_link_type(name)').or(`contact_a.eq.${id},contact_b.eq.${id}`).then(ok),
    ]);
    const otherIds = ((links ?? []) as Row[]).map((l) => (l.contact_a === id ? l.contact_b : l.contact_a));
    const others = otherIds.length ? (ok(await supabase.from('contact').select('id, first_name, last_name').in('id', otherIds)) ?? []) : [];
    return { c: c as Row | null, aff: (aff ?? []) as Row[], rel: rel as Row | null, links: (links ?? []) as Row[], others: others as Row[] };
  }, [id], `person:${id}`);

  if (error) return <p className="err">{error}</p>;
  if (loading || !data) return <SkeletonCards />;
  const { c, aff, rel, links, others } = data;
  if (!c) return <p>Personen findes ikke.</p>;
  const name = new Map(others.map((o) => [o.id, fullName(o)]));

  return (
    <>
      <p className="back"><a href={href('personer')} onClick={(e) => onLink(e, 'personer')}>← Personer</a></p>
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <h1>{fullName(c)} {!c.active && <span className="tag">inaktiv</span>}</h1>
        <span className="inline"><a href={href('visualisering', 'p:' + id)} onClick={(e) => onLink(e, 'visualisering', 'p:' + id)}><button>Vis i netværk</button></a>
        <a href={href('person-ret', id)} onClick={(e) => onLink(e, 'person-ret', id)}><button className="primary">Redigér</button></a></span>
      </div>
      <div className="grid">
        <div className="card"><h3>Kontakt</h3>
          <dl className="kv">
            <dt>E-mail</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '-'}</dd>
            <dt>Telefon</dt><dd>{c.phone ?? '-'}</dd>
            <dt>LinkedIn</dt><dd>{c.linkedin_url ? <a href={c.linkedin_url.startsWith('http') ? c.linkedin_url : 'https://' + c.linkedin_url} target="_blank" rel="noreferrer">{c.linkedin_norm}</a> : '-'}</dd>
          </dl>
        </div>
        {priv && (
          <div className="card private"><h3>Privat (kun dig)</h3>
            <dl className="kv">
              <dt>Kendskab</dt><dd>{rel?.acquaintance?.name ?? '-'}</dd>
              <dt>Kendt siden</dt><dd>{rel?.acquainted_since ?? '-'}</dd>
              <dt>Ingen invitation</dt><dd>{rel?.no_invitation ? 'Ja' : 'Nej'}</dd>
              <dt>Noter</dt><dd>{rel?.notes ?? '-'}</dd>
            </dl>
          </div>
        )}
      </div>

      <h2>Tilknytninger</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Virksomhed</th><th>Type</th><th>Niveau</th><th>Funktion</th><th>Sted</th><th>Periode</th></tr></thead>
        <tbody>
          {aff.length === 0 && <tr><td colSpan={6} className="muted">Ingen tilknytninger.</td></tr>}
          {aff.map((a) => (
            <tr key={a.id}>
              <td><a href={href('virksomhed', a.company.id)} onClick={(e) => onLink(e, 'virksomhed', a.company.id)}>{a.company.name}</a>{a.is_primary && !a.end_date && <span className="tag">primær</span>}</td>
              <td>{a.affiliation_type?.name}</td><td>{a.level?.name ?? ''}</td><td>{a.job_function?.name ?? ''}</td>
              <td>{a.company_location ? [a.company_location.name, a.company_location.city].filter(Boolean).join(', ') : <span className="muted">hovedkontor</span>}</td>
              <td>{[a.start_date, a.end_date].some(Boolean) ? `${a.start_date ?? '?'} til ${a.end_date ?? 'nu'}` : <span className="muted">nuværende</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {priv && (
        <>
          <h2>Relationer til andre personer (privat)</h2>
          <div className="tablewrap"><table>
            <thead><tr><th>Person</th><th>Type</th><th>Note</th></tr></thead>
            <tbody>
              {links.length === 0 && <tr><td colSpan={3} className="muted">Ingen relationer.</td></tr>}
              {links.map((l) => { const o = l.contact_a === id ? l.contact_b : l.contact_a; return (
                <tr key={l.id}><td><a href={href('person', o)} onClick={(e) => onLink(e, 'person', o)}>{name.get(o) ?? o}</a></td><td>{l.person_link_type?.name}</td><td>{l.note ?? ''}</td></tr>
              ); })}
            </tbody>
          </table></div>
        </>
      )}
    </>
  );
}
