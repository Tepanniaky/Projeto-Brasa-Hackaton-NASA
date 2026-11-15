/**
 * BRASA, redesign 1a "Mesa de análise": tela única, mapa dominante com a série anual como seletor
 * de período, painel com abas (Ano corrente · Calendário · Sensores · Método).
 * Filtros únicos espelhados na URL; tema escuro/claro por tokens CSS.
 */
import { type KeyboardEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DataError, loadDataset, loadTeamCalendar } from '../data/loaders';
import type { Dataset, TeamCalendar } from '../data/types';
import { buildRows, csvFileName, toCsv } from '../domain/csv';
import { type Filters, filtersFromSearch, filtersReducer, filtersToSearch, STATE, type Tab, YEAR_MAX, YEAR_MIN } from '../domain/filters';
import { AnnualChart } from './charts/AnnualChart';
import { FilterBar } from './FilterBar';
import { MapView } from './MapView';
import { MethodPanel } from './MethodPanel';
import { CalendarTab, CurrentYearTab, NoFireState, PlaceHeader } from './PlacePanel';
import { SensorSection } from './SensorSection';
import { applyTheme, initialTheme, type Theme } from './theme';

type Load<T> = { status: 'carregando' } | { status: 'erro'; message: string } | { status: 'pronto'; data: T };

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumo', label: 'Ano corrente' },
  { id: 'cal', label: 'Calendário' },
  { id: 'sens', label: 'Sensores' },
  { id: 'met', label: 'Método' },
];

const fmtDate = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');

function Header({ status, theme, onTheme, onMethod }: {
  status: { kind: 'real' | 'sintetico' | 'carregando' | 'erro'; text: string };
  theme: Theme; onTheme: () => void; onMethod: () => void;
}) {
  return (
    <header className="topo">
      <a className="marca" href="./" aria-label="BRASA, página inicial">
        <svg className="marca-logo" viewBox="150 130 1860 490" role="img" aria-label="BRASA">
          <image href={`${import.meta.env.BASE_URL}logo-brasa.png`} width="2172" height="724" />
        </svg>
      </a>
      <span className="marca-sub">Calendário do fogo na Bahia</span>
      <span className="marca-equipe">OPP Team · NASA Space Apps 2026</span>
      <span className="cresce" />
      <span className="status" data-tipo={status.kind} data-testid="status-dados" title={status.text}><i /><span>{status.text}</span></span>
      <button type="button" className="botao-topo texto" onClick={onMethod}>Metodologia e fontes</button>
      <button type="button" className="botao-topo" onClick={onTheme}
              aria-label={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'} title="Alternar tema claro/escuro">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ display: 'block' }}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
        </svg>
      </button>
    </header>
  );
}

function Skeleton() {
  return (
    <>
      <div className="esqueleto" style={{ height: 44, width: '50%', marginBottom: 14 }} />
      <div className="esqueleto" style={{ height: 70, marginBottom: 14 }} />
      <div className="esqueleto" style={{ height: 260, marginBottom: 14 }} />
      <p className="nota" role="status">Carregando calendário, municípios e registros por sensor…</p>
    </>
  );
}

export function App() {
  const [ds, setDs] = useState<Load<Dataset>>({ status: 'carregando' });
  const [filters, dispatch] = useReducer(filtersReducer, undefined, () => {
    const f = filtersFromSearch(window.location.search);
    return window.location.hash === '#metodologia' ? { ...f, tab: 'met' as Tab } : f;
  });
  const [cal, setCal] = useState<Load<TeamCalendar>>({ status: 'carregando' });
  const [lastCal, setLastCal] = useState<TeamCalendar | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    let alive = true;
    setDs({ status: 'carregando' });
    loadDataset()
      .then((data) => {
        if (!alive) return;
        setDs({ status: 'pronto', data });
        const valid = new Set([STATE, ...data.teamIndex.map((m) => m.cod_mun)]);
        if (!valid.has(filters.region)) dispatch({ type: 'region', region: STATE });
      })
      .catch((e: unknown) => alive && setDs({ status: 'erro', message: e instanceof DataError ? e.message : String(e) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    let alive = true;
    setCal({ status: 'carregando' });
    loadTeamCalendar(filters.region)
      .then((c) => { if (alive) { setCal({ status: 'pronto', data: c }); setLastCal(c); } })
      .catch((e: unknown) => alive && setCal({ status: 'erro', message: e instanceof Error ? e.message : String(e) }));
    return () => { alive = false; };
  }, [filters.region]);

  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${filtersToSearch(filters)}`);
  }, [filters]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const data = ds.status === 'pronto' ? ds.data : null;
  const kind = data?.sensors?.manifest.dataset_kind ?? (data ? 'real' : null);
  const synthetic = kind !== null && kind !== 'real';
  const currentCal = cal.status === 'pronto' ? cal.data : null;
  const panelCal = currentCal ?? lastCal;

  const onExport = useCallback(() => {
    if (!data) return;
    const rows = buildRows(data, filters, currentCal);
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = csvFileName(filters, currentCal?.nome ?? filters.region);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, [data, filters, currentCal]);

  const items = useMemo(() => (data ? [...data.teamIndex].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : []), [data]);
  const regionName = (f: Filters) => (f.region === STATE ? 'Bahia' : items.find((m) => m.cod_mun === f.region)?.nome ?? f.region);

  const toggleTheme = () => {
    const t: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(t);              // antes do render: o mapa relê os tokens do CSS
    setTheme(t);
  };
  const goTab = (tab: Tab) => {
    dispatch({ type: 'tab', tab });
    panelRef.current?.scrollTo({ top: 0 });
  };
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.id === filters.tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    goTab(next);
    tabRefs.current[next]?.focus();
  };
  const onYear = (y: number) => dispatch(filters.yearFrom === y && filters.yearTo === y
    ? { type: 'period', yearFrom: YEAR_MIN, yearTo: YEAR_MAX } : { type: 'period', yearFrom: y, yearTo: y });
  const back = () => dispatch({ type: 'region', region: STATE });

  const status = ds.status === 'carregando'
    ? { kind: 'carregando' as const, text: 'Carregando fontes' }
    : ds.status === 'erro' ? { kind: 'erro' as const, text: 'Falha ao carregar' }
    : synthetic ? { kind: 'sintetico' as const, text: 'Dados de demonstração — sintéticos' }
    : { kind: 'real' as const, text: `Dados reais · NASA FIRMS + IBGE · série até ${fmtDate(data?.teamState.dados_ate)}` };

  const period = filters.yearFrom === filters.yearTo ? `${filters.yearFrom}` : `${filters.yearFrom}–${filters.yearTo}`;
  const splitWide = filters.split && filters.tab === 'sens';

  let tabBody: React.ReactNode = null;
  if (data) {
    if (filters.tab === 'sens') tabBody = <SensorSection ds={data} filters={filters} dispatch={dispatch} />;
    else if (filters.tab === 'met') tabBody = <MethodPanel ds={data} />;
    else if (cal.status === 'erro') {
      tabBody = (
        <div className="estado estado-erro" role="alert">
          <h2>Calendário deste local indisponível</h2><p>{cal.message}</p>
          <button type="button" className="botao-sec" onClick={back}>Voltar para a Bahia</button>
        </div>
      );
    } else if (panelCal) {
      tabBody = panelCal.resumo.media_anual === 0 ? <NoFireState cal={panelCal} onBack={back} />
        : filters.tab === 'cal' ? <CalendarTab cal={panelCal} filters={filters} onYear={onYear} />
        : <CurrentYearTab cal={panelCal} />;
    }
  }

  return (
    <div className="app">
      {synthetic && <div className="faixa-sintetica" role="status" data-testid="faixa-sintetica">Dados de demonstração — sintéticos. Não use estes números como resultado.</div>}
      <Header status={status} theme={theme} onTheme={toggleTheme} onMethod={() => { goTab('met'); setDrawer(false); }} />

      {ds.status !== 'pronto' && (
        <main className="principal">
          <section className="coluna-mapa" aria-label="Mapa dos municípios da Bahia"><div className="mapa-area" /></section>
          <div className="painel">
            {ds.status === 'carregando' ? <Skeleton /> : (
              <div className="estado estado-erro" role="alert" data-testid="erro-carga">
                <h2>Não foi possível abrir os dados</h2>
                <p>{ds.message}</p>
                <p className="nota">Se estiver rodando localmente, confira se as pastas <code>public/api</code> e <code>public/data/real</code> existem (veja o README).</p>
                <button type="button" className="botao-sec" onClick={() => setAttempt((a) => a + 1)}>Tentar de novo</button>
              </div>
            )}
          </div>
        </main>
      )}

      {data && (
        <>
          <button type="button" className="resumo-filtros" aria-controls="filtros" aria-expanded={drawer} onClick={() => setDrawer((o) => !o)}>
            <span>{regionName(filters)} · {period} · {filters.split ? 'Lado a lado' : filters.view === 'original' ? 'Originais' : 'Harmonizado'}</span>
            <b>Filtros</b>
          </button>
          <FilterBar id="filtros" filters={filters} dispatch={dispatch} items={items} onExport={onExport}
                     exportDisabled={!currentCal && !data.sensors} hasSensors={!!data.sensors}
                     onReset={() => { dispatch({ type: 'reset' }); setToast('Filtros restaurados.'); }}
                     open={drawer} onClose={() => setDrawer(false)} />
          <main className={`principal${splitWide ? ' lado-a-lado' : ''}`}>
            <MapView ds={data} filters={filters} theme={theme} onSelect={(cod) => dispatch({ type: 'region', region: cod })}
                     onMapMode={(m) => dispatch({ type: 'mapMode', mapMode: m })}>
              <AnnualChart cal={panelCal ?? data.teamState} yearFrom={filters.yearFrom} yearTo={filters.yearTo}
                           onRange={(a, b) => dispatch({ type: 'period', yearFrom: a, yearTo: b })} />
            </MapView>
            <div className="painel" ref={panelRef} aria-busy={cal.status === 'carregando'}>
              <div className={cal.status === 'carregando' && panelCal ? 'atualizando' : undefined}>
                {panelCal ? <PlaceHeader cal={panelCal} filters={filters} onBack={back} /> : <Skeleton />}
              </div>
              <div className="abas" role="tablist" aria-label="Seções da análise" onKeyDown={onTabKey}>
                {TABS.map((t) => (
                  <button key={t.id} type="button" role="tab" id={`aba-${t.id}`} aria-selected={filters.tab === t.id}
                          aria-controls="painel-aba" tabIndex={filters.tab === t.id ? 0 : -1}
                          ref={(el) => { tabRefs.current[t.id] = el; }} onClick={() => goTab(t.id)}>{t.label}</button>
                ))}
              </div>
              <div id="painel-aba" role="tabpanel" aria-labelledby={`aba-${filters.tab}`} aria-live="polite"
                   className={cal.status === 'carregando' && filters.tab !== 'sens' && filters.tab !== 'met' ? 'atualizando' : undefined}>
                {tabBody}
              </div>
              <footer className="rodape">
                BRASA, da OPP Team, para o NASA Space Apps Challenge 2026 (desafio Harmonization of MODIS and VIIRS Hot Spots).
                Dados: NASA FIRMS/LANCE (MODIS C6/C6.1 MCD14ML, VIIRS C2 VJ114IMGML) e IBGE. Mapa de fundo: OpenFreeMap, © OpenStreetMap.
              </footer>
            </div>
          </main>
        </>
      )}
      {toast && <div className="aviso-flutuante" role="status">{toast}</div>}
    </div>
  );
}
