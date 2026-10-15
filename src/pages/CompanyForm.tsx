import { pokeGeo } from '../lib/geoWorker';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll, type Row } from '../lib/data';
import { go, href, onLink } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { useLookups } from '../lib/lookups';
import { companyDupes, type Dupe } from '../lib/dupes';
import { BranchSelect, Field, Select, nz, setFlash, takeFlash, useDebounced } from '../lib/form';
import { SkeletonCards } from '../lib/ui';

const blank = { name: '', cvr: '', website: '', sector_id: '', is_own: false, active: true };

export function CompanyForm({ id, priv }: { id: string | null; priv: boolean }) {
  const lk = useLookups();
  const [f, setF] = useState(blank);
  const [loaded, setLoaded] = useState(!id);
  const [dupes, setDupes] = useState<Dupe[]>([]);
  const [force, setForce] = useState(false);
  const [msg, setMsg] = useState(() => takeFlash());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [branchId, setBranchId] = useState('');
  const set = (k: keyof typeof blank, v: string | boolean) => { setErr(''); setF((x) => ({ ...x, [k]: v })); };

  useEffect(() => {
    if (!id) return;
    supabase.from('company').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (error) setErr(error.message);
      else if (data) setF({ name: data.name, cvr: data.cvr ?? '', website: data.website ?? '', sector_id: data.sector_id ?? '', is_own: data.is_own, active: data.active });
      setLoaded(true);
    });
  }, [id]);

  const key = useDebounced(JSON.stringify([f.name, f.cvr]));
  useEffect(() => {
    if (!loaded) return;
    companyDupes({ id, name: f.name, cvr: f.cvr }).then(setDupes, () => setDupes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded]);
  const hard = dupes.filter((d) => d.kind === 'cvr');
  const soft = dupes.filter((d) => d.kind === 'name');

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('');
    if (!f.name.trim()) return setErr('Navn mangler.');
    if (f.cvr.trim() && !/^\d{8}$/.test(f.cvr.trim())) return setErr('CVR skal være 8 cifre.');
    if (!id && !f.sector_id) return setErr('Vælg en sektor.');
    if (!id && !branchId) return setErr('Vælg en primær branche.');
    if (hard.length) return setErr('CVR-nummeret findes allerede på en anden virksomhed. Åbn den i stedet.');
    if (!id && soft.length && !force) return setErr('Navnet findes allerede. Marker »Opret alligevel«, hvis det er en anden virksomhed.');
    setBusy(true);
    const rec = { name: f.name.trim(), cvr: nz(f.cvr), website: nz(f.website), sector_id: nz(f.sector_id), is_own: f.is_own, active: f.active };
    if (id) {
      const { error } = await supabase.from('company').update(rec).eq('id', id);
      setBusy(false);
      if (error) return setErr(error.message.includes('company_cvr_uq') ? 'CVR-nummeret findes allerede på en anden virksomhed.' : error.message);
      setMsg('Gemt.');
    } else {
      const { data, error } = await supabase.from('company').insert(rec).select('id').single();
      setBusy(false);
      if (error) return setErr(error.message.includes('company_cvr_uq') ? 'CVR-nummeret findes allerede på en anden virksomhed.' : error.message);
      const br = await supabase.from('company_branch').insert({ company_id: data.id, branch_id: branchId, is_primary: true });
      setFlash(br.error ? `Virksomheden er oprettet, men branchen kunne ikke gemmes: ${br.error.message}` : 'Virksomheden er oprettet. Tilføj flere brancher og lokationer nedenfor.');
      go('virksomhed-ret', data.id);
    }
  }

  async function remove() {
    if (!id || !window.confirm(`Slet ${f.name}? Lokationer, brancher og koncernmedlemskab slettes også.`)) return;
    const { error } = await supabase.from('company').delete().eq('id', id);
    if (error) return setErr(error.code === '23503' ? 'Virksomheden har tilknyttede personer. Afslut eller slet tilknytningerne først, eller sæt virksomheden inaktiv.' : error.code === '42501' ? 'Kun den, der oprettede virksomheden, eller ejeren kan slette.' : error.message);
    go('virksomheder');
  }

  if (!loaded) return <SkeletonCards n={2} />;
  return (
    <>
      <p className="back"><a href={id ? href('virksomhed', id) : href('virksomheder')} onClick={(e) => (id ? onLink(e, 'virksomhed', id) : onLink(e, 'virksomheder'))}>← {id ? 'Til virksomheden' : 'Virksomheder'}</a></p>
      <h1>{id ? `Redigér ${f.name}` : 'Ny virksomhed'}</h1>
      {msg && <p role="status" className="ok">{msg}</p>}
      <form onSubmit={save}>
        <div className="form">
          <Field label="Navn *"><input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus={!id} /></Field>
          <Field label="CVR" hint="8 cifre"><input value={f.cvr} inputMode="numeric" maxLength={8} onChange={(e) => set('cvr', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Hjemmeside"><input value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
          <Field label={id ? 'Sektor' : 'Sektor *'}><Select value={f.sector_id} onChange={(v) => set('sector_id', v)} items={lk.data?.sector ?? []} empty={id ? 'Ikke angivet' : 'Vælg sektor...'} /></Field>
          {!id && <Field label="Primær branche *" hint="Flere brancher kan tilføjes bagefter"><BranchSelect branches={lk.data?.branch ?? []} value={branchId} onChange={setBranchId} /></Field>}
          <Field label="Egen virksomhed"><label><input type="checkbox" checked={f.is_own} onChange={(e) => set('is_own', e.target.checked)} /> Kolleger er personer her</label></Field>
          {id && <Field label="Status"><label><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Aktiv</label></Field>}
        </div>
        {hard.length > 0 && <Notice hard dupes={hard} text="Samme CVR findes allerede:" />}
        {soft.length > 0 && <Notice dupes={soft} text="Samme navn findes allerede:" force={!id ? [force, setForce] : undefined} />}
        {err && <p role="alert" className="err">{err}</p>}
        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>{id ? 'Gem' : 'Opret virksomhed'}</button>
          {id && <button type="button" className="danger" onClick={remove}>Slet virksomhed</button>}
        </div>
      </form>
      {id && <Branches companyId={id} />}
      {id && <Locations companyId={id} />}
      {id && <Group companyId={id} />}
      {id && priv && <PrivateNotes companyId={id} />}
    </>
  );
}

function Notice({ dupes, text, hard, force }: { dupes: Dupe[]; text: string; hard?: boolean; force?: [boolean, (v: boolean) => void] }) {
  return (
    <div className={`notice ${hard ? 'hard' : 'soft'}`} role="status">
      {text}
      <ul>{dupes.map((d, i) => (
        <li key={i}><a href={href('virksomhed', d.row.id)} target="_blank" rel="noreferrer">{d.row.name}</a>{d.row.cvr ? <span className="muted"> (CVR {d.row.cvr})</span> : null}</li>
      ))}</ul>
      {force && <label style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={force[0]} onChange={(e) => force[1](e.target.checked)} /> Opret alligevel, det er en anden virksomhed</label>}
    </div>
  );
}

function Branches({ companyId }: { companyId: string }) {
  const lk = useLookups();
  const { data: rows, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('company_branch').select('branch_id, is_primary, branch(name, parent:parent_id(name))').eq('company_id', companyId).order('is_primary', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Row[];
  }, [companyId]);
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState('');
  const branches = lk.data?.branch ?? [];
  const used = new Set((rows ?? []).map((r) => r.branch_id));
  const label = (b: Row) => (b.branch.parent ? `${b.branch.parent.name} / ${b.branch.name}` : b.branch.name);

  async function add() {
    if (!pick) return;
    const { error } = await supabase.from('company_branch').insert({ company_id: companyId, branch_id: pick, is_primary: (rows ?? []).length === 0 });
    setMsg(error ? `Kunne ikke tilføje: ${error.message}` : ''); setPick(''); reload();
  }
  async function makePrimary(branchId: string) {
    const a = await supabase.from('company_branch').update({ is_primary: false }).eq('company_id', companyId).eq('is_primary', true);
    const b = await supabase.from('company_branch').update({ is_primary: true }).eq('company_id', companyId).eq('branch_id', branchId);
    setMsg(a.error || b.error ? `Kunne ikke skifte primær: ${(a.error ?? b.error)!.message}` : ''); reload();
  }
  async function remove(branchId: string) {
    const { error } = await supabase.from('company_branch').delete().eq('company_id', companyId).eq('branch_id', branchId);
    setMsg(error ? `Kunne ikke fjerne: ${error.message}` : ''); reload();
  }

  return (
    <section className="sec">
      <h2>Brancher</h2>
      <div className="inline">
        {(rows ?? []).length === 0 && <span className="muted">Ingen brancher endnu.</span>}
        {(rows ?? []).map((r) => (
          <span key={r.branch_id} className="tag" style={{ marginLeft: 0 }}>
            {label(r)}{r.is_primary ? ' (primær)' : ''}{' '}
            {!r.is_primary && <button className="small" onClick={() => makePrimary(r.branch_id)}>Gør primær</button>}{' '}
            <button className="small danger" onClick={() => remove(r.branch_id)}>Fjern</button>
          </span>
        ))}
      </div>
      <div className="inline" style={{ marginTop: 10 }}>
        <BranchSelect branches={branches} value={pick} onChange={setPick} exclude={used} empty="Tilføj branche..." />
        <button onClick={add} disabled={!pick}>Tilføj</button>
      </div>
      {msg && <p role="alert" className="err">{msg}</p>}
    </section>
  );
}

type Loc = { name: string; is_hq: boolean; address: string; postal_code: string; city: string; active: boolean };

function Locations({ companyId }: { companyId: string }) {
  const { data: rows, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('company_location').select('*').eq('company_id', companyId).order('is_hq', { ascending: false }).order('name');
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  }, [companyId]);
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const [msg, setMsg] = useState('');
  return (
    <section className="sec">
      <h2>Lokationer</h2>
      {msg && <p role="status" className={msg.startsWith('Kunne') ? 'err' : 'ok'}>{msg}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Navn</th><th>Adresse</th><th>Postnr. og by</th><th></th></tr></thead>
        <tbody>
          {(rows ?? []).length === 0 && <tr><td colSpan={4} className="muted">Ingen lokationer endnu.</td></tr>}
          {(rows ?? []).map((l) => (
            <tr key={l.id}>
              <td>{l.name ?? ''}{l.is_hq && <span className="tag">hovedkontor</span>}{!l.active && <span className="tag">inaktiv</span>}</td>
              <td>{l.address ?? ''}</td><td>{[l.postal_code, l.city].filter(Boolean).join(' ')}</td>
              <td className="inline">
                <button className="small" onClick={() => setEdit(l.id)}>Redigér</button>
                <button className="small danger" onClick={async () => {
                  // Personer knyttet til lokationen flyttes til hovedkontor (ingen lokation), så den kan slettes.
                  const { count } = await supabase.from('contact_company').select('id', { count: 'exact', head: true }).eq('location_id', l.id);
                  const txt = count ? `${count} persontilknytning(er) bruger denne lokation og flyttes til hovedkontor. Slet lokationen?` : 'Slet lokationen?';
                  if (!window.confirm(txt)) return;
                  if (count) {
                    const { error: e1 } = await supabase.from('contact_company').update({ location_id: null }).eq('location_id', l.id);
                    if (e1) { setMsg(`Kunne ikke flytte tilknytninger: ${e1.message}`); return; }
                  }
                  const { data: gone, error } = await supabase.from('company_location').delete().eq('id', l.id).select('id');
                  setMsg(error ? `Kunne ikke slette: ${error.message}` : !gone?.length ? 'Kunne ikke slette: du har ikke ret til at slette lokationen (kun ejeren eller den, der oprettede den).' : 'Lokationen er slettet.'); reload();
                }}>Slet</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {edit === null && <div className="actions"><button onClick={() => setEdit('new')}>Tilføj lokation</button></div>}
      {edit !== null && <LocForm key={edit} companyId={companyId} row={edit === 'new' ? null : (rows ?? []).find((r) => r.id === edit) ?? null} hasHq={(rows ?? []).some((r) => r.is_hq)}
        onDone={(m) => { setEdit(null); if (m) setMsg(m); reload(); }} />}
    </section>
  );
}

function LocForm({ companyId, row, hasHq, onDone }: { companyId: string; row: Row | null; hasHq: boolean; onDone: (m?: string) => void }) {
  const [l, setL] = useState<Loc>({ name: row?.name ?? '', is_hq: row?.is_hq ?? !hasHq, address: row?.address ?? '', postal_code: row?.postal_code ?? '', city: row?.city ?? '', active: row?.active ?? true });
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const set = (k: keyof Loc, v: string | boolean) => setL((x) => ({ ...x, [k]: v }));

  async function lookup(pc: string) {
    if (!/^\d{4}$/.test(pc)) { setInfo(''); return; }
    const { data } = await supabase.from('postcode').select('city, municipality, region').eq('postal_code', pc).maybeSingle();
    if (!data) { setInfo('Postnummeret findes ikke i listen.'); return; }
    setInfo([data.municipality, data.region].filter(Boolean).join(', '));
    setL((x) => (x.city.trim() ? x : { ...x, city: data.city }));
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (l.postal_code && !/^\d{4}$/.test(l.postal_code)) return setErr('Postnummer skal være 4 cifre.');
    if (!l.name.trim() && !l.address.trim() && !l.postal_code) return setErr('Udfyld mindst navn, adresse eller postnummer.');
    if (l.is_hq) {
      const q = supabase.from('company_location').update({ is_hq: false }).eq('company_id', companyId).eq('is_hq', true);
      const { error } = row ? await q.neq('id', row.id) : await q;
      if (error) return setErr(error.message);
    }
    const rec: Record<string, unknown> = { company_id: companyId, name: nz(l.name), is_hq: l.is_hq, address: nz(l.address), postal_code: nz(l.postal_code), city: nz(l.city), active: l.active };
    // Ændret adresse: nulstil koordinaterne, så baggrundsopslaget finder dem igen.
    if (!row || row.address !== rec.address || row.postal_code !== rec.postal_code || row.city !== rec.city) { rec.lat = null; rec.lng = null; }
    const { error } = row ? await supabase.from('company_location').update(rec).eq('id', row.id) : await supabase.from('company_location').insert(rec);
    if (error) return setErr(error.message);
    pokeGeo();
    onDone(row ? 'Lokationen er gemt.' : 'Lokationen er tilføjet.');
  }

  return (
    <form className="card" onSubmit={save} style={{ marginTop: 12 }}>
      <h3>{row ? 'Redigér lokation' : 'Ny lokation'}</h3>
      <div className="form">
        <Field label="Navn"><input value={l.name} onChange={(e) => set('name', e.target.value)} placeholder="fx Hovedkontor eller Aarhus" /></Field>
        <Field label="Adresse"><input value={l.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Postnummer" hint={info}><input value={l.postal_code} inputMode="numeric" maxLength={4} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); set('postal_code', v); lookup(v); }} /></Field>
        <Field label="By"><input value={l.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="Type"><label><input type="checkbox" checked={l.is_hq} onChange={(e) => set('is_hq', e.target.checked)} /> Hovedkontor</label></Field>
        {row && <Field label="Status"><label><input type="checkbox" checked={l.active} onChange={(e) => set('active', e.target.checked)} /> Aktiv</label></Field>}
      </div>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="actions"><button className="primary" type="submit">Gem lokation</button><button type="button" onClick={() => onDone()}>Annullér</button></div>
    </form>
  );
}

function Group({ companyId }: { companyId: string }) {
  const lk = useLookups();
  const { data, reload } = useAsync(async () => {
    const { data: mine, error } = await supabase.from('company_group_member').select('group_id, group_role(name)').eq('company_id', companyId);
    if (error) throw new Error(error.message);
    const ids = (mine ?? []).map((m) => m.group_id);
    const members = ids.length ? ((await supabase.from('company_group_member').select('group_id, company_id, company(name), group_role(name)').in('group_id', ids)).data ?? []) : [];
    return { mine: (mine ?? []) as unknown as Row[], members: members as unknown as Row[] };
  }, [companyId]);
  const groups = useAsync(async () => {
    const [g, m] = await Promise.all([fetchAll('company_group', 'id, name'), fetchAll('company_group_member', 'group_id, company(name), group_role(code)')]);
    return g.map((x) => ({ id: x.id, name: x.name || m.filter((y) => y.group_id === x.id).map((y) => y.company?.name).join(', ') || '(tom koncern)' }));
  }, [data]);
  const [gid, setGid] = useState('');
  const [newName, setNewName] = useState('');
  const [role, setRole] = useState('');
  const [msg, setMsg] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault(); setMsg('');
    const roleId = role || (lk.data?.group_role.find((r) => r.code === 'member')?.id ?? '');
    let g = gid;
    if (!g) {
      if (!newName.trim()) return setMsg('Kunne ikke tilføje: vælg en koncern eller skriv navnet på en ny.');
      const { data: ng, error } = await supabase.from('company_group').insert({ name: newName.trim() }).select('id').single();
      if (error) return setMsg(`Kunne ikke oprette koncern: ${error.message}`);
      g = ng.id;
    }
    const { error } = await supabase.from('company_group_member').insert({ group_id: g, company_id: companyId, role_id: roleId });
    setMsg(error ? `Kunne ikke tilføje: ${error.message}` : '');
    if (!error) { setGid(''); setNewName(''); }
    reload();
  }

  return (
    <section className="sec">
      <h2>Koncern</h2>
      {(data?.mine ?? []).length === 0 && <p className="muted">Ikke i en koncern.</p>}
      {(data?.mine ?? []).map((m) => (
        <div key={m.group_id} className="card" style={{ marginBottom: 10 }}>
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <strong>Denne virksomhed er {m.group_role.name.toLowerCase()}</strong>
            <button className="small danger" onClick={async () => { const { error } = await supabase.from('company_group_member').delete().eq('group_id', m.group_id).eq('company_id', companyId); setMsg(error ? `Kunne ikke fjerne: ${error.message}` : ''); reload(); }}>Forlad koncern</button>
          </div>
          <div style={{ marginTop: 6 }}>{(data?.members ?? []).filter((x) => x.group_id === m.group_id).map((x) => <span key={x.company_id} className="tag" style={{ marginLeft: 0, marginRight: 6 }}>{x.company.name} · {x.group_role.name}</span>)}</div>
        </div>
      ))}
      <form className="card" onSubmit={add}>
        <h3>Tilføj til koncern</h3>
        <div className="form">
          <Field label="Eksisterende koncern"><Select value={gid} onChange={setGid} items={(groups.data ?? []).filter((g) => !(data?.mine ?? []).some((m) => m.group_id === g.id))} empty="Ny koncern" /></Field>
          {!gid && <Field label="Navn på ny koncern"><input value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>}
          <Field label="Rolle"><Select value={role} onChange={setRole} items={lk.data?.group_role ?? []} empty="Medlem" /></Field>
        </div>
        {msg && <p role="alert" className="err">{msg}</p>}
        <div className="actions"><button type="submit">Tilføj</button></div>
      </form>
    </section>
  );
}

function PrivateNotes({ companyId }: { companyId: string }) {
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.from('company_relation').select('notes').eq('company_id', companyId).maybeSingle().then(({ data }) => setNotes(data?.notes ?? ''));
  }, [companyId]);
  async function save(e: FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('company_relation').upsert({ owner_id: u.user!.id, company_id: companyId, notes: nz(notes) }, { onConflict: 'owner_id,company_id' });
    setMsg(error ? `Kunne ikke gemme: ${error.message}` : 'Privat note gemt.');
  }
  return (
    <section className="sec">
      <h2>Privat (kun dig)</h2>
      <form className="card private" onSubmit={save}>
        <Field label="Noter"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {msg && <p role="status" className={msg.startsWith('Kunne') ? 'err' : 'ok'}>{msg}</p>}
        <div className="actions"><button className="primary" type="submit">Gem privat note</button></div>
      </form>
    </section>
  );
}
