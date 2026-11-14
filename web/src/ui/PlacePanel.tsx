/** Painel do local (camada A): cartões de resumo, ano corrente, calendário semanal e série anual. */
import type { TeamCalendar } from '../data/types';
import { criticalPeriodText, currentYearHeadline } from '../domain/explain';
import type { Filters } from '../domain/filters';
import { fmtInt } from '../domain/format';
import { AnnualChart } from './charts/AnnualChart';
import { CurrentYearChart } from './charts/CurrentYearChart';
import { WeekCalendar } from './charts/WeekCalendar';

export function RequiredNotices() {
  return (
    <div className="avisos-obrigatorios" data-testid="avisos">
      <p><strong>Fonte:</strong> Dados: NASA FIRMS (MODIS Collection 6.1 e VIIRS 375 m: S-NPP, NOAA-20, NOAA-21). Limites municipais: IBGE.</p>
      <p><strong>Unidade:</strong> Detecções harmonizadas (equivalente MODIS). Uma detecção é uma observação do satélite, não um incêndio individual.</p>
      <p><strong>Limitação:</strong> A ferramenta mostra padrões históricos e condições incomuns. Não é previsão de incêndio. Nuvens podem ocultar focos.</p>
      <p><strong>Método:</strong> Até 2021 a série usa o MODIS observado; a partir de 2022 usa o VIIRS convertido para a mesma escala, porque as órbitas dos satélites do MODIS entraram em deriva.</p>
    </div>
  );
}

export function PlacePanel({ cal, filters, onBack }: { cal: TeamCalendar; filters: Filters; onBack: () => void }) {
  const head = currentYearHeadline(cal);
  const isState = cal.cod_mun === '29';
  const noFire = cal.resumo.media_anual === 0;
  return (
    <>
      <div className="local-cabecalho">
        <h1 className="local-nome" data-testid="nome-local">{cal.nome}</h1>
        {!isState && <button type="button" className="botao-sec" onClick={onBack}>Voltar para a Bahia</button>}
      </div>
      <p className="local-contexto">
        {isState ? 'Bahia, 417 municípios.' : `Município da Bahia, código IBGE ${cal.cod_mun}.`} {criticalPeriodText(cal)}
      </p>
      <RequiredNotices />

      {noFire ? (
        <div className="secao estado" data-testid="sem-registros-equipe">
          <h2>Nenhuma detecção no histórico</h2>
          <p>A série da equipe não registra detecções de {cal.linha_de_base[0]} a hoje em {cal.nome}. Isso não comprova que nunca houve fogo: focos pequenos, nuvens e o horário das passagens limitam a detecção.</p>
        </div>
      ) : (
        <>
          <dl className="resumo" data-testid="cartoes-resumo">
            <div><dt>Média anual</dt><dd>{fmtInt(cal.resumo.media_anual)}<small>detecções harmonizadas</small></dd></div>
            <div><dt>Ano de maior atividade</dt><dd>{cal.resumo.ano_maximo}</dd></div>
            <div><dt>Semana de pico</dt><dd>{cal.resumo.semana_pico}<small>semana que começa nessa data</small></dd></div>
            <div><dt>Período crítico</dt><dd>{cal.periodo_critico ? `${cal.periodo_critico.inicio}–${cal.periodo_critico.fim}` : '—'}
              <small>{cal.periodo_critico ? `${Math.round(cal.periodo_critico.fracao_da_atividade * 100)} % da atividade` : 'sem concentração'}</small></dd></div>
          </dl>

          <section className="secao" aria-labelledby="sec-ano">
            <h2 id="sec-ano">{cal.ano_atual.ano} comparado ao normal</h2>
            <p className="destaque" data-tom={head.tone} data-testid="numero-destaque">{head.text}</p>
            <p className="nota">Acumulado até a semana de {cal.semanas[cal.ano_atual.ultima_semana_completa]}: {fmtInt(cal.ano_atual.acumulado)}, contra a mediana histórica de {fmtInt(cal.ano_atual.mediana_historica_ate_a_data)} até a mesma data. Posição no histórico: {cal.ano_atual.posicao_no_historico}.</p>
            <CurrentYearChart cal={cal} />
          </section>

          <section className="secao" aria-labelledby="sec-cal">
            <h2 id="sec-cal">Quando costuma queimar</h2>
            <p className="secao-sub">Cada linha é um ano, cada coluna uma semana. Período escolhido: {filters.yearFrom}–{filters.yearTo}.</p>
            <WeekCalendar cal={cal} yearFrom={filters.yearFrom} yearTo={filters.yearTo} />
          </section>

          <section className="secao" aria-labelledby="sec-anual">
            <h2 id="sec-anual">Total por ano</h2>
            <p className="secao-sub">A faixa a partir de 2022 é a incerteza da conversão VIIRS → MODIS informada pela equipe (5 % a 95 %). Ela não inclui outras fontes de erro: veja a auditoria abaixo.</p>
            <AnnualChart cal={cal} yearFrom={filters.yearFrom} yearTo={filters.yearTo} />
          </section>
        </>
      )}
    </>
  );
}
