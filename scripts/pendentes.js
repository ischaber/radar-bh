// Lista os projetos que ainda precisam de ficha de 2º turno (depois de node scripts/gerar-site.js).
//   node scripts/pendentes.js           -> projetos sem votos nominais de 2º turno, com o link da proposição
//   node scripts/pendentes.js --baixar  -> só os que já têm ficha achada mas ainda não foram transcritos
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const d = JSON.parse(fs.readFileSync(path.join(RAIZ, "site", "dados.json"), "utf8"));
const { projetos } = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados", "fichas-encontradas.json"), "utf8"));
const { transcricoes } = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados", "transcricoes-2turno.json"), "utf8"));

const pend = (d.projetosVariasReunioes || []).filter((p) => !p.segundoTurnoTranscrito);
for (const p of pend) {
  const chave = p.materia.slice(3);
  const achada = projetos[chave]?.segundoTurno;
  if (process.argv.includes("--baixar")) {
    if (achada && !transcricoes[chave]) console.log(`${chave}\t${achada.data}\t${achada.id}`);
    continue;
  }
  const estado = transcricoes[chave] ? "transcrita" : achada ? "ficha achada, falta transcrever" : "procurar ficha";
  console.log(`${chave}\t${estado}\t${p.reunioes.map((r) => r[0]).join(",")}\t${p.proposicao}`);
}
