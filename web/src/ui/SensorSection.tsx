/**
 * "Estamos vendo mais fogo ou enxergando melhor?": camada B (registros originais por
 * sensor) e a harmonização experimental, com a auditoria da série da equipe.
 */
import { useMemo } from 'react';
import type { Dataset, MetricId, SensorId } from '../data/types';
import { monthCells, monthsWithGap } from '../domain/calendar';
import { adjustmentSummary, auditSentences, driftSentence, evaluationVerdict } from '../domain/explain';
import { type FilterAction, type Filters, sensorsFor } from '../domain/filters';
import { fmt1, fmtInt, fmtMonth, fmtPeriod, fmtSignedPct } from '../domain/format';
import { harmonizedSlice, monthMatrix, monthRange, slice, sum } from '../domain/series';
import { dataText } from '../i18n/dataText';
import { getLang, tr } from '../i18n/lang';
import { niceMax, TableToggle } from './charts/common';
import { MonthCalendar } from './charts/MonthCalendar';
import { type LineSeries, TimeChart } from './charts/TimeChart';

const SENSOR_STYLE: Record<SensorId, { color: string; label: string; marker: 'circle' | 'square' }> = {
  MODIS_AQUA: { color: 'var(--modis)', label: 'MODIS/Aqua', marker: 'circle' },
  VIIRS_NOAA20: { color: 'var(--viirs)', label: 'VIIRS/NOAA-20', marker: 'square' },
};

function Title() {
  return (
    <>
      <span className="rotulo-secao">{tr('3 · Comparação entre sensores', '3 · Sensor comparison')}</span>
      <h2 id="sec-sensores">{tr('Mais fogo ou só enxergando melhor?', 'More fire, or just seeing better?')}</h2>
    </>
  );
}

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
        <Title />
        <div className="estado estado-erro" role="alert">
          <h2>{tr('Dados por sensor indisponíveis', 'Sensor data unavailable')}</h2>
          <p>{ds.sensorsError ?? tr('A camada de registros por sensor não foi publicada.', 'The sensor records layer has not been published.')}{' '}
            {tr('O calendário da equipe continua disponível acima.', 'The team calendar is still available above.')}</p>
          <p className="nota">{tr('Para gerar esses dados, rode o pipeline:', 'To generate these data, run the pipeline:')} <code>python -m brasa.cli build --dataset real</code> {tr('(veja o README).', '(see the README).')}</p>
        </div>
      </section>
    );
  }
  if (!range) {
    return (
      <section className="secao" aria-labelledby="sec-sensores">
        <Title />
        <div className="estado">
          <h2>{tr('O período escolhido não tem dados por sensor', 'The selected period has no sensor data')}</h2>
          <p>{tr(`Os registros originais MODIS e VIIRS processados pelo BRASA cobrem ${s.manifest.periodo.inicio.slice(0, 4)} a ${s.manifest.periodo.fim.slice(0, 4)}.`,
                 `The original MODIS and VIIRS records processed by BRASA cover ${s.manifest.periodo.inicio.slice(0, 4)} to ${s.manifest.periodo.fim.slice(0, 4)}.`)}</p>
          <button type="button" className="botao-sec" onClick={() => dispatch({ type: 'period', yearFrom: 2020, yearTo: 2025 })}>
            {tr('Mostrar 2020–2025', 'Show 2020–2025')}</button>
        </div>
      </section>
    );
  }
  if (!region || !content) {
    return (
      <section className="secao"><Title /><div className="estado"><h2>{tr('Local sem dados por sensor', 'No sensor data for this place')}</h2>
        <p>{tr('Este código de município não aparece na série processada.', 'This municipality code does not appear in the processed series.')}</p></div></section>
    );
  }

  const { meses, metricMeta, gapIdx, gapMonths } = content;
  const sensors = sensorsFor(filters.sensor);
  const metric: MetricId = filters.metric;
  const metricLabel = dataText(metricMeta?.rotulo) || metric;
  // em português a unidade aparece no meio da frase em minúsculas; em inglês "cell-days" já é minúsculo
  const unit = getLang() === 'en' ? metricLabel.replace(/^(\w)/, (c) => c.toLowerCase()) : metricLabel.toLowerCase();
  const totals = Object.fromEntries(sensors.map((id) => [id, sum(slice(region.series[id][metric], range))])) as Record<SensorId, number>;
  const anyData = sensors.some((id) => totals[id] > 0);
  const tickFor = (m: string, i: number) => (m.endsWith('-01') || (i === 0 && meses.length < 13) ? (meses.length <= 12 ? fmtMonth(m) : m.slice(0, 4)) : null);
  const harmonized = filters.view === 'harmonizado';
  const grid = filters.grid;
  const cellMetric = `dias_celula_${grid}` as MetricId;
  const rawLabel = tr('VIIRS bruto', 'Raw VIIRS');
  const adjLabel = tr('VIIRS ajustado', 'Adjusted VIIRS');
  const bandLabel = tr('Intervalo aprox. 90 %', 'Approx. 90% interval');

  const originalSeries: LineSeries[] = sensors.map((id) => ({
    id, label: SENSOR_STYLE[id].label, color: SENSOR_STYLE[id].color, marker: SENSOR_STYLE[id].marker,
    values: slice(region.series[id][metric], range),
  }));

  const h = harmonizedSlice(region, grid, range);
  const adj = adjustmentSummary(region, grid, range, s.harmonization);
  const harmSeries: LineSeries[] = [
    { id: 'modis', label: 'MODIS/Aqua', color: 'var(--modis)', marker: 'circle', values: slice(region.series.MODIS_AQUA[cellMetric], range) },
    { id: 'viirs-bruto', label: rawLabel, color: 'var(--viirs)', marker: 'none', dashed: true, faded: true, values: slice(region.series.VIIRS_NOAA20[cellMetric], range) },
    ...(h ? [{ id: 'viirs-aj', label: adjLabel, color: 'var(--viirs)', marker: 'square' as const, values: h.estimate }] : []),
  ];
  const yearIdx = (y: number) => meses.findIndex((m) => Number(m.slice(0, 4)) === y);
  const lastIdx = (y: number) => meses.map((m) => Number(m.slice(0, 4))).lastIndexOf(y);
  const trainYears = s.harmonization.anos_ajuste.filter((y) => yearIdx(y) >= 0);
  const evalYears = s.harmonization.anos_avaliacao.filter((y) => yearIdx(y) >= 0);
  const shade = [
    ...(trainYears.length ? [{ from: yearIdx(trainYears[0]), to: lastIdx(trainYears[trainYears.length - 1]), label: tr('anos de ajuste', 'fitting years') }] : []),
  ];
  const isState = filters.region === '29';
  const split = filters.split;
  const km = grid === 'g10' ? 10 : 5;
  const cellUnit = tr(`dias-célula (${km} km)`, `cell-days (${km} km)`);
  const splitOriginal: LineSeries[] = [
    harmSeries[0],
    { id: 'viirs-orig', label: rawLabel, color: 'var(--viirs)', marker: 'square', values: harmSeries[1].values },
  ];
  const splitAdjusted: LineSeries[] = [harmSeries[0], ...harmSeries.slice(2)];
  const splitMax = niceMax(Math.max(1, ...harmSeries.flatMap((x) => x.values.filter((v): v is number => v !== null)), ...(h ? h.hi : [])) * 1.05);
  const verdict = evaluationVerdict(s.harmonization, grid, isState ? 'estado_mes' : 'municipio_ano');
  const audit = s.audit?.regioes[filters.region];
  const auditText = auditSentences(audit, region.nome);
  const drift = driftSentence(s.manifest);
  const periodo = fmtPeriod(range.yearFrom, range.yearTo);

  return (
    <section className="secao" aria-labelledby="sec-sensores" data-testid="secao-sensores">
      <Title />
      <p className="secao-sub">
        {harmonized || split
          ? tr(`VIIRS/NOAA-20 convertido para a escala do MODIS/Aqua, em ${cellUnit}, ${periodo}. Experimental.`,
               `VIIRS/NOAA-20 converted to the MODIS/Aqua scale, in ${cellUnit}, ${periodo}. Experimental.`)
          : tr(`Registros originais FIRMS de cada sensor, ${periodo}, nunca somados. Métrica: ${unit}.`,
               `Original FIRMS records for each sensor, ${periodo}, never added together. Metric: ${unit}.`)}
      </p>
      <div className="secao-topo">
        <div className="segmentos na-superficie" role="group" aria-label={tr('Comparar visões', 'Compare views')} data-testid="comparador">
          <button type="button" aria-pressed={!harmonized && !split} onClick={() => dispatch({ type: 'view', view: 'original' })}>{tr('Originais', 'Original')}</button>
          <button type="button" aria-pressed={harmonized && !split} onClick={() => dispatch({ type: 'view', view: 'harmonizado' })}>{tr('Após o ajuste', 'After adjustment')}</button>
          <button type="button" aria-pressed={split} onClick={() => dispatch({ type: 'split', split: true })}>{tr('Lado a lado', 'Side by side')}</button>
        </div>
        {s.manifest.dataset_kind !== 'real' && <span className="chip destaque-chip">{tr('Dados de demonstração — sintéticos', 'Demo data — synthetic')}</span>}
      </div>
      {range.clamped && (
        <p className="nota-alerta">{tr(`Os dados por sensor cobrem só 2020–2025. Esta seção mostra ${periodo}; o calendário da equipe acima continua no período completo escolhido.`,
                                       `Sensor data cover only 2020–2025. This section shows ${periodo}; the team calendar above still uses the full selected period.`)}</p>
      )}
      {gapIdx.length > 0 && (
        <p className="nota">{tr('Faixas hachuradas: o Aqua teve falha de telemetria de 16/08 a 02/09/2020 e a cobertura MODIS foi parcial nesses meses.',
                                'Hatched bands: Aqua had a telemetry failure from Aug 16 to Sep 2, 2020, and MODIS coverage was partial in those months.')}</p>
      )}

      {!harmonized && !split && (
        <>
          {!anyData ? (
            <div className="estado" data-testid="sem-registros">
              <h2>{tr('Nenhuma detecção no recorte', 'No detections in this selection')}</h2>
              <p>{tr(`Nenhum sensor selecionado registrou detecção em ${region.nome} em ${periodo}. Isso não comprova ausência de fogo: nuvens, fumaça, fogo pequeno ou fora do horário da passagem podem não ser detectados.`,
                     `None of the selected sensors recorded a detection in ${region.nome} in ${periodo}. This does not prove there was no fire: clouds, smoke, small fires or fires outside the overpass time may go undetected.`)}</p>
            </div>
          ) : (
            <>
              <TimeChart labels={meses} series={originalSeries} gaps={sensors.includes('MODIS_AQUA') ? gapIdx : []}
                         yLabel={metricLabel} formatX={fmtMonth} tickFor={tickFor}
                         ariaLabel={tr(`Série mensal de ${unit} por sensor em ${region.nome}`, `Monthly series of ${unit} by sensor in ${region.nome}`)} />
              <div className="explicacao" data-testid="explicacao-original">
                {sensors.length === 2 && totals.MODIS_AQUA > 0 && (
                  <p>{tr(<>Em {periodo}, o VIIRS/NOAA-20 registrou <strong>{fmtInt(totals.VIIRS_NOAA20)}</strong> {unit} e o MODIS/Aqua <strong>{fmtInt(totals.MODIS_AQUA)}</strong>: {fmt1(totals.VIIRS_NOAA20 / totals.MODIS_AQUA)} vezes mais. Os dois passam no início da tarde, mas o pixel do VIIRS (375 m) enxerga focos menores que o do MODIS (1 km).</>,
                         <>In {periodo}, VIIRS/NOAA-20 recorded <strong>{fmtInt(totals.VIIRS_NOAA20)}</strong> {unit} and MODIS/Aqua <strong>{fmtInt(totals.MODIS_AQUA)}</strong>: {fmt1(totals.VIIRS_NOAA20 / totals.MODIS_AQUA)} times more. Both pass in the early afternoon, but the VIIRS pixel (375 m) sees smaller fires than the MODIS pixel (1 km).</>)}</p>
                )}
                {sensors.length === 1 && <p>{SENSOR_STYLE[sensors[0]].label}: <strong>{fmtInt(totals[sensors[0]])}</strong> {unit} {tr('em', 'in')} {periodo}.</p>}
                <p className="nota">{dataText(metricMeta?.descricao)}</p>
              </div>
              <div className="duas-colunas" style={{ marginTop: 12 }}>
                {sensors.map((id) => {
                  const vals = slice(region.series[id][metric], range);
                  const mm = monthMatrix(vals, meses);
                  const max = Math.max(0, ...vals);
                  const gaps = id === 'MODIS_AQUA' ? s.manifest.indisponibilidades.filter((g) => g.sensor === id) : [];
                  return (
                    <MonthCalendar key={id} title={`${SENSOR_STYLE[id].label} ${tr('(escala própria)', '(own scale)')}`} color={SENSOR_STYLE[id].color}
                                   years={mm.years} cells={monthCells(mm.rows, mm.years, gaps, max)} unit={unit}
                                   testId={`calendario-mensal-${id}`} />
                  );
                })}
              </div>
              <p className="nota">{tr('Cada calendário usa a escala do próprio sensor, para comparar a sazonalidade e não o volume.', "Each calendar uses its own sensor's scale, to compare seasonality rather than volume.")}{' '}
                {gapMonths.size ? `${tr('Meses com falha de cobertura do Aqua', 'Months with Aqua coverage gaps')}: ${[...gapMonths].map(fmtMonth).join(', ')}.` : ''}</p>
              <TableToggle label={tr('valores mensais por sensor', 'monthly values by sensor')}>
                <table className="dados">
                  <thead><tr><th>{tr('Mês', 'Month')}</th>{sensors.map((id) => <th key={id}>{SENSOR_STYLE[id].label}</th>)}</tr></thead>
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

      {(harmonized || split) && (
        <>
          {s.harmonization.status !== 'ok' || !h ? (
            <div className="estado estado-aviso" data-testid="sem-harmonizacao">
              <h2>◌ {tr('Harmonização ainda não calculada', 'Harmonization not computed yet')}</h2>
              <p>{tr(`O pipeline não encontrou dados suficientes para ajustar o modelo (status: ${s.harmonization.status}). Nada é extrapolado; os registros originais continuam disponíveis.`,
                     `The pipeline did not find enough data to fit the model (status: ${s.harmonization.status}). Nothing is extrapolated; the original records remain available.`)}</p>
              <button type="button" className="botao-sec" onClick={() => dispatch({ type: 'view', view: 'original' })}>{tr('Ver registros originais', 'See original records')}</button>
            </div>
          ) : (
            <>
              <div className="numeros-ajuste" data-testid="numeros-ajuste">
                <div style={{ borderTopColor: 'var(--modis)' }}><div className="valor">{fmtInt(adj.modis)}</div><div className="rotulo">{tr('MODIS/Aqua observado (referência)', 'MODIS/Aqua observed (reference)')}</div></div>
                <div style={{ borderTopColor: 'var(--viirs)' }}><div className="valor">{fmtInt(adj.viirs)}</div><div className="rotulo">{tr('VIIRS/NOAA-20 bruto', 'VIIRS/NOAA-20 raw')}</div></div>
                <div style={{ borderTopColor: 'var(--viirs)' }}><div className="valor">{adj.adjusted === null ? '—' : fmtInt(adj.adjusted)}</div>
                  <div className="rotulo">{adjLabel}{adj.adjustedLo !== null && adj.adjustedHi !== null ? ` (${fmtInt(adj.adjustedLo)}–${fmtInt(adj.adjustedHi)})` : ''}</div></div>
                <div style={{ borderTopColor: 'var(--tinta)' }}><div className="valor">{adj.adjustedDiff === null ? '—' : fmtSignedPct(adj.adjustedDiff)}</div>
                  <div className="rotulo">{tr('Ajustado em relação ao MODIS', 'Adjusted relative to MODIS')}</div></div>
              </div>
              {split ? (
                <>
                  <div className="duas-colunas fixas" data-testid="lado-a-lado">
                    <div><h4>{tr('Registros originais', 'Original records')}</h4>
                      <TimeChart compact labels={meses} series={splitOriginal} gaps={gapIdx} yMax={splitMax} yLabel={cellUnit}
                                 formatX={fmtMonth} tickFor={tickFor} height={230} ariaLabel={tr(`Registros originais em ${region.nome}`, `Original records in ${region.nome}`)} /></div>
                    <div><h4>{tr('Após o ajuste (estimativa)', 'After adjustment (estimate)')}</h4>
                      <TimeChart compact labels={meses} series={splitAdjusted} band={{ lo: h.lo, hi: h.hi, color: 'var(--viirs)', label: bandLabel }}
                                 shade={shade} gaps={gapIdx} yMax={splitMax} yLabel={cellUnit}
                                 formatX={fmtMonth} tickFor={tickFor} height={230} ariaLabel={tr(`MODIS observado e VIIRS ajustado em ${region.nome}`, `Observed MODIS and adjusted VIIRS in ${region.nome}`)} /></div>
                  </div>
                  <p className="nota">{tr('Mesma unidade e mesma escala vertical nos dois painéis, para não exagerar o efeito do ajuste.', 'Same unit and same vertical scale in both panels, so as not to exaggerate the effect of the adjustment.')}</p>
                </>
              ) : (
                <TimeChart labels={meses} series={harmSeries} band={{ lo: h.lo, hi: h.hi, color: 'var(--viirs)', label: bandLabel }}
                           shade={shade} gaps={gapIdx} yLabel={cellUnit}
                           formatX={fmtMonth} tickFor={tickFor} ariaLabel={tr(`MODIS observado e VIIRS ajustado em ${region.nome}`, `Observed MODIS and adjusted VIIRS in ${region.nome}`)} />
              )}
              <ul className="legenda-linha">
                <li><span className="chave-faixa" style={{ background: 'var(--superficie-2)', border: '1px solid var(--linha)' }} />{' '}
                  {tr(`Anos de ajuste (${s.harmonization.anos_ajuste.join(', ')}); os demais são de avaliação (${evalYears.join(', ') || 'fora do período'})`,
                      `Fitting years (${s.harmonization.anos_ajuste.join(', ')}); the others are evaluation years (${evalYears.join(', ') || 'outside the period'})`)}</li>
                <li><span className="chave-faixa" style={{ background: 'var(--viirs)', opacity: 0.25 }} />{' '}
                  {tr('Intervalo aproximado de 90 %, que subestima a incerteza (ver metodologia)', 'Approximate 90% interval, which underestimates the uncertainty (see methodology)')}</li>
              </ul>
              <div className="explicacao" data-testid="o-que-muda">
                <h3 style={{ marginTop: 0 }}>{tr('O que muda após o ajuste?', 'What changes after the adjustment?')}</h3>
                {adj.sentences.map((t) => <p key={t}>{t}</p>)}
                {verdict.map((v) => <p key={v.text} className={v.note ? 'nota' : ''}>{v.text}</p>)}
                <p className="nota">{isState
                  ? tr(`A avaliação acima vale para o conjunto do estado, não só para ${region.nome}.`, `The evaluation above applies to the state as a whole, not only to ${region.nome}.`)
                  : tr(`A avaliação acima vale para o conjunto dos 417 municípios, não só para ${region.nome}.`, `The evaluation above applies to all 417 municipalities together, not only to ${region.nome}.`)}</p>
              </div>
            </>
          )}
        </>
      )}

      {(auditText.length > 0 || drift) && (
        <div className="explicacao" style={{ borderLeftColor: 'var(--brasa)' }} data-testid="auditoria">
          <h3 style={{ marginTop: 0 }}>{tr('A série da equipe confere com o que o MODIS viu?', 'Does the team series match what MODIS saw?')}</h3>
          {auditText.map((t) => <p key={t}>{t}</p>)}
          {drift && <p>{drift}</p>}
          {audit && (
            <TableToggle label={tr('série da equipe × MODIS observado', 'team series × observed MODIS')}>
              <table className="dados">
                <thead><tr><th>{tr('Ano', 'Year')}</th><th>{tr('Equipe', 'Team')}</th><th>{tr('Faixa publicada', 'Published band')}</th>
                  <th>{tr('MODIS Terra+Aqua observado', 'Observed MODIS Terra+Aqua')}</th><th>{tr('Diferença', 'Difference')}</th><th>{tr('Origem na equipe', 'Team source')}</th></tr></thead>
                <tbody>{audit.comparacao_anual.map((c) => (
                  <tr key={c.ano} className={!c.observado_dentro_da_faixa && c.ano >= 2022 ? 'marcado' : ''}>
                    <td>{c.ano}</td><td>{fmt1(c.equipe)}</td><td>{fmt1(c.equipe_min)}–{fmt1(c.equipe_max)}</td>
                    <td>{fmtInt(c.modis_ta_observado)}</td>
                    <td>{c.diferenca_relativa === null ? '—' : fmtSignedPct(c.diferenca_relativa)}</td><td>{dataText(c.origem_equipe)}</td>
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
