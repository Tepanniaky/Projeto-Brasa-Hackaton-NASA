# Dados para o front-end

Tudo aqui é JSON estático. Não precisa de backend: basta servir a pasta `api/` junto com o site
(ou colocar em `public/api/` no Vite/Next) e usar `fetch`.

## Arquivos

| Arquivo | O que é | Quando carregar |
|---|---|---|
| `bahia_municipios.geojson` | Contorno dos 417 municípios (IBGE). Propriedades: `cod_mun`, `municipio` | Ao abrir o mapa |
| `municipios.json` | Lista resumida dos 417 municípios, para a busca e para colorir o mapa | Ao abrir o app |
| `estado.json` | Calendário completo da Bahia inteira | Tela inicial |
| `mun/<cod_mun>.json` | Calendário completo de um município (mesmo formato do estado) | Quando o usuário clica em um município |

## `municipios.json`

```json
{"cod_mun":"2902708","nome":"Barra","media_anual":738.0,"semana_pico":"01/10",
 "razao_ano_atual_vs_mediana":3.81,"alerta_ultimas_4_semanas":"normal"}
```

- `razao_ano_atual_vs_mediana`: 1.0 = ano igual ao normal; 2.0 = o dobro. Pode ser `null` em municípios quase sem fogo.
- `alerta_ultimas_4_semanas`: `normal`, `acima` ou `muito_acima`. Bom para colorir o mapa.

## `estado.json` e `mun/<cod>.json`

| Campo | Conteúdo | Sugestão de uso |
|---|---|---|
| `semanas` | 52 rótulos `dd/mm` (início de cada semana) | Eixo X |
| `climatologia.media / p50 / p75 / p90` | 52 valores cada: o "normal" de cada semana (2003 a 2025) | Faixa cinza de fundo no gráfico do ano |
| `periodo_critico` | Menor janela contínua com 80% do fogo do ano: `inicio`, `fim`, `n_semanas` | Destaque no calendário e texto "período crítico: 16/07 a 12/11" |
| `calendario.anos` + `calendario.valores` | Matriz [ano][semana] de 2003 até hoje | Mapa de calor ano × semana (a tela principal) |
| `anual` | Total por ano com `min`/`max` (incerteza) e `parcial` | Gráfico de barras ou linha |
| `ano_atual.semanas` | Cada semana do ano corrente: `valor`, `min`, `max`, `classe` | Linha do ano sobre a faixa da climatologia |
| `ano_atual.razao_vs_mediana` | Acumulado do ano ÷ mediana histórica até a mesma data | Número de destaque |
| `resumo` | `media_anual`, `ano_maximo`, `semana_pico` | Cartões de resumo |

### Classes de anomalia (`ano_atual.semanas[].classe`)

| Classe | Regra | Cor sugerida |
|---|---|---|
| `muito_acima` | acima do percentil 90 histórico da semana | vermelho |
| `acima` | acima do percentil 75 | laranja |
| `normal` | dentro do esperado | neutro |
| `abaixo` | menos da metade da mediana | azul claro |

Semanas com menos de 3 detecções nunca são marcadas como anômalas.

## Pontos de atenção

- **Unidade**: "detecções harmonizadas (equivalente MODIS)". Não é número de incêndios. Os valores têm casas decimais porque, a partir de 2022, vêm do VIIRS convertido.
- **Semana**: bloco fixo de 7 dias a partir de 1º de janeiro, de 0 a 51. Não é semana ISO.
- **No ano corrente**, as semanas depois de `ultima_semana_completa` aparecem como 0 em `calendario.valores`: tratem como "sem dado", não como "sem fogo".
- **`min` e `max`** são a faixa de 5% a 95% da conversão. Até 2021 são iguais ao valor, porque o dado é MODIS observado.
- **Texto obrigatório no app**: a ferramenta mostra padrões históricos e condições incomuns; não é previsão de incêndio.

## Como regenerar

```
python preparar_dados.py    # CSVs do FIRMS -> parquet recortado na Bahia
python harmonizar.py        # fatores, validação e série harmonizada
python gerar_calendario.py  # esta pasta api/
```
