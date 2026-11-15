/** Painel do local (camada A): cabeçalho com avisos compactos, aba "Ano corrente" e aba "Calendário". */
import type { TeamCalendar } from '../data/types';
import { criticalPeriodText, criticalRange, currentYearHeadline, rankText } from '../domain/explain';
import type { Filters } from '../domain/filters';
import { fmtDayMonth, fmtInt, fmtPct, fmtPeriod } from '../domain/format';
import { tr } from '../i18n/lang';
import { CurrentYearChart } from './charts/CurrentYearChart';
import { WeekCalendar } from './charts/WeekCalendar';

const unit = () => tr('detecções harmonizadas (equiv. MODIS)', 'harmonized detections (MODIS equiv.)');

/**
 * Os quatro avisos obrigatórios (fonte, unidade, limitação, método), em chips e uma nota,
 * para não empurrar o conteúdo para baixo. Nenhum deles foi removido.
 */
export function RequiredNotices({ period }: { period: string }) {
  return (
    <div className="avisos" data-testid="avisos">
      <div className="chips">
        <span className="chip"><b>{period}</b></span>
        <span className="chip">{tr('Fonte', 'Source')}: <b>NASA FIRMS (MODIS C6.1 {tr('e', 'and')} VIIRS 375 m) · IBGE</b></span>
        <span className="chip">{tr('Unidade', 'Unit')}: <b>{unit()}</b></span>
        <span className="chip destaque-chip"
              title={tr('Até 2021 a série usa o MODIS observado; a partir de 2022 usa o VIIRS convertido para a mesma escala, porque as órbitas dos satélites do MODIS entraram em deriva.',
                        'Through 2021 the series uses observed MODIS; from 2022 on it uses VIIRS converted to the same scale, because the orbits of the MODIS satellites began to drift.')}>
          {tr('Observado até 2021', 'Observed through 2021')} · <b>{tr('estimativa desde 2022', 'estimated since 2022')}</b> ⓘ</span>
      </div>
      <p className="nota">
        {tr('Uma detecção é uma observação do satélite, não um incêndio individual, e não mede área queimada. Padrão histórico e condições incomuns. Não é previsão de incêndio. Nuvens podem ocultar focos.',
            'A detection is a satellite observation, not an individual wildfire, and it does not measure burned area. Historical pattern and unusual conditions. Not a fire forecast. Clouds can hide fires.')}
      </p>
    </div>
  );
}

export function PlaceHeader({ cal, filters, onBack }: { cal: TeamCalendar; filters: Filters; onBack: () => void }) {
  const isState = cal.cod_mun === '29';
  const period = fmtPeriod(filters.yearFrom, filters.yearTo);
  return (
    <>
      <div className="local-cabecalho">
        <h1 className="local-nome" data-testid="nome-local">{cal.nome}</h1>
        {!isState && <button type="button" className="botao-sec" onClick={onBack}>{tr('Voltar para a Bahia', 'Back to Bahia')}</button>}
      </div>
      <p className="local-contexto">
        {isState ? tr('Estado da Bahia, 417 municípios.', 'State of Bahia, Brazil, 417 municipalities.')
          : tr(`Município da Bahia, código IBGE ${cal.cod_mun}.`, `Municipality in Bahia, IBGE code ${cal.cod_mun}.`)} {criticalPeriodText(cal)}
      </p>
      <RequiredNotices period={period} />
    </>
  );
}

export function NoFireState({ cal, onBack }: { cal: TeamCalendar; onBack: () => void }) {
  return (
    <section className="secao">
      <div className="estado" data-testid="sem-registros-equipe">
        <h2>{tr('Nenhuma detecção no histórico', 'No detections on record')}</h2>
        <p>{tr(`A série da equipe não registra detecções de ${cal.linha_de_base[0]} a hoje em ${cal.nome}. Isso não comprova que nunca houve fogo: focos pequenos, nuvens e o horário das passagens limitam a detecção.`,
               `The team series has no detections from ${cal.linha_de_base[0]} to date in ${cal.nome}. This does not prove there was never any fire: small fires, clouds and overpass timing limit detection.`)}</p>
        {cal.cod_mun !== '29' && <button type="button" className="botao-sec" onClick={onBack}>{tr('Voltar para a Bahia', 'Back to Bahia')}</button>}
      </div>
    </section>
  );
}

export function CurrentYearTab({ cal }: { cal: TeamCalendar }) {
  const head = currentYearHeadline(cal);
  const a = cal.ano_atual;
  const pc = cal.periodo_critico;
  const week = fmtDayMonth(cal.semanas[a.ultima_semana_completa]);
  return (
    <section className="secao" aria-labelledby="sec-ano">
      <span className="rotulo-secao">{tr('1 · O ano corrente', '1 · The current year')}</span>
      <h2 id="sec-ano">{tr(`${a.ano} está fora do normal?`, `Is ${a.ano} out of the ordinary?`)}</h2>
      <p className="destaque" data-tom={head.tone} data-testid="numero-destaque">{head.text}</p>
      <p className="nota" style={{ marginBottom: 8 }}>
        {tr(`Acumulado até a semana de ${week}: ${fmtInt(a.acumulado)}, contra a mediana histórica de ${fmtInt(a.mediana_historica_ate_a_data)} até a mesma data. Posição no histórico: ${a.posicao_no_historico}.`,
            `Cumulative through the week of ${week}: ${fmtInt(a.acumulado)}, versus a historical median of ${fmtInt(a.mediana_historica_ate_a_data)} by the same date. Rank on record: ${rankText(a.posicao_no_historico)}.`)}
      </p>
      <CurrentYearChart cal={cal} />
      <dl className="resumo" data-testid="cartoes-resumo">
        <div><dt>{tr('Média anual', 'Annual mean')}</dt><dd>{fmtInt(cal.resumo.media_anual)}<small>{unit()}</small></dd></div>
        <div><dt>{tr('Ano de maior atividade', 'Most active year')}</dt><dd>{cal.resumo.ano_maximo}</dd></div>
        <div><dt>{tr('Semana de pico', 'Peak week')}</dt><dd>{fmtDayMonth(cal.resumo.semana_pico)}<small>{tr('semana que começa nessa data', 'week starting on this date')}</small></dd></div>
        <div><dt>{tr('Período crítico', 'Critical period')}</dt><dd>{pc ? criticalRange(pc) : '—'}
          <small>{pc ? tr(`${pc.n_semanas} semanas, ${fmtPct(pc.fracao_da_atividade)} da atividade`, `${pc.n_semanas} weeks, ${fmtPct(pc.fracao_da_atividade)} of activity`)
            : tr('sem concentração', 'no concentration')}</small></dd></div>
      </dl>
    </section>
  );
}

export function CalendarTab({ cal, filters, onYear }: { cal: TeamCalendar; filters: Filters; onYear: (y: number) => void }) {
  return (
    <section className="secao" aria-labelledby="sec-cal">
      <span className="rotulo-secao">{tr('2 · Sazonalidade e recorrência', '2 · Seasonality and recurrence')}</span>
      <h2 id="sec-cal">{tr('Quando costuma queimar?', 'When does it usually burn?')}</h2>
      <p className="secao-sub">
        {tr(`Cada linha é um ano, cada coluna uma semana. Período: ${filters.yearFrom}–${filters.yearTo}. Clique em um ano para isolá-lo; clique de novo para voltar ao período completo.`,
            `Each row is a year, each column a week. Period: ${filters.yearFrom}–${filters.yearTo}. Click a year to isolate it; click again to return to the full period.`)}
      </p>
      <WeekCalendar cal={cal} yearFrom={filters.yearFrom} yearTo={filters.yearTo} onYear={onYear} />
    </section>
  );
}
