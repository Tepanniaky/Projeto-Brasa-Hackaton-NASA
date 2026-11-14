/**
 * Estado único de filtros, compartilhado por mapa, calendários, gráficos e CSV.
 * Serializável na URL para que um link reproduza exatamente a mesma visão.
 */
import type { GridId, MetricId, SensorId } from '../data/types';

export type ViewMode = 'original' | 'harmonizado';
export type SensorChoice = 'ambos' | SensorId;
export type MapMode = 'alerta' | 'atividade';

export interface Filters {
  region: string;     // '29' = Bahia inteira; senão código IBGE do município
  yearFrom: number;
  yearTo: number;
  view: ViewMode;
  sensor: SensorChoice;
  metric: MetricId;
  grid: GridId;
  mapMode: MapMode;
}

export const STATE = '29';
export const YEAR_MIN = 2003;
export const YEAR_MAX = 2026;

export const DEFAULT_FILTERS: Filters = {
  region: STATE,
  yearFrom: YEAR_MIN,
  yearTo: YEAR_MAX,
  view: 'original',
  sensor: 'ambos',
  metric: 'dias_celula_g10',
  grid: 'g10',
  mapMode: 'alerta',
};

export type FilterAction =
  | { type: 'region'; region: string }
  | { type: 'period'; yearFrom: number; yearTo: number }
  | { type: 'view'; view: ViewMode }
  | { type: 'sensor'; sensor: SensorChoice }
  | { type: 'metric'; metric: MetricId }
  | { type: 'grid'; grid: GridId }
  | { type: 'mapMode'; mapMode: MapMode }
  | { type: 'reset' };

const clampYear = (y: number) => Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(y)));

export function filtersReducer(state: Filters, action: FilterAction): Filters {
  switch (action.type) {
    case 'region':
      return { ...state, region: action.region };
    case 'period': {
      const a = clampYear(action.yearFrom);
      const b = clampYear(action.yearTo);
      return { ...state, yearFrom: Math.min(a, b), yearTo: Math.max(a, b) };
    }
    case 'view':
      return { ...state, view: action.view };
    case 'sensor':
      return { ...state, sensor: action.sensor };
    case 'metric': {
      // a métrica em dias-célula define a grade; mantém as duas coerentes
      const grid = action.metric === 'dias_celula_g5' ? 'g5' : action.metric === 'dias_celula_g10' ? 'g10' : state.grid;
      return { ...state, metric: action.metric, grid };
    }
    case 'grid':
      return {
        ...state, grid: action.grid,
        metric: state.metric.startsWith('dias_celula') ? (`dias_celula_${action.grid}` as MetricId) : state.metric,
      };
    case 'mapMode':
      return { ...state, mapMode: action.mapMode };
    case 'reset':
      return DEFAULT_FILTERS;
  }
}

const METRICS: MetricId[] = ['deteccoes', 'dias_com_deteccao', 'dias_celula_g5', 'dias_celula_g10'];
const SENSORS: SensorChoice[] = ['ambos', 'MODIS_AQUA', 'VIIRS_NOAA20'];

export function filtersToSearch(f: Filters): string {
  const p = new URLSearchParams();
  const d = DEFAULT_FILTERS;
  if (f.region !== d.region) p.set('local', f.region);
  if (f.yearFrom !== d.yearFrom) p.set('de', String(f.yearFrom));
  if (f.yearTo !== d.yearTo) p.set('ate', String(f.yearTo));
  if (f.view !== d.view) p.set('visao', f.view);
  if (f.sensor !== d.sensor) p.set('sensor', f.sensor);
  if (f.metric !== d.metric) p.set('metrica', f.metric);
  if (f.mapMode !== d.mapMode) p.set('mapa', f.mapMode);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Lê a URL de forma tolerante: valores inválidos voltam ao padrão. */
export function filtersFromSearch(search: string, validRegions?: Set<string>): Filters {
  const p = new URLSearchParams(search);
  let f = { ...DEFAULT_FILTERS };
  const local = p.get('local');
  if (local && /^\d{2,7}$/.test(local) && (!validRegions || validRegions.has(local))) f.region = local;
  const de = Number(p.get('de'));
  const ate = Number(p.get('ate'));
  if (p.has('de') || p.has('ate')) {
    f = filtersReducer(f, { type: 'period', yearFrom: Number.isFinite(de) && p.has('de') ? de : f.yearFrom,
                                             yearTo: Number.isFinite(ate) && p.has('ate') ? ate : f.yearTo });
  }
  const visao = p.get('visao');
  if (visao === 'original' || visao === 'harmonizado') f.view = visao;
  const sensor = p.get('sensor') as SensorChoice | null;
  if (sensor && SENSORS.includes(sensor)) f.sensor = sensor;
  const metrica = p.get('metrica') as MetricId | null;
  if (metrica && METRICS.includes(metrica)) f = filtersReducer(f, { type: 'metric', metric: metrica });
  const mapa = p.get('mapa');
  if (mapa === 'alerta' || mapa === 'atividade') f.mapMode = mapa;
  return f;
}

export function sensorsFor(choice: SensorChoice): SensorId[] {
  return choice === 'ambos' ? ['MODIS_AQUA', 'VIIRS_NOAA20'] : [choice];
}
