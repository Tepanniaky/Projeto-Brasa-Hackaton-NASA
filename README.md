# BRASA: calendário do fogo na Bahia

**OPP Team, NASA Space Apps Challenge 2026, desafio *Harmonization of MODIS and VIIRS Hot Spots*.**

> "Estamos observando mais fogo ou apenas enxergando melhor?"

O BRASA transforma registros NASA FIRMS em um calendário explicável da
atividade de fogo detectada na Bahia e nos seus 417 municípios. Ele mostra,
sempre separados:

- a série harmonizada da equipe (2003–2026);
- os registros originais MODIS/Aqua e VIIRS/NOAA-20 (2020–2025);
- uma harmonização experimental com treino e avaliação separados;
- uma auditoria independente da série da equipe.

![Bahia: mapa de alertas, cartões e ano corrente](docs/img/inicio-bahia.png)

| Calendário 2003–2026 e mapa VIIRS ÷ MODIS | "O que muda após o ajuste?" em Formosa do Rio Preto |
|---|---|
| ![](docs/img/mapa-razao-calendario.png) | ![](docs/img/harmonizado-formosa.png) |

## O que funciona

- **Mapa** dos 417 municípios (MapLibre).
  - Modo "alerta recente" (série da equipe) e modo "atividade no período" por
    sensor.
  - Com ambos os sensores, mostra a razão VIIRS ÷ MODIS, nunca a soma.
  - Clique ou busque um município para selecioná-lo.
- **Filtros compartilhados**: local, período, visão (original ou harmonizada),
  sensor e métrica. Valem para mapa, calendários, gráficos e CSV, e ficam
  espelhados na URL.
- **Calendário ano × semana** (2003–2026), com período crítico, escala de raiz
  quadrada e "sem dado" diferente de "sem detecção".
- **Calendário mês × ano por sensor** (2020–2025).
- **Ano corrente** sobre a faixa do normal, com classes de anomalia (glifo e
  cor) e número de destaque.
- **Série anual** com a faixa de incerteza da conversão.
- **MODIS × VIIRS**: séries mensais lado a lado. A visão harmonizada responde
  "O que muda após o ajuste?" com textos calculados a partir dos valores.
- **Painel de metodologia**: fontes com SHA-256, critérios de qualidade por
  sensor e ano, deriva orbital medida, avaliação do ajuste com marcações
  automáticas, e limitações.
- **Exportação CSV** do recorte filtrado, com camada, tipo de dado, versão do
  produto e filtros em cada linha.
- **Estados** de carregamento, erro, município sem detecção, período sem dados
  por sensor, camada indisponível e mapa de fundo offline.

## Dados: o que é real e o que é sintético

| Camada | Origem | Situação |
|---|---|---|
| A: `web/public/api/` | Pacote `api.rar` da equipe | Real, usado como recebido. Os scripts que o geraram não estão aqui, então a validação de "2,2 %" **não foi reproduzida**. |
| B: `web/public/data/real/` | 12 arquivos anuais FIRMS (MODIS e VIIRS-NOAA-20, 2020–2025) e malha IBGE, todos com SHA-256 conferido | **Real**, gerado por `pipeline/` |
| Exemplo: `pipeline/examples/firms/` | ~2.300 linhas reais copiadas desses arquivos (Formosa do Rio Preto, 1–7/set/2024) | Real, para testar o pipeline |
| Fixtures de teste | `pipeline/tests/conftest.py`, `web/tests/unit/fixtures.ts` | **Sintéticas**, só em testes; nunca exibidas |

Não foi preciso criar um conjunto sintético de demonstração: os dados reais
estavam acessíveis. A interface já trata esse caso. Se um manifesto vier com
`dataset_kind ≠ "real"`, ela exibe a faixa permanente "Dados de demonstração —
sintéticos", e há teste E2E para isso.

## Requisitos

- Node 20.19 ou mais novo (testado com 24.21) e npm.
- Python 3.13 (testado; as skills recomendam 3.12+).
- Para os testes E2E: Chromium do Playwright 1.65.0. Se faltar, rode
  `npx playwright install chromium`.

## Executar a interface

```bash
cd web
npm ci                 # instala as versões fixadas
npm run dev            # http://localhost:5173  (desenvolvimento)
# ou, como na demo:
npm run build && npm run preview   # http://localhost:4173
```

Os dados já processados estão versionados em `web/public/`, então a interface
roda sem o pipeline.

## Reprocessar os dados (pipeline Python)

```bash
cd pipeline
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock

# 1. Baixar os arquivos anuais FIRMS (sem MAP_KEY). São ~880 MB lidos em fluxo, mas só o recorte da Bahia é gravado (~90 MB):
PYTHONPATH=. .venv/bin/python -m brasa.fetch_firms --years 2020-2025 --products modis viirs-jpss1 \
    --out ../data/raw/firms_bahia --bbox -46.68 -18.44 -37.24 -8.43
# 2. A malha do IBGE já está em data/raw/ibge/ (de onde baixar: docs/METHODOLOGY.md §2)
# 3. Processar e exportar para web/public/data/real (~75 s):
.venv/bin/python -m brasa.cli build --dataset real
# 4. Regenerar o registro afirmação → evidência e auditar:
.venv/bin/python -m brasa.evidence
python3 ../.claude/skills/scientific-writing/scripts/audit_claims.py \
    ../docs/evidencia/harmonizacao.md ../docs/evidencia/afirmacoes.csv ../docs/evidencia/fontes.json
```

**Importar um CSV oficial baixado à mão** (FIRMS Archive Download, mesmas
colunas):

```bash
.venv/bin/python -m brasa.cli import-firms --file ~/Downloads/fire_archive_M-C61_123.csv --product modis
.venv/bin/python -m brasa.cli build --dataset real
```

**Exemplo pequeno de ponta a ponta** (~4 s). O resultado esperado é
`harmonização: dados_insuficientes`, porque o exemplo tem 1 mês e o modelo não
é ajustado:

```bash
.venv/bin/python -m brasa.cli example --out /tmp/brasa-exemplo
```

## Testes

```bash
cd pipeline && .venv/bin/python -m pytest -q        # 19 testes: qualidade, dia local, agregação, separação temporal, auditoria, exemplo e2e
cd web && npm test                                  # 16 testes unitários: filtros, recortes, calendário, CSV, mapa, explicações
cd web && npm run build && PLAYWRIGHT_HTML_OPEN=never npx playwright test   # 9 testes E2E nos dados reais
```

## Estrutura

```
docs/                SCOPE, ARCHITECTURE (ADRs), DATA_CONTRACTS, METHODOLOGY, SKILLS(_USAGE), NEXT_STEPS, DEMO_SCRIPT
docs/evidencia/      afirmações ↔ fontes (auditadas com scientific-writing)
pipeline/brasa/      fetch_firms · ingest · spatial · aggregate · harmonize · audit · cli · evidence
pipeline/examples/   entrada de exemplo (real, pequena)
data/raw/ibge/       malha municipal IBGE (versionada; pequena)
data/raw/firms_*/    recortes FIRMS (não versionados; regenerar com fetch_firms)
data/equipe/api/     cópia extraída do api.rar da equipe
web/src/data         acesso a dados · web/src/domain regras · web/src/ui apresentação
web/public/api       camada A (equipe) · web/public/data/real camada B (pipeline)
```

## Como continuar

1. Leia `docs/SCOPE.md` (critérios de aceite) e `docs/NEXT_STEPS.md` (prioridades).
2. Antes de mudar um JSON, atualize juntos `docs/DATA_CONTRACTS.md`,
   `web/src/data/types.ts` e `schema_version`.
3. Regra de ouro: nunca somar MODIS com VIIRS, nunca converter focos em área,
   nunca tratar ausência de detecção como ausência de fogo.

## Créditos e licenças de dados

- NASA FIRMS/LANCE: MODIS C6/C6.1 MCD14ML e VIIRS C2 VJ114IMGML.
- IBGE: malha municipal.
- Mapa de fundo: OpenFreeMap, © OpenStreetMap contributors e OpenMapTiles.
- Fontes tipográficas: Barlow (SIL OFL), via @fontsource.
- Skills de agente usadas: ver `docs/SKILLS_USAGE.md`, inclusive a citação de
  Kassis et al. (2026), arXiv:2609.00065.
