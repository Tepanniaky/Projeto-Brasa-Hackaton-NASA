/**
 * Inglês para os textos que chegam prontos dos JSON do pipeline (manifest, harmonização, auditoria).
 * Os JSON continuam em português (contrato de dados); a tradução é feita só na exibição.
 * O teste "textos dos dados têm inglês" falha se o pipeline publicar um texto novo sem tradução;
 * até lá, `dataText` mostra o original em português em vez de quebrar.
 */
import type { LevelId } from '../data/types';
import { getLang } from './lang';

export const DATA_EN: Record<string, string> = {
  // manifest.definicao_dia
  'Data civil local (America/Bahia, UTC−3) obtida de acq_date + acq_time (UTC) por conversão de fuso; as passagens noturnas (~01h30 local) contam no dia local em que ocorrem.':
    'Local civil date (America/Bahia, UTC−3) derived from acq_date + acq_time (UTC) by time-zone conversion; night overpasses (~01:30 local) count on the local day they occur.',
  // manifest.sensores[].regra_qualidade
  'confiança numérica ≥ 30 % (classes nominal e alta, Tabela 11 do guia MODIS C6.1) e type = 0':
    'numeric confidence ≥ 30% (nominal and high classes, Table 11 of the MODIS C6.1 user guide) and type = 0',
  'confiança categórica nominal ou alta (baixa excluída: Anomalia Magnética do Atlântico Sul e reflexo solar) e type = 0':
    'categorical confidence nominal or high (low excluded: South Atlantic Magnetic Anomaly and sun glint) and type = 0',
  // manifest.metricas[].rotulo
  'Detecções (focos)': 'Detections (fire pixels)',
  'Dias com detecção': 'Days with detection',
  'Dias-célula (5 km)': 'Cell-days (5 km)',
  'Dias-célula (10 km)': 'Cell-days (10 km)',
  // manifest.metricas[].descricao
  'Registros que passaram nos critérios de qualidade. Um foco é um pixel com fogo, não um incêndio.':
    'Records that passed the quality criteria. A detection is a pixel with fire, not a wildfire.',
  'Dias locais distintos com ao menos uma detecção na região. Não soma entre municípios.':
    'Distinct local days with at least one detection in the region. Not additive across municipalities.',
  'Pares (célula de 5 km ∩ município, dia local) com ao menos uma detecção.':
    'Pairs (5 km cell ∩ municipality, local day) with at least one detection.',
  'Pares (célula de 10 km ∩ município, dia local) com ao menos uma detecção.':
    'Pairs (10 km cell ∩ municipality, local day) with at least one detection.',
  // manifest.indisponibilidades[]
  parcial: 'partial',
  'Falha da unidade FMU do Aqua; produtos gerados só com Direct Broadcast, cobertura incompleta.':
    'Aqua FMU failure; products generated from Direct Broadcast only, incomplete coverage.',
  // manifest.atribuicao_municipio.predicado
  'intersects (inclui borda)': 'intersects (boundary included)',
  // harmonizacao.json
  'dias-célula (fragmento célula ∩ município × dia local com ≥ 1 detecção)':
    'cell-days (cell ∩ municipality fragment × local day with ≥ 1 detection)',
  '90 % aproximado: μ ± 1,645·√Σ(μ + αμ²), supondo independência entre fragmentos':
    'Approximate 90%: μ ± 1.645·√Σ(μ + αμ²), assuming independence between fragments',
  'Aproximação estatística entre escalas de detecção. Não estima o número real de incêndios nem área queimada.':
    'A statistical approximation between detection scales. It does not estimate the actual number of fires or burned area.',
  ajuste: 'fitting',
  avaliacao: 'evaluation',
  // auditoria_equipe.json
  'Contagem MODIS Terra+Aqua sem filtro de confiança ou tipo, município por ponto-no-polígono (IBGE), semana = min((dia_do_ano_UTC − 1) // 7, 51).':
    'MODIS Terra+Aqua count with no confidence or type filter, municipality by point-in-polygon (IBGE), week = min((UTC_day_of_year − 1) // 7, 51).',
  'MODIS observado': 'MODIS observed',
  'VIIRS convertido': 'VIIRS converted',
};

/** Texto vindo dos dados, traduzido quando o idioma é inglês e há tradução. */
export function dataText(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return getLang() === 'en' ? DATA_EN[s] ?? s : s;
}

const LEVEL_EN: Record<LevelId, string> = {
  estado_mes: 'state monthly total',
  municipio_ano: 'annual total per municipality',
  municipio_mes: 'monthly total per municipality',
};
const BASELINE_EN: Record<string, string> = { 'razão simples': 'simple ratio', 'sem ajuste': 'no adjustment' };

/**
 * Marcações automáticas da avaliação (`harmonizacao.json`). Os números só existem dentro da
 * mensagem, então o inglês é remontado a partir do tipo e dos números extraídos.
 */
export function flagText(f: { tipo: string; nivel: LevelId; ano: number; mensagem: string }): string {
  if (getLang() !== 'en') return f.mensagem;
  const head = `In ${f.ano} (${LEVEL_EN[f.nivel] ?? f.nivel}), `;
  if (f.tipo === 'ajuste_nao_melhora') {
    const m = /'([^']+)' \(MAE ([\d.]+) × ([\d.]+)\)/.exec(f.mensagem);
    if (m) return `${head}the model did not reduce the error compared with '${BASELINE_EN[m[1]] ?? m[1]}' (MAE ${m[2]} × ${m[3]}).`;
  } else if (f.tipo === 'degrada_fora_do_ajuste') {
    const m = /([\d.]+)×/.exec(f.mensagem);
    if (m) return `${head}the model error is ${m[1]}× the mean error of the fitting years.`;
  } else if (f.tipo === 'incerteza_subestimada') {
    const m = /(\d+)%/.exec(f.mensagem);
    if (m) return `${head}only ${m[1]}% of observed values fell inside the 90% interval.`;
  }
  return f.mensagem;
}
