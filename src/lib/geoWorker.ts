// Koordinatopslag i baggrunden: finder aktive lokationer uden koordinater og slår dem op én ad gangen (OSM: højst 1 pr. sekund).
// Starter når appen åbnes, og igen når en lokation gemmes (pokeGeo). Opslag uden resultat springes over resten af sessionen.
import { supabase } from './supabase';
import { geocode, sleep } from './geocode';

let running = false;
let again = false;
const skipped = new Set<string>();
export const GEO_EVENT = 'nexus:geo';

export function pokeGeo() {
  if (running) { again = true; return; }
  void run();
}

async function run() {
  running = true;
  try {
    do {
      again = false;
      for (;;) {
        const { data, error } = await supabase.from('company_location').select('id, address, postal_code, city')
          .eq('active', true).is('lat', null).or('address.not.is.null,postal_code.not.is.null').limit(50);
        if (error) return;
        const todo = (data ?? []).filter((l) => !skipped.has(l.id));
        if (!todo.length) break;
        for (const l of todo) {
          try {
            const g = await geocode(l);
            if (g) {
              await supabase.from('company_location').update({ lat: Number(g.lat.toFixed(6)), lng: Number(g.lng.toFixed(6)) }).eq('id', l.id);
              window.dispatchEvent(new Event(GEO_EVENT));
            } else skipped.add(l.id);
          } catch { skipped.add(l.id); }
          await sleep(1100);
        }
      }
    } while (again);
  } finally { running = false; }
}
