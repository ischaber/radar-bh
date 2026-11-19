// Junta os rendimentos de servidores de gabinete, lidos no navegador na ficha de cada servidor da Consulta à
// Remuneração (detalhes.php, depois que uma pessoa responde a verificação anti-robô da ficha), em
// dados/salarios-gabinete.json.
//
//   node scripts/juntar-salarios.js salarios-AAAA-MM.json
//
// entrada: { mes: "AAAA-MM", servidores: { cm: { rend: [[rubrica, "R$ 1,00"]], desc: [[rubrica, "R$ 1,00"]], liq: "1,00" } } }
// Conferência: rendimentos menos descontos tem de dar o líquido da ficha (até R$ 0,01), e a matrícula tem de
// estar num gabinete em dados/gabinetes.json no mesmo mês. Se algo não bater, nada é gravado.
const fs = require("fs");
const path = require("path");

const DADOS = path.join(__dirname, "..", "dados");
const arq = path.join(DADOS, "salarios-gabinete.json");
const gabinetes = JSON.parse(fs.readFileSync(path.join(DADOS, "gabinetes.json"), "utf8"));
const atual = fs.existsSync(arq)
  ? JSON.parse(fs.readFileSync(arq, "utf8"))
  : {
      fonte: "https://www.cmbh.mg.gov.br/transparencia/pessoal/consulta-a-remuneracao",
      observacao:
        "Rendimentos e descontos de cada servidor de gabinete, copiados da ficha individual da Consulta à Remuneração (uma verificação anti-robô por ficha, respondida por uma pessoa).",
      meses: {},
    };
const entrada = JSON.parse(fs.readFileSync(process.argv[2], "utf8").replace(/^﻿/, ""));
const real = (s) => {
  const n = Number(String(s).replace(/[^\d,]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`valor estranho: "${s}"`);
  return Math.round(n * 100) / 100;
};
const doMes = gabinetes.meses[entrada.mes]?.gabinetes;
if (!doMes) throw new Error(`não há equipe guardada para ${entrada.mes} (rode antes juntar-equipes.js)`);
const lotacaoDe = new Map();
for (const [lot, g] of Object.entries(doMes)) for (const s of g.servidores) lotacaoDe.set(s[0], lot);

const erros = [];
const mes = (atual.meses[entrada.mes] = atual.meses[entrada.mes] || {});
for (const [cm, s] of Object.entries(entrada.servidores)) {
  if (!lotacaoDe.has(cm)) {
    erros.push(`${cm}: não está em nenhum gabinete em ${entrada.mes}`);
    continue;
  }
  const rend = s.rend.map(([r, v]) => [r, real(v)]);
  const desc = s.desc.map(([r, v]) => [r, real(v)]);
  const bruto = Math.round(rend.reduce((t, x) => t + x[1], 0) * 100) / 100;
  const descontos = Math.round(desc.reduce((t, x) => t + x[1], 0) * 100) / 100;
  const liquido = real(s.liq);
  if (!rend.length || Math.abs(bruto - descontos - liquido) > 0.011) {
    erros.push(`${cm}: rendimentos ${bruto} - descontos ${descontos} não dá o líquido ${liquido}`);
    continue;
  }
  mes[cm] = { rend, desc, bruto, liquido, lidoEm: s.lidoEm || null };
}
if (erros.length) {
  console.error(`Nada foi gravado. ${erros.length} problema(s):\n` + erros.join("\n"));
  process.exit(1);
}
atual.meses = Object.fromEntries(Object.entries(atual.meses).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(arq, JSON.stringify(atual, null, 1) + "\n");
// quantos gabinetes ficaram completos
const porGab = {};
for (const [lot, g] of Object.entries(doMes)) porGab[lot] = [g.servidores.filter((s) => mes[s[0]]).length, g.servidores.length];
const completos = Object.entries(porGab).filter(([, [a, b]]) => a === b && b > 0).map(([l]) => l);
console.log(`OK: ${Object.keys(entrada.servidores).length} ficha(s) conferidas. ${entrada.mes}: ${Object.keys(mes).length} servidores com salário; gabinetes completos: ${completos.join(", ") || "nenhum"}.`);
