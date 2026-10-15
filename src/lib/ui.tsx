import type { KeyboardEvent } from 'react';

// Pil op og ned flytter fokus mellem links i en tabel. Enter åbner linket.
export function arrowNav(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>('tbody td:first-child a'));
  const i = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (i < 0) return;
  const next = links[i + (e.key === 'ArrowDown' ? 1 : -1)];
  if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest' }); }
}

export function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr className="skelrow" key={r}>
          {Array.from({ length: cols }, (_, c) => <td key={c}><div className="skel" style={{ width: `${55 + ((r * 7 + c * 13) % 40)}%` }} /></td>)}
        </tr>
      ))}
    </>
  );
}

export function SkeletonCards({ n = 3 }: { n?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: n }, (_, i) => (
        <div className="card" key={i}><div className="skel" style={{ width: '40%', marginBottom: 14 }} /><div className="skel" style={{ width: '90%', marginBottom: 8 }} /><div className="skel" style={{ width: '70%' }} /></div>
      ))}
    </div>
  );
}
