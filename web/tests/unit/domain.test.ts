import { describe, expect, it } from 'vitest';
import { sqrtLevel, teamWeekGrid } from '../../src/domain/calendar';
import { buildRows, CSV_COLUMNS, escapeCsv, toCsv } from '../../src/domain/csv';
import { adjustmentSummary, currentYearHeadline } from '../../src/domain/explain';
import { DEFAULT_FILTERS, filtersFromSearch, filtersReducer, filtersToSearch } from '../../src/domain/filters';
import { activityValues, classOf, meanDensityValues, polygonAreaKm2, quantileBreaks, ratioClass, ringAreaKm2 } from '../../src/domain/mapValues';
import { annualTotals, monthMatrix, monthRange, sensorValues, sum } from '../../src/domain/series';
import { dataset, harmonization, MESES, monthly, teamCal } from './fixtures';

describe('filtros compartilhados', () => {
  it('ordena o período e limita aos anos válidos', () => {
    const f = filtersReducer(DEFAULT_FILTERS, { type: 'period', yearFrom: 2030, yearTo: 1999 });
    expect([f.yearFrom, f.yearTo]).toEqual([2003, 2026]);
  });
  it('mantém métrica e grade coerentes', () => {
    const f = filtersReducer(DEFAULT_FILTERS, { type: 'metric', metric: 'dias_celula_g5' });
    expect(f.grid).toBe('g5');
    const g = filtersReducer(f, { type: 'grid', grid: 'g10' });
    expect(g.metric).toBe('dias_celula_g10');
  });
  it('faz ida e volta pela URL e ignora valores inválidos', () => {
    const f = { ...DEFAULT_FILTERS, region: '2902708', yearFrom: 2020, yearTo: 2025, view: 'harmonizado' as const, sensor: 'VIIRS_NOAA20' as const };
    expect(filtersFromSearch(filtersToSearch(f))).toEqual(f);
    const bad = filtersFromSearch('?local=abc&visao=x&sensor=Terra&metrica=area');
    expect(bad).toEqual(DEFAULT_FILTERS);
    expect(filtersFromSearch('?local=9999999', new Set(['29'])).region).toBe('29');
  });
});

describe('recortes por período e sensor', () => {
  it('intersecta o período pedido com a cobertura da camada B', () => {
    expect(monthRange(MESES, 2003, 2026)).toMatchObject({ i0: 0, i1: 3, clamped: true });
    expect(monthRange(MESES, 2023, 2023)).toMatchObject({ i0: 2, i1: 3, clamped: false });
    expect(monthRange(MESES, 2010, 2015)).toBeNull();
  });
  it('lê um sensor por vez e o estado é a soma dos municípios', () => {
    const r = monthRange(MESES, 2022, 2023)!;
    const st = sum(sensorValues(monthly.regioes['29'], 'MODIS_AQUA', 'deteccoes', r));
    const muns = sum(sensorValues(monthly.regioes['2900001'], 'MODIS_AQUA', 'deteccoes', r))
      + sum(sensorValues(monthly.regioes['2900002'], 'MODIS_AQUA', 'deteccoes', r));
    expect(st).toBe(muns);
  });
  it('agrega por ano e monta a matriz mês × ano', () => {
    const vals = monthly.regioes['2900001'].series.VIIRS_NOAA20.deteccoes;
    expect([...annualTotals(vals, MESES)]).toEqual([[2022, 61], [2023, 29]]);
    const mm = monthMatrix(vals, MESES);
    expect(mm.years).toEqual([2022, 2023]);
    expect(mm.rows[0][10]).toBe(60);
    expect(mm.rows[1][1]).toBe(20);
  });
});

describe('calendário', () => {
  it('usa escala de raiz quadrada em 5 níveis', () => {
    expect(sqrtLevel(0, 100)).toBe(0);
    expect(sqrtLevel(1, 100)).toBe(1);
    expect(sqrtLevel(100, 100)).toBe(5);
    expect(sqrtLevel(25, 100)).toBe(3);
  });
  it('separa "sem dado" do ano corrente de "nenhuma detecção"', () => {
    const g = teamWeekGrid(teamCal(), 2024, 2026);
    const cur = g.cells[2];
    expect(cur[36]).toEqual({ kind: 'sem_dado' });      // depois da última semana completa
    expect(cur[35].kind).toBe('valor');
    expect(cur[0]).toEqual({ kind: 'zero' });            // publicado, sem detecção
    expect(g.max).toBe(100);
  });
});

describe('explicações determinísticas', () => {
  it('descreve o ano corrente a partir da razão', () => {
    expect(currentYearHeadline(teamCal()).text).toContain('5,4 vezes acima');
    const c = teamCal(); c.ano_atual.razao_vs_mediana = 0.81;
    expect(currentYearHeadline(c)).toMatchObject({ tone: 'abaixo' });
    c.ano_atual.razao_vs_mediana = null;
    expect(currentYearHeadline(c).tone).toBe('sem_base');
  });
  it('"O que muda após o ajuste" usa os valores e nunca soma sensores', () => {
    const r = monthRange(MESES, 2022, 2023)!;
    const a = adjustmentSummary(monthly.regioes['2900001'], 'g10', r, harmonization);
    expect(a.modis).toBe(7);
    expect(a.viirs).toBe(26);
    expect(a.adjusted).toBeCloseTo(7.8);
    expect(a.adjustedDiff).toBeCloseTo((7.8 - 7) / 7);
    expect(a.sentences.join(' ')).not.toMatch(/incêndios|área queimada/);
  });
});

describe('exportação CSV', () => {
  it('escapa campos e mantém o cabeçalho', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(escapeCsv(null)).toBe('');
    const csv = toCsv([{ camada: 'A', valor: 1.23456 }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0].replace('﻿', '')).toBe(CSV_COLUMNS.join(','));
    expect(csv.split('\r\n')[1]).toContain('1.235');
  });
  it('exporta só o recorte filtrado, sensores em linhas separadas', () => {
    const f = { ...DEFAULT_FILTERS, region: '2900001', yearFrom: 2023, yearTo: 2023, sensor: 'ambos' as const, metric: 'deteccoes' as const };
    const rows = buildRows(dataset, f, null);
    expect(rows).toHaveLength(4); // 2 meses × 2 sensores
    expect(new Set(rows.map((r) => r.serie))).toEqual(new Set(['MODIS_AQUA_original', 'VIIRS_NOAA20_original']));
    expect(rows.every((r) => r.periodo === '2023-01' || r.periodo === '2023-02')).toBe(true);
    expect(rows.find((r) => r.serie === 'MODIS_AQUA_original' && r.periodo === '2023-01')?.versao_produto).toBe('61.03');
    expect(rows.every((r) => r.tipo_dado === 'real')).toBe(true);
  });
  it('inclui a série harmonizada com divisão de avaliação e a camada A com "sem dado"', () => {
    const f = { ...DEFAULT_FILTERS, region: '2900001', yearFrom: 2023, yearTo: 2026, view: 'harmonizado' as const, sensor: 'MODIS_AQUA' as const };
    const rows = buildRows(dataset, f, teamCal());
    const harm = rows.filter((r) => r.serie === 'VIIRS_NOAA20_ajustado_escala_MODIS_AQUA');
    expect(harm.map((r) => r.divisao_harmonizacao)).toEqual(['avaliacao', 'avaliacao']);
    const team2026 = rows.filter((r) => r.camada === 'A_equipe' && r.ano === 2026);
    expect(team2026).toHaveLength(52);
    expect(team2026.find((r) => r.semana === 36)?.valor).toBeNull();
    expect(rows.some((r) => r.camada === 'A_equipe' && r.ano === 2024)).toBe(true);
    const later = buildRows(dataset, { ...f, yearFrom: 2025 }, teamCal());
    expect(later.some((r) => r.camada === 'A_equipe' && r.ano === 2024)).toBe(false);
    expect(later.some((r) => r.camada === 'B_pipeline')).toBe(false); // camada B não cobre 2025–2026 nesta fixture
  });
});

describe('valores do mapa', () => {
  it('com ambos os sensores mostra a razão VIIRS ÷ MODIS, nunca a soma', () => {
    const f = { ...DEFAULT_FILTERS, mapMode: 'atividade' as const, sensor: 'ambos' as const, metric: 'deteccoes' as const, yearFrom: 2022, yearTo: 2023 };
    const v = activityValues(dataset, f)!;
    expect(v.kind).toBe('razao');
    expect(v.values.get('2900001')).toBeCloseTo(90 / 16);
    expect(v.values.has('29')).toBe(false);
  });
  it('com um sensor normaliza por 1.000 km²', () => {
    const f = { ...DEFAULT_FILTERS, mapMode: 'atividade' as const, sensor: 'MODIS_AQUA' as const, metric: 'deteccoes' as const, yearFrom: 2022, yearTo: 2023 };
    expect(activityValues(dataset, f)!.values.get('2900002')).toBeCloseTo((32 / 2000) * 1000);
  });
  it('classifica por quantis sem quebras repetidas', () => {
    const b = quantileBreaks([0, 1, 1, 1, 2, 3, 10]);
    expect(b).toEqual([...new Set(b)]);
    expect(classOf(0, b)).toBe(0);
    expect(classOf(null, b)).toBe(0);
    expect(classOf(10, b)).toBe(b.length);
  });
});

describe('redesign: estado de navegação na URL', () => {
  it('serializa aba, comparação lado a lado e os novos modos de mapa', () => {
    const f = { ...DEFAULT_FILTERS, tab: 'sens' as const, split: true, mapMode: 'razao' as const };
    expect(filtersToSearch(f)).toBe('?mapa=razao&comparar=lado&aba=sens');
    expect(filtersFromSearch(filtersToSearch(f))).toEqual(f);
    expect(filtersFromSearch('?aba=xyz&mapa=calor&comparar=sim')).toEqual(DEFAULT_FILTERS);
  });
  it('escolher uma visão sai do lado a lado; restaurar mantém a aba aberta', () => {
    const lado = filtersReducer(DEFAULT_FILTERS, { type: 'split', split: true });
    expect(filtersReducer(lado, { type: 'view', view: 'harmonizado' })).toMatchObject({ view: 'harmonizado', split: false });
    const mexido = { ...DEFAULT_FILTERS, region: '2902708', yearFrom: 2020, split: true, tab: 'cal' as const };
    expect(filtersReducer(mexido, { type: 'reset' })).toEqual({ ...DEFAULT_FILTERS, tab: 'cal' });
  });
});

describe('redesign: modos de mapa da série da equipe', () => {
  it('calcula área esférica plausível (quadrado de 1° no equador ≈ 12.364 km²) e desconta buracos', () => {
    const sq = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    expect(ringAreaKm2(sq)).toBeGreaterThan(12_300);
    expect(ringAreaKm2(sq)).toBeLessThan(12_400);
    const hole = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75], [0.25, 0.25]];
    const withHole = polygonAreaKm2({ type: 'Polygon', coordinates: [sq, hole] });
    expect(withHole).toBeCloseTo(ringAreaKm2(sq) - ringAreaKm2(hole), 6);
  });
  it('média anual por 1.000 km²: área ausente vira "sem dado", zero fica na classe zero', () => {
    const idx = [
      { cod_mun: 'a', nome: 'A', media_anual: 10, semana_pico: '', razao_ano_atual_vs_mediana: 1, alerta_ultimas_4_semanas: 'normal' as const },
      { cod_mun: 'b', nome: 'B', media_anual: 0, semana_pico: '', razao_ano_atual_vs_mediana: null, alerta_ultimas_4_semanas: 'normal' as const },
      { cod_mun: 'c', nome: 'C', media_anual: 5, semana_pico: '', razao_ano_atual_vs_mediana: 3, alerta_ultimas_4_semanas: 'acima' as const },
    ];
    const v = meanDensityValues(idx, new Map([['a', 500], ['b', 100]]));
    expect(v.values.get('a')).toBe(20);
    expect(v.values.get('b')).toBe(0);
    expect(v.values.get('c')).toBeNull();
    expect(classOf(v.values.get('b') ?? null, v.breaks)).toBe(0);
  });
  it('classes de ano ÷ normal são simétricas em torno de 1 e "sem base" não vira zero', () => {
    expect([0.4, 0.8, 1, 1.05, 1.5, 2, null].map(ratioClass))
      .toEqual(['muito_abaixo', 'abaixo', 'normal', 'normal', 'acima', 'muito_acima', 'sem_base']);
  });
});
