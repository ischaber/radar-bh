// Junta o DETALHAMENTO do Custeio Parlamentar (tipo de despesa, valor e nota de cada item), coletado no
// navegador com scripts/navegador-custeio-detalhe.js, em dados/custeio.json.
//
//   node scripts/juntar-custeio-detalhe.js coleta-detalhe.json
//
// coleta-detalhe.json: { "10/2026": { lista: [[cod, nome], ...], vereadores: { cod: { nome, itens: [[tipo, "R$1,00", arquivo, url]] } } } }
//
// Conferência: a soma dos itens de cada vereador tem de bater (até R$ 0,01) com o total do mês já guardado
// em dados/custeio.json (vindo da tabela de totais). Se não bater, nada é gravado.
const fs = require("fs");
const path = require("path");

const arq = path.join(__dirname, "..", "dados", "custeio.json");
const atual = JSON.parse(fs.readFileSync(arq, "utf8"));
const coleta = JSON.parse(fs.readFileSync(process.argv[2], "utf8").replace(/^﻿/, ""));
const real = (s) => {
  const n = Number(String(s).replace(/[^\d,]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`valor estranho: "${s}"`);
  return Math.round(n * 100) / 100;
};
const idNota = (url) => {
  const m = String(url || "").match(/(?:^|[?&])id=(\d+)/);
  return m && m[1] !== "0" ? m[1] : null;
};

const erros = [];
let n = 0;
for (const [mesAno, m] of Object.entries(coleta)) {
  const [mes, ano] = mesAno.split("/");
  const chave = `${ano}-${mes}`;
  const guardado = atual.meses[chave];
  if (!guardado) {
    erros.push(`${mesAno}: não há total guardado para este mês (rode antes juntar-custeio.js)`);
    continue;
  }
  if (!m.completo) erros.push(`${mesAno}: coleta incompleta (${Object.keys(m.vereadores || {}).length} de ${(m.lista || []).length})`);
  for (const v of guardado.vereadores) {
    const d = (m.vereadores || {})[v.cod];
    if (!d || d.erro) {
      erros.push(`${mesAno} ${v.nome}: sem detalhamento${d?.erro ? ` (${d.erro})` : ""}`);
      continue;
    }
    const itens = d.itens.map(([tipo, valor, arquivo, url]) => [tipo.trim(), real(valor), idNota(url), arquivo || null]);
    const soma = Math.round(itens.reduce((s, i) => s + i[1], 0) * 100) / 100;
    if (Math.abs(soma - v.valor) > 0.011) {
      erros.push(`${mesAno} ${v.nome}: itens somam R$ ${soma.toFixed(2)}, total do mês é R$ ${v.valor.toFixed(2)}`);
      continue;
    }
    v.itens = itens;
    n++;
  }
}
if (erros.length) {
  console.error(`Nada foi gravado. ${erros.length} problema(s):\n` + erros.join("\n"));
  process.exit(1);
}
atual.notaUrl = "https://se.cmbh.mg.gov.br:8443/Prover/rest/downloadNotaFiscal?id=";
fs.writeFileSync(arq, JSON.stringify(atual, null, 1) + "\n");
console.log(`OK: detalhe de ${n} vereador-mês conferido com os totais e gravado.`);
