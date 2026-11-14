/**
 * Contratos de dados do BRASA. A fonte de verdade é docs/DATA_CONTRACTS.md.
 *
 * Camada A: série harmonizada da equipe (public/api/), semanal, 2003–ano corrente.
 * Camada B: pipeline BRASA (public/data/real/), mensal por sensor, 2020–2025.
 */
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

// ---------- Camada A (equipe) ----------

export type AlertClass = 'normal' | 'acima' | 'muito_acima';
export type AnomalyClass = 'abaixo' | 'normal' | 'acima' | 'muito_acima';

export interface TeamIndexItem {
  cod_mun: string;
  nome: string;
  media_anual: number;
  semana_pico: string;
  razao_ano_atual_vs_mediana: number | null;
  alerta_ultimas_4_semanas: AlertClass;
}

export interface TeamCriticalPeriod {
  semana_inicio: number;
  semana_fim: number;
  inicio: string;
  fim: string;
  n_semanas: number;
  fracao_da_atividade: number;
}

export interface TeamAnnual {
  ano: number;
  valor: number;
  min: number;
  max: number;
  parcial: boolean;
}

export interface TeamCurrentWeek {
  semana: number;
  inicio: string;
  valor: number;
  min: number;
  max: number;
  classe: AnomalyClass;
}

export interface TeamCalendar {
  cod_mun: string;
  nome: string;
  unidade: string;
  linha_de_base: [number, number];
  semanas: string[];
  climatologia: { media: number[]; p50: number[]; p75: number[]; p90: number[] };
  periodo_critico: TeamCriticalPeriod | null;
  calendario: { anos: number[]; valores: number[][] };
  anual: TeamAnnual[];
  ano_atual: {
    ano: number;
    ultima_semana_completa: number;
    acumulado: number;
    mediana_historica_ate_a_data: number;
    razao_vs_mediana: number | null;
    posicao_no_historico: string;
    semanas: TeamCurrentWeek[];
  };
  resumo: { media_anual: number; ano_maximo: number; semana_pico: string };
  dados_ate?: string;
}

// ---------- Camada B (pipeline BRASA) ----------

export type SensorId = 'MODIS_AQUA' | 'VIIRS_NOAA20';
export type MetricId = 'deteccoes' | 'dias_com_deteccao' | 'dias_celula_g5' | 'dias_celula_g10';
export type GridId = 'g5' | 'g10';

export interface SensorMeta {
  id: SensorId;
  rotulo: string;
  instrumento: string;
  satelite: string;
  produto: string;
  pixel_nominal_m: number;
  regra_qualidade: string;
  tipo_confianca: 'percent' | 'class';
}

export interface MetricMeta {
  id: MetricId;
  rotulo: string;
  aditiva: boolean;
  descricao: string;
}

export interface QualityRow {
  sensor: string;
  ano: number;
  linhas: number;
  mantidos: number;
  descartes: Record<string, number>;
  versoes: string[];
  processamento: string[];
}

export interface Manifest {
  schema_version: string;
  pipeline_version: string;
  dataset_kind: 'real' | 'synthetic' | 'exemplo';
  gerado_em_utc: string;
  periodo: { inicio: string; fim: string };
  fuso: string;
  definicao_dia: string;
  sensores: SensorMeta[];
  grades: { id: GridId; tamanho_m: number; crs: string; fragmentos: number }[];
  grade_padrao: GridId;
  metricas: MetricMeta[];
  fontes_firms: {
    product: string;
    year: number | null;
    source_url: string | null;
    http_last_modified: string | null;
    source_sha256: string;
    sha256_verified: boolean;
    source_rows: number;
    subset_rows: number;
    retrieved_at_utc: string;
  }[];
  fontes_ibge: { malha: string; sha256: string; nomes: string; crs: string };
  indisponibilidades: { sensor: SensorId; start: string; end: string; kind: string; note: string; source: string }[];
  qualidade: QualityRow[];
  deriva_passagem: { satelite: string; ano: number; hora_local_mediana: number; n: number }[];
  atribuicao_municipio: Record<string, string | number>;
  arquivos: { serie_mensal: string; harmonizacao: string; auditoria_equipe?: string };
}

export type SensorSeries = Record<MetricId, number[]>;

export interface RegionMonthly {
  nome: string;
  area_km2: number;
  series: Record<SensorId, SensorSeries>;
  harmonizado: Partial<Record<GridId, { estimativa: number[]; dp: number[] }>> | null;
  referencia_equipe_modis_ta?: number[];
}

export interface MonthlySeries {
  schema_version: string;
  meses: string[];
  sensores: SensorId[];
  regioes: Record<string, RegionMonthly>;
}

export type MethodId = 'sem_ajuste' | 'razao' | 'binomial_negativa';
export type LevelId = 'estado_mes' | 'municipio_ano' | 'municipio_mes';

export interface MetricRow {
  grade: GridId;
  nivel: LevelId;
  ano: number;
  divisao: 'ajuste' | 'avaliacao';
  metodo: MethodId;
  n: number;
  mae: number;
  vies_medio: number;
  erro_relativo_total: number | null;
  spearman: number | null;
}

export interface Flag {
  grade: GridId;
  nivel: LevelId;
  ano: number;
  tipo: 'ajuste_nao_melhora' | 'degrada_fora_do_ajuste' | 'incerteza_subestimada';
  mensagem: string;
}

export interface GridHarmonization {
  tamanho_m: number;
  fragmentos: number;
  ajuste: {
    status: 'ok' | 'dados_insuficientes';
    motivo?: string;
    razao_k?: number;
    binomial_negativa?: {
      params: Record<string, number>;
      alpha: number;
      ic95: Record<string, [number, number]>;
      convergiu: boolean;
      dispersao_pearson_poisson: number;
      aic: number;
      aic_poisson: number;
    };
  };
  avaliacao: {
    status: string;
    metricas: MetricRow[];
    marcacoes: Flag[];
    cobertura: { grade: GridId; nivel: LevelId; ano: number; divisao: string; cobertura_observada: number }[];
  };
  diagnosticos: { ljung_box_lag?: number; ljung_box_p?: number; nota?: string };
}

export interface Harmonization {
  status: 'ok' | 'dados_insuficientes';
  referencia: SensorId;
  preditor: SensorId;
  unidade: string;
  anos_ajuste: number[];
  anos_avaliacao: number[];
  meses_excluidos_do_ajuste: string[];
  intervalo: string;
  aviso: string;
  grade_padrao: GridId;
  grades: Record<GridId, GridHarmonization>;
  comparabilidade: {
    metrica: MetricId;
    razao_viirs_modis_por_ano: Record<string, number | null>;
    cv_razao_anual: number | null;
    spearman_estado_mes: number;
    spearman_municipio_ano: number;
  }[];
}

export interface AuditYear {
  ano: number;
  equipe: number;
  equipe_min: number;
  equipe_max: number;
  modis_ta_observado: number;
  diferenca_relativa: number | null;
  observado_dentro_da_faixa: boolean;
  origem_equipe: 'MODIS observado' | 'VIIRS convertido';
}

export interface AuditRegion {
  reproducao_2020_2021: { ano: number; semanas_iguais: number; semanas: number; total_equipe: number; total_modis_ta_sem_filtro: number }[];
  comparacao_anual: AuditYear[];
  reproduzida: boolean;
}

export interface TeamAudit {
  metodo: string;
  municipios_reproduzidos_2020_2021: number;
  municipios_auditados: number;
  sintese_2022_2025_municipios_com_50_ou_mais: Record<string, {
    municipios: number;
    mediana_diferenca_relativa: number;
    p10_diferenca_relativa: number;
    p90_diferenca_relativa: number;
    fracao_observado_dentro_da_faixa: number;
  }>;
  regioes: Record<string, AuditRegion>;
}

/** Tudo o que a aplicação carrega na abertura. */
export interface Dataset {
  teamIndex: TeamIndexItem[];
  teamState: TeamCalendar;
  municipalities: FeatureCollection<Polygon | MultiPolygon, { cod_mun: string; municipio: string }>;
  /** Camada B pode estar indisponível sem derrubar a camada A. */
  sensors: { manifest: Manifest; monthly: MonthlySeries; harmonization: Harmonization; audit: TeamAudit | null } | null;
  sensorsError: string | null;
}
