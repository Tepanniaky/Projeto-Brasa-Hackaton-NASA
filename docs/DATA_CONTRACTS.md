# BRASA: contratos de dados (Python → frontend)

Os tipos TypeScript que espelham este documento ficam em `web/src/data/types.ts`.
Qualquer mudança aqui precisa entrar nos dois lados e incrementar `schema_version`.

Convenções gerais:

- JSON estrito: sem `NaN` nem `Infinity`. Um valor ausente é `null`.
- Datas em ISO. Meses como `"AAAA-MM"`, pela data **local** (`America/Bahia`).
- Códigos de município: código IBGE de 7 dígitos. O estado é `"29"`.
- `sensor` ∈ {`MODIS_AQUA`, `VIIRS_NOAA20`}. **Nenhum campo soma os dois sensores.**

## Camada B: `web/public/data/real/`

### `manifest.json` (porta de entrada)

| Campo | Tipo | Significado |
|---|---|---|
| `schema_version` | `"1.0"` | versão do contrato |
| `pipeline_version` | string | versão do pacote `brasa` |
| `dataset_kind` | `"real"` \| `"synthetic"` \| `"exemplo"` | Tudo que não for `real` faz a interface mostrar a faixa permanente "Dados de demonstração — sintéticos". |
| `gerado_em_utc` | ISO datetime | quando o build rodou |
| `periodo` | `{inicio, fim}` (AAAA-MM) | cobertura das séries |
| `fuso`, `definicao_dia` | string | tratamento de horário (texto exibido) |
| `sensores[]` | `{id, rotulo, instrumento, satelite, produto, pixel_nominal_m, regra_qualidade, tipo_confianca}` | metadados de cada sensor |
| `grades[]` | `{id: "g5"\|"g10", tamanho_m, crs, fragmentos}` | grades comuns |
| `grade_padrao` | `"g5"` \| `"g10"` | escolhida por regra determinística (menor erro relativo na avaliação) |
| `metricas[]` | `{id, rotulo, aditiva, descricao}` | métricas disponíveis |
| `fontes_firms[]` | `{product, year, source_url, http_last_modified, source_sha256, sha256_verified, source_rows, subset_rows, retrieved_at_utc}` | procedência |
| `fontes_ibge` | `{malha, sha256, nomes, crs}` | procedência da malha |
| `indisponibilidades[]` | `{sensor, start, end, kind, note, source}` | lacunas conhecidas (ex.: falha do Aqua em 2020) |
| `qualidade[]` | `{sensor, ano, linhas, mantidos, descartes{motivo: n}, versoes[], processamento[]}` | auditoria dos critérios |
| `deriva_passagem[]` | `{satelite, ano, hora_local_mediana, n}` | horário mediano das detecções diurnas |
| `atribuicao_municipio` | objeto | auditoria do ponto-no-polígono |
| `arquivos` | `{serie_mensal, harmonizacao, auditoria_equipe?}` | nomes dos demais arquivos |

### `serie_mensal.json`

```jsonc
{
  "schema_version": "1.0",
  "meses": ["2020-01", "...", "2025-12"],         // N meses
  "sensores": ["MODIS_AQUA", "VIIRS_NOAA20"],
  "regioes": {
    "29": {                                         // estado
      "nome": "Bahia",
      "area_km2": 564759.9,
      "series": {
        "MODIS_AQUA":   { "deteccoes": [N], "dias_com_deteccao": [N], "dias_celula_g5": [N], "dias_celula_g10": [N] },
        "VIIRS_NOAA20": { "...mesmas chaves..." }
      },
      "harmonizado": { "g10": { "estimativa": [N], "dp": [N] }, "g5": { } },   // ou null
      "referencia_equipe_modis_ta": [N]             // MODIS Terra+Aqua sem filtro, mês UTC (auditoria)
    },
    "2900108": { }                                  // os 417 municípios
  }
}
```

Invariantes, cobertas por testes:

- Para `deteccoes` e `dias_celula_*`, o estado é igual à soma dos municípios,
  sensor a sensor.
- `dias_com_deteccao` do estado é recalculado, porque **não** é a soma.
- `harmonizado.*.estimativa` está em dias-célula **equivalentes MODIS/Aqua**.
  O desvio-padrão é `dp` = √Σ(μ + αμ²).

### `harmonizacao.json`

| Campo | Significado |
|---|---|
| `status` | `ok` \| `dados_insuficientes` |
| `referencia`, `preditor`, `unidade` | definição do ajuste |
| `anos_ajuste`, `anos_avaliacao`, `meses_excluidos_do_ajuste` | divisão temporal (anos disjuntos) |
| `grades.<g>.ajuste` | `razao_k`, `binomial_negativa.{params, alpha, ic95, convergiu, aic, aic_poisson, dispersao_pearson_poisson, formula_confere_predict}` |
| `grades.<g>.avaliacao.metricas[]` | `{grade, nivel, ano, divisao, metodo, n, mae, vies_medio, erro_relativo_total, spearman}` |
| `grades.<g>.avaliacao.marcacoes[]` | `{tipo: ajuste_nao_melhora \| degrada_fora_do_ajuste \| incerteza_subestimada, nivel, ano, mensagem}` |
| `grades.<g>.avaliacao.cobertura[]` | cobertura observada do intervalo de 90 % |
| `grades.<g>.diagnosticos` | Ljung-Box dos resíduos mensais do treino |
| `comparabilidade[]` | razão VIIRS ÷ MODIS anual por métrica, coeficiente de variação e Spearman (teste de H2) |

A fórmula da binomial negativa, para quem quiser aplicar os coeficientes:

```
μ = área_frac · exp(const + log1p_viirs·log(1 + VIIRS_dias) + mes_MM)   (janeiro = base, mes_01 = 0)
```

### `auditoria_equipe.json`

- **Síntese:** `municipios_reproduzidos_2020_2021`, `municipios_auditados` e
  `sintese_2022_2025_municipios_com_50_ou_mais[ano]`.
- **Detalhe por região:** `regioes[cod]`, com:
  - `reproducao_2020_2021[]`: semanas iguais e totais;
  - `comparacao_anual[]`: `{ano, equipe, equipe_min, equipe_max, modis_ta_observado, diferenca_relativa, observado_dentro_da_faixa, origem_equipe}`;
  - `reproduzida`.

## Camada A: `web/public/api/` (equipe)

Descrita em `web/public/api/LEIA-ME.md`. Campos consumidos pela interface:

- `municipios.json[]`: `{cod_mun, nome, media_anual, semana_pico, razao_ano_atual_vs_mediana|null, alerta_ultimas_4_semanas}`
- `estado.json` e `mun/<cod>.json`, com os campos:
  - `semanas[52]`, `climatologia{media,p50,p75,p90}[52]`;
  - `periodo_critico|null`;
  - `calendario{anos[], valores[ano][52]}`;
  - `anual[]{ano,valor,min,max,parcial}`;
  - `ano_atual{ano, ultima_semana_completa, acumulado, mediana_historica_ate_a_data, razao_vs_mediana|null, posicao_no_historico, semanas[]}`;
  - `resumo`.
- `bahia_municipios.geojson`: 417 polígonos com `cod_mun` e `municipio`. É
  idêntico à malha do IBGE (IoU = 1,0).

Regras de interpretação aplicadas pela interface:

- As semanas depois de `ultima_semana_completa` no ano corrente são "sem dado",
  não zero.
- `periodo_critico: null` e `media_anual: 0` mostram o estado "nenhuma detecção
  no histórico" (ex.: 2919926).

## CSV exportado pela interface

- **Formato:** RFC 4180, separador `,`, ponto decimal, UTF-8 com BOM.
- **Nome:** `brasa_<local>_<de>-<ate>_<visao>.csv`.
- **Colunas:** `camada, tipo_dado, regiao_cod, regiao_nome, periodo, ano, mes, semana, serie, metrica, unidade, valor, valor_min, valor_max, divisao_harmonizacao, versao_produto, observacao, filtros`.
- **Linhas:**
  - `camada = A_equipe`: semanas da série da equipe no período. As semanas não
    publicadas saem com `valor` vazio.
  - `camada = B_pipeline`: um mês por sensor, em linhas separadas
    (`serie = MODIS_AQUA_original` / `VIIRS_NOAA20_original`).
  - Na visão harmonizada, entra também
    `serie = VIIRS_NOAA20_ajustado_escala_MODIS_AQUA`, com `valor_min`,
    `valor_max` e `divisao_harmonizacao`.
