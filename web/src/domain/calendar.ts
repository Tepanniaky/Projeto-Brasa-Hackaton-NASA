/**
 * Regras dos calendários: classes de intensidade, "sem dado" × "sem detecção",
 * período crítico. Puras e testáveis.
 */
import type { AnomalyClass, TeamCalendar } from '../data/types';

export type CellState =
  | { kind: 'sem_dado' }          // dado ainda não publicado (ano corrente) ou sensor indisponível
  | { kind: 'zero' }              // nenhuma detecção (não prova ausência de fogo)
  | { kind: 'valor'; level: number; value: number };

export const LEVELS = 5;

/**
 * Escala de raiz quadrada (sugestão do roteiro): poucos picos concentram o fogo,
 * e a raiz deixa os meses fracos visíveis. Nível 1..LEVELS para valores > 0.
 */
export function sqrtLevel(value: number, max: number, levels = LEVELS): number {
  if (value <= 0 || max <= 0) return 0;
  const t = Math.sqrt(value) / Math.sqrt(max);
  return Math.min(levels, Math.max(1, Math.ceil(t * levels)));
}

/** Limites superiores de cada nível, em unidades originais (para a legenda). */
export function sqrtBreaks(max: number, levels = LEVELS): number[] {
  return Array.from({ length: levels }, (_, i) => max * ((i + 1) / levels) ** 2);
}

export interface WeekGrid {
  years: number[];
  cells: CellState[][];
  max: number;
}

/** Calendário ano × semana da camada A, recortado no período, com o ano corrente tratado. */
export function teamWeekGrid(cal: TeamCalendar, yearFrom: number, yearTo: number): WeekGrid {
  const { anos, valores } = cal.calendario;
  const years: number[] = [];
  const raw: number[][] = [];
  anos.forEach((y, i) => {
    if (y >= yearFrom && y <= yearTo) {
      years.push(y);
      raw.push(valores[i]);
    }
  });
  const cur = cal.ano_atual;
  let max = 0;
  raw.forEach((row, i) => row.forEach((v, w) => {
    if (!(years[i] === cur.ano && w > cur.ultima_semana_completa)) max = Math.max(max, v);
  }));
  const cells = raw.map((row, i) => row.map((v, w): CellState => {
    if (years[i] === cur.ano && w > cur.ultima_semana_completa) return { kind: 'sem_dado' };
    if (v <= 0) return { kind: 'zero' };
    return { kind: 'valor', level: sqrtLevel(v, max), value: v };
  }));
  return { years, cells, max };
}

export function inCriticalPeriod(cal: TeamCalendar, week: number): boolean {
  const pc = cal.periodo_critico;
  return !!pc && week >= pc.semana_inicio && week <= pc.semana_fim;
}

export const ANOMALY_LABEL: Record<AnomalyClass, string> = {
  muito_acima: 'Muito acima do normal',
  acima: 'Acima do normal',
  normal: 'Dentro do normal',
  abaixo: 'Abaixo do normal',
};

/** Símbolo textual que acompanha a cor (informação não depende só de cor). */
export const ANOMALY_GLYPH: Record<AnomalyClass, string> = {
  muito_acima: '▲▲',
  acima: '▲',
  normal: '●',
  abaixo: '▼',
};

/** Matriz mensal de um sensor, marcando meses com indisponibilidade conhecida do sensor. */
export function monthCells(rows: number[][], years: number[], gaps: { start: string; end: string }[],
                           max: number): CellState[][] {
  return rows.map((row, i) => row.map((v, m): CellState => {
    const ym = `${years[i]}-${String(m + 1).padStart(2, '0')}`;
    const gap = gaps.some((g) => ym >= g.start.slice(0, 7) && ym <= g.end.slice(0, 7));
    if (gap && v === 0) return { kind: 'sem_dado' };
    if (v <= 0) return { kind: 'zero' };
    return { kind: 'valor', level: sqrtLevel(v, max), value: v };
  }));
}

export function monthsWithGap(years: number[], gaps: { start: string; end: string }[]): Set<string> {
  const s = new Set<string>();
  for (const y of years) {
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      if (gaps.some((g) => ym >= g.start.slice(0, 7) && ym <= g.end.slice(0, 7))) s.add(ym);
    }
  }
  return s;
}
