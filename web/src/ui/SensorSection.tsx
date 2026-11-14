/**
 * "Estamos vendo mais fogo ou enxergando melhor?": camada B (registros originais por
 * sensor) e a harmonização experimental, com a auditoria da série da equipe.
 */
import { useMemo } from 'react';
import type { Dataset, MetricId, SensorId } from '../data/types';
import { monthCells, monthsWithGap } from '../domain/calendar';
import { adjustmentSummary, auditSentences, driftSentence, evaluationVerdict } from '../domain/explain';
import { type FilterAction, type Filters, sensorsFor } from '../domain/filters';
import { fmt1, fmtInt, fmtMonth, fmtSignedPct } from '../domain/format';
import { harmonizedSlice, monthMatrix, monthRange, slice, sum } from '../domain/series';
import { TableToggle } from './charts/common';
import { MonthCalendar } from './charts/MonthCalendar';
import { type LineSeries, TimeChart } from './charts/TimeChart';

const SENSOR_STYLE: Record<SensorId, { color: string; label: string; marker: 'circle' | 'square' }> = {
  MODIS_AQUA: { color: 'var(--modis)', label: 'MODIS/Aqua', marker: 'circle' },
  VIIRS_NOAA20: { color: 'var(--viirs)', label: 'VIIRS/NOAA-20', marker: 'square' },
};

export function SensorSection({ ds, filters, dispatch }: { ds: Dataset; filters: Filters; dispatch: (a: FilterAction) => void }) {
  const s = ds.sensors;
  const region = s?.monthly.regioes[filters.region];
  const range = s ? monthRange(s.monthly.meses, filters.yearFrom, filters.yearTo) : null;

  const content = useMemo(() => {
    if (!s || !region || !range) return null;
    const meses = slice(s.monthly.meses, range);
    const metricMeta = s.manifest.metricas.find((m) => m.id === filters.metric);
    const gapMonths = monthsWithGap(meses.map((m) => Number(m.slice(0, 4))).filter((v, i, a) => a.indexOf(v) === i),
      s.manifest.indisponibilidades.filter((g) => g.sensor === 'MODIS_AQUA'));
    const gapIdx = meses.map((m, i) => (gapMonths.has(m) ? i : -1)).filter((i) => i >= 0);
    return { meses, metricMeta, gapIdx, gapMonths };
  }, [s, region, range?.i0, range?.i1, filters.metric]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) {
    return (
      <section className="secao" aria-labelledby="sec-sensores">
        <h2 id="sec-sensores">Mais fogo ou só enxergando melhor?</h2>
        <div className="estado estado-erro" role="alert">
          <h2>Dados por sensor indisponíveis</h2>
          <p>{ds.sensorsError ?? 'A camada de registros por sensor não foi publicada.'} O calendário da equipe continua disponível acima.</p>
          <p>Para gerar esses dados, rode o pipeline: <code>python -m brasa.cli build --dataset real</code> (veja o README).</p>
        </div>
      </section>
    );
  }
  if (!range) {
    return (
      <section className="secao" aria-labelledby="sec-sensores">
        <h2 id="sec-sensores">Mais fogo ou só enxergando melhor?</h2>
        <div className="estado">
          <h2>O período escolhido não tem dados por sensor</h2>
          <p>Os registros originais MODIS e VIIRS processados pelo BRASA cobrem {s.manifest.periodo.inicio.slice(0, 4)} a {s.manifest.periodo.fim.slice(0, 4)}.</p>
          <button type="button" className="botao-sec" onClick={() => dispatch({ type: 'period', yearFrom: 2020, yearTo: 2025 })}>
            Mostrar 2020–2025</button>
        </div>
      </section>
    );
  }
  if (!region || !content) {
    return (
      <section className="secao"><div className="estado"><h2>Local sem dados por sensor</h2>
        <p>Este código de município não aparece na série processada.</p></div></section>
    );
  }

  const { meses, metricMeta, gapIdx, gapMonths } = content;
  const sensors = sensorsFor(filters.sensor);
  const metric: MetricId = filters.metric;
  const unit = metricMeta?.rotulo.toLowerCase() ?? metric;
  const totals = Object.fromEntries(sensors.map((id) => [id, sum(slice(region.series[id][metric], range))])) as Record<SensorId, number>;
  const anyData = sensors.some((id) => totals[id] > 0);
  const tickFor = (m: string, i: number) => (m.endsWith('-01') || (i === 0 && meses.length < 13) ? (meses.length <= 12 ? fmtMonth(m) : m.slice(0, 4)) : null);
  const harmonized = filters.view === 'harmonizado';
  const grid = filters.grid;
  const cellMetric = `dias_celula_${grid}` as MetricId;

  const originalSeries: LineSeries[] = sensors.map((id) => ({
    id, label: SENSOR_STYLE[id].label, color: SENSOR_STYLE[id].color, marker: SENSOR_STYLE[id].marker,
    values: slice(region.series[id][metric], range),
  }));

  const h = harmonizedSlice(region, grid, range);
  const adj = adjustmentSummary(region, grid, range, s.harmonization);
  const harmSeries: LineSeries[] = [
    { id: 'modis', label: 'MODIS/Aqua', color: 'var(--modis)', marker: 'circle', values: slice(region.series.MODIS_AQUA[cellMetric], range) },
    { id: 'viirs-bruto', label: 'VIIRS bruto', color: 'var(--viirs)', marker: 'none', dashed: true, faded: true, values: slice(region.series.VIIRS_NOAA20[cellMetric], range) },
    ...(h ? [{ id: 'viirs-aj', label: 'VIIRS ajustado', color: 'var(--viirs)', marker: 'square' as const, values: h.estimate }] : []),
  ];
  const yearIdx = (y: number) => meses.findIndex((m) => Number(m.slice(0, 4)) === y);
  const lastIdx = (y: number) => meses.map((m) => Number(m.slice(0, 4))).lastIndexOf(y);
  const trainYears = s.harmonization.anos_ajuste.filter((y) => yearIdx(y) >= 0);
  const evalYears = s.harmonization.anos_avaliacao.filter((y) => yearIdx(y) >= 0);
  const shade = [
    ...(trainYears.length ? [{ from: yearIdx(trainYears[0]), to: lastIdx(trainYears[trainYears.length - 1]), label: 'anos de ajuste' }] : []),
  ];
  const isState = filters.region === '29';
  const verdict = evaluationVerdict(s.harmonization, grid, isState ? 'estado_mes' : 'municipio_ano');
  const audit = s.audit?.regioes[filters.region];
  const auditText = auditSentences(audit, region.nome);
  const drift = driftSentence(s.manifest);
  const periodo = range.yearFrom === range.yearTo ? `${range.yearFrom}` : `${range.yearFrom}–${range.yearTo}`;

  return (
    <section className="secao" aria-labelledby="sec-sensores" data-testid="secao-sensores">
      <div className="secao-topo">
        <div>
          <h2 id="sec-sensores">Mais fogo ou só enxergando melhor?</h2>
          <p className="secao-sub">
            {harmonized
              ? `O que muda após o ajuste: VIIRS/NOAA-20 convertido para a escala do MODIS/Aqua, em ${grid === 'g10' ? 'dias-célula de 10 km' : 'dias-célula de 5 km'}, ${periodo}. Experimental.`
              : `Registros originais FIRMS de cada sensor, ${periodo}, lado a lado e nunca somados. Métrica: ${unit}.`}
          </p>
        </div>
      </div>
      {range.clamped && (
        <p className="nota-alerta">Os dados por sensor cobrem só 2020–2025. Esta seção mostra {periodo}; o calendário da equipe acima continua no período completo escolhido.</p>
      )}
      {gapIdx.length > 0 && (
        <p className="nota">Faixas hachuradas: o Aqua teve falha de telemetria de 16/08 a 02/09/2020 e a cobertura MODIS foi parcial nesses meses.</p>
      )}

      {!harmonized && (
        <>
          {!anyData ? (
            <div className="estado" data-testid="sem-registros">
              <h2>Nenhuma detecção no recorte</h2>
              <p>Nenhum sensor selecionado registrou detecção em {region.nome} em {periodo}. Isso não comprova ausência de fogo: nuvens, fumaça, fogo pequeno ou fora do horário da passagem podem não ser detectados.</p>
            </div>
          ) : (
            <>
              <TimeChart labels={meses} series={originalSeries} gaps={sensors.includes('MODIS_AQUA') ? gapIdx : []}
                         yLabel={metricMeta?.rotulo ?? metric} formatX={fmtMonth} tickFor={tickFor}
                         ariaLabel={`Série mensal de ${unit} por sensor em ${region.nome}`} />
              <div className="explicacao" data-testid="explicacao-original">
                {sensors.length === 2 && totals.MODIS_AQUA > 0 && (
                  <p>Em {periodo}, o VIIRS/NOAA-20 registrou <strong>{fmtInt(totals.VIIRS_NOAA20)}</strong> {unit} e o MODIS/Aqua <strong>{fmtInt(totals.MODIS_AQUA)}</strong>: {fmt1(totals.VIIRS_NOAA20 / totals.MODIS_AQUA)} vezes mais. Os dois passam por volta das 13h30, mas o pixel do VIIRS (375 m) enxerga focos menores que o do MODIS (1 km).</p>
                )}
                {sensors.length === 1 && <p>{SENSOR_STYLE[sensors[0]].label}: <strong>{fmtInt(totals[sensors[0]])}</strong> {unit} em {periodo}.</p>}
                <p className="nota">{metricMeta?.descricao}</p>
              </div>
              <div className="duas-colunas" style={{ marginTop: 12 }}>
                {sensors.map((id) => {
                  const vals = slice(region.series[id][metric], range);
                  const mm = monthMatrix(vals, meses);
                  const max = Math.max(0, ...vals);
                  const gaps = id === 'MODIS_AQUA' ? s.manifest.indisponibilidades.filter((g) => g.sensor === id) : [];
                  return (
                    <MonthCalendar key={id} title={`${SENSOR_STYLE[id].label} (escala própria)`} color={SENSOR_STYLE[id].color}
                                   years={mm.years} cells={monthCells(mm.rows, mm.years, gaps, max)} unit={unit}
                                   testId={`calendario-mensal-${id}`} />
                  );
                })}
              </div>
              <p className="nota">Cada calendário usa a escala do próprio sensor, para comparar a sazonalidade e não o volume. {gapMonths.size ? 'Meses com falha de cobertura do Aqua: ' + [...gapMonths].map(fmtMonth).join(', ') + '.' : ''}</p>
              <TableToggle label="valores mensais por sensor">
                <table className="dados">
                  <thead><tr><th>Mês</th>{sensors.map((id) => <th key={id}>{SENSOR_STYLE[id].label}</th>)}</tr></thead>
                  <tbody>{meses.map((m, i) => (
                    <tr key={m} className={gapMonths.has(m) ? 'marcado' : ''}><td>{fmtMonth(m)}{gapMonths.has(m) ? ' ⚠' : ''}</td>
                      {sensors.map((id) => <td key={id}>{fmtInt(slice(region.series[id][metric], range)[i])}</td>)}</tr>
                  ))}</tbody>
                </table>
              </TableToggle>
            </>
          )}
        </>
      )}

      {harmonized && (
        <>
          {s.harmonization.status !== 'ok' || !h ? (
            <div className="estado"><h2>Ajuste indisponível</h2><p>O pipeline não encontrou dados suficientes para ajustar o modelo. Nada é extrapolado.</p></div>
          ) : (
            <>
              <div className="numeros-ajuste" data-testid="numeros-ajuste">
                <div style={{ borderTopColor: 'var(--modis)' }}><div className="valor">{fmtInt(adj.modis)}</div><div className="rotulo">MODIS/Aqua observado (referência)</div></div>
                <div style={{ borderTopColor: 'var(--viirs)' }}><div className="valor">{fmtInt(adj.viirs)}</div><div className="rotulo">VIIRS/NOAA-20 bruto</div></div>
                <div style={{ borderTopColor: 'var(--viirs)' }}><div className="valor">{adj.adjusted === null ? '—' : fmtInt(adj.adjusted)}</div>
                  <div className="rotulo">VIIRS ajustado{adj.adjustedLo !== null && adj.adjustedHi !== null ? ` (${fmtInt(adj.adjustedLo)}–${fmtInt(adj.adjustedHi)})` : ''}</div></div>
                <div style={{ borderTopColor: 'var(--carvao)' }}><div className="valor">{adj.adjustedDiff === null ? '—' : fmtSignedPct(adj.adjustedDiff)}</div>
                  <div className="rotulo">Ajustado em relação ao MODIS</div></div>
              </div>
              <TimeChart labels={meses} series={harmSeries} band={{ lo: h.lo, hi: h.hi, color: 'var(--viirs)', label: 'Intervalo aprox. 90 %' }}
                         shade={shade} gaps={gapIdx} yLabel={grid === 'g10' ? 'dias-célula (10 km)' : 'dias-célula (5 km)'}
                         formatX={fmtMonth} tickFor={tickFor} ariaLabel={`MODIS observado e VIIRS ajustado em ${region.nome}`} />
              <ul className="legenda-linha">
                <li><span className="chave-faixa" style={{ background: '#efe9df' }} /> Anos de ajuste ({s.harmonization.anos_ajuste.join(', ')}); os demais são de avaliação ({evalYears.join(', ') || 'fora do período'})</li>
                <li><span className="chave-faixa" style={{ background: 'var(--viirs)', opacity: 0.25 }} /> Intervalo aproximado de 90 %, que subestima a incerteza (ver metodologia)</li>
              </ul>
              <div className="explicacao" data-testid="o-que-muda">
                <h3 style={{ marginTop: 0 }}>O que muda após o ajuste?</h3>
                {adj.sentences.map((t) => <p key={t}>{t}</p>)}
                {verdict.map((t) => <p key={t} className={t.startsWith('Em ') ? 'nota' : ''}>{t}</p>)}
                <p className="nota">A avaliação acima vale para o conjunto {isState ? 'do estado' : 'dos 417 municípios'}, não só para {region.nome}.</p>
              </div>
            </>
          )}
        </>
      )}

      {(auditText.length > 0 || drift) && (
        <div className="explicacao" style={{ borderLeftColor: 'var(--brasa)' }} data-testid="auditoria">
          <h3 style={{ marginTop: 0 }}>A série da equipe confere com o que o MODIS viu?</h3>
          {auditText.map((t) => <p key={t}>{t}</p>)}
          {drift && <p>{drift}</p>}
          {audit && (
            <TableToggle label="série da equipe × MODIS observado">
              <table className="dados">
                <thead><tr><th>Ano</th><th>Equipe</th><th>Faixa publicada</th><th>MODIS Terra+Aqua observado</th><th>Diferença</th><th>Origem na equipe</th></tr></thead>
                <tbody>{audit.comparacao_anual.map((c) => (
                  <tr key={c.ano} className={!c.observado_dentro_da_faixa && c.ano >= 2022 ? 'marcado' : ''}>
                    <td>{c.ano}</td><td>{fmt1(c.equipe)}</td><td>{fmt1(c.equipe_min)}–{fmt1(c.equipe_max)}</td>
                    <td>{fmtInt(c.modis_ta_observado)}</td>
                    <td>{c.diferenca_relativa === null ? '—' : fmtSignedPct(c.diferenca_relativa)}</td><td>{c.origem_equipe}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableToggle>
          )}
        </div>
      )}
    </section>
  );
}
