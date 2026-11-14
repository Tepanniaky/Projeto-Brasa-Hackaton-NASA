/** Fixtures sintéticas pequenas e determinísticas: só para testes, nunca exibidas. */
import type { Dataset, Harmonization, Manifest, MonthlySeries, RegionMonthly, TeamCalendar } from '../../src/data/types';

export const MESES = ['2022-11', '2022-12', '2023-01', '2023-02'];

function region(nome: string, k: number): RegionMonthly {
  const s = (base: number[]) => base.map((v) => v * k);
  return {
    nome, area_km2: 1000 * k,
    series: {
      MODIS_AQUA: { deteccoes: s([10, 0, 2, 4]), dias_com_deteccao: s([3, 0, 1, 2]), dias_celula_g5: s([5, 0, 1, 2]), dias_celula_g10: s([4, 0, 1, 2]) },
      VIIRS_NOAA20: { deteccoes: s([60, 1, 9, 20]), dias_com_deteccao: s([5, 1, 2, 3]), dias_celula_g5: s([20, 1, 4, 8]), dias_celula_g10: s([16, 1, 3, 6]) },
    },
    harmonizado: { g10: { estimativa: s([4.5, 0.2, 1.1, 2.0]), dp: [1, 0.2, 0.5, 0.8] } },
  };
}

export const monthly: MonthlySeries = {
  schema_version: '1.0', meses: MESES, sensores: ['MODIS_AQUA', 'VIIRS_NOAA20'],
  regioes: { '29': region('Bahia', 3), '2900001': region('Alfa', 1), '2900002': region('Beta', 2) },
};

export const manifest = {
  schema_version: '1.0', pipeline_version: '0.1.0', dataset_kind: 'real', gerado_em_utc: '2026-11-14T00:00:00+00:00',
  periodo: { inicio: '2022-11', fim: '2023-02' }, fuso: 'America/Bahia', definicao_dia: 'local',
  sensores: [], grades: [], grade_padrao: 'g10',
  metricas: [
    { id: 'deteccoes', rotulo: 'Detecções (focos)', aditiva: true, descricao: '' },
    { id: 'dias_celula_g10', rotulo: 'Dias-célula (10 km)', aditiva: true, descricao: '' },
  ],
  fontes_firms: [], fontes_ibge: { malha: '', sha256: '', nomes: '', crs: '' },
  indisponibilidades: [],
  qualidade: [
    { sensor: 'MODIS_AQUA', ano: 2022, linhas: 1, mantidos: 1, descartes: {}, versoes: ['6.03'], processamento: ['SP'] },
    { sensor: 'MODIS_AQUA', ano: 2023, linhas: 1, mantidos: 1, descartes: {}, versoes: ['61.03'], processamento: ['SP'] },
    { sensor: 'VIIRS_NOAA20', ano: 2022, linhas: 1, mantidos: 1, descartes: {}, versoes: ['2'], processamento: ['SP'] },
    { sensor: 'VIIRS_NOAA20', ano: 2023, linhas: 1, mantidos: 1, descartes: {}, versoes: ['2'], processamento: ['SP'] },
  ],
  deriva_passagem: [], atribuicao_municipio: {}, arquivos: { serie_mensal: 's', harmonizacao: 'h' },
} as unknown as Manifest;

export const harmonization = {
  status: 'ok', referencia: 'MODIS_AQUA', preditor: 'VIIRS_NOAA20', unidade: '', anos_ajuste: [2020, 2021, 2022],
  anos_avaliacao: [2023, 2024, 2025], meses_excluidos_do_ajuste: [], intervalo: '', aviso: '', grade_padrao: 'g10',
  grades: { g10: { tamanho_m: 10000, fragmentos: 1, ajuste: { status: 'ok' }, avaliacao: { status: 'ok', metricas: [], marcacoes: [], cobertura: [] }, diagnosticos: {} } },
  comparabilidade: [],
} as unknown as Harmonization;

export function teamCal(): TeamCalendar {
  const semanas = Array.from({ length: 52 }, (_, w) => {
    const d = new Date(Date.UTC(2021, 0, 1 + 7 * w));
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const row = (v: number) => Array.from({ length: 52 }, (_, w) => (w >= 30 && w <= 40 ? v : 0));
  return {
    cod_mun: '2900001', nome: 'Alfa', unidade: 'x', linha_de_base: [2003, 2025], semanas,
    climatologia: { media: row(1), p50: row(1), p75: row(2), p90: row(3) },
    periodo_critico: { semana_inicio: 30, semana_fim: 40, inicio: '30/07', fim: '08/10', n_semanas: 11, fracao_da_atividade: 0.9 },
    calendario: { anos: [2024, 2025, 2026], valores: [row(4), row(100), row(9)] },
    anual: [{ ano: 2024, valor: 44, min: 40, max: 48, parcial: false }],
    ano_atual: { ano: 2026, ultima_semana_completa: 35, acumulado: 54, mediana_historica_ate_a_data: 10, razao_vs_mediana: 5.4,
                 posicao_no_historico: '3 de 3', semanas: [] },
    resumo: { media_anual: 40, ano_maximo: 2025, semana_pico: '01/08' },
  };
}

export const dataset: Dataset = {
  teamIndex: [], teamState: teamCal(), municipalities: { type: 'FeatureCollection', features: [] },
  sensors: { manifest, monthly, harmonization, audit: null }, sensorsError: null,
};
