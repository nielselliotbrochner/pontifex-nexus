import { useEffect, useState, type ReactNode } from 'react';
import type { Row } from './data';

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Engangsbesked der vises efter navigation (fx »Personen er oprettet«).
let flashMsg = '';
export const setFlash = (m: string) => { flashMsg = m; };
export function takeFlash(): string { const m = flashMsg; flashMsg = ''; return m; }

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="fld"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}

export function Select({ value, onChange, items, empty = '', disabled }: { value: string; onChange: (v: string) => void; items: Row[]; empty?: string; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
    </select>
  );
}

// Søgbar vælger: skriv for at indsnævre, vælg i listen.
export function Picker({ items, value, onChange, placeholder = 'Søg...' }: { items: { id: string; label: string }[]; value: string; onChange: (id: string) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const sel = items.find((i) => i.id === value);
  const s = q.trim().toLowerCase();
  const list = (s ? items.filter((i) => i.label.toLowerCase().includes(s)) : items).slice(0, 60);
  if (sel && !list.some((i) => i.id === sel.id)) list.unshift(sel);
  return (
    <div className="picker">
      <input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={value} onChange={(e) => onChange(e.target.value)} size={1}>
        <option value="">{s ? `${list.length} match` : 'Vælg...'}</option>
        {list.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
      </select>
    </div>
  );
}

export const nz = (s: string) => (s.trim() === '' ? null : s.trim());
export const today = () => new Date().toISOString().slice(0, 10);
