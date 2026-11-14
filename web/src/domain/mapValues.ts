/**
 * Valores por município para o mapa, a partir dos mesmos filtros dos gráficos.
 * Modo "atividade":
 *   - um sensor            -> métrica do sensor por 1.000 km² no período;
 *   - ambos os sensores    -> razão VIIRS ÷ MODIS (quanto o VIIRS "vê a mais"), nunca a soma;
 *   - visão harmonizada    -> VIIRS ajustado à escala MODIS/Aqua por 1.000 km².
 */
import type { Dataset } from '../data/types';
import type { Filters } from './filters';
import { harmonizedSlice, monthRange, sensorValues, sum } from './series';

export interface MapLayerValues {
  kind: 'densidade' | 'razao';
  label: string;
  values: Map<string, number | null>;   // null = não calculável (ex.: MODIS = 0 na razão)
  breaks: number[];                      // limites superiores das classes 1..n
}

/** Quebras por quantis dos valores positivos; determinístico e sem classes vazias repetidas. */
export function quantileBreaks(values: number[], n = 5): number[] {
  const v = values.filter((x) => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const out: number[] = [];
  for (let k = 1; k <= n; k++) {
    const q = v[Math.min(v.length - 1, Math.ceil((k / n) * v.length) - 1)];
    if (!out.length || q > out[out.length - 1]) out.push(q);
  }
  return out;
}

export function classOf(value: number | null, breaks: number[]): number {
  if (value === null || value <= 0 || !breaks.length) return 0;
  const k = breaks.findIndex((b) => value <= b);
  return k === -1 ? breaks.length : k + 1;
}

export function activityValues(ds: Dataset, f: Filters): MapLayerValues | null {
  const s = ds.sensors;
  if (!s) return null;
  const r = monthRange(s.monthly.meses, f.yearFrom, f.yearTo);
  if (!r) return null;
  const values = new Map<string, number | null>();
  const metricLabel = s.manifest.metricas.find((m) => m.id === f.metric)?.rotulo ?? f.metric;
  const per1000 = (v: number, area: number) => (area > 0 ? (v / area) * 1000 : 0);
  let kind: MapLayerValues['kind'] = 'densidade';
  let label: string;
  for (const [cod, region] of Object.entries(s.monthly.regioes)) {
    if (cod === '29') continue;
    if (f.view === 'harmonizado') {
      const h = harmonizedSlice(region, f.grid, r);
      values.set(cod, h ? per1000(sum(h.estimate), region.area_km2) : null);
    } else if (f.sensor === 'ambos') {
      kind = 'razao';
      const m = sum(sensorValues(region, 'MODIS_AQUA', f.metric, r));
      const v = sum(sensorValues(region, 'VIIRS_NOAA20', f.metric, r));
      values.set(cod, m > 0 ? v / m : null);
    } else {
      values.set(cod, per1000(sum(sensorValues(region, f.sensor, f.metric, r)), region.area_km2));
    }
  }
  if (f.view === 'harmonizado') label = `VIIRS ajustado (dias-célula equiv. MODIS) por 1.000 km², ${r.yearFrom}–${r.yearTo}`;
  else if (kind === 'razao') label = `Quanto o VIIRS vê a mais: VIIRS ÷ MODIS (${metricLabel}), ${r.yearFrom}–${r.yearTo}`;
  else label = `${f.sensor === 'MODIS_AQUA' ? 'MODIS/Aqua' : 'VIIRS/NOAA-20'}: ${metricLabel} por 1.000 km², ${r.yearFrom}–${r.yearTo}`;
  const breaks = quantileBreaks([...values.values()].filter((x): x is number => x !== null));
  return { kind, label, values, breaks };
}
