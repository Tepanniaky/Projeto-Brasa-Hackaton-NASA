# Harmonização MODIS × VIIRS: afirmações e evidências

<!-- Gerado por `python -m brasa.evidence` a partir dos JSONs do pipeline. Não edite à mão. -->

Cada linha abaixo é uma afirmação registrada em `afirmacoes.csv`, ligada às fontes de `fontes.json`.

- A referência do ajuste é o MODIS/Aqua e o preditor é o VIIRS/NOAA-20, ambos em dias-célula. [claim:C001] [evidence:E005]
- O ajuste usa 2020, 2021, 2022 sem 2020-08 e 2020-09 (falha do Aqua) e a avaliação usa 2023, 2024, 2025. [claim:C002] [evidence:E005, E001]
- No MODIS, confiança abaixo de 30 % é classe baixa, de 30 % a 79 % é nominal e a partir de 80 % é alta; o BRASA mantém nominal e alta. [claim:C003] [evidence:E001]
- No VIIRS 375 m, a confiança baixa está associada a reflexo solar e à Anomalia Magnética do Atlântico Sul; o BRASA mantém nominal e alta. [claim:C004] [evidence:E002]
- Os campos acq_date e acq_time do FIRMS estão em UTC; o BRASA converte para a data local de America/Bahia. [claim:C005] [evidence:E003]
- Ficaram 68.267 detecções MODIS/Aqua e 386.397 VIIRS/NOAA-20 na Bahia em 2020–2025 após os critérios de qualidade. [claim:C006] [evidence:E004]
- A versão MODIS é 6.03 em 2020–2022 e 61.03 em 2023–2025, isto é, Collection 6 e depois Collection 6.1. [claim:C007] [evidence:E004, E001]
- O horário local mediano das detecções diurnas do Aqua passou de 13h39 em 2020 para 14h51 em 2025, enquanto o NOAA-20 ficou em 13h29. [claim:C008] [evidence:E004]
- O Aqua encerrou as manobras de compensação de arrasto em dezembro de 2021 e deriva para passagens mais tarde. [claim:C009] [evidence:E007]
- A razão anual VIIRS ÷ MODIS no estado variou de 5,2× a 6,1× em detecções e de 3,4× a 4,3× em dias-célula de 10 km. [claim:C010] [evidence:E005]
- O coeficiente de variação anual dessa razão foi 0,061 em detecções e 0,088 em dias-célula de 10 km, então a agregação em dias-célula não estabilizou a relação (H2 não confirmada). [claim:C011] [evidence:E005]
- Na grade de 10 km a binomial negativa superou a melhor linha de base em 2 de 3 anos de avaliação no total mensal do estado e em 3 de 3 no total anual por município. [claim:C012] [evidence:E005]
- Na grade de 5 km a binomial negativa superou a melhor linha de base em 1 de 3 anos de avaliação no total mensal do estado. [claim:C013] [evidence:E005]
- O intervalo aproximado de 90 % cobriu de 17 % a 50 % dos meses estaduais nos anos de avaliação, então subestima a incerteza. [claim:C014] [evidence:E005]
- A série semanal da equipe de 2020–2021 foi reproduzida exatamente em 372 de 417 municípios como contagem MODIS Terra+Aqua sem filtro por data UTC. [claim:C015] [evidence:E006]
- Em municípios com ao menos 50 detecções MODIS no ano, a mediana da diferença entre a série da equipe e o MODIS observado foi 2022: −11 %, 2023: −15 %, 2024: −21 %, 2025: −23 %. [claim:C016] [evidence:E006]
- O MODIS observado ficou dentro da faixa publicada pela equipe em 6 % a 11 % desses municípios, conforme o ano. [claim:C017] [evidence:E006]
- A deriva do Aqua em direção ao pico vespertino de fogo é uma explicação plausível para o MODIS observado ficar acima da série convertida, mas não foi testada. [claim:C018] [evidence:E004, E007]
- A validação com erro médio de 2,2 % no total anual informada no roteiro da equipe não foi reproduzida, porque os scripts e o protocolo não estavam disponíveis. [claim:C019] [evidence:E008]
