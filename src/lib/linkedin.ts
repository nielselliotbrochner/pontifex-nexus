// Samme normalisering som databasens private.normalize_linkedin, så dubletter findes før gem.
export function normalizeLinkedin(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = u.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^(www|[a-z]{2})\.(linkedin\.com)/, '$2')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return s === '' ? null : s;
}
