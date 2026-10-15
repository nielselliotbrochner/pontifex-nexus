import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAll, fullName, type Row } from '../lib/data';
import { go, href } from '../lib/nav';
import { Picker } from '../lib/form';
import { useAsync } from '../lib/useAsync';

type Opts = { persons: boolean; past: boolean; groups: boolean; links: boolean; acts: boolean; isolated: boolean; region: string; sector: string; search: string };
type GNode = { id: string; name: string; kind: 'company' | 'person' | 'group'; ref: string; own?: boolean };
type GLink = { source: string; target: string; type: 'current' | 'past' | 'group' | 'private' | 'activity'; label: string; tip?: string; weight?: number };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const MAX_PARTICIPANTS = 12; // større arrangementer giver et filttæppe af forbindelser og springes over

// Knude-id'er: c: virksomhed, p: person, g: koncern. Nye typer (fx j: projekt) tilføjes ved at hente dem i useAsync
// og tilføje noder og forbindelser i graph-beregningen. Fokus og dybde virker uændret for alle typer.
export function Network({ priv, focus }: { priv: boolean; focus: string | null }) {
  const { data, error, loading } = useAsync(async () => {
    const [companies, persons, aff, members, groups, links, parts] = await Promise.all([
      fetchAll('v_company_overview', 'company_id, name, is_own, region, sector, active'),
      fetchAll('v_contact_overview', 'contact_id, first_name, middle_name, last_name, active, region'),
      fetchAll('contact_company', 'contact_id, company_id, end_date, affiliation_type(name)'),
      fetchAll('company_group_member', 'group_id, company_id, group_role(name)'),
      fetchAll('company_group', 'id, name'),
      priv ? fetchAll('person_link', 'contact_a, contact_b, person_link_type(name)') : Promise.resolve([] as Row[]),
      fetchAll('activity_participant', 'activity_id, contact_id, activity(occurred_on, title, activity_type(name))', 'activity_id'),
    ]);
    return { companies, persons, aff, members, groups, links, parts };
  }, [priv], `network:${priv}`);

  const [o, setO] = useState<Opts>({ persons: true, past: false, groups: true, links: true, acts: true, isolated: false, region: '', sector: '', search: '' });
  const [depth, setDepth] = useState(2);
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((x) => ({ ...x, [k]: v }));

  const graph = useMemo(() => {
    if (!data) return { nodes: [] as GNode[], links: [] as GLink[], nCompanies: 0, nPersons: 0 };
    const nodes = new Map<string, GNode>();
    const links: GLink[] = [];
    const filtered = !!(o.region || o.sector) && !focus;
    const companies = data.companies.filter((c) => c.active && (focus || ((!o.region || c.region === o.region) && (!o.sector || c.sector === o.sector))));
    const keep = new Set(companies.map((c) => c.company_id as string));
    const personById = new Map<string, Row>(data.persons.map((p) => [p.contact_id, p]));
    const compById = new Map<string, Row>(companies.map((c) => [c.company_id, c]));
    const addCompany = (id: string) => { const c = compById.get(id)!; nodes.set(`c:${id}`, { id: `c:${id}`, name: c.name, kind: 'company', ref: id, own: c.is_own }); };
    for (const id of keep) addCompany(id);

    if (o.persons) {
      const seen = new Set<string>();
      for (const a of data.aff) {
        const past = !!a.end_date;
        if (!keep.has(a.company_id) || (past && !o.past && !focus)) continue;
        const p = personById.get(a.contact_id);
        if (!p || !p.active) continue;
        const pid = `p:${a.contact_id}`;
        const key = `${pid}|${a.company_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!nodes.has(pid)) nodes.set(pid, { id: pid, name: fullName(p), kind: 'person', ref: a.contact_id });
        links.push({ source: pid, target: `c:${a.company_id}`, type: past ? 'past' : 'current', label: a.affiliation_type?.name ?? '' });
      }
      if (o.isolated && !filtered && !focus) {
        for (const p of data.persons) if (p.active && !nodes.has(`p:${p.contact_id}`)) nodes.set(`p:${p.contact_id}`, { id: `p:${p.contact_id}`, name: fullName(p), kind: 'person', ref: p.contact_id });
      }
      if ((o.links || focus) && priv) {
        for (const l of data.links) {
          const a = `p:${l.contact_a}`, b = `p:${l.contact_b}`;
          if (nodes.has(a) && nodes.has(b)) links.push({ source: a, target: b, type: 'private', label: l.person_link_type?.name ?? '' });
        }
      }
    }
    if (o.persons && o.acts) {
      // Personer, der har været med i samme aktivitet, forbindes. Antal og titler vises på forbindelsen.
      const byAct = new Map<string, Row[]>();
      for (const r of data.parts) if (r.activity) (byAct.get(r.activity_id) ?? byAct.set(r.activity_id, []).get(r.activity_id)!).push(r);
      const pairs = new Map<string, { a: string; b: string; items: Row[] }>();
      for (const rows of byAct.values()) {
        const ids = [...new Set(rows.map((r) => r.contact_id as string))].filter((id) => personById.get(id)?.active);
        if (ids.length < 2 || ids.length > MAX_PARTICIPANTS) continue;
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
          const k = `${a}|${b}`;
          (pairs.get(k) ?? pairs.set(k, { a, b, items: [] }).get(k)!).items.push(rows[0].activity);
        }
      }
      for (const { a, b, items } of pairs.values()) {
        if (filtered && !(nodes.has(`p:${a}`) && nodes.has(`p:${b}`))) continue;
        for (const id of [a, b]) if (!nodes.has(`p:${id}`)) { const p = personById.get(id)!; nodes.set(`p:${id}`, { id: `p:${id}`, name: fullName(p), kind: 'person', ref: id }); }
        const sorted = [...items].sort((x, y) => String(y.occurred_on).localeCompare(x.occurred_on));
        links.push({
          source: `p:${a}`, target: `p:${b}`, type: 'activity', weight: items.length,
          label: items.length === 1 ? `${sorted[0].activity_type?.name ?? 'Aktivitet'} ${sorted[0].occurred_on}` : `${items.length} aktiviteter`,
          tip: sorted.slice(0, 6).map((x) => `${x.occurred_on} ${x.activity_type?.name ?? ''}: ${x.title}`).join('\n') + (sorted.length > 6 ? `\n+${sorted.length - 6} flere` : ''),
        });
      }
    }
    if (o.groups) {
      const byGroup = new Map<string, Row[]>();
      for (const m of data.members) if (keep.has(m.company_id)) (byGroup.get(m.group_id) ?? byGroup.set(m.group_id, []).get(m.group_id)!).push(m);
      for (const [gid, ms] of byGroup) {
        if (ms.length < 2) continue;
        const g = data.groups.find((x) => x.id === gid);
        const nm = g?.name || `Koncern: ${ms.map((m) => compById.get(m.company_id)?.name).filter(Boolean).slice(0, 2).join(', ')}`;
        nodes.set(`g:${gid}`, { id: `g:${gid}`, name: nm, kind: 'group', ref: gid });
        for (const m of ms) links.push({ source: `g:${gid}`, target: `c:${m.company_id}`, type: 'group', label: m.group_role?.name ?? '' });
      }
    }
    if (focus && !nodes.has(focus) && focus.startsWith('p:')) {
      const p = personById.get(focus.slice(2));
      if (p?.active) nodes.set(focus, { id: focus, name: fullName(p), kind: 'person', ref: p.contact_id });
    }
    let all = [...nodes.values()];
    let out = links;
    if (focus && nodes.has(focus)) {
      const adj = new Map<string, string[]>();
      for (const l of links) { (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.target); (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push(l.source); }
      const seen = new Set([focus]);
      let frontier = [focus];
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const id of frontier) for (const n of adj.get(id) ?? []) if (!seen.has(n)) { seen.add(n); next.push(n); }
        frontier = next;
      }
      all = all.filter((n) => seen.has(n.id));
      out = links.filter((l) => seen.has(l.source) && seen.has(l.target));
    }
    return { nodes: all, links: out, nCompanies: all.filter((n) => n.kind === 'company').length, nPersons: all.filter((n) => n.kind === 'person').length };
  }, [data, o, priv, focus, depth]);

  const pickItems = useMemo(() => [
    ...(data?.companies ?? []).filter((c) => c.active).map((c) => ({ id: `c:${c.company_id}`, label: `${c.name} (virksomhed)` })),
    ...(data?.persons ?? []).filter((p) => p.active).map((p) => ({ id: `p:${p.contact_id}`, label: `${fullName(p)} (person)` })),
  ], [data]);
  const focusNode = focus ? graph.nodes.find((n) => n.id === focus) : undefined;
  const regions = useMemo(() => [...new Set((data?.companies ?? []).map((c) => c.region).filter(Boolean))].sort() as string[], [data]);
  const sectors = useMemo(() => [...new Set((data?.companies ?? []).map((c) => c.sector).filter(Boolean))].sort() as string[], [data]);

  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<{ setOption: (o: unknown, n?: boolean) => void; resize: () => void; dispose: () => void; on: (e: string, f: (p: { dataType?: string; data?: { kind: string; ref: string } }) => void) => void } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | undefined;
    (async () => {
      const [{ use, init }, { GraphChart }, { TooltipComponent }, { CanvasRenderer }] = await Promise.all([
        import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers'),
      ]);
      use([GraphChart, TooltipComponent, CanvasRenderer]);
      if (dead || !box.current) return;
      const c = init(box.current) as unknown as NonNullable<typeof chart.current>;
      // Klik flytter fokus til noden, dobbeltklik åbner personen eller virksomheden.
      c.on('click', (p) => {
        const d = p.data;
        if (p.dataType !== 'node' || !d || d.kind === 'group') return;
        go('visualisering', `${d.kind === 'person' ? 'p' : 'c'}:${d.ref}`);
      });
      c.on('dblclick', (p) => {
        const d = p.data;
        if (p.dataType !== 'node' || !d || d.kind === 'group') return;
        go(d.kind === 'person' ? 'person' : 'virksomhed', d.ref);
      });
      chart.current = c;
      ro = new ResizeObserver(() => c.resize());
      ro.observe(box.current);
      setReady(true);
    })();
    return () => { dead = true; ro?.disconnect(); chart.current?.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !chart.current) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const col = { company: v('--accent'), own: v('--head'), person: v('--person'), group: v('--muted'), text: v('--fg'), line: v('--muted'), hi: v('--accent-hover') };
    const deg = new Map<string, number>();
    for (const l of graph.links) { deg.set(l.source, (deg.get(l.source) ?? 0) + 1); deg.set(l.target, (deg.get(l.target) ?? 0) + 1); }
    const s = o.search.trim().toLowerCase();
    const small = graph.nodes.length <= (focus ? 140 : 80);
    const w = box.current?.clientWidth ?? 800, h = box.current?.clientHeight ?? 500;
    const data = graph.nodes.map((n) => {
      const d = deg.get(n.id) ?? 0;
      const hit = !!s && n.name.toLowerCase().includes(s);
      return {
        id: n.id, name: n.name, kind: n.kind, ref: n.ref,
        symbol: n.kind === 'company' ? 'roundRect' : n.kind === 'group' ? 'diamond' : 'circle',
        symbolSize: (n.kind === 'company' ? 16 + Math.sqrt(d) * 5 : n.kind === 'group' ? 14 : 9) + (hit ? 8 : 0) + (n.id === focus ? 10 : 0),
        ...(n.id === focus ? { fixed: true, x: w / 2, y: h / 2 } : {}),
        itemStyle: { color: n.kind === 'company' ? (n.own ? col.own : col.company) : n.kind === 'group' ? col.group : col.person, borderColor: hit || n.id === focus ? col.text : 'transparent', borderWidth: hit || n.id === focus ? 3 : 0 },
        label: { show: n.kind !== 'person' || small || hit || n.id === focus, color: col.text, fontSize: n.id === focus ? 14 : 12, fontWeight: n.id === focus ? 'bold' : 'normal', position: 'right' },
      };
    });
    const style = (t: GLink['type']) => t === 'current' ? { type: 'solid', width: 1.4, opacity: 0.55, color: col.line }
      : t === 'past' ? { type: 'dashed', width: 1, opacity: 0.35, color: col.line }
      : t === 'group' ? { type: 'solid', width: 2.4, opacity: 0.8, color: col.group }
      : t === 'activity' ? { type: 'solid', width: 2, opacity: 0.85, color: col.hi }
      : { type: 'dashed', width: 1.6, opacity: 0.9, color: col.company };
    chart.current.setOption({
      animationDuration: 400,
      tooltip: { formatter: (p: { dataType: string; data: { name: string; label?: string; tip?: string; kind?: string } }) => p.dataType === 'edge' ? esc([p.data.label ?? '', p.data.tip ?? ''].filter(Boolean).join('\n')).replace(/\n/g, '<br/>') : `${p.data.name}${p.data.kind === 'person' ? ' (person)' : p.data.kind === 'group' ? ' (koncern)' : ''}` },
      series: [{
        type: 'graph', layout: 'force', roam: true, zoom: focus || graph.nodes.length > 120 ? 1 : 0.8, draggable: true, data,
        links: graph.links.map((l) => ({ source: l.source, target: l.target, label: l.label, tip: l.tip, lineStyle: l.type === 'activity' ? { ...style(l.type), width: 1.5 + Math.min(l.weight ?? 1, 6) } : style(l.type) })),
        edgeLabel: { show: !!focus && graph.links.length <= 60, formatter: (p: { data: { label?: string } }) => p.data.label ?? '', fontSize: 10, color: col.line },
        force: { repulsion: graph.nodes.length > 400 ? 60 : graph.nodes.length > 120 ? 140 : focus ? 600 : 380, gravity: 0.06, edgeLength: graph.nodes.length > 120 ? [20, 90] : focus ? [110, 230] : [70, 180], friction: 0.25 },
        labelLayout: { hideOverlap: true },
        emphasis: { focus: 'adjacency', label: { show: true }, lineStyle: { width: 3, opacity: 1 } },
        edgeSymbol: ['none', 'none'],
      }],
    }, true);
  }, [graph, o.search, ready, focus]);

  if (error) return <p className="err">{error}</p>;
  return (
    <>
      <h1>Netværk</h1>
      <div className="filters">
        <div style={{ minWidth: 280 }}><Picker items={pickItems} value={focus ?? ''} onChange={(id) => go('visualisering', id || undefined)} placeholder="Centrér på person eller virksomhed" /></div>
        <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} disabled={!focus} title="Hvor mange led fra fokus, der vises">
          <option value={1}>Direkte forbindelser</option><option value={2}>To led</option><option value={3}>Tre led</option>
        </select>
        {focus && <button onClick={() => go('visualisering')}>Vis alle</button>}
        {focusNode && focusNode.kind !== 'group' && <a href={href(focusNode.kind === 'person' ? 'person' : 'virksomhed', focusNode.ref)} onClick={(e) => { e.preventDefault(); go(focusNode.kind === 'person' ? 'person' : 'virksomhed', focusNode.ref); }}>Åbn {focusNode.name}</a>}
      </div>
      {focus && !loading && !focusNode && <p className="warn">Fokus findes ikke i netværket (inaktiv eller slettet).</p>}
      <div className="filters">
        <label><input type="checkbox" checked={o.persons} onChange={(e) => set('persons', e.target.checked)} /> Personer</label>
        <label><input type="checkbox" checked={o.past} onChange={(e) => set('past', e.target.checked)} disabled={!o.persons} /> Tidligere tilknytninger</label>
        <label><input type="checkbox" checked={o.groups} onChange={(e) => set('groups', e.target.checked)} /> Koncerner</label>
        <label title="Forbinder personer, der har været med i samme aktivitet"><input type="checkbox" checked={o.acts} onChange={(e) => set('acts', e.target.checked)} disabled={!o.persons} /> Fælles aktiviteter</label>
        {priv && <label><input type="checkbox" checked={o.links} onChange={(e) => set('links', e.target.checked)} disabled={!o.persons} /> Private relationer</label>}
        <label title="Viser også personer uden tilknytning, når der ikke er valgt region eller sektor"><input type="checkbox" checked={o.isolated} onChange={(e) => set('isolated', e.target.checked)} disabled={!o.persons} /> Personer uden virksomhed</label>
      </div>
      <div className="filters">
        <select value={o.region} disabled={!!focus} onChange={(e) => set('region', e.target.value)}><option value="">Alle regioner</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
        <select value={o.sector} disabled={!!focus} onChange={(e) => set('sector', e.target.value)}><option value="">Alle sektorer</option>{sectors.map((r) => <option key={r}>{r}</option>)}</select>
        <input placeholder="Fremhæv navn" value={o.search} onChange={(e) => set('search', e.target.value)} />
        <span className="muted">{loading ? 'Henter...' : `${graph.nCompanies} virksomheder, ${graph.nPersons} personer, ${graph.links.length} forbindelser`}</span>
      </div>
      <div className="legend">
        <span><i className="sw sq" style={{ background: 'var(--accent)' }} /> Virksomhed</span>
        <span><i className="sw sq" style={{ background: 'var(--head)' }} /> Egen virksomhed</span>
        <span><i className="sw" style={{ background: 'var(--person)' }} /> Person</span>
        <span><i className="sw dia" style={{ background: 'var(--muted)' }} /> Koncern</span>
        <span><i className="sw" style={{ background: 'var(--accent-hover)', borderRadius: 2, height: 3 }} /> Fælles aktivitet (tykkere ved flere)</span>
        <span className="muted">Klik på en node for at centrere på den, dobbeltklik for at åbne den. Træk i noder, scroll for zoom.</span>
      </div>
      <div ref={box} className="netbox" role="img" aria-label="Netværk af virksomheder og personer" />
      {!loading && graph.nodes.length === 0 && <p className="muted">Ingen noder at vise med de valgte filtre.</p>}
    </>
  );
}
