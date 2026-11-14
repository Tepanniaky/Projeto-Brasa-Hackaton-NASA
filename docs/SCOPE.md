# BRASA: escopo, hipóteses e critérios de aceite do MVP

Documento da OPP Team para o NASA Space Apps Challenge 2026, desafio *Harmonization of MODIS and VIIRS Hot Spots*.
Registrado em 2026-11-14 e revisado no mesmo dia, depois da chegada do roteiro de front-end e dos dados da equipe.

> Pergunta central: **"Estamos observando mais fogo ou apenas enxergando melhor?"**

## 1. Problema e usuário

**Usuário principal:** técnico(a) ambiental municipal. Ele precisa responder duas
perguntas: quando costuma queimar no seu município, e se este ano está fora do
normal. Precisa também saber se uma mudança nos números vem do fogo ou do
instrumento que o observa.

**O que o BRASA entrega:** um calendário explicável de atividade de fogo detectada
por satélite para a Bahia e seus 417 municípios. Ele mostra, sempre separados:

1. a **série harmonizada da equipe** (2003–2026), que é a base do calendário;
2. os **registros originais por sensor** (2020–2025), MODIS e VIIRS lado a lado, nunca somados;
3. uma **harmonização experimental independente**, com treino e avaliação separados;
4. uma **auditoria** da série da equipe contra o que o MODIS de fato observou.

## 2. Duas fontes de dados processados

| Camada | Origem | Cobertura | Situação |
|---|---|---|---|
| **A. Série da equipe** (`web/public/api/`) | Pacote `api.rar` gerado pela equipe com `preparar_dados.py`, `harmonizar.py` e `gerar_calendario.py`. Esses scripts **não vieram no pacote**. | Bahia e 417 municípios, semanal, 2003 a 2026-11-13 | Usada como está. A definição foi parcialmente reproduzida (§5, A13). |
| **B. Pipeline BRASA** (`pipeline/` → `web/public/data/real/`) | Arquivos anuais FIRMS baixados, com SHA-256 conferido contra o servidor | Bahia e 417 municípios, mensal, 2020–2025 | Reproduzível com os comandos do README |
| **C. Demonstração sintética** | Não foi necessária: os dados reais estavam acessíveis | — | Fixtures sintéticas existem só nos testes. A interface exibe "Dados de demonstração — sintéticos" se um manifesto vier com `dataset_kind ≠ real` (há teste E2E). |

## 3. Escopo do MVP

O roteiro de front-end da equipe é a base. Os itens do brief original foram acrescentados a ele.

| # | Item | Origem | Fonte de dados |
|---|------|--------|----------------|
| 1 | Mapa da Bahia por município, com clique para selecionar e busca por nome | roteiro + brief | IBGE; alerta da camada A; métricas por sensor da camada B |
| 2 | Filtros compartilhados: região (estado ou município), período (anos) e sensor/visão | brief | A e B |
| 3 | Calendário ano × semana (2003–2026), com período crítico destacado | roteiro | A |
| 4 | Calendário mês × ano por sensor (2020–2025) | brief | B |
| 5 | Ano corrente sobre a faixa do normal, com classes de anomalia e número de destaque | roteiro | A |
| 6 | Série anual com faixa de incerteza | roteiro | A |
| 7 | Gráfico comparativo MODIS × VIIRS | brief | B |
| 8 | Alternância entre observações originais e indicador harmonizado, com a pergunta "O que muda após o ajuste?" | brief | A e B |
| 9 | Painel de metodologia, fontes, qualidade, limitações e auditoria | brief | A e B |
| 10 | Exportação CSV dos resultados filtrados | brief | A e B |

**Fora do escopo:** autenticação, banco de dados, servidor de API, área queimada,
previsão de fogo e seleção de área livre por polígono.

## 4. Hipóteses de trabalho (a testar, não premissas)

- **H1. Sensibilidade.** A diferença entre MODIS e VIIRS é dominada pela
  sensibilidade de cada sensor (pixel de 375 m contra 1 km). Por isso a contagem
  bruta de focos VIIRS não é comparável à do MODIS.
- **H2. Agregação.** "Dias com ≥ 1 detecção por célula e por sensor", em grades
  de 5 km e 10 km, aproxima mais os dois sensores do que a contagem de focos.
- **H3. Transferência entre anos.** Uma relação ajustada em 2020–2022 transfere
  para 2023–2025. Pode falhar por:
  - deriva orbital do Aqua e do Terra;
  - troca de coleção MODIS (C6 → C6.1) exatamente em 2023.
- **H4. Escala municipal.** A série da equipe, convertida a partir do VIIRS,
  reproduz o MODIS observado também na escala municipal, e não só no total
  estadual.
- **H5. Uso pelo técnico.** Em menos de um minuto, o técnico consegue escolher um
  município e responder "quando costuma queimar aqui e este ano está fora do
  normal?". Não foi testada com usuários.

## 5. Critérios de aceite

### Dados (camada B)

- **A1.** Todo registro processado preserva:
  - sensor, satélite e instrumento;
  - data e hora UTC e data local;
  - versão do produto;
  - arquivo de origem, com SHA-256 conferido contra o publicado pelo servidor.
- **A2.** A qualidade é avaliada por produto:
  - MODIS: confiança ≥ 30 (escala percentual);
  - VIIRS: confiança `n` ou `h` (escala categórica);
  - as escalas nunca são convertidas entre si.
- **A3.** MODIS e VIIRS **nunca são somados** em nenhum número exibido ou exportado.
- **A4.** Nenhum texto converte focos em área queimada, nem trata ausência de
  detecção como ausência de fogo.

### Harmonização experimental

- **A5.** A referência é explícita: MODIS/Aqua, em dias-célula.
- **A6.** Os anos de ajuste (2020–2022) e de avaliação (2023–2025) são disjuntos,
  e há teste automatizado para isso.
- **A7.** O ajuste é comparado a duas linhas de base: sem ajuste e razão simples.
  Os casos em que ele não melhora são marcados automaticamente.

### Interface

- **A8.** Selecionar um município e um período atualiza mapa, calendários,
  gráficos e CSV de forma consistente. Há teste E2E para isso.
- **A9.** Há estados de carregamento, erro, ausência de registros e
  indisponibilidade. Exemplos: o ano corrente depois da última semana completa
  aparece como "sem dado", e a falha do Aqua em 2020 aparece marcada.
- **A10.** Com dados sintéticos, a faixa "Dados de demonstração — sintéticos" é
  exibida permanentemente.
- **A11.** Nenhum estado é comunicado só por cor: há texto, ícone ou padrão, e
  todo gráfico tem tabela equivalente.
- **A12.** O CSV exportado traz filtros, camada, tipo de dado (real ou sintético)
  e versão dos produtos.

### Auditoria

- **A13.** A interface informa onde a série da equipe foi reproduzida e onde
  diverge do MODIS observado:
  - reproduzida: 2020–2021, igual à contagem MODIS Terra+Aqua sem filtro, por data UTC;
  - divergência: 2022–2025.

### Roteiro

- **A14.** Atende à lista "Pronto para a demo" do roteiro:
  - Bahia como tela inicial, com o período crítico destacado;
  - clique e busca de município;
  - semanas acima do normal destacadas no ano corrente;
  - faixa de incerteza;
  - fonte, unidade e limitação visíveis;
  - Barra, Formosa do Rio Preto e Vitória da Conquista carregando sem erro.

## 6. Riscos conhecidos

| Risco | Efeito | Mitigação |
|---|---|---|
| Scripts da equipe ausentes | A validação de "2,2% de erro anual" não pode ser reproduzida | Rotulada como "informada pela equipe, não reproduzida". Auditoria independente na camada B. |
| Deriva orbital do Aqua (sem manobras desde dez/2021) | Passagem mais tarde muda a amostragem do ciclo diurno do fogo | Horário mediano de passagem por ano medido nos dados e exibido. Avaliação feita por ano. |
| Falha do Aqua (16/08–02/09/2020) | Lacuna MODIS em plena estação de fogo | Marcada na interface e excluída do ajuste |
| MODIS C6 (2020–2022) e C6.1 (2023–2025) | Troca de coleção coincide com a fronteira treino/avaliação | Campo `version` exibido por ano. O efeito está documentado como fator de confusão. |
| Bug no campo `type` do VIIRS C2 (versões 1 e 2 do produto) | Fontes estáticas rotuladas como vegetação | Documentado |
| Anomalia Magnética do Atlântico Sul (a Bahia está dentro) | Falsos positivos VIIRS de baixa confiança | VIIRS `l` excluído |
| Ano corrente (2026) na camada A | Dados provavelmente NRT, não SP | Rotulado como "dado preliminar" |
