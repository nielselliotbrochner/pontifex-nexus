import { supabase } from '../lib/supabase';
import { fullName, type Row } from '../lib/data';
import { onLink, href } from '../lib/nav';
import { useAsync } from '../lib/useAsync';

export function Company({ id, priv }: { id: string; priv: boolean }) {
  const { data, error, loading } = useAsync(async () => {
    const ok = <T,>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
    const [co, locs, br, people, mem, rel] = await Promise.all([
      supabase.from('company').select('*, sector(name)').eq('id', id).maybeSingle().then(ok),
      supabase.from('company_location').select('*').eq('company_id', id).order('is_hq', { ascending: false }).then(ok),
      supabase.from('company_branch').select('is_primary, branch(name, parent:parent_id(name))').eq('company_id', id).order('is_primary', { ascending: false }).then(ok),
      supabase.from('contact_company').select('*, contact(id,first_name,last_name), affiliation_type(name), level(name, sort_order), job_function:function_id(name)').eq('company_id', id).then(ok),
      supabase.from('company_group_member').select('group_id, group_role(name)').eq('company_id', id).then(ok),
      supabase.from('company_relation').select('*, stage(name), contact:responsible_contact_id(first_name,last_name)').eq('company_id', id).maybeSingle().then(ok),
    ]);
    const groupIds = ((mem ?? []) as Row[]).map((m) => m.group_id);
    const group = groupIds.length
      ? ((ok(await supabase.from('company_group_member').select('group_id, company(id,name), group_role(name, code)').in('group_id', groupIds)) ?? []) as Row[])
      : [];
    return { co: co as Row | null, locs: (locs ?? []) as Row[], br: (br ?? []) as Row[], people: (people ?? []) as Row[], group, rel: rel as Row | null };
  }, [id]);

  if (error) return <p className="err">{error}</p>;
  if (loading || !data) return <p className="muted">Henter...</p>;
  const { co, locs, br, people, group, rel } = data;
  if (!co) return <p>Virksomheden findes ikke.</p>;
  const cur = people.filter((p) => !p.end_date).sort((a, b) => (a.level?.sort_order ?? 99) - (b.level?.sort_order ?? 99));
  const past = people.filter((p) => p.end_date);
  const locName = (lid: string | null) => { const l = locs.find((x) => x.id === lid); return l ? (l.name ?? l.city ?? '') : 'hovedkontor'; };

  const PeopleTable = ({ list }: { list: Row[] }) => (
    <div className="tablewrap"><table>
      <thead><tr><th>Navn</th><th>Type</th><th>Niveau</th><th>Funktion</th><th>Sted</th><th>Periode</th></tr></thead>
      <tbody>
        {list.length === 0 && <tr><td colSpan={6} className="muted">Ingen.</td></tr>}
        {list.map((p) => (
          <tr key={p.id}>
            <td><a href={href('person', p.contact.id)} onClick={(e) => onLink(e, 'person', p.contact.id)}>{fullName(p.contact)}</a></td>
            <td>{p.affiliation_type?.name}</td><td>{p.level?.name ?? ''}</td><td>{p.job_function?.name ?? ''}</td>
            <td>{locName(p.location_id)}</td>
            <td>{[p.start_date, p.end_date].some(Boolean) ? `${p.start_date ?? '?'} til ${p.end_date ?? 'nu'}` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );

  return (
    <>
      <p><a href={href('virksomheder')} onClick={(e) => onLink(e, 'virksomheder')}>← Virksomheder</a></p>
      <h1>{co.name} {co.is_own && <span className="tag">egen</span>} {!co.active && <span className="tag">inaktiv</span>}</h1>
      <div className="grid">
        <div className="card"><h3>Stamdata</h3>
          <dl className="kv">
            <dt>CVR</dt><dd>{co.cvr ?? '-'}</dd>
            <dt>Sektor</dt><dd>{co.sector?.name ?? '-'}</dd>
            <dt>Hjemmeside</dt><dd>{co.website ? <a href={co.website} target="_blank" rel="noreferrer">{co.website}</a> : '-'}</dd>
            <dt>Brancher</dt><dd>{br.length ? br.map((b, i) => <span key={i} className="tag">{b.branch.parent ? `${b.branch.parent.name} / ` : ''}{b.branch.name}{b.is_primary ? ' (primær)' : ''}</span>) : '-'}</dd>
          </dl>
        </div>
        <div className="card"><h3>Lokationer</h3>
          {locs.length === 0 && <span className="muted">Ingen.</span>}
          {locs.map((l) => <div key={l.id}><strong>{l.name ?? l.city}</strong>{l.is_hq && <span className="tag">hovedkontor</span>}<br /><span className="muted">{[l.address, [l.postal_code, l.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span></div>)}
        </div>
        <div className="card"><h3>Koncern</h3>
          {group.length === 0 && <span className="muted">Ikke i en koncern.</span>}
          {group.map((g) => <div key={g.company.id + g.group_id}>{g.company.id === id ? <strong>{g.company.name}</strong> : <a href={href('virksomhed', g.company.id)} onClick={(e) => onLink(e, 'virksomhed', g.company.id)}>{g.company.name}</a>} <span className="tag">{g.group_role.name}</span></div>)}
        </div>
        {priv && (
          <div className="card private"><h3>Privat (kun dig)</h3>
            <dl className="kv">
              <dt>Modenhed</dt><dd>{rel?.stage?.name ?? '-'}</dd>
              <dt>Ansvarlig</dt><dd>{rel?.contact ? fullName(rel.contact) : '-'}</dd>
              <dt>Noter</dt><dd>{rel?.notes ?? '-'}</dd>
            </dl>
          </div>
        )}
      </div>
      <h2>Nuværende personer ({cur.length})</h2><PeopleTable list={cur} />
      {past.length > 0 && <><h2>Tidligere personer ({past.length})</h2><PeopleTable list={past} /></>}
    </>
  );
}
