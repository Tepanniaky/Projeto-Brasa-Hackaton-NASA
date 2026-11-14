# Skills selecionadas para o BRASA

Guia da OPP Team sobre as skills de agente usadas no desenvolvimento do BRASA
(NASA Space Apps, desafio "Harmonization of MODIS and VIIRS Hot Spots").

Pergunta central do projeto: **"Estamos observando mais fogo ou apenas enxergando melhor?"**

Levantamento: 2026-11-14.

---

## Visão geral

| Skill | Para quê, no BRASA | Prioridade | Onde está |
|---|---|---|---|
| `geopandas` | Focos do FIRMS como pontos, recorte da região piloto, contagens por mês e sensor | Essencial | `.claude/skills/geopandas` |
| `statsmodels` | Calibração MODIS ↔ VIIRS, sazonalidade, validação fora da amostra | Essencial | `.claude/skills/statsmodels` |
| `dataviz` | Calendário mês × ano, comparação de sensores, paletas acessíveis | Essencial | Fornecida pelo ambiente Claude (não precisa instalar) |
| `maplibre-tile-sources` | Decidir se os focos vão como GeoJSON ou como tiles | Essencial se o mapa for MapLibre | `.claude/skills/maplibre-tile-sources` |
| `maplibre-source-wiring` | Mapa em branco, ordem das camadas, destaque do ponto sob o mouse | Essencial se o mapa for MapLibre | `.claude/skills/maplibre-source-wiring` |
| `maplibre-cartography` | Legibilidade, hierarquia visual, acessibilidade do mapa | Essencial se o mapa for MapLibre | `.claude/skills/maplibre-cartography` |
| `playwright-cli` | Testes de interface e integração com `@playwright/test` (TypeScript) | Essencial | `.claude/skills/playwright-cli` e a CLI global `playwright-cli` |
| `scientific-writing` | Metodologia, validação e limitações com cada afirmação ligada à sua evidência | Opcional | `.claude/skills/scientific-writing` |
| `brasa-firms` (a criar) | Regras de domínio do FIRMS, MODIS e VIIRS | Essencial | Ainda não existe (ver "Lacunas") |

Já disponíveis no ambiente, sem instalar nada:

- `superpowers:brainstorming` e `superpowers:writing-plans`
- `engineering:architecture` e `engineering:system-design`
- `engineering:testing-strategy`
- `design:accessibility-review` e `web-design-guidelines`

---

## Ordem de adoção

0. **Planejamento.** `brainstorming`, depois `engineering:architecture` (registros de decisão: biblioteca de mapa, formato dos dados processados), depois `writing-plans`.
1. **Criar `brasa-firms`.** As regras de domínio vêm antes do código.
2. **`geopandas`.** Pipeline de dados e verificação da janela 2020–2025.
3. **`statsmodels`.** Indicador harmonizado e validação.
4. **`dataviz`.** Calendário e gráficos de comparação.
5. **`maplibre-*`.** Só depois do registro de decisão sobre o mapa. Se não for MapLibre, remover as três.
6. **`playwright-cli`.** Assim que existirem fluxos de interface.
7. **`scientific-writing`.** Da validação até a entrega.

---

## Resumo de cada skill

### `geopandas` (K-Dense, MIT)

- **Faz:** guia para dados vetoriais com GeoPandas 1.2: sistema de coordenadas (CRS), validade de geometrias, cruzamentos espaciais, recortes, exportação.
- **Fluxo da skill:**
  1. inventariar a camada (`vector_inventory.py`);
  2. planejar a reprojeção (`crs_reprojection_plan.py`);
  3. auditar geometrias (`geometry_validity_report.py`);
  4. medir a cardinalidade do cruzamento espacial (`spatial_join_audit.py`);
  5. planejar a exportação (`export_plan.py`).
- **Regras que importam para o BRASA:**
  - `set_crs` apenas rotula as coordenadas; quem transforma é `to_crs`. Nunca deduzir um CRS desconhecido.
  - O predicado `within` exclui pontos que caem exatamente na divisa. A política de borda precisa ser decidida e documentada.
  - Áreas e buffers só podem ser calculados em CRS projetado, nunca em graus.
  - Todo arquivo derivado registra hash da fonte, CRS, predicado e contagem de linhas.
  - Coordenadas exatas são tratadas como sensíveis; por padrão os relatórios usam agregados.
- **Segurança:** os scripts só trabalham localmente. Recusam URLs e arquivos compactados, e não usam rede nem subprocessos.
- **Requer:** Python 3.12+, com o pacote de versões fixas descrito na própria skill. O sistema tem Python 3.14, então crie um ambiente virtual dedicado.
- **Teste de aceitação:** carregar um mês do arquivo FIRMS (MODIS e VIIRS) da região piloto, cruzar com o polígono do IBGE, contar por sensor e rodar `spatial_join_audit.py`.

### `statsmodels` (K-Dense, BSD-3)

- **Faz:** ajuste e diagnóstico de OLS, GLM, modelos de contagem (Poisson, binomial negativa, zero-inflacionados), ARIMA e SARIMAX, comparação de modelos.
- **Regras que importam para o BRASA:**
  - O tipo de modelo segue o tipo do dado: focos são contagens, então começar com Poisson, testar sobredispersão e passar para binomial negativa se ela aparecer.
  - Fazer diagnóstico de resíduos (Ljung-Box, heterocedasticidade, autocorrelação).
  - Validar sempre fora da amostra, em um período separado.
- **Requer:** statsmodels 0.15, Python 3.12+. Não tem scripts, só referências (`time_series.md`, `glm.md`, `discrete_choice.md`, entre outras).
- **Teste de aceitação:** com as contagens mensais de 2020–2023, ajustar uma binomial negativa de VIIRS em função de MODIS e do mês. Validar em 2024 e reportar sobredispersão, resíduos e erro absoluto médio fora da amostra.

### `dataviz` (ambiente Claude)

- **Faz:** escolhe a forma do gráfico, monta paletas validadas e acessíveis (tema claro e escuro), indicadores numéricos, legendas, tooltips e mapas de calor.
- **Uso no BRASA:**
  - o calendário de atividade (mapa de calor mês × ano);
  - a comparação MODIS × VIIRS;
  - a exibição do indicador harmonizado com a incerteza.
- **Teste de aceitação:** desenhar o calendário com paleta sequencial e um painel de comparação, nos temas claro e escuro.

### `maplibre-tile-sources`, `maplibre-source-wiring`, `maplibre-cartography` (MapLibre, MIT)

- **`tile-sources`:** decide entre GeoJSON direto e tiles (vetoriais ou raster), com limites de quantidade de pontos e tamanho de arquivo, e explica como combinar o mapa de fundo com os dados próprios.
- **`source-wiring`:**
  - mapa em branco sem erro no console;
  - `url` de TileJSON contra `tiles` escrito à mão;
  - `source-layer` com o nome errado;
  - dados cobrindo os rótulos;
  - `promoteId` e feature-state para destacar o ponto sob o mouse.
- **`cartography`:** legibilidade de rótulos e símbolos, relação figura-fundo dos pontos, hierarquia visual, ordem das camadas, acessibilidade.
- **Só se aplicam ao MapLibre GL JS.** São só Markdown, sem scripts.
- **Teste de aceitação:** com o número real de focos de 2020–2025 na região, decidir entre GeoJSON e tiles. Implementar a camada de focos abaixo dos rótulos, com destaque via feature-state.

### `playwright-cli` (Microsoft, Apache-2.0)

- **Faz:** controla o navegador pelo terminal. O ciclo é: capturar a estrutura da página, pegar a referência de um elemento, interagir e capturar de novo.
- **Também cobre:** gravar ações e transformá-las em código de teste, simular respostas de rede, rastreamento (traces) e depuração de testes `@playwright/test` com `--debug=cli`.
- **Permissões declaradas:** só pode executar `playwright-cli` e `npx playwright`.
- **Teste de aceitação:** gerar um teste que seleciona região e período, confere quantas células o calendário mostra e valida o cabeçalho do CSV exportado.
- **Comandos úteis:**
  - Rodar os testes sem abrir o relatório: `PLAYWRIGHT_HTML_OPEN=never npx playwright test`
  - Depurar: `npx playwright test --debug=cli`

### `scientific-writing` (K-Dense, MIT), opcional

- **Faz:** escreve e audita texto científico em que cada afirmação aponta para uma evidência.
- **Regras:** nunca inventar dados ou referências; IA não é autora; confidencialidade dos materiais.
- **Scripts:** funcionam sem rede: `audit_claims.py`, `check_consistency.py`, `lint_manuscript.py`, entre outros.
- **Atenção:** é voltada a artigos científicos (IMRaD, normas de periódicos). No BRASA, use só a parte de evidência por afirmação e a reconciliação entre métodos e resultados.
- **Teste de aceitação:** escrever a seção "Metodologia de harmonização" com uma tabela de afirmações e evidências (`assets/claim_evidence_template.csv`) e rodar `audit_claims.py`.

---

## Lacunas e a skill local `brasa-firms`

Não encontrei nenhuma skill confiável que cubra a harmonização FIRMS MODIS/VIIRS. A única skill de FIRMS
encontrada (`tiangong-ai/agent-skills` → `nasa-firms-fire-fetch`) foi descartada, por três motivos:

- depende de uma CLI de terceiros;
- limita a janela a 31 dias;
- declara não servir para fusão de fontes.

**Proposta:** criar `.claude/skills/brasa-firms/SKILL.md` a partir de quatro fontes oficiais:

- o guia do usuário do produto de fogo ativo MODIS Collection 6.1;
- o guia do usuário do produto de fogo ativo VIIRS 375 m;
- o FAQ do FIRMS;
- a documentação de download de histórico e da API do FIRMS (MAP_KEY).

Conteúdo mínimo, **a confirmar nesses documentos**:

- **Campos:** confiança (0–100 no MODIS; baixa, nominal ou alta no VIIRS), `frp`, `scan`/`track`, `daynight`, `type`.
- **Fonte histórica:** usar Standard Processing (SP), não Near Real-Time (NRT).
- **Filtragem:** decidir quais valores de `type` entram (fogo de vegetação presumido) e qual limiar de confiança usar.
- **Resolução:** cerca de 1 km no MODIS contra 375 m no VIIRS. Uma detecção não é um incêndio.
- **Horário de passagem:** Aqua e NOAA-20 passam à tarde. **Verificar a deriva orbital do Aqua depois de 2022** e o efeito dela na janela 2020–2025.
- **Disponibilidade:** confirmar a data de início do arquivo SP do NOAA-20 no FIRMS.

Outras lacunas:

- **Vite e React SPA:** não encontrei skill oficial. A `react-best-practices` instalada é centrada em Next.js, e as regras de servidor não se aplicam. Use react.dev, vite.dev e o MCP Context7 (precisa de autorização via `/mcp`).

---

## Sobreposições e conflitos

- **Citação K-Dense:** `geopandas`, `statsmodels` e `scientific-writing` mandam o agente citar o artigo da K-Dense (arXiv:2609.00065) e consultar o arXiv quando a skill contribui para um relatório. **Decisão pendente da equipe**; registrar no `CLAUDE.md`.
- **Playwright:** a skill `playwright-cli` e o Playwright MCP (instalado) usam o mesmo motor. Use a CLI para escrever e depurar testes e o MCP para exploração, nunca os dois no mesmo navegador.
- **Design:** `dataviz` cuida dos gráficos; `impeccable` e `frontend-design` cuidam da interface geral.
  - O `impeccable` baixa um executável na primeira execução.
  - O `web-design-guidelines` busca as regras na internet a cada revisão.
- **Fora do projeto de propósito:**
  - `geomaster`: só para imagens de satélite (raster).
  - `statistical-analysis` e `aeon`: se sobrepõem a `statsmodels`.
  - `webapp-testing`: escreve testes em Python.

---

## O que é skill, MCP, biblioteca e fonte de dados

| Tipo | Itens |
|---|---|
| Skill (instruções) | as listadas acima |
| MCP ou conector | Playwright MCP, Context7 MCP, Figma MCP |
| Biblioteca | geopandas, shapely, pyproj, pandas, statsmodels; maplibre-gl, react-map-gl/deck.gl (se escolhidos); @playwright/test, vitest |
| Fonte de dados | NASA FIRMS (histórico e API), limites municipais do IBGE, INPE BDQueimadas (possível comparação independente) |

---

## Procedência e atualização

As skills foram copiadas de commits fixados. Os clones ficam em `~/src/skills-vendor/`.

| Origem | Commit | Skills |
|---|---|---|
| https://github.com/K-Dense-AI/scientific-agent-skills | `2d2065fb4520` | geopandas, statsmodels, scientific-writing |
| https://github.com/maplibre/maplibre-agent-skills | `60ab59deb00f` | maplibre-tile-sources, maplibre-source-wiring, maplibre-cartography |
| https://github.com/microsoft/playwright-cli | `b21724888b81` | playwright-cli (e a CLI global `@playwright/cli@0.1.24`) |

Para atualizar:

1. `git -C ~/src/skills-vendor/<repo> fetch`
2. Revisar o diff da pasta da skill.
3. Fazer checkout do novo commit.
4. Copiar a pasta para `.claude/skills/` de novo.
5. Atualizar esta tabela.

Não editar as cópias instaladas: a próxima atualização sobrescreve qualquer mudança feita nelas.

---

## Pendências antes de começar

- [ ] Registro de decisão: biblioteca de mapa (MapLibre ou outra). Se não for MapLibre, remover `maplibre-*`.
- [ ] Confirmar a disponibilidade dos dados SP de MODIS/Aqua e VIIRS/NOAA-20 no FIRMS para 2020–2025.
- [ ] Criar um ambiente Python 3.12 dedicado ao pipeline (o sistema tem 3.14; `uv` não está instalado).
- [ ] Definir a política de citação das skills K-Dense e registrá-la no `CLAUDE.md`.
- [ ] Escrever a skill local `brasa-firms`.
- [ ] Autorizar o MCP Context7 (`/mcp`), se for usado.
