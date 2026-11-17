# Radar BH

O que cada vereador de Belo Horizonte faz, só com dados oficiais da Câmara Municipal (CMBH).
Por enquanto: **presença nas reuniões do Plenário**, mandato 2025–2028.

## Como funciona

```
scripts/coletar.js     baixa do site da CMBH → dados/*.json   (1 requisição a cada 10 s, como pede o robots.txt)
scripts/coletar-extras.js  homenagens em reunião solene e comissões → dados/homenagens.json, dados/comissoes.json
scripts/coletar-votacoes.js  o que foi votado em cada reunião e quem registrou presença em cada votação → dados/votacoes.json
scripts/gerar-site.js  dados/*.json → site/dados.json         (sem internet)
scripts/conferir.js    compara a presença mensal com o XLSX de cada reunião → dados/conferencia.json
site/                  página estática (index.html, app.js, style.css, dados.json)
```

Precisa de Node 20 ou mais novo e não usa nenhuma dependência.

```bash
npm run atualizar          # coleta incremental + gera o site
node scripts/coletar.js --tudo     # refaz todos os meses
node scripts/conferir.js 2         # confere as 20 reuniões mais recentes
```

O mês em andamento ainda não está na tabela mensal da Câmara. Ele vem dos relatórios por reunião (um XLSX por reunião, publicado 1 a 3 dias depois) e aparece no site como **provisório** até a tabela mensal sair. Nesses relatórios, a presença vem da coluna PRESENTE/AUSENTE, que é a que bate com a tabela mensal. A coluna de código às vezes traz `#REF!` ou contradiz a coluna PRESENTE/AUSENTE. Por isso, uma ausência sem tipo confiável aparece como `AUS` (ausente, tipo ainda não informado).

Se a coleta vier incompleta ou estranha (menos de 35 vereadores, mês diferente do pedido, tabela desalinhada, menos meses que antes), o script **para sem gravar nada** e o site fica com a última versão boa.

## Votos nominais (como cada vereador votou)

A Câmara só publica o voto de cada vereador como **PDF escaneado** (a "ficha de votação"), e a busca que leva até ele não aceita robôs. Por isso, esses votos são transcritos à mão em `dados/votos-nominais.json`:

1. No site da Câmara, abra a proposição → **Tramitação** → documento "Decisão e ocorrências" (a ficha de votação, em PDF).
2. Copie o link do PDF e copie um bloco existente do arquivo.
3. Preencha matéria, turno, data, reunião, autoria, ementa, resultado, totais (como impressos na ficha), o link da ficha e o voto de cada vereador.
4. Rode `npm run site`. Se a soma dos votos não bater com os totais da ficha, o gerador **para com erro**.

O critério de escolha das votações fica no campo `criterio` e aparece no site.

## Canal de correção

Em `radar.config.json`, preencha **uma** destas opções e rode `npm run site`:

- `"tipo": "email"` com `"endereco"`. De preferência, um e-mail só do projeto, não o pessoal. O site mostra um botão no rodapé e, em cada vereador, um link "Viu algo errado aqui? Avise" que abre o e-mail já com nome, mês e o que está errado.
- `"tipo": "link"` com `"url"` (por exemplo, um Google Forms). Para o formulário já abrir com o nome do vereador:
  1. No Google Forms, menu ⋮ → **Obter link preenchido**.
  2. Na pergunta "Vereador(a)", escreva `VEREADOR` e clique em **Gerar link** → **Copiar link**.
  3. Cole em `"url"` e troque `VEREADOR` por `{vereador}`. Fica algo como `https://docs.google.com/forms/d/e/.../viewform?usp=pp_url&entry.123456={vereador}`.

  No rodapé, o mesmo link abre com o campo vazio.

Enquanto estiver vazio, o site diz que o canal ainda está sendo configurado.

Cada correção feita entra em `dados/correcoes.json` (data, vereador, o que mudou) e aparece em "Correções feitas" no rodapé.

## Regras

- Só dado oficial, com link para a fonte.
- Mesma regra para todos os vereadores. Ordem alfabética, sem ranking nem nota.
- Dado ausente não é falta: dia "sem registro" aparece como sem registro.
- Só contato público (telefone e e-mail de gabinete).
- Quem aparece na presença, mas não está na lista atual de vereadores (suplentes), aparece separado.
- `dados/apelidos.json` casa nomes escritos de jeitos diferentes (ex.: "Vile" → `vile-santos`).

Fontes levantadas no Passo 1: [PASSO-1-fontes-de-dados.md](PASSO-1-fontes-de-dados.md).
