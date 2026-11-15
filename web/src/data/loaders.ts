/**
 * Acesso a dados: só busca e valida a forma mínima dos JSONs estáticos.
 * Regras de análise ficam em src/domain; apresentação em src/ui.
 */
import type {
  Dataset, Harmonization, Manifest, MonthlySeries, TeamAudit, TeamCalendar, TeamIndexItem,
} from './types';
import { tr } from '../i18n/lang';

const BASE = import.meta.env.BASE_URL ?? './';

export class DataError extends Error {
  constructor(message: string, readonly url: string, readonly kind: 'rede' | 'formato' | 'ausente') {
    super(message);
  }
}

/** `what` = [português, inglês] do que está sendo baixado, para a mensagem de erro. */
async function getJson<T>(path: string, check: (x: unknown) => boolean, whatPair: [string, string]): Promise<T> {
  const url = `${BASE}${path}`;
  const what = tr(...whatPair);
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new DataError(tr(`Não foi possível baixar ${what}. Verifique a conexão.`, `Could not download ${what}. Check your connection.`), url, 'rede');
  }
  if (res.status === 404) throw new DataError(tr(`${what} não está publicado neste site.`, `${what} is not published on this site.`), url, 'ausente');
  if (!res.ok) throw new DataError(tr(`Falha ao baixar ${what} (HTTP ${res.status}).`, `Failed to download ${what} (HTTP ${res.status}).`), url, 'rede');
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new DataError(tr(`${what} não é um JSON válido.`, `${what} is not valid JSON.`), url, 'formato');
  }
  if (!check(body)) throw new DataError(tr(`${what} não segue o contrato esperado.`, `${what} does not follow the expected contract.`), url, 'formato');
  return body as T;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

export const isTeamCalendar = (x: unknown) =>
  isObj(x) && isObj(x.calendario) && Array.isArray((x.calendario as Record<string, unknown>).valores)
  && Array.isArray(x.semanas) && isObj(x.ano_atual) && Array.isArray(x.anual);

export const isManifest = (x: unknown) =>
  isObj(x) && typeof x.schema_version === 'string' && typeof x.dataset_kind === 'string' && Array.isArray(x.sensores);

const isMonthly = (x: unknown) => isObj(x) && Array.isArray(x.meses) && isObj(x.regioes);
const isHarm = (x: unknown) => isObj(x) && isObj(x.grades) && typeof x.status === 'string';
const isAudit = (x: unknown) => isObj(x) && isObj(x.regioes);

const teamCache = new Map<string, Promise<TeamCalendar>>();

/** Calendário da camada A para o estado ('29') ou um município (código IBGE). */
export function loadTeamCalendar(cod: string): Promise<TeamCalendar> {
  const path = cod === '29' ? 'api/estado.json' : `api/mun/${cod}.json`;
  if (!teamCache.has(cod)) {
    const p = getJson<TeamCalendar>(path, isTeamCalendar, [`o calendário de ${cod === '29' ? 'Bahia' : cod}`, `the calendar for ${cod === '29' ? 'Bahia' : cod}`]);
    p.catch(() => teamCache.delete(cod));
    teamCache.set(cod, p);
  }
  return teamCache.get(cod)!;
}

async function loadSensors(): Promise<NonNullable<Dataset['sensors']>> {
  const manifest = await getJson<Manifest>('data/real/manifest.json', isManifest, ['o manifesto dos sensores', 'the sensor manifest']);
  const [monthly, harmonization, audit] = await Promise.all([
    getJson<MonthlySeries>(`data/real/${manifest.arquivos.serie_mensal}`, isMonthly, ['a série mensal por sensor', 'the monthly series by sensor']),
    getJson<Harmonization>(`data/real/${manifest.arquivos.harmonizacao}`, isHarm, ['a harmonização experimental', 'the experimental harmonization']),
    manifest.arquivos.auditoria_equipe
      ? getJson<TeamAudit>(`data/real/${manifest.arquivos.auditoria_equipe}`, isAudit, ['a auditoria da série da equipe', 'the team series audit'])
      : Promise.resolve(null),
  ]);
  return { manifest, monthly, harmonization, audit };
}

export async function loadDataset(): Promise<Dataset> {
  const [teamIndex, teamState, municipalities] = await Promise.all([
    getJson<TeamIndexItem[]>('api/municipios.json', Array.isArray, ['o índice de municípios', 'the municipality index']),
    loadTeamCalendar('29'),
    getJson<Dataset['municipalities']>('api/bahia_municipios.geojson',
      (x) => isObj(x) && Array.isArray(x.features), ['o contorno dos municípios', 'the municipal boundaries']),
  ]);
  let sensors: Dataset['sensors'] = null;
  let sensorsError: string | null = null;
  try {
    sensors = await loadSensors();
  } catch (e) {
    sensorsError = e instanceof Error ? e.message : String(e);
  }
  return { teamIndex, teamState, municipalities, sensors, sensorsError };
}
