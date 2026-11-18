# Rotina semanal: votos nominais de 2º turno e gastos do gabinete

O robô diário do GitHub já atualiza presença, votações por reunião, comissões e homenagens.
Ele **não** consegue buscar as fichas de votação nominal, por dois motivos:

- a tramitação de cada proposição só abre pela pesquisa da Câmara, que recusa acesso por programa
  ("fonte não autorizada"); ela precisa ser aberta num navegador, como uma pessoa faria;
- a ficha "Decisão e ocorrências" é um PDF escaneado, que precisa ser lido.

Por isso esta parte roda uma vez por semana no app do Claude, com o navegador do app.
Pasta do projeto: `C:\Users\wallp\Documents\Codex\radarBH`. Git: `C:\Program Files\Git\cmd\git.exe`.

## Passos

1. **Atualizar**: `git pull --ff-only` (o robô publica dados todo dia) e `node scripts/gerar-site.js`.
2. **Ver o que falta**: `node scripts/pendentes.js`. Cada linha traz o PL, o estado e o link da proposição.
   - Se não houver nenhum "procurar ficha" nem "ficha achada, falta transcrever", pular para o passo 7.
3. **Achar as fichas** (só para "procurar ficha"): no navegador do app, abrir o link de cada proposição,
   esperar ~8 s e rodar o trecho de `scripts/navegador-tramitacao.js` na página. Um projeto por vez,
   com pelo menos 10 s entre páginas. Parar se aparecer verificação anti-robô (captcha) e avisar.
   Juntar os JSON devolvidos num só objeto, salvar num arquivo temporário e rodar
   `node scripts/juntar-fichas.js arquivo.json`.
   - Projetos que só têm 1º turno ou que não abrem continuam pendentes; tudo bem, voltam na semana seguinte.
4. **Baixar os PDFs**: `node scripts/baixar-fichas.js` (salva em `fichas/`, que não vai para o GitHub).
5. **Transcrever**: para cada PL de `node scripts/pendentes.js --baixar`, ler `fichas/<numero>-<ano>.pdf`.
   Usar a votação que decidiu o projeto (projeto, substitutivo ou artigos destacados); se a ficha tiver
   várias, ver os nomes das votações daquela data em `dados/votacoes.json` e escolher a que bate com a
   presença. Escrever uma linha por ficha num arquivo de lote (formato no topo de
   `scripts/adicionar-transcricoes.js`) e rodar `node scripts/adicionar-transcricoes.js lote.txt`.
6. **Conferir**: `node scripts/montar-votos.js`. Só grava se os totais baterem com a ficha e com a
   planilha da reunião. Se acusar diferença, reler a ficha e corrigir a linha; se não fechar, tirar a
   transcrição daquele PL de `dados/transcricoes-2turno.json` e anotar no resumo.
7. **Gastos do gabinete (Custeio Parlamentar)**: no navegador do app, abrir
   https://www.cmbh.mg.gov.br/transparencia/vereadores/custeio-parlamentar, colar a função de
   `scripts/navegador-custeio.js` e rodar `await coletarCusteio(["MM/AAAA do mês atual", "MM/AAAA do mês anterior"])`
   (os lançamentos chegam com atraso, por isso o mês anterior também). Salvar o JSON devolvido num arquivo
   temporário e rodar `node scripts/juntar-custeio.js arquivo.json`. Se a página não trouxer a tabela, pular
   esta etapa e anotar no resumo. No dia 1º a 7 de cada mês, incluir também o mês retrasado.
   Depois, na mesma página, apagar o progresso antigo (`localStorage.removeItem("cust_det")`), colar a função
   de `scripts/navegador-custeio-detalhe.js` e rodar `await detalharCusteio([os mesmos meses])` (abre o
   detalhamento de cada vereador, 10 s entre cliques). Salvar `localStorage.cust_det` num arquivo e rodar
   `node scripts/juntar-custeio-detalhe.js arquivo.json`: ele confere a soma dos itens com o total do mês e
   só grava se bater.
   **Equipe dos gabinetes** (uma vez por mês, NÃO automática): a Consulta à Remuneração pede uma
   verificação anti-robô na entrada, que só uma pessoa pode responder. Quando o usuário estiver presente
   e responder, seguir `scripts/navegador-equipes.js` e rodar `node scripts/juntar-equipes.js arquivo.json`.
   Sem isso, o site continua mostrando a equipe do último mês coletado. O subsídio e os benefícios são
   calculados sozinhos pelo `gerar-site.js`, pela regra oficial.
8. **Publicar**: `node scripts/gerar-site.js`, `node scripts/lista-fichas.js`, depois commit de
   `dados/fichas-encontradas.json`, `dados/transcricoes-2turno.json`, `dados/votos-nominais.json`,
   `dados/custeio.json`, `dados/gabinetes.json`, `site/dados.json` e `FICHAS-2o-TURNO.md`, e `git push`. Conferir em
   https://ischaber.github.io/radar-bh/dados.json que o número de votações nominais subiu.
9. **Resumo**: quais PLs entraram, resultado de cada um, quais meses de custeio foram atualizados,
   o que ficou pendente e por quê.

## Regras

- Só dados oficiais. Nada de adivinhar voto: se a ficha estiver ilegível, o PL fica pendente.
- Não contornar bloqueios da Câmara: nada de chamar a pesquisa por script, nem acelerar o ritmo.
- Não mudar código do site nem dos scripts durante a rotina; só os arquivos de dados listados acima.
