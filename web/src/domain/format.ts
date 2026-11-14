const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const pct0 = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

export const fmtInt = (v: number) => nf0.format(v);
export const fmt1 = (v: number) => nf1.format(v);
export const fmtPct = (v: number) => pct0.format(v);
/** "+12 %" / "−8 %" com sinal explícito (menos tipográfico). */
export const fmtSignedPct = (v: number) => `${v >= 0 ? '+' : '−'}${pct0.format(Math.abs(v))}`;

export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function fmtMonth(ym: string): string {
  return `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
}

export function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h${String(mm).padStart(2, '0')}`;
}
