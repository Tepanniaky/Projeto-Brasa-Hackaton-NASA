/**
 * Valores por município para o mapa, a partir dos mesmos filtros dos gráficos.
 * Modo "atividade":
 *   - um sensor            -> métrica do sensor por 1.000 km² no período;
 *   - ambos os sensores    -> razão VIIRS ÷ MODIS (quanto o VIIRS "vê a mais"), nunca a soma;
 *   - visão harmonizada    -> VIIRS ajustado à escala MODIS/Aqua por 1.000 km².
 */
import type { MultiPolygon, Polygon } from 'geojson';
import type { Dataset, TeamIndexItem } from '../data/types';
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

// ---------- Modos da camada A (série da equipe), sem depender dos sensores ----------

const R_EARTH_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Área esférica de um anel lon/lat em km² (fórmula de Chamberlain & Duquette, a mesma do geojson-area). */
export function ringAreaKm2(ring: number[][]): number {
  let total = 0;
  const n = ring.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * R_EARTH_KM * R_EARTH_KM) / 2);
}

/** Área de Polygon/MultiPolygon em km²: anel externo menos os buracos. */
export function polygonAreaKm2(geom: Polygon | MultiPolygon): number {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.reduce((acc, rings) => acc + rings.reduce((a, r, i) => a + (i === 0 ? 1 : -1) * ringAreaKm2(r), 0), 0);
}

/** Média anual da série da equipe por 1.000 km², com quebras por quintis dos valores positivos. */
export function meanDensityValues(index: TeamIndexItem[], areas: Map<string, number>): MapLayerValues {
  const values = new Map<string, number | null>();
  for (const m of index) {
    const a = areas.get(m.cod_mun);
    values.set(m.cod_mun, a && a > 0 ? (m.media_anual / a) * 1000 : null);
  }
  return {
    kind: 'densidade',
    label: 'Média anual 2003–2025 por 1.000 km²',
    values,
    breaks: quantileBreaks([...values.values()].filter((x): x is number => x !== null)),
  };
}

export type RatioClass = 'muito_abaixo' | 'abaixo' | 'normal' | 'acima' | 'muito_acima' | 'sem_base';

/** Ano corrente ÷ mediana histórica até a data, em classes fixas e simétricas em torno de 1. */
export function ratioClass(r: number | null): RatioClass {
  if (r === null || !Number.isFinite(r)) return 'sem_base';
  if (r < 0.5) return 'muito_abaixo';
  if (r < 0.95) return 'abaixo';
  if (r <= 1.05) return 'normal';
  if (r < 2) return 'acima';
  return 'muito_acima';
}
