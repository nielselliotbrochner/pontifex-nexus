import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll, fullName, type Row } from '../lib/data';
import { go } from '../lib/nav';
import { useAsync } from '../lib/useAsync';
import { useLookups, lookupByCode } from '../lib/lookups';
import { Field, Picker, Select, nz, setFlash, today } from '../lib/form';
import { INTERACTION, MAX_FILE, safeName } from '../lib/activity';
import { SkeletonCards } from '../lib/ui';

type Person = { id: string; name: string; company_id: string; opts: { id: string; name: string }[] };
type Co = { id: string; name: string };

async function affiliationOpts(contactId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase.from('contact_company').select('company_id, is_primary, company(name)').eq('contact_id', contactId).is('end_date', null).order('is_primary', { ascending: false });
  return ((data ?? []) as Row[]).map((r) => ({ id: r.company_id, name: r.company?.name ?? '' }));
}

export function ActivityForm({ id, prefill }: { id: string | null; prefill: string | null }) {
  const lk = useLookups();
  const persons = useAsync(() => fetchAll('contact', 'id, first_name, middle_name, last_name', 'last_name'), [], 'personPickAct');
  const companies = useAsync(() => fetchAll('company', 'id, name, cvr', 'name'), [], 'companyPick');
  const existing = useAsync(async () => {
    if (!id) return null;
    const { data, error } = await supabase.from('activity').select(`*, activity_type(code),
      activity_participant(contact_id, company_id, contact(first_name, middle_name, last_name)),
      activity_company(company_id, company(name)), activity_subject(contact_id, contact(first_name, middle_name, last_name)), activity_file(*)`).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Row | null;
  }, [id]);

  const [f, setF] = useState({ type_id: '', occurred_on: today(), title: '', body: '', source_url: '', priv: false, present: true });
  const [people, setPeople] = useState<Person[]>([]);
  const [cos, setCos] = useState<Co[]>([]);
  const [files, setFiles] = useState<Row[]>([]);
  const [removed, setRemoved] = useState<Row[]>([]);
  const [fresh, setFresh] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [init, setInit] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function addPerson(pid: string, name: string, company_id?: string) {
    setPeople((x) => (x.some((p) => p.id === pid) ? x : [...x, { id: pid, name, company_id: company_id ?? '', opts: [] }]));
    const opts = await affiliationOpts(pid);
    setPeople((x) => x.map((p) => (p.id === pid ? { ...p, opts, company_id: p.company_id || (f.present ? opts[0]?.id ?? '' : '') } : p)));
  }

  // Indlæs eksisterende aktivitet, eller forudfyld fra siden man kom fra (p:<id> eller c:<id>).
  useEffect(() => {
    if (init || !lk.data || !persons.data || !companies.data || existing.loading) return;
    setInit(true);
    const a = existing.data;
    if (a) {
      const parts = (a.activity_participant ?? []) as Row[];
      const subs = (a.activity_subject ?? []) as Row[];
      setF({ type_id: a.type_id, occurred_on: a.occurred_on, title: a.title, body: a.body ?? '', source_url: a.source_url ?? '', priv: a.visibility === 'private',
        present: parts.length > 0 || (subs.length === 0 && INTERACTION.has(a.activity_type?.code)) });
      const rows = parts.length ? parts : subs;
      for (const r of rows) void addPerson(r.contact_id, fullName(r.contact), r.company_id ?? undefined);
      setCos(((a.activity_company ?? []) as Row[]).map((c) => ({ id: c.company_id, name: c.company?.name ?? '' })));
      setFiles((a.activity_file ?? []) as Row[]);
    } else {
      setF((x) => ({ ...x, type_id: lookupByCode(lk.data!.activity_type, 'meeting') }));
      const [k, pid] = (prefill ?? '').split(':');
      if (k === 'p' && pid) { const p = persons.data.find((r) => r.id === pid); if (p) void addPerson(pid, fullName(p)); }
      if (k === 'c' && pid) { const c = companies.data.find((r) => r.id === pid); if (c) setCos([{ id: pid, name: c.name }]); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lk.data, persons.data, companies.data, existing.loading, init]);

  function changeType(tid: string) {
    const code = lk.data?.activity_type.find((t) => t.id === tid)?.code ?? '';
    setF((x) => ({ ...x, type_id: tid, present: INTERACTION.has(code) }));
  }

  async function save(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!f.type_id) return setErr('Vælg en type.');
    if (!f.title.trim()) return setErr('Titel mangler.');
    if (!f.occurred_on) return setErr('Dato mangler.');
    const big = fresh.find((x) => x.size > MAX_FILE);
    if (big) return setErr(`${big.name} er over 25 MB.`);
    setBusy(true);
    const rec = { type_id: f.type_id, occurred_on: f.occurred_on, title: f.title.trim(), body: nz(f.body), source_url: nz(f.source_url), visibility: f.priv ? 'private' : 'shared' };
    let aid = id;
    if (aid) {
      const { error } = await supabase.from('activity').update(rec).eq('id', aid);
      if (error) { setBusy(false); return setErr(error.message); }
    } else {
      const { data, error } = await supabase.from('activity').insert(rec).select('id').single();
      if (error) { setBusy(false); return setErr(error.message); }
      aid = data.id as string;
    }
    const fail = (m: string) => { setBusy(false); setErr(`Aktiviteten er gemt, men ${m}`); };
    // Deltagere, emner og virksomheder skrives om fra bunden.
    for (const t of ['activity_participant', 'activity_subject', 'activity_company']) {
      const { error } = await supabase.from(t).delete().eq('activity_id', aid);
      if (error) return fail(error.message);
    }
    if (people.length) {
      const { error } = f.present
        ? await supabase.from('activity_participant').insert(people.map((p) => ({ activity_id: aid, contact_id: p.id, company_id: nz(p.company_id) })))
        : await supabase.from('activity_subject').insert(people.map((p) => ({ activity_id: aid, contact_id: p.id })));
      if (error) return fail(error.message);
    }
    if (cos.length) {
      const { error } = await supabase.from('activity_company').insert(cos.map((c) => ({ activity_id: aid, company_id: c.id })));
      if (error) return fail(error.message);
    }
    if (removed.length) {
      await supabase.storage.from('activity-files').remove(removed.map((r) => r.path));
      await supabase.from('activity_file').delete().in('id', removed.map((r) => r.id));
    }
    for (const file of fresh) {
      const path = `${aid}/${Date.now()}-${safeName(file.name)}`;
      const up = await supabase.storage.from('activity-files').upload(path, file, { contentType: file.type || undefined });
      if (up.error) return fail(`${file.name} kunne ikke uploades: ${up.error.message}`);
      const { error } = await supabase.from('activity_file').insert({ activity_id: aid, path, file_name: file.name, mime: file.type || null, size_bytes: file.size });
      if (error) return fail(error.message);
    }
    setFlash(id ? 'Aktiviteten er gemt.' : 'Aktiviteten er oprettet.');
    go('aktivitet', aid);
  }

  if (!init || lk.loading) return <SkeletonCards />;
  if (id && !existing.data) return <p>Aktiviteten findes ikke, eller du har ikke adgang til den.</p>;
  const personItems = (persons.data ?? []).filter((p) => !people.some((x) => x.id === p.id)).map((p) => ({ id: p.id, label: fullName(p) }));
  const coItems = (companies.data ?? []).filter((c) => !cos.some((x) => x.id === c.id)).map((c) => ({ id: c.id, label: c.cvr ? `${c.name} (${c.cvr})` : c.name }));

  return (
    <form onSubmit={save}>
      <h1>{id ? 'Redigér aktivitet' : 'Ny aktivitet'}</h1>
      <div className="form">
        <Field label="Type *"><Select value={f.type_id} onChange={changeType} items={lk.data!.activity_type} /></Field>
        <Field label="Dato *"><input type="date" value={f.occurred_on} onChange={(e) => set('occurred_on', e.target.value)} /></Field>
        <Field label="Titel *"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Fx Møde om rammeaftale" /></Field>
        <Field label="Kilde (link)" hint="Fx en nyhed eller artikel"><input value={f.source_url} onChange={(e) => set('source_url', e.target.value)} /></Field>
        <Field label="Synlighed"><label><input type="checkbox" checked={f.priv} onChange={(e) => set('priv', e.target.checked)} /> Privat (kun mig)</label></Field>
        <Field label="Personerne"><label><input type="checkbox" checked={f.present} onChange={(e) => set('present', e.target.checked)} /> deltog (ellers handler aktiviteten om dem)</label></Field>
        <Field label="Tekst / referat"><textarea style={{ minHeight: 140 }} value={f.body} onChange={(e) => set('body', e.target.value)} /></Field>
        <div className="fld wide" />
        <Field label={f.present ? 'Deltagere' : 'Handler om (personer)'}>
          <Picker items={personItems} value="" onChange={(pid) => { const p = persons.data?.find((r) => r.id === pid); if (p) void addPerson(pid, fullName(p)); }} placeholder="Søg person og tilføj" />
          {people.map((p) => (
            <div key={p.id} className="inline" style={{ marginTop: 4 }}>
              <span className="tag" style={{ marginLeft: 0 }}>{p.name}</span>
              {f.present && <select value={p.company_id} onChange={(e) => setPeople((x) => x.map((y) => (y.id === p.id ? { ...y, company_id: e.target.value } : y)))}>
                <option value="">Ingen virksomhed</option>
                {p.opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>}
              <button type="button" className="small" onClick={() => setPeople((x) => x.filter((y) => y.id !== p.id))}>Fjern</button>
            </div>
          ))}
        </Field>
        <Field label="Handler om (virksomheder)">
          <Picker items={coItems} value="" onChange={(cid) => { const c = companies.data?.find((r) => r.id === cid); if (c) setCos((x) => [...x, { id: cid, name: c.name }]); }} placeholder="Søg virksomhed og tilføj" />
          {cos.map((c) => (
            <div key={c.id} className="inline" style={{ marginTop: 4 }}>
              <span className="tag" style={{ marginLeft: 0 }}>{c.name}</span>
              <button type="button" className="small" onClick={() => setCos((x) => x.filter((y) => y.id !== c.id))}>Fjern</button>
            </div>
          ))}
        </Field>
        <Field label="Filer" hint="PDF, billeder m.m. Højst 25 MB pr. fil">
          <input type="file" multiple onChange={(e) => { setFresh((x) => [...x, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
          {files.map((x) => (
            <div key={x.id} className="inline" style={{ marginTop: 4 }}>{x.file_name}
              <button type="button" className="small" onClick={() => { setFiles((l) => l.filter((y) => y.id !== x.id)); setRemoved((l) => [...l, x]); }}>Fjern</button></div>
          ))}
          {fresh.map((x, i) => (
            <div key={i} className="inline" style={{ marginTop: 4 }}>{x.name} <span className="muted">(ny)</span>
              <button type="button" className="small" onClick={() => setFresh((l) => l.filter((_, j) => j !== i))}>Fjern</button></div>
          ))}
        </Field>
      </div>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Gemmer...' : 'Gem aktivitet'}</button>
        <button type="button" onClick={() => (id ? go('aktivitet', id) : history.back())}>Annullér</button>
      </div>
    </form>
  );
}
