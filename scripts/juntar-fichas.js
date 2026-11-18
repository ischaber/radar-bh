// Junta a coleta do navegador (tramitação de cada proposição) em dados/fichas-encontradas.json
// e marca, em cada projeto, qual ficha "Decisão e ocorrências" é a do 2º turno.
//
//   node scripts/juntar-fichas.js caminho/da/coleta.json
const fs = require("fs");
const path = require("path");

const arq = path.join(__dirname, "..", "dados", "fichas-encontradas.json");
const atual = JSON.parse(fs.readFileSync(arq, "utf8"));
const novos = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : {};

for (const [k, v] of Object.entries(novos)) {
  if (k.startsWith("FALHOU")) continue;
  atual.projetos[k] = v;
}
const segundo = (txt) => /segundo turno/i.test(txt) && !/primeiro turno/i.test(txt);
const resumo = { com2t: 0, sem2t: [], varios2t: [] };
for (const [k, p] of Object.entries(atual.projetos)) {
  const ds = p.decisoes.filter((d) => segundo(d[1]));
  p.segundoTurno = ds.length ? { id: ds.at(-1)[0], decisao: ds.at(-1)[1], data: ds.at(-1)[2] } : null;
  if (ds.length) resumo.com2t++;
  else resumo.sem2t.push(`${k}: ${p.decisoes.map((d) => d[2] + " " + d[1]).join(" | ")}`);
  if (ds.length > 1) resumo.varios2t.push(k);
}
atual.projetos = Object.fromEntries(Object.entries(atual.projetos).sort());
fs.writeFileSync(arq, JSON.stringify(atual, null, 1) + "\n");
console.log(`${Object.keys(atual.projetos).length} projetos; ${resumo.com2t} com ficha de 2º turno.`);
console.log("Vários 2º turno:", resumo.varios2t.join(", ") || "nenhum");
console.log("Sem 2º turno identificado:\n" + resumo.sem2t.join("\n"));
