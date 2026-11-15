# BRASA: arquitetura e registros de decisão

## Visão geral

```
NASA FIRMS (CSV anuais, SHA-256)   IBGE (malha)        Equipe (api.rar)
            │                        │                       │
            ▼                        ▼                       ▼
  pipeline/brasa (Python 3.13)                    web/public/api/   ← camada A
  fetch_firms → ingest → spatial → aggregate              │
        → harmonize → audit → cli(build) → evidence       │
            │                                             │
            ▼                                             │
  web/public/data/real/*.json   ← camada B                │
            │                                             │
            └──────────────┬──────────────────────────────┘
                           ▼
         web/ (React 19 + TypeScript + Vite 8, estático)
         src/data    → acesso: fetch e validação de forma
         src/domain  → regras: filtros, recortes, calendário, explicações, CSV, mapa
         src/ui      → apresentação: MapLibre, gráficos SVG, painéis
```

**Não há** servidor, banco de dados, autenticação ou chave de API. O site é
estático e é publicado na Vercel (`web/vercel.json`); também funcionaria no GitHub Pages, como sugeria o roteiro.

## Separação de responsabilidades

| Camada | Pasta | Pode | Não pode |
|---|---|---|---|
| Ingestão e análise | `pipeline/brasa` | ler FIRMS e IBGE, aplicar qualidade, agregar, ajustar modelos, exportar JSON | renderizar |
| Acesso a dados | `web/src/data` | buscar JSON e checar a forma mínima | calcular métricas |
| Regras de análise | `web/src/domain` | recortar período, escolher sensor, montar calendários, gerar textos, CSV e valores do mapa (TS puro, testável sem navegador) | tocar no DOM |
| Apresentação | `web/src/ui` | desenhar, tratar eventos, mostrar estados | calcular regra de negócio |

O estado de filtros é um só (`domain/filters.ts`, via `useReducer`) e fica
espelhado na URL. Mapa, calendários, gráficos e CSV leem o mesmo objeto.

## Registros de decisão (ADR)

### ADR-001: Biblioteca de mapa: MapLibre GL JS (6.16)

- **Contexto.** O roteiro sugere Leaflet. As skills selecionadas (`maplibre-*`)
  assumem MapLibre. São 417 polígonos, com hover, seleção e cores dinâmicas.
- **Decisão.** MapLibre GL JS, com o estilo vetorial OpenFreeMap "positron".
  Não exige chave e traz atribuição OSM/OpenMapTiles.
  - Fonte GeoJSON com `promoteId: 'cod_mun'`, porque o feature-state precisa de id.
  - Camadas inseridas antes do primeiro símbolo, para não cobrir os rótulos.
  - Cor por feature-state, sem regerar o GeoJSON a cada filtro.
- **Consequências.** Pacote JS maior: cerca de 380 kB gzip mais o *worker*.
  - Se o mapa de fundo falhar (offline), o app troca para um fundo liso em até
    8 s e avisa; os municípios continuam clicáveis.
  - Pela skill `maplibre-tile-sources`, 417 polígonos (~0,9 MB) ficam abaixo do
    limite de 5 mil feições e 2 MB para GeoJSON. Não precisamos de tiles.
- **Reversível?** Sim: `MapView.tsx` é o único arquivo que importa
  `maplibre-gl`.

### ADR-002: Dados pré-processados em JSON estático, em duas camadas

- **Contexto.** O MVP não pode depender de backend. A equipe já entrega a
  camada A em JSON.
- **Decisão.**
  - A camada A é servida como recebida (`public/api`).
  - A camada B tem 3 JSONs e 1 manifesto (~1,9 MB), gerados pelo pipeline.
  - A camada B pode faltar sem derrubar a camada A; a interface mostra
    "Dados por sensor indisponíveis".
- **Consequências.** Atualizar os dados significa rodar o pipeline e publicar
  de novo. Não há consulta ad hoc.

### ADR-003: Unidade de agregação "fragmento = célula ∩ município"

- **Contexto.** O filtro é por município e as grades de 5 e 10 km cruzam as
  divisas.
- **Decisão.** Agregar por fragmento.
  - Os municípios somam exatamente o estado.
  - O modelo usa offset log(área do fragmento).
- **Alternativa descartada:** atribuir a célula ao município do centroide. É
  mais simples, mas move detecções de município e quebra a consistência com a
  camada A.

### ADR-004: CRS da grade EPSG:10857 (Brazil Albers, de área igual)

- **Contexto.** A Bahia cruza os fusos UTM 23S e 24S.
- **Decisão.** EPSG:10857: área igual, transformação de precisão de 1 m sem
  "ballpark". A área estadual calculada (564.760 km²) confere com o IBGE.

### ADR-005: Referência da harmonização MODIS/Aqua; preditor VIIRS/NOAA-20

- **Contexto.** O brief pede uma referência explícita. Aqua e NOAA-20 têm
  passagens próximas (~13h30), o que isola o efeito da resolução.
- **Decisão.**
  - Escala-alvo: MODIS/Aqua.
  - Ajuste em 2020–2022, avaliação em 2023–2025.
  - Comparação com "sem ajuste" e "razão simples".
- **Consequência conhecida.** A deriva do Aqua e a troca de coleção MODIS
  coincidem com a fronteira entre ajuste e avaliação. Isso está documentado e é
  medido.

### ADR-006: Gráficos em SVG feitos à mão

- **Contexto.** O roteiro sugere SVG para o calendário (24 × 52). As cores
  seguem a skill `dataviz`.
- **Decisão.** Nenhuma biblioteca de gráficos.
  - Eixo y único, sem eixo duplo.
  - Rótulos diretos e dica por mouse e teclado.
  - Tabela equivalente para cada gráfico.
  - Paleta validada com o `validate_palette.js` da skill.
- **Paleta:** sensores `#2f6fd0` e `#0f8f6a` (todos os pares aprovados,
  contraste ≥ 3:1); rampa ordinal de 5 laranjas com o tom mais claro em ≥ 2:1.

### ADR-007: Python 3.13 em ambiente virtual dedicado

- **Contexto.** A skill `geopandas` testou o conjunto com 3.12; o sistema tem
  3.13 e 3.14; `uv` não está instalado.
- **Decisão.** `python3.13 -m venv pipeline/.venv`, com as versões fixadas pelas
  skills (`requirements.lock`). A skill `statsmodels` registra checagem nativa
  em 3.13.

## Versões fixadas

**Frontend.** Política: versão publicada há pelo menos duas semanas, com uma
exceção justificada.

- react 19.3.1, vite 8.3.5, @vitejs/plugin-react 6.1.2, typescript 5.9.3;
- maplibre-gl 6.16.0, vitest 5.0.5;
- @playwright/test 1.65.0. É a exceção: tem 9 dias, mas usa o Chromium 1254 já
  presente no cache local, o que evita baixar outro navegador.

**Pipeline.** geopandas 1.2.0, pandas 3.0.6, numpy 2.5.3, shapely 2.1.2,
pyproj 3.8.0, statsmodels 0.15.0, scipy 1.18.1 (ver
`pipeline/requirements.lock`).
