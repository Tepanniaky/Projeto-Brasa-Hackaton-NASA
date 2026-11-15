/**
 * Gráfico de linhas no tempo com um único eixo y (nunca eixo duplo),
 * faixa opcional de incerteza, faixas sombreadas (ajuste/avaliação) e colunas
 * com indisponibilidade hachuradas. Hover/foco mostram todos os valores do ponto.
 */
import { type KeyboardEvent, useState } from 'react';
import { fmt1 } from '../../domain/format';
import { tr } from '../../i18n/lang';
import { HATCH_ID, HatchDefs, niceMax, ticks, Tip, useChartWidth, useTip } from './common';

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
  marker?: 'circle' | 'square' | 'none';
  faded?: boolean;
}

interface Props {
  labels: string[];
  series: LineSeries[];
  band?: { lo: number[]; hi: number[]; color: string; label: string };
  shade?: { from: number; to: number; label: string }[];
  gaps?: number[];
  yLabel: string;
  formatX: (label: string) => string;
  tickFor: (label: string, i: number) => string | null;
  height?: number;
  ariaLabel: string;
  /** máximo do eixo y imposto de fora: "lado a lado" usa a mesma escala nos dois painéis */
  yMax?: number;
  /** versão estreita para dois gráficos lado a lado */
  compact?: boolean;
}

export function TimeChart({ labels, series, band, shade = [], gaps = [], yLabel, formatX, tickFor, height = 250, ariaLabel, yMax, compact }: Props) {
  const [svgRef, W] = useChartWidth(compact ? 360 : 600, 280);
  // estreito (celular ou painel lado a lado): margens menores, rótulos diretos em 11 px
  const narrow = compact || W < 480;
  const PAD = narrow ? { l: 60, r: 90, t: 22, b: 30 } : { l: 52, r: 118, t: 22, b: 30 };
  const { tip, show, hide } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (band) all.push(...band.hi);
  const ymax = yMax ?? niceMax(Math.max(1, ...all) * 1.05);
  const x = (i: number) => PAD.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / ymax) * ih;
  const step = n > 1 ? iw / (n - 1) : iw;

  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const bandPath = band
    ? `M${band.hi.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L')}L${band.lo
        .map((v, i) => [i, v] as const).reverse().map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('L')}Z`
    : '';

  const tipContent = (i: number) => (
    <div>
      <strong>{formatX(labels[i])}</strong>
      {gaps.includes(i) && <div>⚠ {tr('sensor de referência com falha parcial', 'reference sensor with partial outage')}</div>}
      {series.map((s) => (
        <div key={s.id}>{s.label}: {s.values[i] === null ? tr('sem dado', 'no data') : fmt1(s.values[i] as number)}</div>
      ))}
      {band && <div>{band.label}: {fmt1(band.lo[i])} {tr('a', 'to')} {fmt1(band.hi[i])}</div>}
    </div>
  );

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - PAD.l) / step)));
    setHover(i);
    show(e, tipContent(i));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = Math.max(0, Math.min(n - 1, (hover ?? -1) + (e.key === 'ArrowRight' ? 1 : -1)));
    setHover(i);
    const rect = svgRef.current!.getBoundingClientRect();
    show({ clientX: rect.left + (x(i) / W) * rect.width, clientY: rect.top + 20 }, tipContent(i));
  };

  const yt = ticks(ymax);
  // rótulos do eixo x: descarta os que encostariam no anterior (ex.: 12 meses num celular)
  const xTicks: { l: string; i: number; t: string }[] = [];
  labels.forEach((l, i) => {
    const t = tickFor(l, i);
    if (!t) return;
    const prev = xTicks[xTicks.length - 1];
    if (prev && x(i) - x(prev.i) < (Math.max(t.length, prev.t.length) * 6.2 + 8)) return;
    xTicks.push({ l, i, t });
  });
  // rótulos diretos no fim da linha, afastados para não colidir
  const ends = series.map((s) => {
    const last = [...s.values].reverse().find((v) => v !== null) ?? 0;
    return { s, y: y(last as number) };
  }).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;

  return (
    <>
      <svg ref={svgRef} className="grafico" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel}
           tabIndex={0} onKeyDown={onKey} onBlur={() => { setHover(null); hide(); }}>
        <HatchDefs />
        {shade.map((s) => (
          <g key={s.label}>
            <rect x={x(s.from) - step / 2} y={PAD.t} width={x(s.to) - x(s.from) + step} height={ih} fill="var(--superficie-2)" opacity={0.9} />
            <text x={x(s.to) + step / 2 - 4} y={PAD.t - 6} textAnchor="end" style={{ fontSize: 11, fill: 'var(--tinta-2)' }}>{s.label}</text>
          </g>
        ))}
        {gaps.map((i) => (
          <rect key={`g${i}`} x={x(i) - step / 2} y={PAD.t} width={step} height={ih} fill={`url(#${HATCH_ID})`} />
        ))}
        {yt.map((t) => (
          <g key={t}>
            <line className="grade" x1={PAD.l} x2={PAD.l + iw} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt1(t)}</text>
          </g>
        ))}
        <line className="eixo" x1={PAD.l} x2={PAD.l + iw} y1={PAD.t + ih} y2={PAD.t + ih} />
        {xTicks.map(({ l, i, t }) => <text key={l} x={x(i)} y={height - 10} textAnchor="middle">{t}</text>)}
        <text x={narrow ? 10 : 12} y={PAD.t + ih / 2} transform={`rotate(-90 ${narrow ? 10 : 12} ${PAD.t + ih / 2})`} textAnchor="middle">{yLabel}</text>
        {band && <path d={bandPath} fill={band.color} opacity={0.22} />}
        {series.map((s) => (
          <g key={s.id} opacity={s.faded ? 0.45 : 1}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined}
                  strokeLinejoin="round" strokeLinecap="round" />
            {s.marker !== 'none' && n <= 90 && s.values.map((v, i) => v === null ? null : s.marker === 'square'
              ? <rect key={i} x={x(i) - 3} y={y(v) - 3} width={6} height={6} fill={s.color} stroke="var(--superficie)" strokeWidth={1.5} />
              : <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill={s.color} stroke="var(--superficie)" strokeWidth={1.5} />)}
          </g>
        ))}
        {ends.map(({ s, y: yy }) => (
          <text key={s.id} className="rotulo-direto" x={PAD.l + iw + 8} y={yy + 4} style={{ fill: s.color, fontSize: narrow ? 11 : undefined }}>{s.label}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--tinta-3)" strokeWidth={1} />}
        <rect x={PAD.l - step / 2} y={PAD.t} width={iw + step} height={ih} fill="transparent"
              onMouseMove={onMove} onMouseLeave={() => { setHover(null); hide(); }} />
      </svg>
      <Tip tip={tip} />
    </>
  );
}
