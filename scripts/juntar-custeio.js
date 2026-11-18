// Junta a coleta do Custeio Parlamentar (feita no navegador) em dados/custeio.json.
//
// O resultado do Custeio Parlamentar vem de um módulo interno da Câmara que não é chamado por script;
// a coleta é feita no navegador, um mês por vez, com o trecho de scripts/navegador-custeio.js.
//
//   node scripts/juntar-custeio.js coleta.json
//
// coleta.json: { "10/2026": { coletadoEm, linhas: [[nome, codVereador, "R$1.234,56"], ...] }, ... }
const fs = require("fs");
const path = require("path");

const arq = path.join(__dirname, "..", "dados", "custeio.json");
const atual = fs.existsSync(arq)
  ? JSON.parse(fs.readFileSync(arq, "utf8"))
  : {
      fonte: "https://www.cmbh.mg.gov.br/transparencia/vereadores/custeio-parlamentar",
      observacao:
        "Custeio Parlamentar: gastos do gabinete com escritório, informática, serviços gráficos, divulgação da atividade parlamentar, carimbos, material de copa, serviços postais e telefonia, por mês. Só aparecem os vereadores com despesa no mês. Não inclui salários de vereadores nem de assessores.",
      meses: {},
    };
const coleta = JSON.parse(fs.readFileSync(process.argv[2], "utf8").replace(/^﻿/, ""));
const real = (s) => {
  const n = Number(String(s).replace(/[^\d,]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`valor estranho: "${s}"`);
  return Math.round(n * 100) / 100;
};

let n = 0;
for (const [mesAno, m] of Object.entries(coleta)) {
  const [mes, ano] = mesAno.split("/");
  if (!/^\d{2}$/.test(mes) || !/^\d{4}$/.test(ano)) throw new Error(`mês inválido: ${mesAno}`);
  if (m.vazio && !m.linhas.length) console.warn(`aviso: ${mesAno} veio sem tabela: ${m.vazio}`);
  atual.meses[`${ano}-${mes}`] = {
    coletadoEm: m.coletadoEm,
    vereadores: m.linhas.map(([nome, cod, valor]) => ({ nome: nome.trim(), cod, valor: real(valor) })),
  };
  n++;
}
atual.meses = Object.fromEntries(Object.entries(atual.meses).sort());
fs.writeFileSync(arq, JSON.stringify(atual, null, 1) + "\n");
const total = Object.values(atual.meses).reduce((s, m) => s + m.vereadores.reduce((a, v) => a + v.valor, 0), 0);
console.log(`${n} mês(es) juntados; ${Object.keys(atual.meses).length} no arquivo; total R$ ${total.toFixed(2)}.`);
