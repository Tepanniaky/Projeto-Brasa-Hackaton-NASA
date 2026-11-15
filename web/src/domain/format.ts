/** Números, meses, datas e horas no idioma atual (pt-BR ou en-US). */
import { getLang, type Lang } from '../i18n/lang';

const make = (loc: string) => ({
  n0: new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }),
  n1: new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 0 }),
  p0: new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 0 }),
});
const NF: Record<Lang, ReturnType<typeof make>> = { pt: make('pt-BR'), en: make('en-US') };
const nf = () => NF[getLang()];

export const fmtInt = (v: number) => nf().n0.format(v);
export const fmt1 = (v: number) => nf().n1.format(v);
export const fmtPct = (v: number) => nf().p0.format(v);
/** "+12 %" / "−8 %" com sinal explícito (menos tipográfico). */
export const fmtSignedPct = (v: number) => `${v >= 0 ? '+' : '−'}${nf().p0.format(Math.abs(v))}`;

const MONTHS: Record<Lang, string[]> = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
/** Nomes curtos dos meses no idioma atual (índice 0 = janeiro). */
export const monthsShort = (): string[] => MONTHS[getLang()];

/** "2024-09" → "set/2024" | "Sep 2024". */
export function fmtMonth(ym: string): string {
  const m = monthsShort()[Number(ym.slice(5, 7)) - 1];
  return getLang() === 'en' ? `${m} ${ym.slice(0, 4)}` : `${m}/${ym.slice(0, 4)}`;
}

/** "16/07" (dia/mês, como vem da série da equipe) → "16/07" | "Jul 16". */
export function fmtDayMonth(dm: string): string {
  if (getLang() !== 'en') return dm;
  const [d, m] = dm.split('/').map(Number);
  return d && m ? `${MONTHS.en[m - 1]} ${d}` : dm;
}

/** "2026-11-13" → "13/11/2026" | "Nov 13, 2026". */
export function fmtIsoDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return getLang() === 'en' ? `${MONTHS.en[Number(m) - 1]} ${Number(d)}, ${y}` : `${d}/${m}/${y}`;
}

/** Hora decimal → "13h39" | "13:39". */
export function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = String(Math.round((h - hh) * 60)).padStart(2, '0');
  return getLang() === 'en' ? `${hh}:${mm}` : `${hh}h${mm}`;
}

/** Período "2020" ou "2020–2025". */
export const fmtPeriod = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
