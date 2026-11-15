/**
 * Explicações determinísticas, sempre derivadas dos valores calculados, em português ou inglês.
 * Nenhum texto aqui afirma número de incêndios, área queimada ou ausência de fogo.
 */
import type { AuditRegion, GridId, Harmonization, Manifest, MetricId, RegionMonthly, TeamCalendar } from '../data/types';
import { flagText } from '../i18n/dataText';
import { tr } from '../i18n/lang';
import { fmt1, fmtDayMonth, fmtHour, fmtInt, fmtPct, fmtPeriod, fmtSignedPct } from './format';
import { harmonizedSlice, type MonthRange, sensorValues, sum, sumSd } from './series';

export function currentYearHeadline(cal: TeamCalendar): { text: string; tone: 'acima' | 'abaixo' | 'normal' | 'sem_base' } {
  const r = cal.ano_atual.razao_vs_mediana;
  const y = cal.ano_atual.ano;
  if (r === null || !Number.isFinite(r)) {
    return { text: tr(`Não há histórico suficiente para comparar ${y} com o normal.`,
                      `There is not enough history to compare ${y} with normal.`), tone: 'sem_base' };
  }
  const d = r - 1;
  if (Math.abs(d) < 0.05) return { text: tr(`${y} está dentro do normal até esta data.`, `${y} is within normal so far.`), tone: 'normal' };
  if (r >= 2) {
    return { text: tr(`${y} está ${fmt1(r)} vezes acima do normal até esta data.`, `${y} is ${fmt1(r)} times above normal so far.`), tone: 'acima' };
  }
  return d > 0
    ? { text: tr(`${y} está ${fmtPct(d)} acima do normal até esta data.`, `${y} is ${fmtPct(d)} above normal so far.`), tone: 'acima' }
    : { text: tr(`${y} está ${fmtPct(-d)} abaixo do normal até esta data.`, `${y} is ${fmtPct(-d)} below normal so far.`), tone: 'abaixo' };
}

export function criticalPeriodText(cal: TeamCalendar): string {
  const pc = cal.periodo_critico;
  if (!pc) return tr('Sem período crítico: quase nenhuma detecção no histórico.', 'No critical period: almost no detections on record.');
  return tr(
    `Período crítico: ${pc.inicio} a ${pc.fim} (${pc.n_semanas} semanas concentram ${fmtPct(pc.fracao_da_atividade)} da atividade detectada).`,
    `Critical period: ${fmtDayMonth(pc.inicio)} to ${fmtDayMonth(pc.fim)} (${pc.n_semanas} weeks hold ${fmtPct(pc.fracao_da_atividade)} of detected activity).`,
  );
}

/** "16/07–12/11" | "Jul 16–Nov 12". */
export const criticalRange = (pc: NonNullable<TeamCalendar['periodo_critico']>) => `${fmtDayMonth(pc.inicio)}–${fmtDayMonth(pc.fim)}`;

/** "11 de 24 (1 = menor)" → "11 of 24 (1 = lowest)". */
export function rankText(s: string): string {
  const m = /^(\d+) de (\d+)/.exec(s);
  return tr(s, m ? `${m[1]} of ${m[2]} (1 = lowest)` : s);
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
  const km = grid === 'g10' ? 10 : 5;
  const unit = tr(`dias-célula de ${km} km`, `${km} km cell-days`);
  const periodo = fmtPeriod(r.yearFrom, r.yearTo);
  if (modis === 0 && viirs === 0) {
    return { modis, viirs, adjusted: null, adjustedLo: null, adjustedHi: null, rawRatio: null, adjustedDiff: null,
             sentences: [tr(
               `Nenhum dos dois sensores registrou detecção em ${periodo}. Isso não comprova ausência de fogo: nuvens, fumaça e o horário da passagem podem ocultar focos.`,
               `Neither sensor recorded a detection in ${periodo}. This does not prove there was no fire: clouds, smoke and overpass timing can hide fires.`)] };
  }
  const rawRatio = modis > 0 ? viirs / modis : null;
  sentences.push(rawRatio !== null
    ? tr(`Antes do ajuste, o VIIRS/NOAA-20 registrou ${fmtInt(viirs)} ${unit} contra ${fmtInt(modis)} do MODIS/Aqua em ${periodo}: ${fmt1(rawRatio)} vezes mais. Esse excesso vem principalmente do pixel menor (375 m contra 1 km), não de mais fogo.`,
         `Before adjustment, VIIRS/NOAA-20 recorded ${fmtInt(viirs)} ${unit} versus ${fmtInt(modis)} for MODIS/Aqua in ${periodo}: ${fmt1(rawRatio)} times more. The excess comes mainly from the smaller pixel (375 m versus 1 km), not from more fire.`)
    : tr(`Em ${periodo}, o MODIS/Aqua não registrou detecções e o VIIRS/NOAA-20 registrou ${fmtInt(viirs)} ${unit}.`,
         `In ${periodo}, MODIS/Aqua recorded no detections and VIIRS/NOAA-20 recorded ${fmtInt(viirs)} ${unit}.`));
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
    sentences.push(tr(
      `Depois do ajuste, o VIIRS equivale a ${fmtInt(adjusted)} ${unit} na escala do MODIS/Aqua (intervalo aproximado de ${fmtInt(lo)} a ${fmtInt(hi)}).`,
      `After adjustment, VIIRS is equivalent to ${fmtInt(adjusted)} ${unit} on the MODIS/Aqua scale (approximate interval ${fmtInt(lo)} to ${fmtInt(hi)}).`));
    if (diff !== null) {
      sentences.push(Math.abs(diff) < 0.1
        ? tr(`O ajuste aproxima os dois sensores: a diferença para o MODIS observado cai para ${fmtSignedPct(diff)}.`,
             `The adjustment brings the two sensors together: the difference from observed MODIS drops to ${fmtSignedPct(diff)}.`)
        : tr(`Mesmo ajustado, o VIIRS fica ${fmtSignedPct(diff)} em relação ao MODIS observado. Diferenças assim podem vir da deriva orbital do Aqua, de nuvens ou de limites do modelo.`,
             `Even after adjustment, VIIRS is ${fmtSignedPct(diff)} relative to observed MODIS. Differences like this can come from Aqua's orbital drift, clouds or model limits.`));
    }
  } else {
    sentences.push(tr('O ajuste experimental não está disponível para este recorte.', 'The experimental adjustment is not available for this selection.'));
  }
  return { modis, viirs, adjusted, adjustedLo: lo, adjustedHi: hi, rawRatio, adjustedDiff: diff, sentences };
}

/**
 * Desempenho do ajuste nos anos de avaliação, contado a partir das métricas exportadas.
 * `note` marca as linhas secundárias (marcações automáticas), exibidas em tom de nota.
 */
export function evaluationVerdict(harm: Harmonization, grid: GridId, level: 'estado_mes' | 'municipio_ano'): { text: string; note: boolean }[] {
  const g = harm.grades[grid];
  if (!g || g.ajuste.status !== 'ok') return [{ text: tr('Harmonização não ajustada: dados insuficientes.', 'Harmonization not fitted: insufficient data.'), note: false }];
  const rows = g.avaliacao.metricas.filter((m) => m.nivel === level && m.divisao === 'avaliacao');
  const years = [...new Set(rows.map((r) => r.ano))].sort();
  let better = 0;
  for (const y of years) {
    const by = Object.fromEntries(rows.filter((r) => r.ano === y).map((r) => [r.metodo, r.mae]));
    const base = Math.min(by.sem_ajuste, by.razao);
    if (by.binomial_negativa < base) better++;
  }
  const anos = harm.anos_avaliacao.join(', ');
  const out = [{
    text: level === 'estado_mes'
      ? tr(`Nos anos de avaliação (${anos}), nunca usados no ajuste, o modelo reduziu o erro em ${better} de ${years.length} anos no total mensal do estado, em comparação com a melhor linha de base.`,
           `In the evaluation years (${anos}), never used for fitting, the model reduced the error in ${better} of ${years.length} years for the state monthly total, compared with the best baseline.`)
      : tr(`Nos anos de avaliação (${anos}), nunca usados no ajuste, o modelo reduziu o erro em ${better} de ${years.length} anos no total anual dos municípios, em comparação com a melhor linha de base.`,
           `In the evaluation years (${anos}), never used for fitting, the model reduced the error in ${better} of ${years.length} years for the annual municipal totals, compared with the best baseline.`),
    note: false,
  }];
  for (const f of g.avaliacao.marcacoes.filter((m) => m.nivel === level)) out.push({ text: flagText(f), note: true });
  return out;
}

export function auditSentences(audit: AuditRegion | undefined, regionName: string): string[] {
  if (!audit) return [];
  const out: string[] = [];
  const rep = audit.reproducao_2020_2021;
  if (audit.reproduzida) {
    out.push(tr(
      `Em ${regionName}, 2020 e 2021 da série da equipe reproduzem exatamente, semana a semana, a contagem MODIS Terra+Aqua sem filtro (data UTC).`,
      `In ${regionName}, the team series for 2020 and 2021 exactly reproduces, week by week, the unfiltered MODIS Terra+Aqua count (UTC date).`));
  } else if (rep.length) {
    const r = rep.map((x) => tr(`${x.ano}: ${x.semanas_iguais}/52 semanas iguais`, `${x.ano}: ${x.semanas_iguais}/52 identical weeks`)).join('; ');
    out.push(tr(
      `Em ${regionName}, a reprodução de 2020–2021 é aproximada (${r}). Diferenças pequenas costumam vir de pontos na divisa entre municípios.`,
      `In ${regionName}, the 2020–2021 reproduction is approximate (${r}). Small differences usually come from points on municipal boundaries.`));
  }
  const conv = audit.comparacao_anual.filter((c) => c.origem_equipe === 'VIIRS convertido' && c.ano <= 2025);
  if (conv.length) {
    const inBand = conv.filter((c) => c.observado_dentro_da_faixa).length;
    const diffs = conv.map((c) => `${c.ano} ${c.diferenca_relativa === null ? tr('n/d', 'n/a') : fmtSignedPct(c.diferenca_relativa)}`).join(', ');
    out.push(tr(
      `De 2022 a 2025 a série da equipe vem do VIIRS convertido. Em relação ao MODIS Terra+Aqua observado: ${diffs}. O valor observado caiu dentro da faixa publicada em ${inBand} de ${conv.length} anos.`,
      `From 2022 to 2025 the team series comes from converted VIIRS. Relative to observed MODIS Terra+Aqua: ${diffs}. The observed value fell inside the published band in ${inBand} of ${conv.length} years.`));
  }
  return out;
}

export function driftSentence(manifest: Manifest): string | null {
  const aqua = manifest.deriva_passagem.filter((d) => d.satelite === 'Aqua').sort((a, b) => a.ano - b.ano);
  const n20 = manifest.deriva_passagem.filter((d) => d.satelite === 'N20').sort((a, b) => a.ano - b.ano);
  if (aqua.length < 2) return null;
  const a0 = aqua[0];
  const a1 = aqua[aqua.length - 1];
  const nLast = n20.length ? fmtHour(n20[n20.length - 1].hora_local_mediana) : '';
  return tr(
    `O horário local mediano das detecções diurnas do Aqua passou de ${fmtHour(a0.hora_local_mediana)} (${a0.ano}) para ${fmtHour(a1.hora_local_mediana)} (${a1.ano}).${nLast ? ` No mesmo período o NOAA-20 ficou estável, perto de ${nLast}.` : ''} O Aqua passa cada vez mais perto do pico diário de fogo da tarde e pode estar "vendo mais" sem que haja mais fogo.`,
    `The median local time of Aqua's daytime detections moved from ${fmtHour(a0.hora_local_mediana)} (${a0.ano}) to ${fmtHour(a1.hora_local_mediana)} (${a1.ano}).${nLast ? ` Over the same period NOAA-20 stayed stable, near ${nLast}.` : ''} Aqua now passes ever closer to the afternoon peak of daily fire activity and may be "seeing more" without there being more fire.`,
  );
}
