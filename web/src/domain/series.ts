/**
 * Recortes e agregações das séries mensais por sensor (camada B).
 * Nunca soma MODIS com VIIRS: cada função opera sobre UM sensor.
 */
import type { GridId, MetricId, MonthlySeries, RegionMonthly, SensorId } from '../data/types';

export interface MonthRange {
  i0: number;
  i1: number;           // inclusivo
  yearFrom: number;
  yearTo: number;
  clamped: boolean;     // o período pedido foi reduzido à cobertura da camada B
}

/** Interseção do período pedido com os meses disponíveis; null se não houver sobreposição. */
export function monthRange(meses: string[], yearFrom: number, yearTo: number): MonthRange | null {
  const years = meses.map((m) => Number(m.slice(0, 4)));
  const first = years[0];
  const last = years[years.length - 1];
  const a = Math.max(yearFrom, first);
  const b = Math.min(yearTo, last);
  if (a > b) return null;
  const i0 = years.indexOf(a);
  const i1 = years.lastIndexOf(b);
  return { i0, i1, yearFrom: a, yearTo: b, clamped: a !== yearFrom || b !== yearTo };
}

export function slice<T>(values: T[], r: MonthRange): T[] {
  return values.slice(r.i0, r.i1 + 1);
}

export function sensorValues(region: RegionMonthly, sensor: SensorId, metric: MetricId, r: MonthRange): number[] {
  return slice(region.series[sensor][metric], r);
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Soma por ano; para métricas não aditivas no tempo (nenhuma aqui) o chamador não deve usar. */
export function annualTotals(values: number[], meses: string[]): Map<number, number> {
  const out = new Map<number, number>();
  meses.forEach((m, i) => {
    const y = Number(m.slice(0, 4));
    out.set(y, (out.get(y) ?? 0) + (values[i] ?? 0));
  });
  return out;
}

export interface HarmonizedSlice {
  estimate: number[];
  lo: number[];
  hi: number[];
}

const Z90 = 1.6449;

/** Estimativa VIIRS ajustada à escala MODIS/Aqua (dias-célula) e intervalo aproximado de 90 %. */
export function harmonizedSlice(region: RegionMonthly, grid: GridId, r: MonthRange): HarmonizedSlice | null {
  const h = region.harmonizado?.[grid];
  if (!h) return null;
  const est = slice(h.estimativa, r);
  const dp = slice(h.dp, r);
  return {
    estimate: est,
    lo: est.map((e, i) => Math.max(0, e - Z90 * dp[i])),
    hi: est.map((e, i) => e + Z90 * dp[i]),
  };
}

/** Desvio-padrão de uma soma de meses, supondo independência (mesma hipótese do pipeline). */
export function sumSd(dp: number[]): number {
  return Math.sqrt(dp.reduce((a, d) => a + d * d, 0));
}

/** Matriz ano × mês (12 colunas) para o calendário mensal de um sensor. */
export function monthMatrix(values: number[], meses: string[]): { years: number[]; rows: number[][] } {
  const years: number[] = [];
  const rows: number[][] = [];
  meses.forEach((m, i) => {
    const y = Number(m.slice(0, 4));
    const mo = Number(m.slice(5, 7)) - 1;
    let k = years.indexOf(y);
    if (k < 0) {
      years.push(y);
      rows.push(new Array(12).fill(0));
      k = years.length - 1;
    }
    rows[k][mo] = values[i] ?? 0;
  });
  return { years, rows };
}

export function gridOfMetric(metric: MetricId, fallback: GridId): GridId {
  if (metric === 'dias_celula_g5') return 'g5';
  if (metric === 'dias_celula_g10') return 'g10';
  return fallback;
}

export function regionOf(monthly: MonthlySeries, cod: string): RegionMonthly | null {
  return monthly.regioes[cod] ?? null;
}
