/**
 * Calendário ano × semana (camada A). Escala de raiz quadrada em 5 níveis de uma cor,
 * período crítico emoldurado, "sem dado" hachurado e distinto de "sem detecção".
 */
import { type KeyboardEvent, useMemo, useState } from 'react';
import type { TeamCalendar } from '../../data/types';
import { type CellState, criticalSegments, inCriticalPeriod, sqrtBreaks, teamWeekGrid } from '../../domain/calendar';
import { fmt1, fmtDayMonth, fmtInt, monthsShort } from '../../domain/format';
import { criticalRange } from '../../domain/explain';
import { tr } from '../../i18n/lang';
import { HATCH_ID, HatchDefs, RAMP, TableToggle, Tip, useTip } from './common';

const CW = 12;
const CH = 13;
const GAP = 1.5;
const LEFT = 40;
const TOP = 44;

function fill(c: CellState) {
  if (c.kind === 'sem_dado') return `url(#${HATCH_ID})`;
  if (c.kind === 'zero') return RAMP[0];
  return RAMP[c.level];
}

export function WeekCalendar({ cal, yearFrom, yearTo, onYear }: { cal: TeamCalendar; yearFrom: number; yearTo: number; onYear?: (y: number) => void }) {
  const grid = useMemo(() => teamWeekGrid(cal, yearFrom, yearTo), [cal, yearFrom, yearTo]);
  const { tip, show, hide } = useTip();
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const width = LEFT + 52 * (CW + GAP) + 4;
  const height = TOP + grid.years.length * (CH + GAP) + 6;
  const pc = cal.periodo_critico;
  const segments = criticalSegments(pc);
  const labelSeg = segments.reduce<[number, number]>((best, s) => (s[1] - s[0] > best[1] - best[0] ? s : best), segments[0] ?? [0, 0]);
  const labelEnd = labelSeg[0] > 26;
  const breaks = sqrtBreaks(grid.max);

  const describe = (r: number, w: number) => {
    const c = grid.cells[r][w];
    const y = grid.years[r];
    const val = c.kind === 'valor' ? `${fmt1(c.value)} ${tr('detecções harmonizadas', 'harmonized detections')}`
      : c.kind === 'zero' ? tr('nenhuma detecção (não prova ausência de fogo)', 'no detections (does not prove absence of fire)')
      : tr('sem dado: semana ainda não publicada', 'no data: week not yet published');
    return (
      <div>
        <strong>{y}, {tr('semana de', 'week of')} {fmtDayMonth(cal.semanas[w])}</strong>
        <div>{val}</div>
        {inCriticalPeriod(cal, w) && <div>{tr('Dentro do período crítico', 'Inside the critical period')}</div>}
        <div style={{ opacity: 0.8 }}>{y <= 2021 ? tr('MODIS observado', 'MODIS observed') : tr('VIIRS convertido (equipe)', 'VIIRS converted (team)')}</div>
      </div>
    );
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const mv = moves[e.key];
    if (!mv) return;
    e.preventDefault();
    const [r0, w0] = focus ?? [grid.years.length - 1, 0];
    const r = Math.max(0, Math.min(grid.years.length - 1, r0 + mv[0]));
    const w = Math.max(0, Math.min(51, w0 + mv[1]));
    setFocus([r, w]);
    const el = (e.currentTarget as SVGSVGElement).querySelector(`[data-rw="${r}-${w}"]`);
    if (el) show(el.getBoundingClientRect(), describe(r, w));
  };

  if (!grid.years.length) {
    return <p className="estado">{tr('Nenhum ano do calendário cai no período selecionado.', 'No calendar year falls within the selected period.')}</p>;
  }

  const months = monthsShort();
  return (
    <>
      <div className="calendario-wrap">
        <svg className="grafico" viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0}
             aria-label={tr(`Calendário semanal de ${cal.nome}, ${grid.years[0]} a ${grid.years[grid.years.length - 1]}. Use as setas para percorrer as semanas.`,
                           `Weekly calendar for ${cal.nome}, ${grid.years[0]} to ${grid.years[grid.years.length - 1]}. Use the arrow keys to move through the weeks.`)}
             onKeyDown={onKey} onBlur={() => { setFocus(null); hide(); }} data-testid="calendario-semanal">
          <HatchDefs />
          {cal.semanas.map((s, w) => Number(s.slice(0, 2)) <= 7 ? (
            <text key={s} x={LEFT + w * (CW + GAP)} y={TOP - 7}>{months[Number(s.slice(3, 5)) - 1]}</text>
          ) : null)}
          {grid.years.map((y, r) => (
            <g key={y}>
              <text x={LEFT - 6} y={TOP + r * (CH + GAP) + CH - 3} textAnchor="end" data-testid={`ano-${y}`}
                    className={onYear ? 'ano-clicavel' : undefined} onClick={onYear ? () => onYear(y) : undefined}
                    onMouseMove={onYear ? (e) => show(e, <div>{yearFrom === y && yearTo === y ? tr('Clique para voltar ao período completo', 'Click to return to the full period') : tr(`Clique para ver só ${y}`, `Click to see only ${y}`)}</div>) : undefined}
                    onMouseLeave={onYear ? hide : undefined}
                    style={{ fontWeight: y === cal.ano_atual.ano ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>{y}</text>
              {grid.cells[r].map((c, w) => (
                <rect key={w} className="cal-celula" data-rw={`${r}-${w}`} data-estado={c.kind}
                      x={LEFT + w * (CW + GAP)} y={TOP + r * (CH + GAP)} width={CW} height={CH} rx={2}
                      fill={fill(c)}
                      stroke={focus && focus[0] === r && focus[1] === w ? 'var(--brasa)' : 'none'} strokeWidth={2}
                      onMouseMove={(e) => show(e, describe(r, w))} onMouseLeave={hide} />
              ))}
            </g>
          ))}
          {pc && (
            <g aria-hidden="true">
              {segments.map(([a, b]) => (
                <rect key={a} x={LEFT + a * (CW + GAP) - 2} y={TOP - 20}
                      width={(b - a + 1) * (CW + GAP) + 2.5}
                      height={grid.years.length * (CH + GAP) + 21} fill="none" stroke="var(--tinta)" strokeWidth={2} rx={3} />
              ))}
              {/* rótulo no trecho mais longo; ancorado à direita quando o trecho fica no fim do ano, para não sair do gráfico */}
              <text x={labelEnd ? LEFT + (labelSeg[1] + 1) * (CW + GAP) : LEFT + labelSeg[0] * (CW + GAP)} y={TOP - 26}
                    textAnchor={labelEnd ? 'end' : 'start'} style={{ fontWeight: 600, fill: 'var(--tinta)' }}>
                {tr('Período crítico', 'Critical period')} {criticalRange(pc)}{segments.length > 1 ? tr(' (atravessa o ano)', ' (spans the new year)') : ''}
              </text>
            </g>
          )}
        </svg>
      </div>
      <ul className="legenda-linha" aria-label={tr('Legenda do calendário', 'Calendar legend')}>
        <li><span className="amostra" style={{ background: RAMP[0] }} /> {tr('Nenhuma detecção', 'No detections')}</li>
        {breaks.map((b, i) => (
          <li key={i}><span className="amostra" style={{ background: RAMP[i + 1] }} /> {tr('até', 'up to')} {grid.max < 20 ? fmt1(b) : fmtInt(b)}</li>
        ))}
        <li><span className="amostra hachura" /> {tr('Sem dado (semana não publicada)', 'No data (week not published)')}</li>
        <li><span className="amostra" style={{ background: 'transparent', border: '2px solid var(--tinta)' }} /> {tr('Período crítico', 'Critical period')}</li>
      </ul>
      <p className="nota">{tr('Escala de raiz quadrada: poucas semanas concentram quase todo o fogo, e a raiz deixa visíveis os meses fracos. Unidade: detecções harmonizadas (equivalente MODIS) por semana.',
                              'Square-root scale: a few weeks hold almost all the fire, and the root keeps the weak months visible. Unit: harmonized detections (MODIS equivalent) per week.')}</p>
      <TableToggle label={tr('valores semanais', 'weekly values')}>
        <table className="dados">
          <thead><tr><th>{tr('Ano', 'Year')}</th>{cal.semanas.map((s) => <th key={s}>{fmtDayMonth(s)}</th>)}</tr></thead>
          <tbody>
            {grid.years.map((y, r) => (
              <tr key={y}><td>{y}</td>{grid.cells[r].map((c, w) => (
                <td key={w}>{c.kind === 'valor' ? fmt1(c.value) : c.kind === 'zero' ? '0' : '—'}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
      <Tip tip={tip} />
    </>
  );
}
