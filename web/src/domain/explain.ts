/**
 * Explicações determinísticas, sempre derivadas dos valores calculados.
 * Nenhum texto aqui afirma número de incêndios, área queimada ou ausência de fogo.
 */
import type { AuditRegion, GridId, Harmonization, Manifest, MetricId, RegionMonthly, TeamCalendar } from '../data/types';
import { fmt1, fmtHour, fmtInt, fmtPct, fmtSignedPct } from './format';
import { harmonizedSlice, type MonthRange, sensorValues, sum, sumSd } from './series';

export function currentYearHeadline(cal: TeamCalendar): { text: string; tone: 'acima' | 'abaixo' | 'normal' | 'sem_base' } {
  const r = cal.ano_atual.razao_vs_mediana;
  const y = cal.ano_atual.ano;
  if (r === null || !Number.isFinite(r)) {
    return { text: `Não há histórico suficiente para comparar ${y} com o normal.`, tone: 'sem_base' };
  }
  const d = r - 1;
  if (Math.abs(d) < 0.05) return { text: `${y} está dentro do normal até esta data.`, tone: 'normal' };
  if (r >= 2) {
    return { text: `${y} está ${fmt1(r)} vezes acima do normal até esta data.`, tone: 'acima' };
  }
  return d > 0
    ? { text: `${y} está ${fmtPct(d)} acima do normal até esta data.`, tone: 'acima' }
    : { text: `${y} está ${fmtPct(-d)} abaixo do normal até esta data.`, tone: 'abaixo' };
}

export function criticalPeriodText(cal: TeamCalendar): string {
  const pc = cal.periodo_critico;
  if (!pc) return 'Sem período crítico: quase nenhuma detecção no histórico.';
  return `Período crítico: ${pc.inicio} a ${pc.fim} (${pc.n_semanas} semanas concentram ${fmtPct(pc.fracao_da_atividade)} da atividade detectada).`;
}

export interface AdjustmentSummary {
  modis: number;
  viirs: number;
  adjusted: number | null;
  adjustedLo: number | null;
  adjustedHi: number | null;
  rawRatio: number | null;          // VIIRS / MODIS antes do ajuste
  adjustedDiff: number | null;      // (ajustado − MODIS) / MODIS
  sentences: string[];
}

/**
 * "O que muda após o ajuste?": compara, no mesmo recorte, MODIS observado,
 * VIIRS bruto e VIIRS ajustado à escala MODIS (dias-célula da grade escolhida).
 */
export function adjustmentSummary(region: RegionMonthly, grid: GridId, r: MonthRange, harm: Harmonization): AdjustmentSummary {
  const metric = `dias_celula_${grid}` as MetricId;
  const modis = sum(sensorValues(region, 'MODIS_AQUA', metric, r));
  const viirs = sum(sensorValues(region, 'VIIRS_NOAA20', metric, r));
  const h = harmonizedSlice(region, grid, r);
  const sentences: string[] = [];
  const unit = grid === 'g10' ? 'dias-célula de 10 km' : 'dias-célula de 5 km';
  const periodo = r.yearFrom === r.yearTo ? `${r.yearFrom}` : `${r.yearFrom}–${r.yearTo}`;
  if (modis === 0 && viirs === 0) {
    return { modis, viirs, adjusted: null, adjustedLo: null, adjustedHi: null, rawRatio: null, adjustedDiff: null,
             sentences: [`Nenhum dos dois sensores registrou detecção em ${periodo}. Isso não comprova ausência de fogo: nuvens, fumaça e o horário da passagem podem ocultar focos.`] };
  }
  const rawRatio = modis > 0 ? viirs / modis : null;
  sentences.push(rawRatio !== null
    ? `Antes do ajuste, o VIIRS/NOAA-20 registrou ${fmtInt(viirs)} ${unit} contra ${fmtInt(modis)} do MODIS/Aqua em ${periodo}: ${fmt1(rawRatio)} vezes mais. Esse excesso vem principalmente do pixel menor (375 m contra 1 km), não de mais fogo.`
    : `Em ${periodo}, o MODIS/Aqua não registrou detecções e o VIIRS/NOAA-20 registrou ${fmtInt(viirs)} ${unit}.`);
  let adjusted: number | null = null;
  let lo: number | null = null;
  let hi: number | null = null;
  let diff: number | null = null;
  if (h && harm.status === 'ok') {
    adjusted = sum(h.estimate);
    const dp = region.harmonizado?.[grid]?.dp.slice(r.i0, r.i1 + 1) ?? [];
    const sd = sumSd(dp);
    lo = Math.max(0, adjusted - 1.6449 * sd);
    hi = adjusted + 1.6449 * sd;
    diff = modis > 0 ? (adjusted - modis) / modis : null;
    sentences.push(`Depois do ajuste, o VIIRS equivale a ${fmtInt(adjusted)} ${unit} na escala do MODIS/Aqua (intervalo aproximado de ${fmtInt(lo)} a ${fmtInt(hi)}).`);
    if (diff !== null) {
      sentences.push(Math.abs(diff) < 0.1
        ? `O ajuste aproxima os dois sensores: a diferença para o MODIS observado cai para ${fmtSignedPct(diff)}.`
        : `Mesmo ajustado, o VIIRS fica ${fmtSignedPct(diff)} em relação ao MODIS observado. Diferenças assim podem vir da deriva orbital do Aqua, de nuvens ou de limites do modelo.`);
    }
  } else {
    sentences.push('O ajuste experimental não está disponível para este recorte.');
  }
  return { modis, viirs, adjusted, adjustedLo: lo, adjustedHi: hi, rawRatio, adjustedDiff: diff, sentences };
}

/** Desempenho do ajuste nos anos de avaliação, contado a partir das métricas exportadas. */
export function evaluationVerdict(harm: Harmonization, grid: GridId, level: 'estado_mes' | 'municipio_ano'): string[] {
  const g = harm.grades[grid];
  if (!g || g.ajuste.status !== 'ok') return ['Harmonização não ajustada: dados insuficientes.'];
  const rows = g.avaliacao.metricas.filter((m) => m.nivel === level && m.divisao === 'avaliacao');
  const years = [...new Set(rows.map((r) => r.ano))].sort();
  const out: string[] = [];
  let better = 0;
  for (const y of years) {
    const by = Object.fromEntries(rows.filter((r) => r.ano === y).map((r) => [r.metodo, r.mae]));
    const base = Math.min(by.sem_ajuste, by.razao);
    if (by.binomial_negativa < base) better++;
  }
  const nivel = level === 'estado_mes' ? 'no total mensal do estado' : 'no total anual dos municípios';
  out.push(`Nos anos de avaliação (${harm.anos_avaliacao.join(', ')}), nunca usados no ajuste, o modelo reduziu o erro em ${better} de ${years.length} anos ${nivel}, em comparação com a melhor linha de base.`);
  for (const f of g.avaliacao.marcacoes.filter((m) => m.nivel === level)) out.push(f.mensagem);
  return out;
}

export function auditSentences(audit: AuditRegion | undefined, regionName: string): string[] {
  if (!audit) return [];
  const out: string[] = [];
  const rep = audit.reproducao_2020_2021;
  if (audit.reproduzida) {
    out.push(`Em ${regionName}, 2020 e 2021 da série da equipe reproduzem exatamente, semana a semana, a contagem MODIS Terra+Aqua sem filtro (data UTC).`);
  } else if (rep.length) {
    const r = rep.map((x) => `${x.ano}: ${x.semanas_iguais}/52 semanas iguais`).join('; ');
    out.push(`Em ${regionName}, a reprodução de 2020–2021 é aproximada (${r}). Diferenças pequenas costumam vir de pontos na divisa entre municípios.`);
  }
  const conv = audit.comparacao_anual.filter((c) => c.origem_equipe === 'VIIRS convertido' && c.ano <= 2025);
  if (conv.length) {
    const inBand = conv.filter((c) => c.observado_dentro_da_faixa).length;
    const diffs = conv.map((c) => `${c.ano} ${c.diferenca_relativa === null ? 'n/d' : fmtSignedPct(c.diferenca_relativa)}`).join(', ');
    out.push(`De 2022 a 2025 a série da equipe vem do VIIRS convertido. Em relação ao MODIS Terra+Aqua observado: ${diffs}. O valor observado caiu dentro da faixa publicada em ${inBand} de ${conv.length} anos.`);
  }
  return out;
}

export function driftSentence(manifest: Manifest): string | null {
  const aqua = manifest.deriva_passagem.filter((d) => d.satelite === 'Aqua').sort((a, b) => a.ano - b.ano);
  const n20 = manifest.deriva_passagem.filter((d) => d.satelite === 'N20').sort((a, b) => a.ano - b.ano);
  if (aqua.length < 2) return null;
  const a0 = aqua[0];
  const a1 = aqua[aqua.length - 1];
  const nText = n20.length ? ` No mesmo período o NOAA-20 ficou estável, perto de ${fmtHour(n20[n20.length - 1].hora_local_mediana)}.` : '';
  return `O horário local mediano das detecções diurnas do Aqua passou de ${fmtHour(a0.hora_local_mediana)} (${a0.ano}) para ${fmtHour(a1.hora_local_mediana)} (${a1.ano}).${nText} O Aqua passa cada vez mais perto do pico diário de fogo da tarde e pode estar "vendo mais" sem que haja mais fogo.`;
}
