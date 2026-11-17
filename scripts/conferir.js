// Passo 5: confere a presença mensal (fonte 1) com o relatório individualizado
// de cada reunião em XLSX (fonte 2), ambos oficiais da CMBH.
//
//   node scripts/conferir.js [paginas=1]
//
// Cada página da lista oficial tem 10 reuniões. Grava dados/conferencia.json.
const fs = require("fs");
const path = require("path");
const { BASE, baixar, texto, normalizar } = require("./lib/cmbh");
const { lerPlanilha } = require("./lib/xlsx");

const DADOS = path.join(__dirname, "..", "dados");
const LISTA = "/transparencia/vereadores/relatorio-individualizado-reuniao";
const paginas = Number(process.argv[2] || 1);

async function baixarBinario(url) {
  const r = await fetch(url, { headers: { "User-Agent": "radarBH/0.1 (conferencia de presenca; 1 requisicao a cada 10s)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mensal = JSON.parse(fs.readFileSync(path.join(DADOS, "presenca-mensal.json"), "utf8"));
  const apelidos = JSON.parse(fs.readFileSync(path.join(DADOS, "apelidos.json"), "utf8"));
  const canon = (n) => {
    const k = normalizar(n);
    return apelidos[k] ? normalizar(apelidos[k].replace(/-/g, " ")) : k;
  };
  // índice: "2026-10-15|nome" -> código
  const idx = new Map();
  for (const m of mensal.meses)
    for (const v of m.vereadores)
      for (const d of v.dias) idx.set(`${m.ano}-${m.mes}-${d.dia}|${canon(v.nome)}`, d.codigo);

  const reunioes = [];
  for (let p = 0; p < paginas; p++) {
    const html = await baixar(`${LISTA}${p ? `?page=${p}` : ""}`);
    for (const m of html.matchAll(/<a href="([^"]+\.xlsx)">([\s\S]*?)<\/a>/g)) {
      const titulo = texto(m[2]);
      const data = (titulo.match(/(\d{2})\/(\d{2})\/(\d{4})/) || []).slice(1).map(Number);
      if (data.length === 3) reunioes.push({ url: m[1], titulo, dia: data[0], mes: data[1], ano: data[2] });
    }
  }

  const resultado = { geradoEm: new Date().toISOString(), regra: "Mensal P deve corresponder a PRESENTE no XLSX; F, AJ, LM ou SR a AUSENTE.", reunioes: [] };
  for (const r of reunioes) {
    await esperar(10_000);
    let linhas;
    try {
      linhas = lerPlanilha(await baixarBinario(r.url));
    } catch (e) {
      resultado.reunioes.push({ ...r, erro: e.message });
      continue;
    }
    const itens = { batem: 0, divergem: [], soNoXlsx: [], celulasComErro: [] };
    for (const l of linhas) {
      const m = String(l.F || "").match(/^\s*\d+\.\s*(.+)$/);
      if (!m || !/PRESENTE|AUSENTE/.test(l.D || "")) continue;
      const nome = m[1].trim();
      if (String(l.E || "").startsWith("#") || l.E === undefined) itens.celulasComErro.push(nome);
      const cod = idx.get(`${r.ano}-${r.mes}-${r.dia}|${canon(nome)}`);
      if (cod === undefined) { itens.soNoXlsx.push(nome); continue; }
      const presenteMensal = cod === "P";
      const presenteXlsx = l.D === "PRESENTE";
      if (presenteMensal === presenteXlsx) itens.batem++;
      else itens.divergem.push({ nome, mensal: cod, xlsx: l.D, percentual: l.C });
    }
    resultado.reunioes.push({ ...r, ...itens });
    console.log(`${r.titulo}: ${itens.batem} batem, ${itens.divergem.length} divergem, ${itens.soNoXlsx.length} só no XLSX, ${itens.celulasComErro.length} células com erro`);
  }
  fs.writeFileSync(path.join(DADOS, "conferencia.json"), JSON.stringify(resultado, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
