import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll, fullName, type Row } from '../lib/data';
import { go, href, onLink } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { useLookups, lookupByCode, type Lookups } from '../lib/lookups';
import { personDupes, companyDupes, type Dupe } from '../lib/dupes';
import { pokeGeo } from '../lib/geoWorker';
import { Field, Picker, Select, nz, setFlash, takeFlash, today, useDebounced } from '../lib/form';
import { SkeletonCards } from '../lib/ui';

const blank = { first_name: '', middle_name: '', last_name: '', email: '', phone: '', linkedin_url: '', active: true };

export function PersonForm({ id, priv }: { id: string | null; priv: boolean }) {
  const [f, setF] = useState(blank);
  const [loaded, setLoaded] = useState(!id);
  const [dupes, setDupes] = useState<Dupe[]>([]);
  const [force, setForce] = useState(false);
  const [msg, setMsg] = useState(() => takeFlash());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank, v: string | boolean) => { setErr(''); setF((x) => ({ ...x, [k]: v })); };

  useEffect(() => {
    if (!id) return;
    supabase.from('contact').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (error) setErr(error.message);
      else if (data) setF({ first_name: data.first_name ?? '', middle_name: data.middle_name ?? '', last_name: data.last_name ?? '', email: data.email ?? '', phone: data.phone ?? '', linkedin_url: data.linkedin_url ?? '', active: data.active });
      setLoaded(true);
    });
  }, [id]);

  const key = useDebounced(JSON.stringify([f.first_name, f.last_name, f.email, f.linkedin_url]));
  useEffect(() => {
    if (!loaded) return;
    personDupes({ id, first: f.first_name, last: f.last_name, email: f.email, linkedin: f.linkedin_url }).then(setDupes, () => setDupes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded]);

  const hard = dupes.filter((d) => d.kind === 'linkedin');
  const soft = dupes.filter((d) => d.kind !== 'linkedin');

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!f.first_name.trim()) return setErr('Fornavn mangler.');
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr('E-mailadressen er ikke gyldig.');
    if (hard.length) return setErr('LinkedIn-adressen findes allerede på en anden person. Åbn den i stedet.');
    if (!id && soft.length && !force) return setErr('Personen ligner en eksisterende. Marker »Opret alligevel«, hvis det er en anden person.');
    setBusy(true);
    const rec = { first_name: f.first_name.trim(), middle_name: nz(f.middle_name), last_name: nz(f.last_name), email: nz(f.email), phone: nz(f.phone), linkedin_url: nz(f.linkedin_url), active: f.active };
    if (id) {
      const { error } = await supabase.from('contact').update(rec).eq('id', id);
      setBusy(false);
      if (error) return setErr(error.message.includes('contact_linkedin_uq') ? 'LinkedIn-adressen findes allerede på en anden person.' : error.message);
      setMsg('Gemt.');
    } else {
      const { data, error } = await supabase.from('contact').insert(rec).select('id').single();
      setBusy(false);
      if (error) return setErr(error.message.includes('contact_linkedin_uq') ? 'LinkedIn-adressen findes allerede på en anden person.' : error.message);
      setFlash('Personen er oprettet. Tilføj tilknytning til en virksomhed nedenfor.');
      go('person-ret', data.id);
    }
  }

  async function remove() {
    if (!id || !window.confirm(`Slet ${fullName(f as Row)}? Tilknytninger og private noter slettes også.`)) return;
    const { error } = await supabase.from('contact').delete().eq('id', id);
    if (error) return setErr(error.message.includes('row-level') || error.code === '42501' ? 'Kun den, der oprettede personen, eller ejeren kan slette.' : error.message);
    go('personer');
  }

  if (!loaded) return <SkeletonCards n={2} />;
  return (
    <>
      <p className="back"><a href={id ? href('person', id) : href('personer')} onClick={(e) => (id ? onLink(e, 'person', id) : onLink(e, 'personer'))}>← {id ? 'Til personen' : 'Personer'}</a></p>
      <h1>{id ? `Redigér ${fullName(f as Row)}` : 'Ny person'}</h1>
      {msg && <p role="status" className="ok">{msg}</p>}
      <form onSubmit={save}>
        <div className="form">
          <Field label="Fornavn *"><input value={f.first_name} onChange={(e) => set('first_name', e.target.value)} autoFocus={!id} /></Field>
          <Field label="Mellemnavn"><input value={f.middle_name} onChange={(e) => set('middle_name', e.target.value)} /></Field>
          <Field label="Efternavn"><input value={f.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
          <Field label="E-mail"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Telefon"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="LinkedIn"><input value={f.linkedin_url} onChange={(e) => set('linkedin_url', e.target.value)} placeholder="linkedin.com/in/..." /></Field>
          {id && <Field label="Status"><label><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Aktiv</label></Field>}
        </div>
        {hard.length > 0 && <Notice hard dupes={hard} text="Samme LinkedIn-adresse findes allerede:" />}
        {soft.length > 0 && <Notice dupes={soft} text="Ligner eksisterende (samme e-mail eller navn):" force={!id ? [force, setForce] : undefined} />}
        {err && <p role="alert" className="err">{err}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>{id ? 'Gem' : 'Opret person'}</button>
          {id && <button type="button" className="danger" onClick={remove}>Slet person</button>}
        </div>
      </form>
      {id && <Affiliations contactId={id} />}
      {id && priv && <PrivateRelation contactId={id} />}
      {id && priv && <PersonLinks contactId={id} />}
    </>
  );
}

function Notice({ dupes, text, hard, force }: { dupes: Dupe[]; text: string; hard?: boolean; force?: [boolean, (v: boolean) => void] }) {
  return (
    <div className={`notice ${hard ? 'hard' : 'soft'}`} role="status">
      {text}
      <ul>{dupes.map((d, i) => (
        <li key={i}><a href={href('person', d.row.id)} target="_blank" rel="noreferrer">{fullName(d.row)}</a>{d.row.email ? <span className="muted"> ({d.row.email})</span> : null} <span className="tag">{d.kind === 'email' ? 'samme e-mail' : d.kind === 'name' ? 'samme navn' : 'samme LinkedIn'}</span></li>
      ))}</ul>
      {force && <label style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={force[0]} onChange={(e) => force[1](e.target.checked)} /> Opret alligevel, det er en anden person</label>}
    </div>
  );
}

type Aff = { company_id: string; affiliation_type_id: string; level_id: string; function_id: string; location_id: string; start_date: string; end_date: string; is_primary: boolean; note: string };

function Affiliations({ contactId }: { contactId: string }) {
  const lk = useLookups();
  const { data: rows, reload, error } = useAsync(async () => {
    const { data, error: er } = await supabase.from('contact_company')
      .select('*, company(id,name), affiliation_type(name), level(name), job_function:function_id(name), company_location(name,city)')
      .eq('contact_id', contactId).order('is_primary', { ascending: false }).order('end_date', { nullsFirst: true });
    if (er) throw new Error(er.message);
    return (data ?? []) as Row[];
  }, [contactId]);
  const companies = useAsync(() => fetchAll('company', 'id, name, cvr', 'name'), [], 'companyPick');
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const [msg, setMsg] = useState('');

  return (
    <section className="sec">
      <h2>Tilknytninger</h2>
      {error && <p className="err">{error}</p>}
      {msg && <p role="status" className={msg.startsWith('Kunne') ? 'err' : 'ok'}>{msg}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Virksomhed</th><th>Type</th><th>Niveau</th><th>Funktion</th><th>Periode</th><th></th></tr></thead>
        <tbody>
          {(rows ?? []).length === 0 && <tr><td colSpan={6} className="muted">Ingen tilknytninger endnu.</td></tr>}
          {(rows ?? []).map((a) => (
            <tr key={a.id}>
              <td>{a.company.name}{a.is_primary && !a.end_date && <span className="tag">primær</span>}</td>
              <td>{a.affiliation_type?.name}</td><td>{a.level?.name ?? ''}</td><td>{a.job_function?.name ?? ''}</td>
              <td>{a.start_date || a.end_date ? `${a.start_date ?? '?'} til ${a.end_date ?? 'nu'}` : <span className="muted">nuværende</span>}</td>
              <td className="inline">
                <button className="small" onClick={() => setEdit(a.id)}>Redigér</button>
                {!a.end_date && <button className="small" onClick={async () => {
                  const { error: er } = await supabase.from('contact_company').update({ end_date: today(), is_primary: false }).eq('id', a.id);
                  setMsg(er ? `Kunne ikke afslutte: ${er.message}` : 'Tilknytningen er afsluttet.'); reload();
                }}>Afslut</button>}
                <button className="small danger" onClick={async () => {
                  if (!window.confirm('Slet tilknytningen?')) return;
                  const { error: er } = await supabase.from('contact_company').delete().eq('id', a.id);
                  setMsg(er ? `Kunne ikke slette: ${er.message}` : 'Tilknytningen er slettet.'); reload();
                }}>Slet</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {edit === null && <div className="actions"><button onClick={() => setEdit('new')}>Tilføj tilknytning</button></div>}
      {edit !== null && lk.data && (
        <AffForm key={edit} contactId={contactId} row={edit === 'new' ? null : (rows ?? []).find((r) => r.id === edit) ?? null} lk={lk.data} others={(rows ?? []).filter((r) => r.is_primary && !r.end_date && r.id !== edit)}
          companies={(companies.data ?? []).map((c) => ({ id: c.id, label: c.cvr ? `${c.name} (${c.cvr})` : c.name }))}
          onDone={(m) => { setEdit(null); if (m) setMsg(m); reload(); }} />
      )}
    </section>
  );
}

function AffForm({ contactId, row, lk, others, companies, onDone }: { contactId: string; row: Row | null; lk: Lookups; others: Row[]; companies: { id: string; label: string }[]; onDone: (msg?: string) => void }) {
  const [a, setA] = useState<Aff>({
    company_id: row?.company_id ?? '', affiliation_type_id: row?.affiliation_type_id ?? lookupByCode(lk.affiliation_type, 'employment'),
    level_id: row?.level_id ?? '', function_id: row?.function_id ?? '', location_id: row?.location_id ?? '',
    start_date: row?.start_date ?? '', end_date: row?.end_date ?? '', is_primary: row?.is_primary ?? true, note: row?.note ?? '',
  });
  const [err, setErr] = useState('');
  const [extra, setExtra] = useState<{ id: string; label: string }[]>([]);
  const [nc, setNc] = useState<{ name: string; cvr: string; postal_code: string; city: string } | null>(null);
  const [ncDupes, setNcDupes] = useState<Dupe[]>([]);
  const [ncForce, setNcForce] = useState(false);
  const [ncErr, setNcErr] = useState('');
  const ncKey = useDebounced(nc ? JSON.stringify([nc.name, nc.cvr]) : '');
  useEffect(() => {
    if (!nc) return;
    let alive = true;
    companyDupes({ name: nc.name, cvr: nc.cvr }).then((d) => { if (alive) setNcDupes(d); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncKey]);
  async function createCompany() {
    if (!nc) return;
    setNcErr('');
    if (!nc.name.trim()) return setNcErr('Navn mangler.');
    if (nc.cvr.trim() && !/^\d{8}$/.test(nc.cvr.trim())) return setNcErr('CVR skal være 8 cifre.');
    if (nc.postal_code && !/^\d{4}$/.test(nc.postal_code)) return setNcErr('Postnummer skal være 4 cifre.');
    if (ncDupes.some((d) => d.kind === 'cvr')) return setNcErr('CVR-nummeret findes allerede. Vælg virksomheden på listen i stedet.');
    if (ncDupes.some((d) => d.kind === 'name') && !ncForce) return setNcErr('Navnet findes allerede. Vælg den på listen, eller marker »Opret alligevel«.');
    const { data, error } = await supabase.from('company').insert({ name: nc.name.trim(), cvr: nz(nc.cvr) }).select('id').single();
    if (error) return setNcErr(error.message.includes('company_cvr_uq') ? 'CVR-nummeret findes allerede.' : error.message);
    if (nc.postal_code || nc.city.trim()) {
      await supabase.from('company_location').insert({ company_id: data.id, is_hq: true, postal_code: nz(nc.postal_code), city: nz(nc.city) });
      pokeGeo();
    }
    setExtra((x) => [...x, { id: data.id, label: nc.cvr.trim() ? `${nc.name.trim()} (${nc.cvr.trim()})` : nc.name.trim() }]);
    setA((x) => ({ ...x, company_id: data.id, location_id: '' }));
    setNc(null); setNcDupes([]); setNcForce(false);
  }
  const set = (k: keyof Aff, v: string | boolean) => setA((x) => ({ ...x, [k]: v }));
  const locs = useAsync(async () => {
    if (!a.company_id) return [] as Row[];
    const { data } = await supabase.from('company_location').select('id, name, city, is_hq').eq('company_id', a.company_id).order('is_hq', { ascending: false });
    return (data ?? []) as Row[];
  }, [a.company_id]);

  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!a.company_id) return setErr('Vælg en virksomhed.');
    if (!a.affiliation_type_id) return setErr('Vælg en tilknytningstype.');
    if (a.start_date && a.end_date && a.end_date < a.start_date) return setErr('Slutdato ligger før startdato.');
    const rec = { contact_id: contactId, company_id: a.company_id, affiliation_type_id: a.affiliation_type_id, level_id: nz(a.level_id), function_id: nz(a.function_id), location_id: nz(a.location_id),
      start_date: nz(a.start_date), end_date: nz(a.end_date), is_primary: a.is_primary && !a.end_date, note: nz(a.note) };
    // Ny primær tilknytning overtager markeringen fra den nuværende.
    if (rec.is_primary && others.length) {
      const { error: er } = await supabase.from('contact_company').update({ is_primary: false }).in('id', others.map((o) => o.id));
      if (er) return setErr(er.message);
    }
    const { error } = row ? await supabase.from('contact_company').update(rec).eq('id', row.id) : await supabase.from('contact_company').insert(rec);
    if (error) return setErr(error.message.includes('contact_one_primary_uq') ? 'Personen har allerede en primær tilknytning. Afslut den, eller fjern markeringen her.' : error.message);
    onDone(row ? 'Tilknytningen er gemt.' : 'Tilknytningen er tilføjet.');
  }

  return (
    <form className="card" onSubmit={save} style={{ marginTop: 12 }}>
      <h3>{row ? 'Redigér tilknytning' : 'Ny tilknytning'}</h3>
      <div className="form">
        <Field label="Virksomhed *">
          <Picker items={[...companies, ...extra]} value={a.company_id} onChange={(v) => { set('company_id', v); set('location_id', ''); }} placeholder="Søg virksomhed" />
          {!nc && <button type="button" className="small" style={{ marginTop: 4, alignSelf: 'flex-start' }} onClick={() => setNc({ name: '', cvr: '', postal_code: '', city: '' })}>+ Opret ny virksomhed</button>}
        </Field>
        {nc && (
          <div className="card private wide" style={{ gridColumn: '1 / -1' }}>
            <h3>Ny virksomhed</h3>
            <div className="form">
              <Field label="Navn *"><input autoFocus value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></Field>
              <Field label="CVR"><input inputMode="numeric" maxLength={8} value={nc.cvr} onChange={(e) => setNc({ ...nc, cvr: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="Postnr. (hovedkontor)"><input inputMode="numeric" maxLength={4} value={nc.postal_code} onChange={(e) => setNc({ ...nc, postal_code: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="By"><input value={nc.city} onChange={(e) => setNc({ ...nc, city: e.target.value })} /></Field>
            </div>
            {ncDupes.length > 0 && (
              <p className="warn" role="status">
                {ncDupes.some((d) => d.kind === 'cvr') ? 'CVR findes allerede: ' : 'Findes måske allerede: '}
                {ncDupes.map((d) => (d.row.cvr ? `${d.row.name} (${d.row.cvr})` : d.row.name)).join(', ')}
                {!ncDupes.some((d) => d.kind === 'cvr') && <label style={{ marginLeft: 8 }}><input type="checkbox" checked={ncForce} onChange={(e) => setNcForce(e.target.checked)} /> Opret alligevel</label>}
              </p>
            )}
            {ncErr && <p role="alert" className="err">{ncErr}</p>}
            <div className="actions"><button type="button" className="primary" onClick={createCompany}>Opret og vælg</button><button type="button" onClick={() => { setNc(null); setNcErr(''); }}>Annullér</button></div>
            <p className="muted" style={{ margin: '4px 0 0' }}>Brancher, flere lokationer og andet udfyldes bagefter på virksomhedens side.</p>
          </div>
        )}
        <Field label="Type *"><Select value={a.affiliation_type_id} onChange={(v) => set('affiliation_type_id', v)} items={lk.affiliation_type} /></Field>
        <Field label="Niveau"><Select value={a.level_id} onChange={(v) => set('level_id', v)} items={lk.level} empty="Ikke angivet" /></Field>
        <Field label="Funktion"><Select value={a.function_id} onChange={(v) => set('function_id', v)} items={lk.job_function} empty="Ikke angivet" /></Field>
        <Field label="Sted" hint="Tomt betyder hovedkontor"><Select value={a.location_id} onChange={(v) => set('location_id', v)} items={(locs.data ?? []).map((l) => ({ id: l.id, name: [l.name, l.city].filter(Boolean).join(', ') }))} empty="Hovedkontor (antaget)" /></Field>
        <Field label="Start"><input type="date" value={a.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="Slut"><input type="date" value={a.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        <Field label="Primær"><label><input type="checkbox" checked={a.is_primary} onChange={(e) => set('is_primary', e.target.checked)} /> Personens hovedtilknytning</label>
          {a.is_primary && !a.end_date && others.length > 0 && <span className="muted">Overtager markeringen fra {others.map((o) => o.company?.name).join(', ')}.</span>}</Field>
        <Field label="Note"><input value={a.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </div>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="actions"><button className="primary" type="submit">Gem tilknytning</button><button type="button" onClick={() => onDone()}>Annullér</button></div>
    </form>
  );
}

function PrivateRelation({ contactId }: { contactId: string }) {
  const lk = useLookups();
  const [r, setR] = useState({ acquaintance_id: '', acquainted_since: '', no_invitation: false, notes: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('contact_relation').select('*').eq('contact_id', contactId).maybeSingle().then(({ data }) => {
      if (data) setR({ acquaintance_id: data.acquaintance_id ?? '', acquainted_since: data.acquainted_since ?? '', no_invitation: data.no_invitation, notes: data.notes ?? '' });
    });
  }, [contactId]);
  async function save(e: FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('contact_relation').upsert(
      { owner_id: u.user!.id, contact_id: contactId, acquaintance_id: nz(r.acquaintance_id), acquainted_since: nz(r.acquainted_since), no_invitation: r.no_invitation, notes: nz(r.notes) },
      { onConflict: 'owner_id,contact_id' });
    setMsg(error ? `Kunne ikke gemme: ${error.message}` : 'Privat relation gemt.');
  }
  return (
    <section className="sec">
      <h2>Privat (kun dig)</h2>
      <form className="card private" onSubmit={save}>
        <div className="form">
          <Field label="Kendskab"><Select value={r.acquaintance_id} onChange={(v) => setR({ ...r, acquaintance_id: v })} items={lk.data?.acquaintance ?? []} empty="Ikke angivet" /></Field>
          <Field label="Kendt siden"><input type="date" value={r.acquainted_since} onChange={(e) => setR({ ...r, acquainted_since: e.target.value })} /></Field>
          <Field label="Invitation"><label><input type="checkbox" checked={r.no_invitation} onChange={(e) => setR({ ...r, no_invitation: e.target.checked })} /> Skal ikke inviteres</label></Field>
          <Field label="Noter"><textarea value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} /></Field>
        </div>
        {msg && <p role="status" className={msg.startsWith('Kunne') ? 'err' : 'ok'}>{msg}</p>}
        <div className="actions"><button className="primary" type="submit">Gem privat relation</button></div>
      </form>
    </section>
  );
}

function PersonLinks({ contactId }: { contactId: string }) {
  const lk = useLookups();
  const people = useAsync(() => fetchAll('contact', 'id, first_name, middle_name, last_name', 'last_name'), [], 'contactPick');
  const { data: links, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('person_link').select('*, person_link_type(name)').or(`contact_a.eq.${contactId},contact_b.eq.${contactId}`);
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  }, [contactId]);
  const [other, setOther] = useState('');
  const [type, setType] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const nameOf = (id: string) => fullName((people.data ?? []).find((p) => p.id === id));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!other || !type) return setMsg('Kunne ikke tilføje: vælg person og type.');
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('person_link').insert({ owner_id: u.user!.id, contact_a: contactId, contact_b: other, type_id: type, note: nz(note) });
    setMsg(error ? `Kunne ikke tilføje: ${error.message}` : 'Relationen er tilføjet.');
    if (!error) { setOther(''); setNote(''); reload(); }
  }
  return (
    <section className="sec">
      <h2>Relationer til andre personer (privat)</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Person</th><th>Type</th><th>Note</th><th></th></tr></thead>
        <tbody>
          {(links ?? []).length === 0 && <tr><td colSpan={4} className="muted">Ingen relationer.</td></tr>}
          {(links ?? []).map((l) => { const o = l.contact_a === contactId ? l.contact_b : l.contact_a; return (
            <tr key={l.id}><td><a href={href('person', o)} onClick={(e) => onLink(e, 'person', o)}>{nameOf(o)}</a></td><td>{l.person_link_type?.name}</td><td>{l.note ?? ''}</td>
              <td><button className="small danger" onClick={async () => { const { error } = await supabase.from('person_link').delete().eq('id', l.id); setMsg(error ? `Kunne ikke slette: ${error.message}` : 'Relationen er slettet.'); reload(); }}>Slet</button></td></tr>
          ); })}
        </tbody>
      </table></div>
      <form className="card private" onSubmit={add} style={{ marginTop: 12 }}>
        <div className="form">
          <Field label="Person"><Picker items={(people.data ?? []).filter((p) => p.id !== contactId).map((p) => ({ id: p.id, label: fullName(p) }))} value={other} onChange={setOther} placeholder="Søg person" /></Field>
          <Field label="Type"><Select value={type} onChange={setType} items={lk.data?.person_link_type ?? []} empty="Vælg..." /></Field>
          <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {msg && <p role="status" className={msg.startsWith('Kunne') ? 'err' : 'ok'}>{msg}</p>}
        <div className="actions"><button className="primary" type="submit">Tilføj relation</button></div>
      </form>
    </section>
  );
}
