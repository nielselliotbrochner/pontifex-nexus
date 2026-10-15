import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { supabase } from '../lib/supabase';
import { fetchAll, fullName, type Row } from '../lib/data';
import { go, href } from '../lib/nav';
import { geocode, sleep } from '../lib/geocode';
import { useAsync } from '../lib/useAsync';

type Opts = { region: string; sector: string; hqOnly: boolean; search: string };

export function MapView() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [locs, companies, aff, people] = await Promise.all([
      fetchAll('company_location', 'id, company_id, name, is_hq, address, postal_code, city, lat, lng, active'),
      fetchAll('v_company_overview', 'company_id, name, is_own, region, sector, active'),
      fetchAll('contact_company', 'contact_id, company_id, location_id, end_date'),
      fetchAll('contact', 'id, first_name, middle_name, last_name, active'),
    ]);
    return { locs, companies, aff, people };
  }, [], 'map');
  const [o, setO] = useState<Opts>({ region: '', sector: '', hqOnly: false, search: '' });
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO((x) => ({ ...x, [k]: v }));

  const model = useMemo(() => {
    if (!data) return { points: [] as Point[], missing: [] as Row[], regions: [] as string[], sectors: [] as string[] };
    const comp = new Map<string, Row>(data.companies.map((c) => [c.company_id, c]));
    const person = new Map<string, Row>(data.people.map((p) => [p.id, p]));
    const hqOf = new Map<string, string>();
    for (const l of data.locs) if (l.is_hq) hqOf.set(l.company_id, l.id);
    const byLoc = new Map<string, Row[]>();
    for (const a of data.aff) {
      if (a.end_date) continue;
      const lid = a.location_id ?? hqOf.get(a.company_id);
      const p = person.get(a.contact_id);
      if (!lid || !p?.active) continue;
      (byLoc.get(lid) ?? byLoc.set(lid, []).get(lid)!).push(p);
    }
    const s = o.search.trim().toLowerCase();
    const points: Point[] = [];
    const missing: Row[] = [];
    for (const l of data.locs) {
      const c = comp.get(l.company_id);
      if (!c || !c.active || !l.active) continue;
      if (o.region && c.region !== o.region) continue;
      if (o.sector && c.sector !== o.sector) continue;
      if (o.hqOnly && !l.is_hq) continue;
      const people = byLoc.get(l.id) ?? [];
      if (s && ![c.name, l.city, l.name, ...people.map(fullName)].join(' ').toLowerCase().includes(s)) continue;
      if (l.lat == null || l.lng == null) { missing.push(l); continue; }
      points.push({ id: l.id, lat: Number(l.lat), lng: Number(l.lng), company: c.name, companyId: l.company_id, own: c.is_own, hq: l.is_hq, name: l.name, address: [l.address, [l.postal_code, l.city].filter(Boolean).join(' ')].filter(Boolean).join(', '), people: people.map((p) => ({ id: p.id, name: fullName(p) })) });
    }
    const uniq = (k: string) => [...new Set(data.companies.map((c) => c[k]).filter(Boolean))].sort() as string[];
    return { points, missing, regions: uniq('region'), sectors: uniq('sector') };
  }, [data, o]);

  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ L: typeof Leaflet; map: Leaflet.Map; group: Leaflet.MarkerClusterGroup } | null>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef('');

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import('leaflet')).default;
      (window as unknown as { L: typeof L }).L = L;
      await import('leaflet.markercluster');
      await import('leaflet/dist/leaflet.css');
      await import('leaflet.markercluster/dist/MarkerCluster.css');
      if (dead || !box.current) return;
      const map = L.map(box.current, { zoomControl: true }).setView([56.0, 10.6], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsydere' }).addTo(map);
      const group = L.markerClusterGroup({
        showCoverageOnHover: false, maxClusterRadius: 45,
        iconCreateFunction: (c) => L.divIcon({ html: `<span>${c.getChildCount()}</span>`, className: 'nx-cluster', iconSize: [34, 34] }),
      });
      map.addLayer(group);
      api.current = { L, map, group };
      setReady(true);
    })();
    return () => { dead = true; api.current?.map.remove(); api.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !api.current) return;
    const { L, map, group } = api.current;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim(), deep = css.getPropertyValue('--head').trim();
    group.clearLayers();
    for (const p of model.points) {
      const m = L.circleMarker([p.lat, p.lng], { radius: p.hq ? 9 : 6, color: '#fff', weight: 1.5, fillColor: p.own ? deep : accent, fillOpacity: 0.92 });
      m.bindPopup(() => popup(p), { maxWidth: 300 });
      m.bindTooltip(p.company, { direction: 'top' });
      group.addLayer(m);
    }
    const key = JSON.stringify([o.region, o.sector, o.hqOnly, o.search, model.points.length]);
    if (model.points.length && fitted.current !== key) {
      fitted.current = key;
      map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 12 });
    }
  }, [model, ready, o]);

  // Find manglende koordinater
  const [geo, setGeo] = useState<{ running: boolean; done: number; total: number; failed: string[] }>({ running: false, done: 0, total: 0, failed: [] });
  const stop = useRef(false);
  async function findCoords() {
    const todo = (data?.locs ?? []).filter((l) => l.active && (l.lat == null || l.lng == null) && (l.address || l.postal_code));
    if (!todo.length) return;
    stop.current = false;
    setGeo({ running: true, done: 0, total: todo.length, failed: [] });
    const failed: string[] = [];
    let n = 0;
    for (const l of todo) {
      if (stop.current) break;
      try {
        const g = await geocode(l);
        if (g) {
          const { error: er } = await supabase.from('company_location').update({ lat: Number(g.lat.toFixed(6)), lng: Number(g.lng.toFixed(6)) }).eq('id', l.id);
          if (er) failed.push(`${l.address ?? l.postal_code}: ${er.message}`);
        } else failed.push(`${[l.address, l.postal_code, l.city].filter(Boolean).join(', ')}: ikke fundet`);
      } catch (e) { failed.push(e instanceof Error ? e.message : String(e)); }
      n += 1;
      setGeo({ running: true, done: n, total: todo.length, failed: [...failed] });
      await sleep(1100);
    }
    setGeo({ running: false, done: n, total: todo.length, failed });
    reload();
  }

  if (error) return <p className="err">{error}</p>;
  const noCoordsAll = (data?.locs ?? []).filter((l) => l.active && (l.lat == null || l.lng == null)).length;
  return (
    <>
      <h1>Kort</h1>
      <div className="filters">
        <select value={o.region} onChange={(e) => set('region', e.target.value)}><option value="">Alle regioner</option>{model.regions.map((r) => <option key={r}>{r}</option>)}</select>
        <select value={o.sector} onChange={(e) => set('sector', e.target.value)}><option value="">Alle sektorer</option>{model.sectors.map((r) => <option key={r}>{r}</option>)}</select>
        <input placeholder="Søg virksomhed, by eller person" value={o.search} onChange={(e) => set('search', e.target.value)} style={{ minWidth: 240 }} />
        <label><input type="checkbox" checked={o.hqOnly} onChange={(e) => set('hqOnly', e.target.checked)} /> Kun hovedkontorer</label>
        <span className="muted">{loading ? 'Henter...' : `${model.points.length} lokationer på kortet`}</span>
      </div>
      {noCoordsAll > 0 && (
        <div className="notice soft">
          <div className="inline">
            <span>{noCoordsAll} lokationer mangler koordinater og vises ikke.</span>
            {!geo.running && <button className="small" onClick={findCoords}>Find koordinater</button>}
            {geo.running && <><span>{geo.done} af {geo.total}</span><button className="small" onClick={() => { stop.current = true; }}>Stop</button></>}
          </div>
          <small className="muted">Koordinater hentes fra OpenStreetMap, ét opslag i sekundet. Findes adressen ikke, bruges postnummerets midte.</small>
          {geo.failed.length > 0 && <ul>{geo.failed.slice(0, 8).map((f, i) => <li key={i} className="err">{f}</li>)}</ul>}
        </div>
      )}
      <div className="legend">
        <span><i className="sw" style={{ background: 'var(--accent)' }} /> Virksomhed</span>
        <span><i className="sw" style={{ background: 'var(--head)' }} /> Egen virksomhed</span>
        <span className="muted">Stor prik er hovedkontor. Klik på en prik for personer og link.</span>
      </div>
      <div ref={box} className="netbox" role="application" aria-label="Kort over lokationer" />
    </>
  );
}

type Point = { id: string; lat: number; lng: number; company: string; companyId: string; own: boolean; hq: boolean; name: string | null; address: string; people: { id: string; name: string }[] };

function popup(p: Point): HTMLElement {
  const el = document.createElement('div');
  const link = (text: string, view: string, id: string) => {
    const a = document.createElement('a');
    a.textContent = text; a.href = href(view, id);
    a.addEventListener('click', (e) => { e.preventDefault(); go(view, id); });
    return a;
  };
  const h = document.createElement('strong'); h.appendChild(link(p.company, 'virksomhed', p.companyId)); el.appendChild(h);
  const sub = document.createElement('div'); sub.textContent = [p.hq ? 'Hovedkontor' : p.name, p.address].filter(Boolean).join(' · '); sub.style.margin = '2px 0 6px'; el.appendChild(sub);
  const n = document.createElement('div'); n.textContent = p.people.length === 0 ? 'Ingen personer her' : `${p.people.length} ${p.people.length === 1 ? 'person' : 'personer'}`; el.appendChild(n);
  if (p.people.length) {
    const ul = document.createElement('ul'); ul.style.margin = '4px 0 0'; ul.style.paddingLeft = '18px';
    for (const q of p.people.slice(0, 8)) { const li = document.createElement('li'); li.appendChild(link(q.name, 'person', q.id)); ul.appendChild(li); }
    if (p.people.length > 8) { const li = document.createElement('li'); li.textContent = `og ${p.people.length - 8} flere`; ul.appendChild(li); }
    el.appendChild(ul);
  }
  return el;
}
