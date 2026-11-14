/**
 * Ano corrente sobre a faixa do normal histórico (camada A).
 * Faixa: p50–p90 da semana; linha: mediana. Pontos do ano: cor + glifo da classe.
 */
import { useRef, useState } from 'react';
import type { AnomalyClass, TeamCalendar } from '../../data/types';
import { ANOMALY_GLYPH, ANOMALY_LABEL } from '../../domain/calendar';
import { fmt1 } from '../../domain/format';
import { niceMax, TableToggle, ticks, Tip, useTip } from './common';

const W = 720;
const H = 250;
const PAD = { l: 52, r: 16, t: 14, b: 30 };
const COLOR: Record<AnomalyClass, string> = {
  muito_acima: 'var(--muito-acima)', acima: 'var(--acima)', normal: 'var(--normal)', abaixo: 'var(--abaixo)',
};

function Marker({ cls, x, y }: { cls: AnomalyClass; x: number; y: number }) {
  const c = COLOR[cls];
  if (cls === 'muito_acima') return <path d={`M${x},${y - 6.5}L${x + 6},${y + 4.5}L${x - 6},${y + 4.5}Z`} fill={c} stroke="#fff" strokeWidth={1.2} />;
  if (cls === 'acima') return <path d={`M${x},${y - 5}L${x + 4.5},${y + 3.5}L${x - 4.5},${y + 3.5}Z`} fill={c} stroke="#fff" strokeWidth={1.2} />;
  if (cls === 'abaixo') return <path d={`M${x},${y + 5}L${x + 4.5},${y - 3.5}L${x - 4.5},${y - 3.5}Z`} fill={c} stroke="#fff" strokeWidth={1.2} />;
  return <circle cx={x} cy={y} r={2.6} fill={c} />;
}

export function CurrentYearChart({ cal }: { cal: TeamCalendar }) {
  const { tip, show, hide } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const cur = cal.ano_atual;
  const clim = cal.climatologia;
  const ymax = niceMax(Math.max(1, ...clim.p90, ...cur.semanas.map((s) => s.max)) * 1.05);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (w: number) => PAD.l + (w / 51) * iw;
  const y = (v: number) => PAD.t + ih - (v / ymax) * ih;
  const band = `M${clim.p90.map((v, w) => `${x(w)},${y(v)}`).join('L')}L${clim.p50.map((v, w) => [w, v] as const).reverse().map(([w, v]) => `${x(w)},${y(v)}`).join('L')}Z`;
  const line = cur.semanas.map((s, i) => `${i ? 'L' : 'M'}${x(s.semana)},${y(s.valor)}`).join('');
  const med = clim.p50.map((v, w) => `${w ? 'L' : 'M'}${x(w)},${y(v)}`).join('');

  const content = (w: number) => {
    const s = cur.semanas.find((k) => k.semana === w);
    return (
      <div>
        <strong>Semana de {cal.semanas[w]}</strong>
        <div>{cur.ano}: {s ? `${fmt1(s.valor)} (${ANOMALY_GLYPH[s.classe]} ${ANOMALY_LABEL[s.classe].toLowerCase()})` : 'sem dado ainda'}</div>
        <div>Normal (mediana): {fmt1(clim.p50[w])}; p75 {fmt1(clim.p75[w])}; p90 {fmt1(clim.p90[w])}</div>
      </div>
    );
  };
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const w = Math.max(0, Math.min(51, Math.round(((px - PAD.l) / iw) * 51)));
    setHover(w);
    show(e, content(w));
  };
  const counts = cur.semanas.reduce<Record<string, number>>((a, s) => ({ ...a, [s.classe]: (a[s.classe] ?? 0) + 1 }), {});

  return (
    <>
      <svg ref={ref} className="grafico" viewBox={`0 0 ${W} ${H}`} role="img" data-testid="grafico-ano-corrente"
           aria-label={`Semanas de ${cur.ano} comparadas ao normal de ${cal.linha_de_base[0]} a ${cal.linha_de_base[1]}`}>
        {ticks(ymax).map((t) => (
          <g key={t}>
            <line className="grade" x1={PAD.l} x2={PAD.l + iw} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{fmt1(t)}</text>
          </g>
        ))}
        <line className="eixo" x1={PAD.l} x2={PAD.l + iw} y1={PAD.t + ih} y2={PAD.t + ih} />
        {cal.semanas.map((s, w) => Number(s.slice(0, 2)) <= 7
          ? <text key={s} x={x(w)} y={H - 10} textAnchor="middle">{s.slice(3)}/{String(cur.ano).slice(2)}</text> : null)}
        <path d={band} fill="var(--normal)" opacity={0.35} />
        <path d={med} fill="none" stroke="var(--tinta-3)" strokeWidth={1.5} />
        <line x1={x(cur.ultima_semana_completa) + 4} x2={x(cur.ultima_semana_completa) + 4} y1={PAD.t} y2={PAD.t + ih}
              stroke="var(--tinta-3)" strokeDasharray="2 3" />
        <text x={x(cur.ultima_semana_completa) + 8} y={PAD.t + 10}>sem dado depois daqui</text>
        <path d={line} fill="none" stroke="var(--carvao)" strokeWidth={2} />
        {cur.semanas.map((s) => <Marker key={s.semana} cls={s.classe} x={x(s.semana)} y={y(s.valor)} />)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--tinta-3)" />}
        <rect x={PAD.l} y={PAD.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove}
              onMouseLeave={() => { setHover(null); hide(); }} />
      </svg>
      <ul className="legenda-linha">
        <li><span className="chave-linha" style={{ color: 'var(--carvao)' }} /> {cur.ano}</li>
        <li><span className="chave-linha" style={{ color: 'var(--tinta-3)' }} /> Mediana {cal.linha_de_base[0]}–{cal.linha_de_base[1]}</li>
        <li><span className="chave-faixa" style={{ background: 'var(--normal)', opacity: 0.5 }} /> Faixa mediana a percentil 90</li>
        {(['muito_acima', 'acima', 'abaixo'] as AnomalyClass[]).map((c) => (
          <li key={c}><span style={{ color: COLOR[c] }}>{ANOMALY_GLYPH[c]}</span> {ANOMALY_LABEL[c]} ({counts[c] ?? 0} sem.)</li>
        ))}
      </ul>
      <p className="nota">Semanas com menos de 3 detecções nunca são marcadas como anômalas. Valores de {cur.ano} são preliminares.</p>
      <TableToggle label={`semanas de ${cur.ano}`}>
        <table className="dados">
          <thead><tr><th>Semana</th><th>{cur.ano}</th><th>Mín.</th><th>Máx.</th><th>Mediana</th><th>p90</th><th>Classe</th></tr></thead>
          <tbody>{cur.semanas.map((s) => (
            <tr key={s.semana} className={s.classe === 'muito_acima' || s.classe === 'acima' ? 'marcado' : ''}>
              <td>{s.inicio}</td><td>{fmt1(s.valor)}</td><td>{fmt1(s.min)}</td><td>{fmt1(s.max)}</td>
              <td>{fmt1(clim.p50[s.semana])}</td><td>{fmt1(clim.p90[s.semana])}</td>
              <td>{ANOMALY_GLYPH[s.classe]} {ANOMALY_LABEL[s.classe]}</td>
            </tr>
          ))}</tbody>
        </table>
      </TableToggle>
      <Tip tip={tip} />
    </>
  );
}
