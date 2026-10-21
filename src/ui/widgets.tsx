import type { ReactNode } from 'react';

export function Bar({ value, label, tone, detail }: { value: number; label: string; tone?: 'good' | 'warn' | 'bad' | 'auto'; detail?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const t = tone === 'auto' || !tone ? (v > 0.66 ? 'good' : v > 0.33 ? 'warn' : 'bad') : tone;
  return (
    <div className="bar">
      <div className="bar-head">
        <span>{label}</span>
        <span className="mono">{detail ?? `${Math.round(v * 100)}%`}</span>
      </div>
      <div className="bar-track"><div className={`bar-fill ${t}`} style={{ width: `${v * 100}%` }} /></div>
    </div>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{children}</div>
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head"><h3>{title}</h3>{right}</header>
      {children}
    </section>
  );
}

export function fmtNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}k`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function fmtUsdB(b: number): string {
  const a = Math.abs(b);
  const text = a >= 1000 ? `${(a / 1000).toFixed(2)}T` : `${a.toFixed(a >= 100 ? 0 : 1)}B`;
  return `${b < 0 && /[1-9]/.test(text) ? '-' : ''}$${text}`;
}
