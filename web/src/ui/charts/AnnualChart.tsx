/** Série anual da camada A: barras finas com faixa min–max (incerteza da conversão) a partir de 2022. */
import type { TeamCalendar } from '../../data/types';
import { fmt1, fmtInt } from '../../domain/format';
import { HATCH_ID, HatchDefs, niceMax, TableToggle, ticks, Tip, useTip } from './common';

const W = 720;
const H = 240;
const PAD = { l: 56, r: 12, t: 14, b: 30 };

export function AnnualChart({ cal, yearFrom, yearTo }: { cal: TeamCalendar; yearFrom: number; yearTo: number }) {
  const { tip, show, hide } = useTip();
  const rows = cal.anual.filter((a) => a.ano >= yearFrom && a.ano <= yearTo);
  if (!rows.length) return <p className="estado">Nenhum ano no período selecionado.</p>;
  const ymax = niceMax(Math.max(1, ...rows.map((r) => r.max)) * 1.05);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / rows.length;
  const bw = Math.max(4, Math.min(22, slot * 0.55));
  const x = (i: number) => PAD.l + slot * (i + 0.5);
  const y = (v: number) => PAD.t + ih - (v / ymax) * ih;
  const firstConv = rows.findIndex((r) => r.ano >= 2022);
  return (
    <>
      <svg className="grafico" viewBox={`0 0 ${W} ${H}`} role="img" data-testid="grafico-anual"
           aria-label={`Total anual de detecções harmonizadas de ${cal.nome}`}>
        <HatchDefs />
        {ticks(ymax).map((t) => (
          <g key={t}>
            <line className="grade" x1={PAD.l} x2={PAD.l + iw} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{fmtInt(t)}</text>
          </g>
        ))}
        {firstConv > 0 && (
          <g>
            <line x1={x(firstConv) - slot / 2} x2={x(firstConv) - slot / 2} y1={PAD.t} y2={PAD.t + ih} stroke="var(--tinta-3)" strokeDasharray="3 3" />
            <text x={x(firstConv) - slot / 2 - 6} y={PAD.t + 10} textAnchor="end">MODIS observado</text>
            <text x={x(firstConv) - slot / 2 + 6} y={PAD.t + 10}>VIIRS convertido</text>
          </g>
        )}
        <line className="eixo" x1={PAD.l} x2={PAD.l + iw} y1={PAD.t + ih} y2={PAD.t + ih} />
        {rows.map((r, i) => (
          <g key={r.ano} onMouseMove={(e) => show(e, (
            <div><strong>{r.ano}{r.parcial ? ' (parcial)' : ''}</strong><div>{fmt1(r.valor)} detecções harmonizadas</div>
              {r.max > r.min && <div>Faixa da conversão: {fmt1(r.min)} a {fmt1(r.max)}</div>}
              <div>{r.ano <= 2021 ? 'MODIS observado' : 'VIIRS convertido pela equipe'}</div></div>
          ))} onMouseLeave={hide}>
            <rect x={x(i) - slot / 2} y={PAD.t} width={slot} height={ih} fill="transparent" />
            <rect x={x(i) - bw / 2} y={y(r.valor)} width={bw} height={Math.max(0, y(0) - y(r.valor))} rx={3}
                  fill={r.parcial ? `url(#${HATCH_ID})` : r.ano >= 2022 ? 'var(--r3)' : 'var(--r2)'}
                  stroke={r.parcial ? 'var(--r3)' : 'none'} strokeWidth={1.5} />
            {r.max > r.min && (
              <g stroke="var(--carvao)" strokeWidth={1.5}>
                <line x1={x(i)} x2={x(i)} y1={y(r.max)} y2={y(r.min)} />
                <line x1={x(i) - 4} x2={x(i) + 4} y1={y(r.max)} y2={y(r.max)} />
                <line x1={x(i) - 4} x2={x(i) + 4} y1={y(r.min)} y2={y(r.min)} />
              </g>
            )}
            {(rows.length <= 12 || i % 3 === 0 || i === rows.length - 1) &&
              <text x={x(i)} y={H - 10} textAnchor="middle">{r.ano}</text>}
          </g>
        ))}
      </svg>
      <ul className="legenda-linha">
        <li><span className="chave-faixa" style={{ background: 'var(--r2)' }} /> MODIS observado (até 2021)</li>
        <li><span className="chave-faixa" style={{ background: 'var(--r3)' }} /> VIIRS convertido (desde 2022)</li>
        <li><span className="chave-linha" style={{ color: 'var(--carvao)', borderTopWidth: 0, borderLeft: '2px solid', height: 12, width: 2 }} /> Faixa 5–95 % da conversão</li>
        <li><span className="amostra hachura" /> Ano parcial</li>
      </ul>
      <TableToggle label="totais anuais">
        <table className="dados">
          <thead><tr><th>Ano</th><th>Valor</th><th>Mín.</th><th>Máx.</th><th>Origem</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.ano}><td>{r.ano}{r.parcial ? ' (parcial)' : ''}</td><td>{fmt1(r.valor)}</td><td>{fmt1(r.min)}</td>
              <td>{fmt1(r.max)}</td><td>{r.ano <= 2021 ? 'MODIS observado' : 'VIIRS convertido'}</td></tr>
          ))}</tbody>
        </table>
      </TableToggle>
      <Tip tip={tip} />
    </>
  );
}
