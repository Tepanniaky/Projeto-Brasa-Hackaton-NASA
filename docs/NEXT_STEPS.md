# BRASA: próximos passos priorizados

Prioridade: **P0** antes da submissão · **P1** fortalece a ciência · **P2** produto.

## P0: antes da submissão

1. ~~**Publicar o site estático.**~~ Feito em 15/11/2026: https://brasa-bahia.vercel.app/
   (Vercel, plano Hobby; versão em inglês com `?lang=en`).
   - Confirme na página oficial do desafio se o repositório precisa ser público.
2. **Combinar com a equipe a mensagem sobre a série harmonizada.**
   - A auditoria mostra a série convertida de 11 % a 23 % abaixo do MODIS
     observado em 2022–2025.
   - O MODIS observado cai na faixa publicada em menos de 11 % dos municípios.
   - Decidir: (a) apresentar a faixa como "incerteza da conversão apenas", como
     a interface já faz; ou (b) alargá-la com o erro de validação.
3. **Pedir a Marcelo os scripts `preparar_dados.py`, `harmonizar.py` e
   `gerar_calendario.py`.**
   - Com eles dá para reproduzir os "2,2 % de erro anual" e versionar a camada A
     neste repositório.
   - Até lá, a interface diz que a validação não foi reproduzida.
4. **Gravar o vídeo** com `docs/DEMO_SCRIPT.md`. Conferir o limite de duração
   no regulamento.
5. **Iniciar o git e fazer o primeiro commit.** O diretório ainda não é um
   repositório; o `.gitignore` já exclui dados brutos, `node_modules` e `.venv`.

## P1: rigor científico

6. **Testar a hipótese da deriva do Aqua.**
   - Estratificar por `daynight` e por faixa de horário local.
   - Comparar o MODIS/Aqua com o VIIRS/NOAA-20 só em passagens próximas
     (|Δt| < 30 min).
   - Se a razão MODIS ÷ VIIRS crescer com o atraso do Aqua, a hipótese
     "enxergando melhor" ganha evidência.
7. **Separar o efeito da troca C6 → C6.1.** A fronteira ajuste/avaliação
   coincide com ela. Duas opções:
   - baixar 2018–2019 do arquivo SP (já testado: os arquivos existem) para ter
     mais anos de treino em C6;
   - fazer validação cruzada por ano (deixar um ano de fora).
8. **Corrigir a subcobertura do intervalo.** Alternativas:
   - erro empírico de validação (conformal por ano);
   - bootstrap por bloco espacial.
   - A cobertura atual é de 17–50 % no mês estadual.
9. **Usar a cobertura observacional.** Hoje ela não existe nos arquivos de
   focos. Precisa dos produtos gridded (MOD14A1/VNP14A1) ou da máscara de nuvens
   para separar "sem fogo" de "não observado".
10. **Incluir S-NPP e NOAA-21** como preditores, para ficar comparável à série
    da equipe, que usa os três VIIRS.
11. **Comparação independente** com o INPE BDQueimadas, satélite de referência.
12. **Revalidar o campo `type` do VIIRS** com a versão 3 do produto, quando o
    FIRMS indicar.

## P2: produto

13. **Testar com 3 a 5 técnicos municipais** a hipótese H5: responder em menos
    de 1 minuto "quando queima aqui e este ano está fora do normal?".
14. **Comparar dois municípios lado a lado** e **selecionar área livre por
    polígono**. Itens opcionais do roteiro.
15. **Separar o pacote JS** (`manualChunks` para o maplibre) e carregar
    `auditoria_equipe.json` só sob demanda.
16. **Revisão de acessibilidade** com `design:accessibility-review`:
    - leitores de tela no canvas do mapa;
    - navegação por teclado nos calendários mensais.
17. **Criar a skill `brasa-firms`** a partir de `METHODOLOGY.md` §9, seguindo a
    `writing-skills`: cenários de pressão com subagentes, linha de base sem a
    skill, depois com a skill.
18. **Modo escuro**, com a paleta revalidada sobre a superfície escura.
