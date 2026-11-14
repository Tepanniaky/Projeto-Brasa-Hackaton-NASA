import { useCallback, useState, type ReactNode } from 'react';

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function ticks(max: number, n = 4): number[] {
  const step = max / n;
  return Array.from({ length: n + 1 }, (_, i) => i * step);
}

export interface TipState { x: number; y: number; content: ReactNode }

/** Dica flutuante compartilhada por todos os gráficos (mouse e foco do teclado). */
export function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback((e: { clientX: number; clientY: number } | DOMRect, content: ReactNode) => {
    if ('clientX' in e) setTip({ x: e.clientX, y: e.clientY, content });
    else setTip({ x: e.left + e.width / 2, y: e.top, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

export function Tip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  const left = Math.min(tip.x + 14, window.innerWidth - 290);
  const top = tip.y + 16 > window.innerHeight - 90 ? tip.y - 80 : tip.y + 16;
  return <div className="dica" role="status" style={{ left, top }}>{tip.content}</div>;
}

/** Botão "Ver tabela": alternativa textual de cada gráfico. */
export function TableToggle({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="botao-sec" aria-expanded={open} onClick={() => setOpen((o) => !o)}
              style={{ marginTop: 10, fontSize: 13 }}>
        {open ? 'Ocultar tabela' : `Ver tabela: ${label}`}
      </button>
      {open && <div className="tabela-wrap">{children}</div>}
    </div>
  );
}

export const HATCH_ID = 'hachura-sem-dado';
export function HatchDefs() {
  return (
    <defs>
      <pattern id={HATCH_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--zero)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--linha-forte)" strokeWidth="2.5" />
      </pattern>
    </defs>
  );
}

export const RAMP = ['var(--zero)', 'var(--r1)', 'var(--r2)', 'var(--r3)', 'var(--r4)', 'var(--r5)'];
