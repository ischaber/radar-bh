# Radar BH: Passo 1, de onde vêm os dados

Levantamento feito em 16/11/2026 no portal da Câmara Municipal de Belo Horizonte (CMBH), www.cmbh.mg.gov.br.

## Resumo

| Dado | Existe? | Download automático? | Formato |
|---|---|---|---|
| Lista de vereadores (nome, partido, foto, contato) | Sim | **Sim** | HTML simples |
| Presença em plenário por mês (desde 2009) | Sim | **Sim** | HTML (tabela) |
| Presença em plenário por reunião e por votação | Sim | **Sim** | XLSX |
| Presença em comissões, reuniões especiais e solenes, justificativas | Sim | Provável (não testado a fundo) | HTML/arquivos |
| Proposições (indicações, requerimentos, PLs, moções…) | Sim | **Bloqueado para robô** | HTML via busca em JavaScript |
| Texto e documentos de cada proposição | Sim | **Sim**, com o ID do documento em mãos | PDF |
| Como cada vereador votou (votação nominal) | Sim | Sim (PDF), **mas é digitalização: precisa de OCR** | PDF escaneado |
| API ou portal de dados abertos da CMBH | **Não encontrado** | — | — |

A CMBH **não usa o SAPL**. Ela tem um site em Drupal que funciona como fachada para um sistema interno chamado **SIL** (Sistema de Informações Legislativas). O endereço do SIL (`cmbhsilint.cmbh.mg.gov.br`) não pode ser acessado pela internet. O servidor de downloads (`cmbhsildownload.cmbh.mg.gov.br`) é público.

`robots.txt`: pede **10 segundos entre requisições** (`Crawl-delay: 10`).

## Fontes, uma a uma

### 1. Vereadores
- Lista: `https://www.cmbh.mg.gov.br/vereadores`. Traz os 41 vereadores atuais, com partido e link para o perfil.
- Perfil: `/vereadores/<slug>`, por exemplo `/vereadores/pedro-patrus`. Tem nome civil, partido, mandatos, telefone e e-mail de gabinete. As abas são `/projetos`, `/legislacao`, `/comissoes` e `/conselhos`.
- A aba `/projetos` tem um ID interno do vereador (`idVereador`), mas a lista em si usa a mesma busca bloqueada (item 4).

### 2. Presença mensal consolidada
- `https://www.cmbh.mg.gov.br/transparencia/vereadores/presenca-mensal-consolidada`
- Formulário POST com `ano` e `mes`. Exercícios de 2009 a 2026.
- Uma tabela por vereador, com os dias de reunião e um código por dia: P (presente), F (falta), AJ (ausência justificada), LM (licença médica) e SR (licença sem remuneração).
- A página avisa que mostra apenas os dias em que houve reunião.

### 3. Presença por reunião (relatório individualizado)
- Lista: `https://www.cmbh.mg.gov.br/transparencia/vereadores/relatorio-individualizado-reuniao`, com 119 páginas de histórico (`?page=N`).
- Cada reunião tem um **XLSX**. Por vereador, ele traz o total de eventos, o percentual, se o vereador estava presente ou ausente, a presença no início da reunião e **uma coluna para cada votação do dia** (por exemplo "PL 676/26 Substitutivo nº 7"), com P ou F.
- O link do arquivo tem um trecho estranho, mas funciona como está: `.../presenca_plenario/[user-last-login-yyyy]/[user-last-login-m]/99a_reuniao_ordinaria_-_13-11-2026.xlsx`.
- Amostra salva em: `amostras/presenca_99a_reuniao_ordinaria_13-11-2026.xlsx`.
- ⚠️ Qualidade: algumas células da coluna de presença trazem `#REF!` ou ficam vazias (por exemplo Loíde Gonçalves, Luiza Dulci, Irlan Melo e Pedro Patrus na 99ª reunião). Os totais nas colunas A, B e C continuam corretos.
- ⚠️ A tabela mensal de outubro/2026 traz nomes que não estão na lista atual de vereadores (Leonardo Ângelo, Lucas Ganem). Provavelmente são suplentes ou trocas de cadeira. Precisa conferir no Passo 5.

### 4. Proposições (o bloqueio)
- Página de busca: `https://www.cmbh.mg.gov.br/atividade-legislativa/pesquisar-proposicoes`
- A página manda um POST via JavaScript para `/sites/all/modules/proposicoes/pesquisar.php`, com os campos `tipo`, `numero`, `ano`, `autor`, `assunto`, `fase`, `tramitando` e `paginaRequerida`, mais um campo `stormCodex`.
- **Feita por script, a chamada volta com "Pesquisa de fonte não autorizada."** No navegador ela funciona. É uma restrição deliberada, e eu **não** tentei driblá-la.
- No navegador, a busca devolve 7 itens por página com tipo e número, todos os autores, o assunto, a situação, o link "Texto inicial" e o link "Tramitação".
- Cada proposição tem link permanente: `/atividade-legislativa/pesquisar-proposicoes/<tipo>/<numero>/<ano>`, por exemplo `/projeto-de-lei/813/2026`. O conteúdo, porém, também vem pelo POST restrito (`proxy.php`).
- O texto das indicações traz **rua e bairro** (por exemplo "Rua Herval, nº 692, Bairro Serra"). É a matéria-prima da busca por bairro do Passo 4.

### 5. Documentos (download público)
- `https://cmbhsildownload.cmbh.mg.gov.br/silinternet/servico/download/documentoVinculado?idDocumento=<id>`
- Baixa direto por script, sem bloqueio. O que falta é descobrir os IDs, que estão na tramitação (item 4).

### 6. Votação nominal
- Fica na tramitação, como documento "Decisão e ocorrências: aprovado em primeiro turno".
- É um **PDF escaneado**: traz matéria, reunião, data e hora, tipo (Nominal), turno, quórum, presentes e, para cada vereador, partido, voto (Sim, Não, Não votou ou Presidência) e horário, além dos totais e do resultado.
- O texto embutido no PDF é ilegível (OCR ruim e invertido). Vai ser preciso fazer OCR de novo.
- Amostra salva em: `amostras/votacao_nominal_PL813-2026_1o_turno.pdf` (PL 813/26, 1º turno, 13/11/2026: 28 Sim, 9 Não, aprovado).
- Para saber quais votações aconteceram em cada dia, dá para usar as colunas do XLSX de presença (item 3).

## Prova com um vereador: Pedro Patrus (PT)

| Dado | Valor | Fonte |
|---|---|---|
| Presença em plenário em outubro/2026 | 10 de 10 dias com reunião (P em todos) | Presença mensal consolidada |
| 99ª Reunião Ordinária (13/11/2026) | Presente em 7 de 7 eventos (100%) | XLSX do relatório individualizado |
| Indicações em 2025 (como autor ou coautor) | 31 | Busca de proposições, no navegador |
| Voto no PL 813/26, 1º turno | **Não** (16:01:01) | PDF da votação nominal |
| Contato público | (31) 3555-1323/1224, sala A-313, e-mail de gabinete | Perfil oficial |

## O que isso significa para o projeto

1. **A presença está resolvida.** Ela pode ser coletada automaticamente e respeitando o `robots.txt`, a partir de duas fontes oficiais que servem para conferir uma à outra no Passo 5.
2. **As proposições são o gargalo.** Há três caminhos:
   - **a)** Pedir à CMBH, pela Lei de Acesso à Informação (LAI) ou pela Ouvidoria, uma exportação ou acesso autorizado aos dados do SIL. É o caminho mais seguro e pode virar uma base completa de uma vez só.
   - **b)** Coletar com um navegador automatizado (headless), usando a busca como um cidadão usa, devagar e com identificação. É viável, mas depende da Câmara não considerar isso abuso. O ideal é avisar ou pedir antes.
   - **c)** Começar o site só com presença e votos e acrescentar as proposições quando (a) ou (b) estiver resolvido.
3. **Os votos são possíveis, mas trabalhosos.** É preciso descobrir o documento de cada votação e passar OCR nos PDFs. Como a ficha tem layout fixo, o OCR tende a funcionar bem, mas exige conferência.
4. **O volume em BH é grande.** São 41 vereadores e centenas de indicações por vereador a cada ano. Com 7 resultados por página e 10 segundos de intervalo, a primeira coleta completa leva horas. As atualizações diárias são pequenas.
