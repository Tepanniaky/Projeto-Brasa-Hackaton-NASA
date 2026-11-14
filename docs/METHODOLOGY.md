# BRASA: metodologia e limitações

Documento da OPP Team, versão do pipeline 0.1.0, de 2026-11-14.

Os números deste documento vêm dos arquivos gerados pelo pipeline e foram
conferidos em [`evidencia/harmonizacao.md`](evidencia/harmonizacao.md). Esse
arquivo tem 19 afirmações, cada uma ligada a uma fonte e auditada com o
`audit_claims.py` da skill `scientific-writing`. Se os dados forem regenerados,
rode `python -m brasa.evidence` e audite de novo antes de citar números.

## 1. Pergunta e escopo

**"Estamos observando mais fogo ou apenas enxergando melhor?"**

O BRASA separa três coisas que costumam vir misturadas:

1. o que cada sensor registrou;
2. quanto da diferença entre sensores vem do instrumento;
3. o que sobra depois de levar em conta a diferença de instrumento.

O BRASA **não** estima número de incêndios, área queimada, emissões nem risco
futuro.

## 2. Dados e procedência

| Fonte | O que é | Como entra |
|---|---|---|
| FIRMS, arquivos anuais por país (`/data/country/<produto>/<ano>/`) | MODIS C6/C6.1 (MCD14ML) Terra+Aqua; VIIRS C2 375 m NOAA-20 (VJ114IMGML) | `brasa.fetch_firms`: download em fluxo, SHA-256 do arquivo inteiro conferido com o cabeçalho `x-amz-meta-sha256` do servidor, recorte pelo retângulo da Bahia **sem alterar nenhum campo** |
| CSV da ferramenta FIRMS Archive Download | Mesmas colunas | `brasa.cli import-firms`, com SHA-256 local registrado |
| IBGE, API de malhas, qualidade intermediária | 417 municípios da Bahia, SIRGAS 2000 | Arquivo local com SHA-256 no manifesto. É idêntico ao GeoJSON da equipe (IoU = 1,0 nos 417). |
| Camada A: série da equipe (`web/public/api`) | Calendário semanal harmonizado 2003–2026 | Usada como recebida e auditada (§7) |

Os 12 arquivos FIRMS (2 produtos × 2020–2025) tiveram o SHA-256 conferido com o
servidor em 2026-11-14. O manifesto (`web/public/data/real/manifest.json`)
registra, para cada arquivo:

- URL e data `Last-Modified`;
- hash do arquivo de origem;
- linhas totais e linhas no recorte.

Cada detecção processada preserva:

- sensor, satélite e instrumento;
- `acq_date` e `acq_time` (UTC) e a data local;
- `version` e o tipo de processamento (SP ou NRT, inferido do sufixo da versão);
- confiança original;
- `type`;
- arquivo de origem e SHA-256 da origem.

## 3. Tempo: definição de "dia"

- **No BRASA (camada B), dia é a data civil local de `America/Bahia`.** Ela é
  obtida de `acq_date + acq_time` (UTC) por conversão de fuso com `zoneinfo`,
  não por subtração fixa. A Bahia está em UTC−3 sem horário de verão em
  2020–2025.
- **Efeito prático.** As passagens de 01h30 local (Aqua/NOAA-20 à noite) ficam
  no mesmo dia local. As passagens noturnas do Terra (~01 UTC = 22h local)
  ficam no **dia anterior** à data UTC.
- **Mês:** o mês da data local.
- **Na série da equipe (camada A), semana** é um bloco fixo de 7 dias desde
  1º de janeiro, pela **data UTC**. A semana 51 absorve os 8 ou 9 dias finais
  do ano. Reproduzimos isso exatamente: 52 de 52 semanas em Formosa do Rio
  Preto. Pela data local, só 41 de 52 coincidiriam.
- **Escala temporal mínima.** O guia MODIS alerta para vieses severos em
  intervalos menores que cerca de 8 dias (§7.1.1). Por isso as séries por
  sensor do BRASA são **mensais**. O calendário semanal é o da camada A, com
  essa ressalva.

## 4. Qualidade: critérios por produto

As escalas de confiança **não são equivalentes e nunca são convertidas entre si**.

| Produto | Mantido | Fonte |
|---|---|---|
| MODIS (MCD14ML) | `confidence` ≥ 30 % (classes nominal e alta; baixa < 30 %) | Guia MODIS C6.1, Tabela 11 e §8.4.2 |
| VIIRS 375 m | `confidence` ∈ {n, h} | Guia VIIRS C2 v1.2, §2. A classe baixa se liga a reflexo solar e à **Anomalia Magnética do Atlântico Sul**, e a Bahia está dentro dela. |
| Ambos | `type = 0` (presumida vegetação) quando o campo existe | Guias e atributos FIRMS |

**Ordem dos descartes.** Cada registro recebe só o **primeiro** motivo aplicável:

1. satélite fora do escopo (Terra, S-NPP);
2. duplicado (mesmo sensor, coordenadas e instante);
3. tipo ≠ 0;
4. baixa confiança;
5. fora da Bahia.

A contagem por motivo, sensor e ano está no manifesto e no painel de metodologia.

**Resultado.** Ficaram 68.267 detecções MODIS/Aqua e 386.397 VIIRS/NOAA-20 em
2020–2025.

**Versões observadas nos dados:**

- MODIS `6.03` em 2020–2022 e `61.03` em 2023–2025, isto é, Collection 6 e
  depois 6.1, pela convenção `CCC.VV` do guia (§5.5.1);
- VIIRS `2` (Collection 2) em todos os anos;
- todos os registros são processamento padrão (SP), sem sufixo NRT.

## 5. Espaço: município, grade e unidade de agregação

- **Município.** Ponto-no-polígono com predicado `intersects`, que inclui a
  borda. Um ponto exatamente na divisa fica com o menor código IBGE. Na
  execução real não houve nenhum caso de divisa.
- **CRS da grade:** EPSG:10857 (SIRGAS 2000 / Brazil Albers, de área igual).
  - A Bahia cruza os fusos UTM 23S e 24S, por isso UTM foi descartado.
  - A transformação WGS84 → 10857 tem precisão de 1 m e não é "ballpark"
    (verificado com `crs_reprojection_plan.py` da skill `geopandas`).
  - A área da Bahia calculada nesse CRS é de 564.760 km², igual à oficial do IBGE.
- **Grades comuns:** 5 km e 10 km, com origem em (0, 0). Cada célula de 5 km
  está contida numa única célula de 10 km, propriedade coberta por teste.
- **Fragmento** = célula ∩ município. Os municípios somam o estado nas métricas
  aditivas.

**Métricas por sensor (nunca somadas entre sensores):**

| Métrica | Definição | Aditiva entre municípios |
|---|---|---|
| `deteccoes` | registros mantidos | sim |
| `dias_com_deteccao` | dias locais distintos com ≥ 1 detecção | **não** (recalculada para o estado) |
| `dias_celula_g5`, `dias_celula_g10` | pares (fragmento, dia local) com ≥ 1 detecção | sim |

"Dias com pelo menos uma detecção por célula e por sensor" é uma **etapa de
agregação, não uma harmonização**.

## 6. Harmonização experimental (camada B)

- **Referência (escala-alvo):** MODIS/Aqua, em dias-célula.
- **Preditor:** VIIRS/NOAA-20 no mesmo fragmento e mês.
- **Por que essa dupla:** os dois passam por volta das 13h30 e 01h30, o que
  reduz a diferença de amostragem do ciclo diário. A diferença que sobra vem
  principalmente da resolução: 1 km contra 375 m.

**Divisão temporal sem vazamento:**

- ajuste em 2020–2022, sem 2020-08 e 2020-09 (falha do Aqua, guia MODIS §7.2.4);
- avaliação em 2023–2025;
- teste automatizado (`test_fit_has_no_leakage_from_evaluation_years`): o teste
  corrompe os valores dos anos de avaliação e verifica que o ajuste não muda.

**Métodos comparados,** todos ajustados só no treino:

1. sem ajuste: VIIRS usado direto como estimativa do MODIS;
2. razão simples: k = ΣMODIS / ΣVIIRS;
3. binomial negativa (NB2, `statsmodels.discrete`):
   `log μ = log(área do fragmento) + β0 + β1·log(1 + VIIRS) + γ_mês`.
   - O Poisson foi ajustado primeiro, como triagem de dispersão.
   - α = 0 é fronteira do espaço de parâmetros, então não reportamos p-valor
     qui-quadrado ingênuo, como pede a skill `statsmodels`.
   - A fórmula exportada é conferida contra o `predict` do statsmodels.

**Intervalo exibido:** μ ± 1,645·√Σ(μ + αμ²), supondo independência entre
fragmentos.

**Avaliação.** Calculamos MAE, viés, erro relativo do total e Spearman por ano,
em três níveis:

- total mensal do estado;
- total anual por município;
- total mensal por município.

O pipeline **marca automaticamente** três situações:

- o modelo não supera a melhor linha de base;
- o erro na avaliação passa de 1,5× o do treino;
- a cobertura do intervalo de 90 % fica abaixo de 75 %.

### Resultados (dados reais, 2026-11-14)

- **H1 (a diferença entre sensores é de instrumento): sustentada.**
  - A razão anual VIIRS ÷ MODIS no estado foi de 5,2× a 6,1× em detecções e de
    3,4× a 4,3× em dias-célula de 10 km.
  - No mapa, a razão é muito maior no leste (focos pequenos) do que no oeste
    (Cerrado, queimadas grandes).
- **H2 (dias-célula estabilizam a relação): não confirmada.** O coeficiente de
  variação anual da razão foi 0,061 em detecções e 0,088 em dias-célula de
  10 km. A agregação aproxima a magnitude, mas não torna a relação mais estável
  entre anos.
- **Grade de 10 km.** A binomial negativa superou a melhor linha de base:
  - em 2 de 3 anos de avaliação no total mensal do estado;
  - em 3 de 3 no total anual por município.
  - Em 2023 (estado-mês) ela perdeu para a razão simples, e isso está marcado.
- **Grade de 5 km.** A binomial negativa superou a linha de base em só 1 de 3
  anos. Pela regra fixa (menor erro relativo na avaliação), a interface usa
  10 km.
- **Incerteza subestimada.** O intervalo de 90 % cobriu só de 17 % a 50 % dos
  meses estaduais na avaliação, porque a independência espacial é falsa. A
  interface diz isso ao lado do gráfico.
- **Ljung-Box** nos resíduos mensais do treino: p = 0,16 na grade de 10 km e
  p = 0,027 na de 5 km. Na de 5 km há autocorrelação não modelada.
- **H3 (transferência para anos não vistos): parcial.** Dois fatores de
  confusão coincidem com a fronteira 2022/2023:
  - a troca de coleção MODIS (C6 → C6.1). Pelo guia, ela tem efeito pequeno nas
    contagens;
  - a deriva do Aqua: o horário mediano das detecções diurnas foi de 13h39
    (2020) para 14h51 (2025), enquanto o NOAA-20 ficou em 13h29.

**O que isto NÃO é.** Uma estimativa VIIRS "na escala MODIS" diz quantos
dias-célula o MODIS/Aqua *provavelmente* registraria. Não diz quanto fogo houve.

## 7. Auditoria da série da equipe (camada A)

A equipe declara: "até 2021, MODIS observado; a partir de 2022, VIIRS convertido".
Os scripts que geraram a série **não estão no repositório**. Por isso a
afirmação de "erro médio de 2,2 % no total anual" **não foi reproduzida**.

Com os registros FIRMS verificados, o BRASA fez duas checagens.

**Reprodução de 2020–2021.**

- Em 372 de 417 municípios, as 52 semanas coincidem exatamente com a contagem
  MODIS Terra+Aqua **sem filtro de confiança nem de tipo**, com semanas pela data
  UTC.
- Nos demais municípios e no total estadual, as diferenças são menores que
  0,3 % ao ano. Uma causa provável são pontos de borda e o recorte estadual.

**Divergência de 2022–2025.** Consideramos os municípios com ao menos 50
detecções MODIS no ano.

| Ano | Mediana da diferença (série da equipe − MODIS observado) | MODIS observado dentro da faixa 5–95 % publicada |
|---|---|---|
| 2022 | −11 % | 10 % dos municípios |
| 2023 | −15 % | 11 % |
| 2024 | −21 % | 6 % |
| 2025 | −23 % | 7 % |

Leitura:

- A série convertida fica sistematicamente **abaixo** do que o MODIS de fato viu.
- A faixa publicada cobre só a incerteza do fator de conversão.
- Uma explicação **plausível e ainda não testada** é a deriva do Aqua. Desde
  dez/2021 ele passa mais tarde, mais perto do pico de fogo da tarde, e pode
  "ver mais" sem que haja mais fogo.
- Se for isso, a série da equipe estaria corrigindo um viés do MODIS, não
  errando. Testar exige comparar por horário de passagem (próximos passos).

## 8. Limitações (para exibir e citar)

1. **Uma detecção não é um incêndio.** É um pixel (375 m ou ~1 km, maior na
   borda da faixa MODIS) com fogo ativo no instante da passagem.
2. **Ausência de detecção não prova ausência de fogo.**
   - Nuvens, fumaça, copa de árvores, fogo pequeno ou frio e fogo fora do
     horário da passagem não são detectados.
   - Os arquivos de focos não trazem cobertura de nuvens nem a lista de
     passagens. O BRASA não inventa cobertura observacional.
3. **Nunca somamos MODIS e VIIRS.** Quando ambos são exibidos, aparecem lado a
   lado, ou como razão VIIRS ÷ MODIS no mapa.
4. **Focos não são convertidos em área queimada.**
5. **A harmonização é experimental:**
   - intervalo subestimado;
   - fatores de confusão na fronteira entre ajuste e avaliação;
   - um único par de satélites;
   - um único estado.
6. **Dados preliminares.** O ano corrente na camada A é provavelmente NRT. As
   semanas não publicadas aparecem como "sem dado".
7. **Bug no campo `type` do VIIRS C2.** O guia v1.2 (§6.1) informa que, nas
   versões de produto 1 e 2, fontes estáticas foram rotuladas como vegetação
   (corrigido em maio/2025, versão 3). O campo `version` do FIRMS (`2`) não
   revela a versão do produto. Alguma fonte industrial pode ter entrado como
   fogo.
8. **Falha do Aqua de 16/08 a 02/09/2020.** A cobertura MODIS foi parcial; os
   meses aparecem hachurados e foram excluídos do ajuste.

## 9. Regras de domínio FIRMS (base para a skill `brasa-firms`)

Resumo verificado nos documentos oficiais em 2026-11-14. Ele ainda não foi
instalado como skill: falta o teste com agentes exigido pela skill
`writing-skills`.

- **Fuso.** `acq_date`/`acq_time` estão em UTC.
- **Satélite.** O campo `satellite` usa `Aqua`/`Terra` (ou `A`/`T` em NRT) e `N`
  (S-NPP), `N20` (NOAA-20), `N21` (NOAA-21).
- **Confiança.** MODIS em 0–100 com classes < 30 / 30–79 / ≥ 80; VIIRS em
  `l`/`n`/`h`. Não converter entre as duas.
- **Tipo.** `type`: 0 presumida vegetação, 1 vulcão, 2 outra fonte estática
  terrestre, 3 offshore. Só existe em dados SP; os arquivos NRT não trazem esse
  campo.
- **Versão.** `version` com sufixo NRT/RT/URT indica processamento rápido; sem
  sufixo, SP. No MODIS, `6.03` e `61.03` seguem `CCC.VV` (coleção e versão).
- **Arquivos por país.** Os anuais
  (`https://firms.modaps.eosdis.nasa.gov/data/country/<modis|viirs-jpss1|viirs-snpp>/<ano>/<produto>_<ano>_Brazil.csv`)
  não exigem MAP_KEY e publicam SHA-256 no cabeçalho `x-amz-meta-sha256`.
- **Localização.** O ponto é o centro do pixel, não a posição do fogo.
- **Anomalia Magnética.** Na América do Sul, a classe VIIRS baixa está sujeita a
  falsos positivos (SAMA).
- **Deriva do Aqua.** O Aqua está sem manobras de arrasto desde dez/2021 e
  deriva para passagens mais tarde. O Terra também deriva, para passagens mais
  cedo (visível nos dados: 10h24 → 9h12).
