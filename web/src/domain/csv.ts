/**
 * Exportação CSV dos resultados filtrados (RFC 4180, separador vírgula, ponto decimal, UTF-8 com BOM).
 * Cada linha diz de qual camada veio, que tipo de dado é e quais filtros a produziram.
 * MODIS e VIIRS aparecem em linhas separadas: nunca há uma coluna com a soma dos dois.
 */
import type { Dataset, MetricId, SensorId, TeamCalendar } from '../data/types';
import { type Filters, sensorsFor } from './filters';
import { harmonizedSlice, monthRange, slice } from './series';

export const CSV_COLUMNS = [
  'camada', 'tipo_dado', 'regiao_cod', 'regiao_nome', 'periodo', 'ano', 'mes', 'semana',
  'serie', 'metrica', 'unidade', 'valor', 'valor_min', 'valor_max', 'divisao_harmonizacao',
  'versao_produto', 'observacao', 'filtros',
] as const;

type Row = Partial<Record<(typeof CSV_COLUMNS)[number], string | number | null>>;

export function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '') : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => escapeCsv(r[c])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function describeFilters(f: Filters): string {
  return `local=${f.region}; anos=${f.yearFrom}-${f.yearTo}; visao=${f.view}; sensor=${f.sensor}; metrica=${f.metric}`;
}

export function buildRows(ds: Dataset, f: Filters, teamCal: TeamCalendar | null): Row[] {
  const rows: Row[] = [];
  const filtros = describeFilters(f);
  // Camada A: série semanal harmonizada da equipe
  if (teamCal) {
    const cur = teamCal.ano_atual;
    teamCal.calendario.anos.forEach((y, i) => {
      if (y < f.yearFrom || y > f.yearTo) return;
      teamCal.calendario.valores[i].forEach((v, w) => {
        const semDado = y === cur.ano && w > cur.ultima_semana_completa;
        rows.push({
          camada: 'A_equipe', tipo_dado: 'real', regiao_cod: teamCal.cod_mun, regiao_nome: teamCal.nome,
          periodo: `${y}-S${String(w).padStart(2, '0')}`, ano: y, semana: w,
          serie: 'harmonizada_equipe', metrica: 'deteccoes_harmonizadas',
          unidade: 'detecções equivalentes MODIS por semana',
          valor: semDado ? null : v,
          observacao: semDado ? 'sem dado (semana ainda não publicada)'
            : y <= 2021 ? 'MODIS observado' : 'VIIRS convertido pela equipe',
          filtros,
        });
      });
    });
  }
  // Camada B: série mensal por sensor (e harmonização experimental quando a visão pede)
  const s = ds.sensors;
  if (!s) return rows;
  const region = s.monthly.regioes[f.region];
  const r = monthRange(s.monthly.meses, f.yearFrom, f.yearTo);
  if (!region || !r) return rows;
  const meses = slice(s.monthly.meses, r);
  const kind = s.manifest.dataset_kind === 'real' ? 'real' : 'sintetico';
  const versions = (sensor: SensorId, year: number) =>
    s.manifest.qualidade.find((q) => q.sensor === sensor && q.ano === year)?.versoes.join('|') ?? '';
  const divisao = (year: number) =>
    s.harmonization.anos_ajuste.includes(year) ? 'ajuste' : s.harmonization.anos_avaliacao.includes(year) ? 'avaliacao' : '';
  const metric: MetricId = f.metric;
  const unidade = s.manifest.metricas.find((m) => m.id === metric)?.rotulo ?? metric;
  for (const sensor of sensorsFor(f.sensor)) {
    const vals = slice(region.series[sensor][metric], r);
    meses.forEach((m, i) => {
      const y = Number(m.slice(0, 4));
      rows.push({
        camada: 'B_pipeline', tipo_dado: kind, regiao_cod: f.region, regiao_nome: region.nome, periodo: m,
        ano: y, mes: Number(m.slice(5, 7)), serie: `${sensor}_original`, metrica: metric, unidade,
        valor: vals[i], versao_produto: versions(sensor, y), filtros,
      });
    });
  }
  if (f.view === 'harmonizado') {
    const h = harmonizedSlice(region, f.grid, r);
    if (h) {
      meses.forEach((m, i) => {
        const y = Number(m.slice(0, 4));
        rows.push({
          camada: 'B_pipeline', tipo_dado: kind, regiao_cod: f.region, regiao_nome: region.nome, periodo: m,
          ano: y, mes: Number(m.slice(5, 7)), serie: 'VIIRS_NOAA20_ajustado_escala_MODIS_AQUA',
          metrica: `dias_celula_${f.grid}`, unidade: 'dias-célula equivalentes MODIS/Aqua',
          valor: h.estimate[i], valor_min: h.lo[i], valor_max: h.hi[i], divisao_harmonizacao: divisao(y),
          versao_produto: versions('VIIRS_NOAA20', y),
          observacao: 'experimental; intervalo de 90 % aproximado e subestimado (ver metodologia)', filtros,
        });
      });
    }
  }
  return rows;
}

export function csvFileName(f: Filters, regionName: string): string {
  const slug = regionName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `brasa_${slug}_${f.yearFrom}-${f.yearTo}_${f.view}.csv`;
}
