/**
 * Série anual da camada A sob o mapa, usada também como seletor de período: arrastar sobre as barras
 * escolhe de/até (os selects da barra de filtros continuam como alternativa por teclado).
 * A partir de 2022 o traço laranja é a faixa 5–95 % da conversão VIIRS → MODIS informada pela equipe.
 */
import { useRef, useState } from 'react';
import type { TeamCalendar } from '../../data/types';
import { fmt1 } from '../../domain/format';
import { TableToggle, Tip, useTip } from './common';

export function AnnualChart({ cal, yearFrom, yearTo, onRange }: {
  cal: TeamCalendar; yearFrom: number; yearTo: number; onRange: (from: number, to: number) => void;
}) {
  const { tip, show, hide } = useTip();
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const rows = cal.anual;
  const max = Math.max(1, ...rows.map((r) => r.max));
  const lo = drag ? Math.min(drag.start, drag.end) : yearFrom;
  const hi = drag ? Math.max(drag.start, drag.end) : yearTo;

  const yearAt = (clientX: number, clientY: number): number | null => {
    const b = document.elementFromPoint(clientX, clientY)?.closest?.('[data-ano]') as HTMLElement | null;
    if (b && barsRef.current?.contains(b)) return Number(b.dataset.ano);
    // fora das barras (arraste além da borda): usa a posição horizontal
    const r = barsRef.current?.getBoundingClientRect();
    if (!r) return null;
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor(((clientX - r.left) / r.width) * rows.length)));
    return rows[i]?.ano ?? null;
  };

  const tipFor = (r: TeamCalendar['anual'][number]) => (
    <div><strong>{r.ano}{r.parcial ? ' · parcial' : ''}</strong><div>{fmt1(r.valor)} detecções harmonizadas</div>
      {r.max > r.min ? <div>Faixa da conversão (5–95 %): {fmt1(r.min)} a {fmt1(r.max)}</div> : <div>MODIS observado</div>}</div>
  );

  return (
    <div className="escova">
      <div className="escova-topo">
        <span><b>Total por ano</b> · {cal.nome} · detecções harmonizadas (equiv. MODIS)</span>
        <span><b>{lo === hi ? lo : `${lo}–${hi}`}</b> · arraste para escolher o período</span>
      </div>
      <div ref={barsRef} className="barras" data-testid="grafico-anual" role="img"
           aria-label={`Total anual de ${cal.nome}; arraste para escolher o período ou use os seletores de ano nos filtros`}
           onPointerDown={(e) => {
             const y = yearAt(e.clientX, e.clientY);
             if (y === null) return;
             e.currentTarget.setPointerCapture(e.pointerId);
             hide();
             setDrag({ start: y, end: y });
           }}
           onPointerMove={(e) => {
             if (!drag) return;
             const y = yearAt(e.clientX, e.clientY);
             if (y !== null && y !== drag.end) setDrag({ ...drag, end: y });
           }}
           onPointerUp={() => {
             if (!drag) return;
             onRange(Math.min(drag.start, drag.end), Math.max(drag.start, drag.end));
             setDrag(null);
           }}
           onPointerCancel={() => setDrag(null)}>
        {rows.map((r) => {
          const inside = r.ano >= lo && r.ano <= hi;
          return (
            <div key={r.ano} data-ano={r.ano} className={`barra${inside ? ' dentro' : ''}${r.parcial ? ' parcial' : ''}`}
                 onMouseMove={(e) => !drag && show(e, tipFor(r))} onMouseLeave={hide}>
              <span>
                <i style={{ height: `${(r.valor / max) * 100}%` }} />
                {r.max > r.min && <u style={{ bottom: `${(r.min / max) * 100}%`, height: `${Math.max(2, ((r.max - r.min) / max) * 100)}%` }} />}
              </span>
              <em>{String(r.ano).slice(2)}</em>
            </div>
          );
        })}
      </div>
      <ul className="legenda-linha">
        <li><span className="chave-faixa" style={{ background: 'var(--tinta)' }} /> até 2021: MODIS observado</li>
        <li><span className="chave-faixa" style={{ width: 3, background: 'var(--brasa)' }} /> desde 2022: VIIRS convertido, faixa 5–95 %</li>
        <li><span className="amostra hachura" style={{ height: 10 }} /> ano parcial</li>
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
    </div>
  );
}
