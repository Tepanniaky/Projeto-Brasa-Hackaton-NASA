/**
 * BRASA, redesign 1a "Mesa de análise": tela única, mapa dominante com a série anual como seletor
 * de período, painel com abas (Ano corrente · Calendário · Sensores · Método).
 * Filtros únicos espelhados na URL; tema escuro/claro por tokens CSS; português/inglês (src/i18n).
 */
import { type KeyboardEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DataError, loadDataset, loadTeamCalendar } from '../data/loaders';
import type { Dataset, TeamCalendar } from '../data/types';
import { buildRows, csvFileName, toCsv } from '../domain/csv';
import { type Filters, filtersFromSearch, filtersReducer, filtersToSearch, STATE, type Tab, YEAR_MAX, YEAR_MIN } from '../domain/filters';
import { fmtIsoDate, fmtPeriod } from '../domain/format';
import { type Lang, LANGS, locale, searchWithLang, setLang, tr, useLang } from '../i18n/lang';
import { AnnualChart } from './charts/AnnualChart';
import { FilterBar } from './FilterBar';
import { MapView } from './MapView';
import { MethodPanel } from './MethodPanel';
import { CalendarTab, CurrentYearTab, NoFireState, PlaceHeader } from './PlacePanel';
import { SensorSection } from './SensorSection';
import { applyTheme, initialTheme, type Theme } from './theme';

type Load<T> = { status: 'carregando' } | { status: 'erro'; message: string } | { status: 'pronto'; data: T };

const TABS: { id: Tab; label: [string, string] }[] = [
  { id: 'resumo', label: ['Ano corrente', 'Current year'] },
  { id: 'cal', label: ['Calendário', 'Calendar'] },
  { id: 'sens', label: ['Sensores', 'Sensors'] },
  { id: 'met', label: ['Método', 'Method'] },
];

/**
 * Seletor de idioma sempre visível (também no celular): dois botões "PT | EN" com o nome
 * completo do idioma no título e no leitor de tela, cada um no próprio idioma.
 */
const LANG_NAME: Record<Lang, string> = { pt: 'Português', en: 'English' };
function LangSwitch({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  return (
    <div className="idioma" role="group" aria-label="Idioma / Language" data-testid="seletor-idioma">
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.5 8h13M8 1.5c-2.2 2.4-2.2 10.6 0 13M8 1.5c2.2 2.4 2.2 10.6 0 13" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      {LANGS.map((l) => (
        <button key={l} type="button" lang={locale(l)} aria-pressed={lang === l} title={LANG_NAME[l]}
                aria-label={LANG_NAME[l]} data-testid={`idioma-${l}`} onClick={() => onLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function Header({ status, theme, onTheme, onMethod, lang, onLang }: {
  status: { kind: 'real' | 'sintetico' | 'carregando' | 'erro'; text: string };
  theme: Theme; onTheme: () => void; onMethod: () => void; lang: Lang; onLang: (l: Lang) => void;
}) {
  return (
    <header className="topo">
      <a className="marca" href={`./${searchWithLang('')}`} aria-label={tr('BRASA, página inicial', 'BRASA, home page')}>
        <svg className="marca-logo" viewBox="150 130 1860 490" role="img" aria-label="BRASA">
          <image href={`${import.meta.env.BASE_URL}logo-brasa.png`} width="2172" height="724" />
        </svg>
      </a>
      <span className="marca-sub">{tr('Calendário do fogo na Bahia', 'Fire calendar for Bahia, Brazil')}</span>
      <span className="marca-equipe">OPP Team · NASA Space Apps 2026</span>
      <span className="cresce" />
      <span className="status" data-tipo={status.kind} data-testid="status-dados" title={status.text}><i /><span>{status.text}</span></span>
      <button type="button" className="botao-topo texto" onClick={onMethod}>{tr('Metodologia e fontes', 'Methodology and sources')}</button>
      <LangSwitch lang={lang} onLang={onLang} />
      <button type="button" className="botao-topo" onClick={onTheme}
              aria-label={theme === 'dark' ? tr('Mudar para o tema claro', 'Switch to light theme') : tr('Mudar para o tema escuro', 'Switch to dark theme')}
              title={tr('Alternar tema claro/escuro', 'Toggle light/dark theme')}>
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
      <p className="nota" role="status">{tr('Carregando calendário, municípios e registros por sensor…', 'Loading calendar, municipalities and sensor records…')}</p>
    </>
  );
}

export function App() {
  const lang = useLang();
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
    window.history.replaceState(null, '', `${window.location.pathname}${searchWithLang(filtersToSearch(filters), lang)}`);
  }, [filters, lang]);

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

  // nomes de municípios são próprios (não se traduzem); a ordem segue as regras do português
  const items = useMemo(() => (data ? [...data.teamIndex].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : []), [data]);
  const regionName = (f: Filters) => (f.region === STATE ? 'Bahia' : items.find((m) => m.cod_mun === f.region)?.nome ?? f.region);

  const toggleTheme = () => {
    const t: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(t);              // antes do render: o mapa relê os tokens do CSS
    setTheme(t);
  };
  const changeLang = (l: Lang) => { if (l !== lang) setLang(l); };
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
    ? { kind: 'carregando' as const, text: tr('Carregando fontes', 'Loading sources') }
    : ds.status === 'erro' ? { kind: 'erro' as const, text: tr('Falha ao carregar', 'Failed to load') }
    : synthetic ? { kind: 'sintetico' as const, text: tr('Dados de demonstração — sintéticos', 'Demo data — synthetic') }
    : { kind: 'real' as const, text: tr(`Dados reais · NASA FIRMS + IBGE · série até ${fmtIsoDate(data?.teamState.dados_ate)}`,
                                        `Real data · NASA FIRMS + IBGE · series through ${fmtIsoDate(data?.teamState.dados_ate)}`) };

  const period = fmtPeriod(filters.yearFrom, filters.yearTo);
  const splitWide = filters.split && filters.tab === 'sens';

  let tabBody: React.ReactNode = null;
  if (data) {
    if (filters.tab === 'sens') tabBody = <SensorSection ds={data} filters={filters} dispatch={dispatch} />;
    else if (filters.tab === 'met') tabBody = <MethodPanel ds={data} />;
    else if (cal.status === 'erro') {
      tabBody = (
        <div className="estado estado-erro" role="alert">
          <h2>{tr('Calendário deste local indisponível', 'Calendar for this place is unavailable')}</h2><p>{cal.message}</p>
          <button type="button" className="botao-sec" onClick={back}>{tr('Voltar para a Bahia', 'Back to Bahia')}</button>
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
      {synthetic && <div className="faixa-sintetica" role="status" data-testid="faixa-sintetica">{tr('Dados de demonstração — sintéticos. Não use estes números como resultado.', 'Demo data — synthetic. Do not use these numbers as results.')}</div>}
      <Header status={status} theme={theme} onTheme={toggleTheme} onMethod={() => { goTab('met'); setDrawer(false); }}
              lang={lang} onLang={changeLang} />

      {ds.status !== 'pronto' && (
        <main className="principal">
          <section className="coluna-mapa" aria-label={tr('Mapa dos municípios da Bahia', 'Map of Bahia municipalities')}><div className="mapa-area" /></section>
          <div className="painel">
            {ds.status === 'carregando' ? <Skeleton /> : (
              <div className="estado estado-erro" role="alert" data-testid="erro-carga">
                <h2>{tr('Não foi possível abrir os dados', 'Could not open the data')}</h2>
                <p>{ds.message}</p>
                <p className="nota">{tr('Se estiver rodando localmente, confira se as pastas', 'If you are running locally, check that the folders')} <code>public/api</code> {tr('e', 'and')} <code>public/data/real</code> {tr('existem (veja o README).', 'exist (see the README).')}</p>
                <button type="button" className="botao-sec" onClick={() => setAttempt((a) => a + 1)}>{tr('Tentar de novo', 'Try again')}</button>
              </div>
            )}
          </div>
        </main>
      )}

      {data && (
        <>
          <button type="button" className="resumo-filtros" aria-controls="filtros" aria-expanded={drawer} onClick={() => setDrawer((o) => !o)}>
            <span>{regionName(filters)} · {period} · {filters.split ? tr('Lado a lado', 'Side by side') : filters.view === 'original' ? tr('Originais', 'Original') : tr('Harmonizado', 'Harmonized')}</span>
            <b>{tr('Filtros', 'Filters')}</b>
          </button>
          <FilterBar id="filtros" filters={filters} dispatch={dispatch} items={items} onExport={onExport}
                     exportDisabled={!currentCal && !data.sensors} hasSensors={!!data.sensors}
                     onReset={() => { dispatch({ type: 'reset' }); setToast(tr('Filtros restaurados.', 'Filters restored.')); }}
                     open={drawer} onClose={() => setDrawer(false)} />
          <main className={`principal${splitWide ? ' lado-a-lado' : ''}`}>
            <MapView ds={data} filters={filters} theme={theme} lang={lang} onSelect={(cod) => dispatch({ type: 'region', region: cod })}
                     onMapMode={(m) => dispatch({ type: 'mapMode', mapMode: m })}>
              <AnnualChart cal={panelCal ?? data.teamState} yearFrom={filters.yearFrom} yearTo={filters.yearTo}
                           onRange={(a, b) => dispatch({ type: 'period', yearFrom: a, yearTo: b })} />
            </MapView>
            <div className="painel" ref={panelRef} aria-busy={cal.status === 'carregando'}>
              <div className={cal.status === 'carregando' && panelCal ? 'atualizando' : undefined}>
                {panelCal ? <PlaceHeader cal={panelCal} filters={filters} onBack={back} /> : <Skeleton />}
              </div>
              <div className="abas" role="tablist" aria-label={tr('Seções da análise', 'Analysis sections')} onKeyDown={onTabKey}>
                {TABS.map((t) => (
                  <button key={t.id} type="button" role="tab" id={`aba-${t.id}`} aria-selected={filters.tab === t.id}
                          aria-controls="painel-aba" tabIndex={filters.tab === t.id ? 0 : -1}
                          ref={(el) => { tabRefs.current[t.id] = el; }} onClick={() => goTab(t.id)}>{tr(...t.label)}</button>
                ))}
              </div>
              <div id="painel-aba" role="tabpanel" aria-labelledby={`aba-${filters.tab}`} aria-live="polite"
                   className={cal.status === 'carregando' && filters.tab !== 'sens' && filters.tab !== 'met' ? 'atualizando' : undefined}>
                {tabBody}
              </div>
              <footer className="rodape">
                {tr('BRASA, da OPP Team, para o NASA Space Apps Challenge 2026 (desafio Harmonization of MODIS and VIIRS Hot Spots).',
                    'BRASA, by OPP Team, for the NASA Space Apps Challenge 2026 (Harmonization of MODIS and VIIRS Hot Spots challenge).')}{' '}
                {tr('Dados: NASA FIRMS/LANCE (MODIS C6/C6.1 MCD14ML, VIIRS C2 VJ114IMGML) e IBGE. Mapa de fundo: OpenFreeMap, © OpenStreetMap.',
                    'Data: NASA FIRMS/LANCE (MODIS C6/C6.1 MCD14ML, VIIRS C2 VJ114IMGML) and IBGE (Brazilian Institute of Geography and Statistics). Basemap: OpenFreeMap, © OpenStreetMap.')}
              </footer>
            </div>
          </main>
        </>
      )}
      {toast && <div className="aviso-flutuante" role="status">{toast}</div>}
    </div>
  );
}
