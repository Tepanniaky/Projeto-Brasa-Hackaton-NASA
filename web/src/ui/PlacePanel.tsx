/** Painel do local (camada A): cabeçalho com avisos compactos, aba "Ano corrente" e aba "Calendário". */
import type { TeamCalendar } from '../data/types';
import { criticalPeriodText, currentYearHeadline } from '../domain/explain';
import type { Filters } from '../domain/filters';
import { fmtInt, fmtPct } from '../domain/format';
import { CurrentYearChart } from './charts/CurrentYearChart';
import { WeekCalendar } from './charts/WeekCalendar';

const UNIT = 'detecções harmonizadas (equiv. MODIS)';

/**
 * Os quatro avisos obrigatórios (fonte, unidade, limitação, método), em chips e uma nota,
 * para não empurrar o conteúdo para baixo. Nenhum deles foi removido.
 */
export function RequiredNotices({ period }: { period: string }) {
  return (
    <div className="avisos" data-testid="avisos">
      <div className="chips">
        <span className="chip"><b>{period}</b></span>
        <span className="chip">Fonte: <b>NASA FIRMS (MODIS C6.1 e VIIRS 375 m) · IBGE</b></span>
        <span className="chip">Unidade: <b>{UNIT}</b></span>
        <span className="chip destaque-chip"
              title="Até 2021 a série usa o MODIS observado; a partir de 2022 usa o VIIRS convertido para a mesma escala, porque as órbitas dos satélites do MODIS entraram em deriva.">
          Observado até 2021 · <b>estimativa desde 2022</b> ⓘ</span>
      </div>
      <p className="nota">
        Uma detecção é uma observação do satélite, não um incêndio individual, e não mede área queimada.
        Padrão histórico e condições incomuns. Não é previsão de incêndio. Nuvens podem ocultar focos.
      </p>
    </div>
  );
}

export function PlaceHeader({ cal, filters, onBack }: { cal: TeamCalendar; filters: Filters; onBack: () => void }) {
  const isState = cal.cod_mun === '29';
  const period = filters.yearFrom === filters.yearTo ? `${filters.yearFrom}` : `${filters.yearFrom}–${filters.yearTo}`;
  return (
    <>
      <div className="local-cabecalho">
        <h1 className="local-nome" data-testid="nome-local">{cal.nome}</h1>
        {!isState && <button type="button" className="botao-sec" onClick={onBack}>Voltar para a Bahia</button>}
      </div>
      <p className="local-contexto">
        {isState ? 'Estado da Bahia, 417 municípios.' : `Município da Bahia, código IBGE ${cal.cod_mun}.`} {criticalPeriodText(cal)}
      </p>
      <RequiredNotices period={period} />
    </>
  );
}

export function NoFireState({ cal, onBack }: { cal: TeamCalendar; onBack: () => void }) {
  return (
    <section className="secao">
      <div className="estado" data-testid="sem-registros-equipe">
        <h2>Nenhuma detecção no histórico</h2>
        <p>A série da equipe não registra detecções de {cal.linha_de_base[0]} a hoje em {cal.nome}. Isso não comprova que nunca houve fogo: focos pequenos, nuvens e o horário das passagens limitam a detecção.</p>
        {cal.cod_mun !== '29' && <button type="button" className="botao-sec" onClick={onBack}>Voltar para a Bahia</button>}
      </div>
    </section>
  );
}

export function CurrentYearTab({ cal }: { cal: TeamCalendar }) {
  const head = currentYearHeadline(cal);
  const a = cal.ano_atual;
  const pc = cal.periodo_critico;
  return (
    <section className="secao" aria-labelledby="sec-ano">
      <span className="rotulo-secao">1 · O ano corrente</span>
      <h2 id="sec-ano">{a.ano} está fora do normal?</h2>
      <p className="destaque" data-tom={head.tone} data-testid="numero-destaque">{head.text}</p>
      <p className="nota" style={{ marginBottom: 8 }}>Acumulado até a semana de {cal.semanas[a.ultima_semana_completa]}: {fmtInt(a.acumulado)}, contra a mediana histórica de {fmtInt(a.mediana_historica_ate_a_data)} até a mesma data. Posição no histórico: {a.posicao_no_historico}.</p>
      <CurrentYearChart cal={cal} />
      <dl className="resumo" data-testid="cartoes-resumo">
        <div><dt>Média anual</dt><dd>{fmtInt(cal.resumo.media_anual)}<small>{UNIT}</small></dd></div>
        <div><dt>Ano de maior atividade</dt><dd>{cal.resumo.ano_maximo}</dd></div>
        <div><dt>Semana de pico</dt><dd>{cal.resumo.semana_pico}<small>semana que começa nessa data</small></dd></div>
        <div><dt>Período crítico</dt><dd>{pc ? `${pc.inicio}–${pc.fim}` : '—'}
          <small>{pc ? `${pc.n_semanas} semanas, ${fmtPct(pc.fracao_da_atividade)} da atividade` : 'sem concentração'}</small></dd></div>
      </dl>
    </section>
  );
}

export function CalendarTab({ cal, filters, onYear }: { cal: TeamCalendar; filters: Filters; onYear: (y: number) => void }) {
  return (
    <section className="secao" aria-labelledby="sec-cal">
      <span className="rotulo-secao">2 · Sazonalidade e recorrência</span>
      <h2 id="sec-cal">Quando costuma queimar?</h2>
      <p className="secao-sub">Cada linha é um ano, cada coluna uma semana. Período: {filters.yearFrom}–{filters.yearTo}. Clique em um ano para isolá-lo; clique de novo para voltar ao período completo.</p>
      <WeekCalendar cal={cal} yearFrom={filters.yearFrom} yearTo={filters.yearTo} onYear={onYear} />
    </section>
  );
}
