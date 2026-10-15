import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

// Søgbar vælger: skriv, og de matchende poster vises løbende i en liste. Pil op/ned og Enter virker.
export function Picker({ items, value, onChange, placeholder = 'Søg...' }: { items: { id: string; label: string }[]; value: string; onChange: (id: string) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const sel = items.find((i) => i.id === value);
  const s = q.trim().toLowerCase();
  const list = useMemo(() => {
    if (!s) return items.slice(0, 8);
    const hits = items.filter((i) => i.label.toLowerCase().includes(s));
    hits.sort((x, y) => Number(y.label.toLowerCase().startsWith(s)) - Number(x.label.toLowerCase().startsWith(s)));
    return hits.slice(0, 10);
  }, [items, s]);
  const total = s ? items.filter((i) => i.label.toLowerCase().includes(s)).length : items.length;

  function choose(id: string) { onChange(id); setQ(''); setOpen(false); }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAct((x) => Math.min(x + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((x) => Math.max(x - 1, 0)); }
    else if (e.key === 'Enter' && open && list[act]) { e.preventDefault(); choose(list[act].id); }
    else if (e.key === 'Escape') { setOpen(false); setQ(''); }
  }
  const mark = (label: string) => {
    const i = s ? label.toLowerCase().indexOf(s) : -1;
    return i < 0 ? label : <>{label.slice(0, i)}<mark>{label.slice(i, i + s.length)}</mark>{label.slice(i + s.length)}</>;
  };

  return (
    <div className="picker" onBlur={() => { setOpen(false); setQ(''); }}>
      <input role="combobox" aria-expanded={open} aria-autocomplete="list" placeholder={placeholder}
        value={open || !sel ? q : sel.label}
        onFocus={() => { setOpen(true); setAct(0); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(0); }}
        onKeyDown={onKey} />
      {sel && !open && <button type="button" className="picker-x" aria-label="Fjern valg" onMouseDown={(e) => { e.preventDefault(); choose(''); }}>×</button>}
      {open && (
        <ul className="picker-list" role="listbox">
          {list.length === 0 && <li className="muted">Ingen match</li>}
          {list.map((i, n) => (
            <li key={i.id} role="option" aria-selected={n === act} className={n === act ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); choose(i.id); }} onMouseEnter={() => setAct(n)}>{mark(i.label)}</li>
          ))}
          {total > list.length && <li className="muted">...og {total - list.length} flere. Skriv mere for at indsnævre.</li>}
        </ul>
      )}
    </div>
  );
}

export const nz = (s: string) => (s.trim() === '' ? null : s.trim());
export const today = () => new Date().toISOString().slice(0, 10);
