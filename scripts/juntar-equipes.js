// Junta a lista de servidores de um mês, coletada no navegador na Consulta à Remuneração da Câmara
// (https://www.cmbh.mg.gov.br/transparencia/pessoal/consulta-a-remuneracao), em dados/gabinetes.json.
// Guarda só quem está lotado em gabinete de vereador ("VEREADOR ..." / "VEREADORA ..."): matrícula (cm),
// cargo, carga horária, admissão, exoneração e nome, como a Câmara publica. Os salários não vêm: a Câmara só mostra
// o valor de cada servidor, um por um, depois de uma verificação anti-robô.
//
//   node scripts/juntar-equipes.js coleta-equipes-AAAA-MM.json
//
// coleta: { mes: "AAAA-MM", totalServidores, coletadoEm, gabinetes: [[cm, cargo, carga, lotacao, admissao, exoneracao, nome]] }
const fs = require("fs");
const path = require("path");

const arq = path.join(__dirname, "..", "dados", "gabinetes.json");
const atual = fs.existsSync(arq)
  ? JSON.parse(fs.readFileSync(arq, "utf8"))
  : {
      fonte: "https://www.cmbh.mg.gov.br/transparencia/pessoal/consulta-a-remuneracao",
      observacao:
        "Servidores lotados em cada gabinete de vereador, por mês, como aparecem na Consulta à Remuneração da Câmara. Nome, cargo e carga horária; sem salários.",
      meses: {},
    };
const coleta = JSON.parse(fs.readFileSync(process.argv[2], "utf8").replace(/^﻿/, ""));
if (!/^\d{4}-\d{2}$/.test(coleta.mes)) throw new Error(`mês estranho: ${coleta.mes}`);

const vistos = new Set();
const gabinetes = {};
for (const [cm, cargo, carga, lotacao, admissao, exoneracao, nome] of coleta.gabinetes) {
  if (!/^VEREADORA?\s/i.test(lotacao)) continue;
  if (vistos.has(cm)) throw new Error(`matrícula repetida: ${cm}`);
  vistos.add(cm);
  const g = (gabinetes[lotacao] = gabinetes[lotacao] || { vereador: null, servidores: [] });
  const h = Math.round(Number(carga) * 10) / 10;
  if (cargo === "VEREADOR") g.vereador = { cm, nome: nome || null, admissao, exoneracao: exoneracao || null };
  else g.servidores.push([cm, cargo, h, admissao, exoneracao || null, nome || null]);
}
atual.meses[coleta.mes] = { coletadoEm: coleta.coletadoEm, totalServidoresDaCamara: coleta.totalServidores, gabinetes };
atual.meses = Object.fromEntries(Object.entries(atual.meses).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(arq, JSON.stringify(atual, null, 1) + "\n");
const n = Object.values(gabinetes).reduce((s, g) => s + g.servidores.length, 0);
console.log(`OK: ${coleta.mes}: ${Object.keys(gabinetes).length} gabinetes, ${n} servidores (de ${coleta.totalServidores} na Câmara).`);
