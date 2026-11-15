/** Calendário ano × mês de UM sensor (camada B). Pequenos múltiplos: um por sensor, mesma escala. */
import type { CellState } from '../../domain/calendar';
import { fmtInt, MONTHS_SHORT } from '../../domain/format';
import { HATCH_ID, HatchDefs, RAMP, Tip, useChartWidth, useTip } from './common';

const CH = 20;
const GAP = 2;
const LEFT = 40;
const TOP = 18;

export function MonthCalendar({ title, color, years, cells, unit, testId }: {
  title: string; color: string; years: number[]; cells: CellState[][]; unit: string; testId: string;
}) {
  const { tip, show, hide } = useTip();
  // largura das células segue o contêiner (até 30), para o texto não encolher com o SVG
  const [ref, width] = useChartWidth(LEFT + 12 * 32, 240);
  const CW = (width - LEFT) / 12 - GAP;
  const monthLabel = (m: string) => (CW < 19 ? m[0] : m);
  const height = TOP + years.length * (CH + GAP) + 4;
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />{title}
      </figcaption>
      <svg ref={ref} className="grafico" viewBox={`0 0 ${width} ${height}`} role="img" data-testid={testId}
           aria-label={`${title}: ${unit} por mês, ${years[0]} a ${years[years.length - 1]}`}>
        <HatchDefs />
        {MONTHS_SHORT.map((m, i) => <text key={m} x={LEFT + i * (CW + GAP) + CW / 2} y={TOP - 6} textAnchor="middle">{monthLabel(m)}</text>)}
        {years.map((y, r) => (
          <g key={y}>
            <text x={LEFT - 6} y={TOP + r * (CH + GAP) + CH - 6} textAnchor="end">{y}</text>
            {cells[r].map((c, m) => (
              <rect key={m} className="cal-celula" data-estado={c.kind}
                    x={LEFT + m * (CW + GAP)} y={TOP + r * (CH + GAP)} width={CW} height={CH} rx={2}
                    fill={c.kind === 'sem_dado' ? `url(#${HATCH_ID})` : c.kind === 'zero' ? RAMP[0] : RAMP[c.level]}
                    onMouseMove={(e) => show(e, (
                      <div><strong>{MONTHS_SHORT[m]}/{y}, {title}</strong>
                        <div>{c.kind === 'valor' ? `${fmtInt(c.value)} ${unit}` : c.kind === 'zero'
                          ? 'nenhuma detecção (não prova ausência de fogo)' : 'sensor com falha de cobertura neste mês'}</div></div>
                    ))} onMouseLeave={hide} />
            ))}
          </g>
        ))}
      </svg>
      <Tip tip={tip} />
    </figure>
  );
}
