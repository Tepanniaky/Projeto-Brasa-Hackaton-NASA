import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { DataError, loadDataset, loadTeamCalendar } from '../data/loaders';
import type { Dataset, TeamCalendar } from '../data/types';
import { buildRows, csvFileName, toCsv } from '../domain/csv';
import { filtersFromSearch, filtersReducer, filtersToSearch, STATE } from '../domain/filters';
import { FilterBar } from './FilterBar';
import { MapView } from './MapView';
import { MethodPanel } from './MethodPanel';
import { PlacePanel } from './PlacePanel';
import { SensorSection } from './SensorSection';

type Load<T> = { status: 'carregando' } | { status: 'erro'; message: string } | { status: 'pronto'; data: T };

function Header({ kind }: { kind: string | null }) {
  return (
    <header className="topo">
      <a className="marca" href="./" aria-label="BRASA, página inicial">
        <span className="marca-nome">BRAS<span>A</span></span>
        <span className="marca-sub">Calendário do fogo na Bahia</span>
      </a>
      <div className="topo-fonte">
        {kind === 'real' ? 'Registros reais NASA FIRMS e malha IBGE' : kind ? 'Dados de demonstração' : 'Carregando fontes'}
        <br /><a href="#metodologia" style={{ color: 'var(--sobre-carvao-2)' }}>Metodologia e limitações</a>
      </div>
    </header>
  );
}

export function App() {
  const [ds, setDs] = useState<Load<Dataset>>({ status: 'carregando' });
  const [filters, dispatch] = useReducer(filtersReducer, undefined, () => filtersFromSearch(window.location.search));
  const [cal, setCal] = useState<Load<TeamCalendar>>({ status: 'carregando' });
  const [lastCal, setLastCal] = useState<TeamCalendar | null>(null);
  const [attempt, setAttempt] = useState(0);

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
    const url = `${window.location.pathname}${filtersToSearch(filters)}${window.location.hash}`;
    window.history.replaceState(null, '', url);
  }, [filters]);

  const data = ds.status === 'pronto' ? ds.data : null;
  const kind = data?.sensors?.manifest.dataset_kind ?? (data ? 'real' : null);
  const synthetic = kind !== null && kind !== 'real';
  const currentCal = cal.status === 'pronto' ? cal.data : null;

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

  const panelCal = currentCal ?? lastCal;
  const items = useMemo(() => (data ? [...data.teamIndex].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : []), [data]);

  return (
    <div className={synthetic ? 'com-faixa' : undefined}>
      {synthetic && <div className="faixa-sintetica" role="status" data-testid="faixa-sintetica">Dados de demonstração — sintéticos. Não use estes números como resultado.</div>}
      <Header kind={kind} />
      {ds.status === 'carregando' && <div className="estado" role="status"><span className="carregando">Carregando calendário, municípios e registros por sensor…</span></div>}
      {ds.status === 'erro' && (
        <div className="painel"><div className="estado estado-erro" role="alert" data-testid="erro-carga">
          <h2>Não foi possível abrir os dados</h2>
          <p>{ds.message}</p>
          <p>Se estiver rodando localmente, confira se as pastas <code>public/api</code> e <code>public/data/real</code> existem (veja o README).</p>
          <button type="button" className="botao-sec" onClick={() => setAttempt((a) => a + 1)}>Tentar de novo</button>
        </div></div>
      )}
      {data && (
        <>
          <FilterBar filters={filters} dispatch={dispatch} items={items} onExport={onExport}
                     exportDisabled={!currentCal && !data.sensors} hasSensors={!!data.sensors} />
          <main className="principal">
            <MapView ds={data} filters={filters} onSelect={(cod) => dispatch({ type: 'region', region: cod })}
                     onMapMode={(m) => dispatch({ type: 'mapMode', mapMode: m })} />
            <div className="painel" aria-live="polite" aria-busy={cal.status === 'carregando'}>
              {cal.status === 'erro' && (
                <div className="estado estado-erro" role="alert">
                  <h2>Calendário deste local indisponível</h2><p>{cal.message}</p>
                  <button type="button" className="botao-sec" onClick={() => dispatch({ type: 'region', region: STATE })}>Voltar para a Bahia</button>
                </div>
              )}
              {cal.status === 'carregando' && !panelCal && <div className="estado"><span className="carregando">Carregando calendário…</span></div>}
              {panelCal && cal.status !== 'erro' && (
                <div className={cal.status === 'carregando' ? 'atualizando' : ''}>
                  <PlacePanel cal={panelCal} filters={filters} onBack={() => dispatch({ type: 'region', region: STATE })} />
                </div>
              )}
              <SensorSection ds={data} filters={filters} dispatch={dispatch} />
              <MethodPanel ds={data} />
              <footer className="rodape">
                BRASA, da OPP Team, para o NASA Space Apps Challenge 2026 (desafio Harmonization of MODIS and VIIRS Hot Spots).
                Dados: NASA FIRMS/LANCE (MODIS C6/C6.1 MCD14ML, VIIRS C2 VJ114IMGML) e IBGE. Mapa de fundo: OpenFreeMap, © OpenStreetMap.
              </footer>
            </div>
          </main>
        </>
      )}
    </div>
  );
}
