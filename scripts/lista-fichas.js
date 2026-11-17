// Gera FICHAS-2o-TURNO.md: a lista de trabalho para buscar à mão as fichas de 2º turno.
// A ficha só aparece na tramitação da proposição, que a Câmara não libera para acesso automático;
// por isso uma pessoa abre cada link, clica em Pesquisar e copia o link do PDF "Decisão e ocorrências".
//
//   node scripts/gerar-site.js && node scripts/lista-fichas.js
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const d = JSON.parse(fs.readFileSync(path.join(RAIZ, "site", "dados.json"), "utf8"));
const LOTE = 20;
const br = (iso) => iso.split("-").reverse().join("/");

const projetos = d.projetosVariasReunioes || [];
const pendentes = projetos.filter((p) => !p.segundoTurnoTranscrito);
const feitos = projetos.length - pendentes.length;

const linhas = [
  "# Fichas de 2º turno para buscar",
  "",
  `${projetos.length} projetos de lei votados em mais de uma reunião desde ${br(d.votacoes.planilhas[0].data)}. ` +
    `${feitos} já transcritos, ${pendentes.length} pendentes. Gerado em ${new Date().toLocaleDateString("pt-BR")}.`,
  "",
  "## Como fazer",
  "",
  "1. Clique no link do projeto e, na página da Câmara, clique em **Pesquisar**.",
  "2. Desça até o fim da **Tramitação da proposição** e procure, em **Apreciação em Plenário**, a linha",
  '   **"Decisão e ocorrências: ... em segundo turno"**.',
  "3. Clique no ícone verde dessa linha e copie o endereço do PDF que abrir.",
  "4. Mande os links de um lote de uma vez, um por linha. Não precisa dizer de qual projeto é: a ficha diz.",
  "",
  'Se o projeto não tiver ficha de 2º turno (só 1º turno, veto, retirado de pauta), é só pular. Se quiser, avise "PL tal: sem 2º turno".',
  "",
];
for (let i = 0; i < pendentes.length; i += LOTE) {
  linhas.push(`## Lote ${i / LOTE + 1}`, "");
  pendentes.slice(i, i + LOTE).forEach((p, j) => {
    const datas = p.reunioes.map((r) => br(r[0])).join(", ");
    linhas.push(`${i + j + 1}. [ ] [${p.materia}](${p.proposicao}) · votado em ${datas}`);
  });
  linhas.push("");
}
fs.writeFileSync(path.join(RAIZ, "FICHAS-2o-TURNO.md"), linhas.join("\n"));
console.log(`FICHAS-2o-TURNO.md: ${pendentes.length} pendentes em ${Math.ceil(pendentes.length / LOTE)} lotes (${feitos} já transcritos).`);
