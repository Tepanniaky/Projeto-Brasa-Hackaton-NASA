# Skills usadas na construção do BRASA

Este registro complementa a seleção prévia em [`SKILLS.md`](SKILLS.md). Para
cada skill ele diz se foi usada, o que fez de concreto e onde está o resultado.
Sessão de 2026-11-14.

| Skill | Usada? | Contribuição concreta | Onde ver |
|---|---|---|---|
| `geopandas` (K-Dense) | Sim | Fixou o ambiente (geopandas 1.2.0 e dependências). Seu `crs_reprojection_plan.py` aprovou a transformação WGS84 → EPSG:10857 (1 m, sem "ballpark"). Suas regras orientaram três decisões: `set_crs` só rotula; o predicado `intersects` inclui a borda e a cardinalidade é auditada; área só em CRS projetado. Cada derivado registra hash e contagens. | `pipeline/brasa/spatial.py`, `manifest.json` (`atribuicao_municipio`, `fontes_ibge`) |
| `statsmodels` (K-Dense) | Sim | Ditou o fluxo de dados de contagem: Poisson, depois dispersão de Pearson como triagem, depois binomial negativa. Também: sem p-valor ingênuo da razão de verossimilhança na fronteira α = 0; validação fora da amostra em anos separados; Ljung-Box nos resíduos; `offset` para exposição. | `pipeline/brasa/harmonize.py`, `harmonizacao.json` |
| `dataviz` (ambiente) | Sim | Procedimento forma → cor → validação. Paletas aprovadas no `validate_palette.js` sobre a superfície `#fbf8f3`: sensores com todos os pares aprovados e contraste ≥ 3:1; rampa ordinal de 5 laranjas com o tom mais claro ≥ 2:1. A primeira rampa foi **reprovada** (1,35:1) e corrigida. Também deu: eixo y único, rótulos diretos, tabela por gráfico, hachura para "sem dado" e status sempre com glifo. | `web/src/ui/styles.css`, `web/src/ui/charts/*` |
| `maplibre-tile-sources` | Sim | Decisão GeoJSON × tiles: 417 polígonos (~0,9 MB) ficam abaixo do limite de 5 mil feições e 2 MB, então GeoJSON. Mapa de fundo e dados ficam em fontes separadas. | ADR-001 em `docs/ARCHITECTURE.md` |
| `maplibre-source-wiring` | Sim | `promoteId: 'cod_mun'` para o feature-state de hover, seleção e cor; camadas inseridas antes do primeiro símbolo. | `web/src/ui/MapView.tsx` |
| `maplibre-cartography` | Sim | Dados abaixo dos rótulos do mapa de fundo; alerta comunicado também por anel de tamanho diferente (não só cor); alternativa acessível em tabelas no painel. | `web/src/ui/MapView.tsx` |
| `playwright-cli` | Sim | A CLI global inspecionou e capturou a interface (6 capturas revisadas). Os testes `@playwright/test` foram escritos com base na referência da skill. A captura revelou um bug real de layout (barra de filtros que deixava de ser fixa) e o teste da faixa sintética confirmou. | `web/tests/e2e/brasa.spec.ts` |
| `scientific-writing` (K-Dense) | Sim, parcial (como previsto) | Usada só a parte de evidência por afirmação. `python -m brasa.evidence` gera 19 afirmações ligadas a 8 fontes. `validate_manifest.py` e `audit_claims.py` passaram: 0 erros, 0 avisos. | `docs/evidencia/` |
| `frontend-design` (ambiente) | Sim | Plano de tokens antes do código: carvão, branco quente e brasa; Barlow e Barlow Condensed; mapa à esquerda e painel à direita. Revisão contra os padrões genéricos: sem rótulos em caixa alta, sem metadados separados por "·", sem setas "→" em botões. | `web/src/ui/styles.css` |
| `superpowers:writing-skills` | Sim, para **não** instalar | Exige teste RED/GREEN com subagentes antes de instalar uma skill. Subagentes não foram autorizados nesta sessão, então `brasa-firms` **não foi criada**. O conteúdo verificado ficou pronto na seção 9 da metodologia. | `docs/METHODOLOGY.md` §9 |
| `superpowers:brainstorming`, `writing-plans` | Não seguidas como diálogo | O brief pedia para não interromper com perguntas. O escopo, as hipóteses e os critérios de aceite foram registrados direto. | `docs/SCOPE.md` |
| `engineering:architecture` | Formato aproveitado | ADRs com contexto, decisão e consequências. | `docs/ARCHITECTURE.md` |
| `impeccable`, `web-design-guidelines` | Não | A primeira baixa um executável e a segunda busca regras na internet a cada uso, como já alertava `SKILLS.md`. | — |
| Context7 MCP | Não | Precisa de autorização (`/mcp`). As APIs foram conferidas no próprio pacote instalado: `maplibre-gl.d.ts` e o mecanismo do *worker*. | — |

## Redesign 1a (2026-11-14)

Implementação do pacote do Claude Design (`BRASA Redesign.dc.html`, direção 1a "Mesa de análise", só em português).

| Skill | Usada? | Contribuição concreta | Onde |
|---|---|---|---|
| `dataviz` | Sim | O validador (`validate_palette.js`) reprovou as cores de sensor do tema escuro propostas no design (`#74abf3`/`#3fc79c`, fora da faixa de luminosidade para fundo escuro). Elas foram trocadas por `#5a96e2`/`#24ad82`, que passam em todas as checagens sobre `#24221e`. A rampa clara do MVP foi mantida porque passa; a rampa de calor escura do design reprova em "um só matiz" e em contraste do passo 1, e foi mantida de propósito, sempre acompanhada de legenda, dica e tabela. | `web/src/ui/styles.css` (cabeçalho) |
| `maplibre-cartography` | Sim | Camadas próprias continuam abaixo do primeiro símbolo do mapa de fundo; o mapa de fundo escuro (OpenFreeMap `dark`) foi escolhido para que os rótulos do próprio estilo sigam legíveis; seleção por contorno, alerta por anel (não só cor). | `web/src/ui/MapView.tsx` |
| `playwright-cli` | Formato aproveitado | Testes e2e atualizados para as abas e novos fluxos (restaurar, série anual arrastável, tema, modos do mapa, gaveta no celular). | `web/tests/e2e/brasa.spec.ts` |

## Instalações feitas

**Nenhuma mudança global no sistema.** Tudo o que foi instalado ficou no projeto:

- `pipeline/.venv`, com Python 3.13 do sistema e os pacotes fixados pelas skills;
- `web/node_modules`, com as versões fixadas em `web/package.json`;
- o Chromium do Playwright já estava no cache do usuário (build 1254).

## Citação exigida pelas skills K-Dense

As skills `geopandas`, `statsmodels` e `scientific-writing` contribuíram
materialmente para este código. Conforme a instrução delas, a referência abaixo
foi conferida no arXiv em 2026-11-14: 5 autores, sem periódico. A política de
citação no `CLAUDE.md` continua como **decisão pendente da equipe**, como
registrado em `SKILLS.md`.

> Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner, A. M. (2026). Scientific Agent Skills: A Library of
> Procedural Knowledge for Research Agents. arXiv:2609.00065. https://doi.org/10.48550/arXiv.2609.00065
