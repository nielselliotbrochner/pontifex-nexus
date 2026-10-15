// Koordinater fra OpenStreetMap (Nominatim). Kaldes fra browseren, højst ét opslag pr. sekund (OSM's brugsvilkår).
export type Geo = { lat: number; lng: number; precision: 'adresse' | 'postnummer' };

async function nominatim(params: Record<string, string>): Promise<{ lat: number; lng: number } | null> {
  const qs = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'dk', 'accept-language': 'da', ...params });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`);
  if (!r.ok) throw new Error(`Opslaget fejlede (${r.status})`);
  const j = (await r.json()) as { lat: string; lon: string }[];
  return j.length ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
}

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Prøver adressen først, derefter postnummerets midte. To kald (1,1 s imellem) i værste fald.
export async function geocode(a: { address?: string | null; postal_code?: string | null; city?: string | null }): Promise<Geo | null> {
  const addr = a.address?.trim();
  if (addr) {
    const hit = await nominatim({ q: [addr, [a.postal_code, a.city].filter(Boolean).join(' '), 'Danmark'].filter(Boolean).join(', ') });
    if (hit) return { ...hit, precision: 'adresse' };
    await sleep(1100);
  }
  if (a.postal_code) {
    const hit = await nominatim({ postalcode: a.postal_code, country: 'Denmark' });
    if (hit) return { ...hit, precision: 'postnummer' };
  }
  return null;
}
