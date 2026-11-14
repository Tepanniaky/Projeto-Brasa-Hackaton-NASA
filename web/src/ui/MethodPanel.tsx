/** Metodologia, fontes, qualidade e limitações, construídos a partir dos manifestos (nada fixo no código). */
import type { Dataset } from '../data/types';
import { fmt1, fmtHour, fmtInt, fmtPct } from '../domain/format';

const DROP_LABEL: Record<string, string> = {
  satelite_fora_do_escopo: 'satélite fora do escopo',
  duplicado: 'duplicado',
  tipo_nao_vegetacao: 'tipo ≠ 0 (fonte estática, vulcão, mar)',
  baixa_confianca: 'baixa confiança',
  fora_da_regiao: 'fora da Bahia',
  fora_do_periodo: 'fora do período',
};

export function MethodPanel({ ds }: { ds: Dataset }) {
  const s = ds.sensors;
  const harm = s?.harmonization;
  return (
    <section className="secao" aria-labelledby="sec-metodo" id="metodologia" data-testid="metodologia">
      <h2 id="sec-metodo">Metodologia, fontes, qualidade e limitações</h2>
      <p className="secao-sub">Tudo abaixo é lido dos manifestos gerados pelo pipeline. O documento completo está em <code>docs/METHODOLOGY.md</code>.</p>

      <details className="metodo" open>
        <summary>Limitações que mudam a leitura</summary>
        <ul>
          <li>Uma detecção é um pixel com fogo ativo no instante da passagem do satélite. Não é um incêndio, e focos não são convertidos em área queimada.</li>
          <li>Ausência de detecção não comprova ausência de fogo. Nuvens, fumaça, copa das árvores, fogo pequeno ou fora do horário da passagem escapam ao sensor. Os arquivos de focos não trazem a cobertura de nuvens.</li>
          <li>MODIS e VIIRS nunca são somados. O VIIRS (pixel de 375 m) detecta focos menores que o MODIS (1 km). Contar os dois juntos duplicaria fogo e misturaria escalas.</li>
          <li>As escalas de confiança não são equivalentes: MODIS usa 0–100 %, VIIRS usa as classes baixa, nominal e alta.</li>
          <li>A harmonização é uma aproximação estatística entre escalas de detecção. Ela não mede a quantidade real de fogo.</li>
          <li>Ano corrente: dados preliminares (processamento rápido, NRT). Semanas ainda não publicadas aparecem como "sem dado", não como "sem fogo".</li>
        </ul>
      </details>

      <details className="metodo">
        <summary>Duas camadas de dados</summary>
        <ul>
          <li><strong>Série da equipe</strong> (calendário semanal 2003–hoje): MODIS Terra+Aqua observado até 2021, VIIRS (S-NPP, NOAA-20 e NOAA-21) convertido a partir de 2022. Os scripts que a geraram não estão neste repositório. A validação de "erro médio de 2,2 % no total anual" informada pela equipe <strong>não foi reproduzida</strong> aqui.</li>
          {s?.audit && <li>Auditoria independente: a série da equipe de 2020–2021 foi reproduzida exatamente em {s.audit.municipios_reproduzidos_2020_2021} de {s.audit.municipios_auditados} municípios. Método: {s.audit.metodo}</li>}
          <li><strong>Registros por sensor</strong> (BRASA, mensal 2020–2025): MODIS/Aqua e VIIRS/NOAA-20, com critérios de qualidade próprios de cada produto, gerados pelo pipeline Python deste repositório.</li>
        </ul>
      </details>

      {s && (
        <>
          <details className="metodo">
            <summary>Definição de dia, horário e grade</summary>
            <ul>
              <li>{s.manifest.definicao_dia}</li>
              <li>A série da equipe usa outra convenção: semana = bloco fixo de 7 dias desde 1º de janeiro, pela data UTC; a semana 51 absorve os últimos dias do ano.</li>
              <li>Grades comuns de {s.manifest.grades.map((g) => `${g.tamanho_m / 1000} km (${fmtInt(g.fragmentos)} fragmentos)`).join(' e ')} em {s.manifest.grades[0]?.crs} (SIRGAS 2000 / Brazil Albers, de área igual). Fragmento = célula ∩ município. Os valores dos municípios somam o estado.</li>
              <li>Município de cada detecção: ponto-no-polígono com a malha do IBGE ({s.manifest.atribuicao_municipio.predicado}).</li>
            </ul>
          </details>

          <details className="metodo">
            <summary>Sensores e critérios de qualidade</summary>
            <ul>
              {s.manifest.sensores.map((x) => (
                <li key={x.id}><strong>{x.rotulo}</strong>: {x.produto}; pixel nominal {fmtInt(x.pixel_nominal_m)} m. Regra: {x.regra_qualidade}.</li>
              ))}
            </ul>
            <div className="tabela-wrap">
              <table className="dados" data-testid="tabela-qualidade">
                <thead><tr><th>Sensor</th><th>Ano</th><th>Linhas no recorte</th><th>Mantidas</th><th>Descartes</th><th>Versão</th><th>Processamento</th></tr></thead>
                <tbody>{s.manifest.qualidade.filter((q) => !q.sensor.includes('Terra')).map((q) => (
                  <tr key={`${q.sensor}${q.ano}`}><td>{q.sensor}</td><td>{q.ano}</td><td>{fmtInt(q.linhas)}</td><td>{fmtInt(q.mantidos)}</td>
                    <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>{Object.entries(q.descartes).map(([k, v]) => `${DROP_LABEL[k] ?? k}: ${fmtInt(v)}`).join('; ')}</td>
                    <td>{q.versoes.join(', ')}</td><td>{q.processamento.join(', ')}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="nota">Versão MODIS "6.03" = Collection 6 e "61.03" = Collection 6.1 (convenção CCC.VV do MCD14ML). A troca acontece entre 2022 e 2023, na mesma fronteira entre os anos de ajuste e de avaliação.</p>
          </details>

          <details className="metodo">
            <summary>Indisponibilidades e deriva orbital</summary>
            <ul>
              {s.manifest.indisponibilidades.map((g) => (
                <li key={g.start}><strong>{g.sensor}</strong> de {g.start} a {g.end} ({g.kind}): {g.note} Fonte: {g.source}.</li>
              ))}
            </ul>
            <div className="tabela-wrap">
              <table className="dados">
                <thead><tr><th>Satélite</th>{[...new Set(s.manifest.deriva_passagem.map((d) => d.ano))].sort().map((y) => <th key={y}>{y}</th>)}</tr></thead>
                <tbody>{['Aqua', 'N20', 'Terra'].map((sat) => (
                  <tr key={sat}><td>{sat === 'N20' ? 'NOAA-20' : sat}</td>
                    {s.manifest.deriva_passagem.filter((d) => d.satelite === sat).sort((a, b) => a.ano - b.ano)
                      .map((d) => <td key={d.ano}>{fmtHour(d.hora_local_mediana)}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <p className="nota">Horário local mediano das detecções diurnas, medido nos próprios dados. Uma mudança de horário altera quanto do ciclo diário do fogo o sensor enxerga.</p>
          </details>

          {harm && (
            <details className="metodo" data-testid="avaliacao-harmonizacao">
              <summary>Harmonização experimental e avaliação</summary>
              <ul>
                <li>Referência: <strong>{harm.referencia}</strong>; preditor: {harm.preditor}; unidade: {harm.unidade}.</li>
                <li>Ajuste com {harm.anos_ajuste.join(', ')} (sem {harm.meses_excluidos_do_ajuste.join(' e ')}, falha do Aqua); avaliação em {harm.anos_avaliacao.join(', ')}, anos nunca vistos pelo ajuste.</li>
                <li>Métodos: sem ajuste, razão simples e binomial negativa (log μ = log área + β·log(1+VIIRS) + mês). {harm.intervalo}.</li>
                <li>Grade usada na interface: {harm.grade_padrao === 'g10' ? '10 km' : '5 km'}, escolhida por regra fixa: menor erro relativo nos anos de avaliação.</li>
                <li>{harm.aviso}</li>
              </ul>
              {(['g10', 'g5'] as const).map((gid) => {
                const g = harm.grades[gid];
                if (!g) return null;
                const rows = g.avaliacao.metricas.filter((m) => m.nivel === 'estado_mes');
                const years = [...new Set(rows.map((r) => r.ano))].sort();
                const cov = g.avaliacao.cobertura.filter((c) => c.nivel === 'estado_mes');
                return (
                  <div key={gid}>
                    <h3>Grade de {g.tamanho_m / 1000} km: erro absoluto médio mensal do estado</h3>
                    <div className="tabela-wrap">
                      <table className="dados">
                        <thead><tr><th>Ano</th><th>Divisão</th><th>Sem ajuste</th><th>Razão simples</th><th>Binomial negativa</th><th>Cobertura do IC 90 %</th></tr></thead>
                        <tbody>{years.map((y) => {
                          const by = Object.fromEntries(rows.filter((r) => r.ano === y).map((r) => [r.metodo, r]));
                          const best = by.binomial_negativa && by.razao && by.sem_ajuste && by.binomial_negativa.mae < Math.min(by.razao.mae, by.sem_ajuste.mae);
                          const c = cov.find((x) => x.ano === y);
                          return (
                            <tr key={y} className={by.binomial_negativa?.divisao === 'avaliacao' && !best ? 'marcado' : ''}>
                              <td>{y}</td><td>{by.binomial_negativa?.divisao}</td>
                              <td>{by.sem_ajuste ? fmt1(by.sem_ajuste.mae) : '—'}</td><td>{by.razao ? fmt1(by.razao.mae) : '—'}</td>
                              <td>{by.binomial_negativa ? `${fmt1(by.binomial_negativa.mae)}${best ? ' ✓' : ''}` : '—'}</td>
                              <td>{c ? fmtPct(c.cobertura_observada) : '—'}</td>
                            </tr>
                          );
                        })}</tbody>
                      </table>
                    </div>
                    {g.ajuste.binomial_negativa && (
                      <p className="nota">β(log1p VIIRS) = {fmt1(g.ajuste.binomial_negativa.params.log1p_viirs)}; α = {g.ajuste.binomial_negativa.alpha.toFixed(2)}; dispersão de Pearson do Poisson = {g.ajuste.binomial_negativa.dispersao_pearson_poisson.toFixed(2)}; Ljung-Box (resíduos mensais do treino) p = {g.diagnosticos.ljung_box_p?.toFixed(3)}. Linhas marcadas: anos de avaliação em que o modelo não superou a melhor linha de base.</p>
                    )}
                    <ul>{g.avaliacao.marcacoes.filter((f) => f.nivel !== 'municipio_mes').map((f) => <li key={f.mensagem}>⚠ {f.mensagem}</li>)}</ul>
                  </div>
                );
              })}
              <h3>Em qual unidade os sensores ficam mais próximos?</h3>
              <div className="tabela-wrap">
                <table className="dados">
                  <thead><tr><th>Métrica</th>{Object.keys(harm.comparabilidade[0]?.razao_viirs_modis_por_ano ?? {}).map((y) => <th key={y}>{y}</th>)}<th>CV da razão</th><th>Spearman mês</th></tr></thead>
                  <tbody>{harm.comparabilidade.map((c) => (
                    <tr key={c.metrica}><td>{s.manifest.metricas.find((m) => m.id === c.metrica)?.rotulo}</td>
                      {Object.values(c.razao_viirs_modis_por_ano).map((v, i) => <td key={i}>{v === null ? '—' : `${fmt1(v)}×`}</td>)}
                      <td>{c.cv_razao_anual === null ? '—' : c.cv_razao_anual.toFixed(3)}</td><td>{c.spearman_estado_mes.toFixed(2)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="nota">Razão VIIRS ÷ MODIS no total anual do estado. Um coeficiente de variação (CV) menor indica uma relação mais estável entre os anos.</p>
            </details>
          )}

          <details className="metodo">
            <summary>Fontes e procedência</summary>
            <ul>
              {s.manifest.fontes_firms.map((f) => (
                <li key={`${f.product}${f.year}`}>{f.product} {f.year}: <a href={f.source_url ?? '#'}>{f.source_url}</a>; {fmtInt(f.source_rows)} linhas no arquivo nacional, {fmtInt(f.subset_rows)} no recorte. SHA-256 {f.sha256_verified ? 'conferido com o servidor' : 'NÃO conferido'}: <span className="hash">{f.source_sha256.slice(0, 16)}…</span></li>
              ))}
              <li>Malha municipal IBGE ({s.manifest.fontes_ibge.crs}): <span className="hash">{s.manifest.fontes_ibge.sha256.slice(0, 16)}…</span></li>
              <li>Pipeline {s.manifest.pipeline_version}, gerado em {s.manifest.gerado_em_utc} (UTC). Tipo de dado: {s.manifest.dataset_kind}.</li>
              <li>Mapa de fundo: OpenFreeMap, com dados © OpenStreetMap e OpenMapTiles.</li>
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
