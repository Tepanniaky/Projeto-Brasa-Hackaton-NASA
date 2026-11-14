import { useId, useMemo, useRef, useState } from 'react';
import type { MetricId, TeamIndexItem } from '../data/types';
import { type FilterAction, type Filters, STATE, YEAR_MAX, YEAR_MIN } from '../domain/filters';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Combobox acessível que filtra os 417 municípios pelo nome (padrão ARIA 1.2). */
export function SearchBox({ items, value, onPick }: { items: TeamIndexItem[]; value: string; onPick: (cod: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // fechamento adiado no blur (para o clique na opção funcionar); cancelado se o campo voltar a ser usado
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const results = useMemo(() => {
    const n = norm(q.trim());
    const all = [{ cod_mun: STATE, nome: 'Bahia (estado inteiro)' } as TeamIndexItem, ...items];
    return (n ? all.filter((m) => norm(m.nome).includes(n)) : all).slice(0, 12);
  }, [q, items]);
  const current = value === STATE ? 'Bahia' : items.find((m) => m.cod_mun === value)?.nome ?? value;
  const pick = (cod: string) => { onPick(cod); setQ(''); setOpen(false); inputRef.current?.blur(); };
  return (
    <label className="campo busca">
      <span>Local</span>
      <input ref={inputRef} type="search" role="combobox" aria-expanded={open} aria-controls={listId}
             aria-autocomplete="list" aria-activedescendant={open && results[active] ? `${listId}-${results[active].cod_mun}` : undefined}
             placeholder={current} value={q} data-testid="busca-municipio"
             onChange={(e) => { cancelClose(); setQ(e.target.value); setOpen(true); setActive(0); }}
             onFocus={() => { cancelClose(); setOpen(true); }}
             onBlur={() => { cancelClose(); closeTimer.current = window.setTimeout(() => setOpen(false), 150); }}
             onKeyDown={(e) => {
               if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
               else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
               else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active].cod_mun); }
               else if (e.key === 'Escape') setOpen(false);
             }} />
      {open && (
        <ul id={listId} role="listbox" aria-label="Municípios encontrados">
          {results.length ? results.map((m, i) => (
            <li key={m.cod_mun} id={`${listId}-${m.cod_mun}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(m.cod_mun); }}>{m.nome}</li>
          )) : <li className="vazio" role="option" aria-selected={false} aria-disabled>Nenhum município com esse nome.</li>}
        </ul>
      )}
    </label>
  );
}

const years = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);

/** Gaveta no celular: as opções de métrica só afetam a seção de sensores e o modo "Por sensor" do mapa. */
const METRIC_OPTIONS: { id: MetricId; label: string }[] = [
  { id: 'dias_celula_g10', label: 'Dias-célula (10 km)' },
  { id: 'dias_celula_g5', label: 'Dias-célula (5 km)' },
  { id: 'deteccoes', label: 'Detecções (focos)' },
  { id: 'dias_com_deteccao', label: 'Dias com detecção' },
];

export function FilterBar({ id, filters, dispatch, items, onExport, exportDisabled, hasSensors, onReset, open, onClose }: {
  id: string; filters: Filters; dispatch: (a: FilterAction) => void; items: TeamIndexItem[];
  onExport: () => void; exportDisabled: boolean; hasSensors: boolean;
  onReset: () => void; open: boolean; onClose: () => void;
}) {
  return (
    <form id={id} className={`filtros${open ? ' aberta' : ''}`} aria-label="Filtros compartilhados por mapa, calendários, gráficos e exportação"
          onSubmit={(e) => e.preventDefault()} onKeyDown={(e) => { if (e.key === 'Escape' && open) onClose(); }}>
      <SearchBox items={items} value={filters.region} onPick={(cod) => { dispatch({ type: 'region', region: cod }); onClose(); }} />
      <fieldset className="campo">
        <legend>Período</legend>
        <div className="linha-campos">
          <select aria-label="Ano inicial" value={filters.yearFrom} data-testid="ano-inicial"
                  onChange={(e) => dispatch({ type: 'period', yearFrom: Number(e.target.value), yearTo: filters.yearTo })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span aria-hidden="true">a</span>
          <select aria-label="Ano final" value={filters.yearTo} data-testid="ano-final"
                  onChange={(e) => dispatch({ type: 'period', yearFrom: filters.yearFrom, yearTo: Number(e.target.value) })}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </fieldset>
      <fieldset className="campo">
        <legend>Visão</legend>
        <div className="segmentos" role="group" aria-label="Visão">
          <button type="button" aria-pressed={filters.view === 'original' && !filters.split} onClick={() => dispatch({ type: 'view', view: 'original' })}>
            Originais</button>
          <button type="button" aria-pressed={filters.view === 'harmonizado' && !filters.split} disabled={!hasSensors}
                  onClick={() => dispatch({ type: 'view', view: 'harmonizado' })}>Harmonizado</button>
        </div>
      </fieldset>
      <fieldset className="campo">
        <legend>Sensor</legend>
        <div className="segmentos" role="group" aria-label="Sensor">
          {([['ambos', 'Ambos'], ['MODIS_AQUA', 'MODIS/Aqua'], ['VIIRS_NOAA20', 'VIIRS/NOAA-20']] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filters.sensor === id} disabled={!hasSensors}
                    onClick={() => dispatch({ type: 'sensor', sensor: id })}>{label}</button>
          ))}
        </div>
      </fieldset>
      <label className="campo">
        <span>Métrica por sensor</span>
        <select value={filters.metric} disabled={!hasSensors} data-testid="metrica"
                onChange={(e) => dispatch({ type: 'metric', metric: e.target.value as MetricId })}>
          {METRIC_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <div className="acoes-filtros">
        <button type="button" className="botao-fantasma" onClick={onReset} data-testid="restaurar-filtros">Restaurar filtros</button>
        <button type="button" className="botao-acao" onClick={onExport} disabled={exportDisabled} data-testid="exportar-csv">
          Exportar CSV
        </button>
        <button type="button" className="botao-fantasma fechar-gaveta" onClick={onClose}>Ver resultados</button>
      </div>
    </form>
  );
}
