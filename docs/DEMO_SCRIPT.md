# Roteiro de demonstração do BRASA (~3 min)

**Antes de começar:**

- Rode `npm run preview` em `web/` ou abra o link publicado.
- Use uma janela de 1440 × 900.
- Deixe o MODIS/Aqua aberto em `http://localhost:4173/`.
- Os números entre aspas vêm dos dados reais de 2026-11-14 e mudam se os dados
  forem regenerados.

## 0:00–0:25: a pergunta

> "Satélites detectam fogo na Bahia desde 2003. Mas os satélites mudaram: o
> VIIRS enxerga focos menores que o MODIS, e o MODIS está saindo de órbita. Então,
> quando o número sobe, **estamos vendo mais fogo ou só enxergando melhor?** O
> BRASA responde isso para cada município."

**Na tela:** abertura na Bahia. Aponte para o calendário e para os avisos
obrigatórios (fonte, unidade, limitação).

## 0:25–0:55: quando costuma queimar

**Ação:** role até **"Quando costuma queimar"**.

> "Cada linha é um ano, cada coluna uma semana, de 2003 a hoje. A moldura marca
> o período crítico: de 16 de julho a 12 de novembro, 18 semanas concentram 80 %
> da atividade."

**Ação:** passe o mouse numa célula escura de 2007 e mostre a dica. Depois
aponte para as células hachuradas de 2026.

> "Hachurado é 'sem dado ainda', não 'sem fogo'."

## 0:55–1:25: este ano está fora do normal?

**Ação:** digite **Barra** na busca e tecle Enter.

> "Em Barra, 2026 está 3,8 vezes acima do normal até esta data."

**Ação:** aponte os triângulos vermelhos acima da faixa cinza.

> "Cada símbolo diz se a semana ficou acima do percentil 75 ou do 90, e não só
> pela cor."

**Ação:** clique em outro município no mapa e mostre que o painel troca. Volte
para **Formosa do Rio Preto**.

## 1:25–2:15: mais fogo ou enxergando melhor?

**Ação:** escolha o período **2020 a 2025** e role até **"Mais fogo ou só
enxergando melhor?"**.

> "Aqui estão os registros originais dos dois satélites, lado a lado e nunca
> somados. O VIIRS registra 2,8 vezes mais dias-célula que o MODIS em Formosa.
> Isso é o instrumento, não o fogo."

**Ação:** clique em **Atividade no período** no mapa, com o sensor em **Ambos**.

> "No leste do estado, onde os focos são pequenos, o VIIRS vê até 50 vezes mais.
> No Cerrado do oeste, umas 4 vezes. Enxergar melhor pesa mais onde o fogo é
> pequeno."

**Ação:** clique em **Harmonizado**.

> "O que muda após o ajuste? Treinamos a conversão em 2020–2022 e testamos em
> 2023–2025, anos que o modelo nunca viu. Em Formosa, o VIIRS ajustado fica a
> +3 % do MODIS observado."

**Ação:** aponte a nota de incerteza.

> "E dizemos quando não funciona: o intervalo de incerteza é estreito demais,
> e a interface avisa."

## 2:15–2:45: a evidência que mudou a nossa leitura

**Ação:** role até **"A série da equipe confere com o que o MODIS viu?"**.

> "Até 2021, a nossa série reproduz exatamente o MODIS. A partir de 2022 ela vem
> do VIIRS convertido, e fica abaixo do que o MODIS viu. O motivo provável: o
> satélite Aqua derivou. Ele passava às 13h39 e agora passa às 14h51, mais perto
> do pico de fogo da tarde. O MODIS passou a ver mais sem que houvesse mais
> fogo. É uma hipótese que estamos testando, e está documentada."

## 2:45–3:00: fechar

**Ação:** clique em **Exportar CSV** e abra **Metodologia e limitações**.

> "Tudo é exportável com a procedência de cada linha, e cada número da
> metodologia aponta para a sua fonte. BRASA: o calendário do fogo, com a
> honestidade de dizer o que o satélite não vê."

**Plano B (sem internet):**

- O mapa de fundo some em até 8 s e fica um fundo liso com aviso.
- Os municípios, os calendários e o CSV continuam funcionando, porque os dados
  são locais.
