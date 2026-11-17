// Votações de cada reunião do Plenário, a partir do Relatório Individualizado de Presença (XLSX).
// A planilha diz o que foi votado no dia e se cada vereador registrou presença em cada votação
// (P presente, F ausente, X presidindo a sessão). Ela NÃO diz como cada um votou.
//
//   node scripts/coletar-votacoes.js          -> incremental (reuniões novas e as dos últimos 45 dias)
//   node scripts/coletar-votacoes.js --tudo   -> baixa de novo todas as planilhas do mandato
//
// Se falhar, a presença continua sendo publicada e dados/votacoes.json fica com a última versão boa.
const fs = require("fs");
const path = require("path");
const { BASE, baixar, texto } = require("./lib/cmbh");
const { lerPlanilha } = require("./lib/xlsx");

const DADOS = path.join(__dirname, "..", "dados");
const INICIO = "2025-01-01";
const REVISITAR_DIAS = 45; // ausências podem virar justificadas depois
const MIN_VEREADORES = 35;
const URL_LISTA = "/transparencia/vereadores/relatorio-individualizado-reuniao";
const args = new Set(process.argv.slice(2));

const falhar = (msg) => {
  throw new Error(`Coleta de votações abortada, nada foi gravado: ${msg}`);
};
const pad = (n) => String(n).padStart(2, "0");

function lerLista(html) {
  return [...html.matchAll(/<a href="([^"]+\.xlsx)">([\s\S]*?)<\/a>/g)].map((m) => {
    const titulo = texto(m[2]).replace(/^Relatório Individualizado de Presença - /, "").replace(/\s*\(data de publicação.*$/, "");
    // A data vem escrita de jeitos diferentes ("04-09-2025", "-13/06/2025"); tenta o título e
    // depois o nome do arquivo. A data de dentro da planilha é conferida depois.
    const d = titulo.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})\s*$/) || decodeURIComponent(m[1]).match(/(\d{2})-(\d{2})-(\d{4})(?:_\d+)?\.xlsx$/);
    return { titulo, url: m[1], data: d ? `${d[3]}-${d[2]}-${d[1]}` : null };
  });
}

function colunas(linha) {
  return Object.keys(linha).filter((k) => /^[A-Z]{1,2}$/.test(k)).sort((a, b) => a.length - b.length || a.localeCompare(b));
}

// Devolve { eventos: [{ nome, inicio }], vereadores: [{ nome, situacao, marcas }] } ou lança erro.
function lerPlanilhaVotacoes(buf, dataEsperada) {
  const linhas = lerPlanilha(buf);
  const serial = Number((linhas.find((l) => l.linha === 1) || {}).F);
  const data = new Date(Math.round((serial - 25569) * 864e5)).toISOString().slice(0, 10);
  if (data !== dataEsperada) throw new Error(`planilha traz a data ${data}, a lista diz ${dataEsperada}`);
  const cab = linhas.find((l) => String(l.F || "").trim().toUpperCase() === "VEREADOR");
  if (!cab) throw new Error("não achei a linha de cabeçalho (VEREADOR)");
  const cols = colunas(cab).filter((k) => k > "F" || k.length > 1);
  const eventos = cols.map((k) => {
    const nome = texto(cab[k]).replace(/\s+/g, " ");
    return { nome, inicio: /presente no in[ií]cio/i.test(nome) };
  });
  const vereadores = [];
  for (const l of linhas) {
    const m = String(l.F || "").match(/^\s*\d+\.\s*(.+?)\s*$/);
    if (!m || !/^(PRESENTE|AUSENTE)$/.test(l.D || "")) continue;
    const marcas = cols.map((k) => {
      const v = String(l[k] || "").trim().toUpperCase();
      return v === "P" || v === "F" || v === "X" ? v : "?";
    });
    vereadores.push({ nome: m[1], situacao: l.D, marcas: marcas.join("") });
  }
  if (vereadores.length < MIN_VEREADORES) throw new Error(`só ${vereadores.length} vereadores na planilha`);
  if (!eventos.length) throw new Error("nenhum evento na planilha");
  return { eventos, vereadores };
}

async function main() {
  const agora = new Date().toISOString();
  const arq = path.join(DADOS, "votacoes.json");
  const antigo = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, "utf8")) : { reunioes: [] };
  const cache = new Map(antigo.reunioes.map((r) => [r.url, r]));
  const hoje = new Date();
  const revisitar = new Date(hoje - REVISITAR_DIAS * 864e5).toISOString().slice(0, 10);

  console.log("1/2 Lista de relatórios por reunião");
  const lista = [];
  for (let p = 0; p < 200; p++) {
    let html;
    try {
      html = await baixar(URL_LISTA + (p ? `?page=${p}` : ""));
    } catch (e) {
      // A lista oficial só deixa abrir até a página 20; as seguintes respondem 410 (não existe mais).
      if (p > 0 && /HTTP 410/.test(e.message)) {
        console.warn(`  aviso: a página ${p + 1} da lista não está mais disponível (HTTP 410); a lista oficial termina aqui.`);
        break;
      }
      throw e;
    }
    const pagina = lerLista(html);
    if (!pagina.length) {
      if (p === 0) falhar("a lista de relatórios veio vazia");
      break;
    }
    for (const r of pagina.filter((r) => !r.data)) console.warn(`  aviso: sem data reconhecível, pulei "${r.titulo}"`);
    const comData = pagina.filter((r) => r.data);
    if (!comData.length) falhar(`nenhuma data reconhecível na página ${p + 1} da lista`);
    lista.push(...comData.filter((r) => r.data >= INICIO));
    const maisAntiga = comData.at(-1).data;
    if (maisAntiga < INICIO) break;
    // incremental: já passamos da janela de revisita e tudo nesta página já está guardado
    if (!args.has("--tudo") && maisAntiga < revisitar && comData.every((r) => cache.has(r.url))) {
      const jaConhecidas = antigo.reunioes.filter((r) => r.data < maisAntiga && r.data >= INICIO);
      lista.push(...jaConhecidas);
      break;
    }
    console.log(`  página ${p + 1}: até ${maisAntiga}`);
  }
  const porUrl = new Map(lista.map((r) => [r.url, r]));

  console.log(`2/2 Planilhas (${porUrl.size} reuniões desde ${INICIO})`);
  const reunioes = [];
  const erros = [];
  for (const r of porUrl.values()) {
    const guardada = cache.get(r.url);
    if (!args.has("--tudo") && guardada && !guardada.erro && r.data < revisitar) {
      reunioes.push(guardada);
      continue;
    }
    console.log(`  ${r.titulo}`);
    try {
      const lida = lerPlanilhaVotacoes(await baixar(r.url, { binario: true }), r.data);
      reunioes.push({ titulo: r.titulo, data: r.data, url: r.url, coletadoEm: agora, ...lida });
    } catch (e) {
      if (/HTTP|timeout|fetch/i.test(e.message) && guardada) {
        reunioes.push(guardada); // erro de rede: mantém a versão anterior
      } else {
        erros.push(`${r.titulo}: ${e.message}`);
        reunioes.push({ titulo: r.titulo, data: r.data, url: r.url, coletadoEm: agora, erro: e.message });
      }
    }
  }
  reunioes.sort((a, b) => a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo));
  if (erros.length > Math.max(3, reunioes.length * 0.1)) falhar(`muitas planilhas com problema (${erros.length}):\n${erros.join("\n")}`);
  if (reunioes.length < antigo.reunioes.length) falhar(`vieram ${reunioes.length} reuniões, eram ${antigo.reunioes.length}`);
  for (const e of erros) console.warn(`  aviso: ${e}`);

  const saida = {
    fonte: BASE + URL_LISTA,
    observacao:
      "Cada reunião lista o que foi votado no dia e, para cada vereador, a marca em cada evento: P presente, F ausente, X presidindo a sessão. O primeiro evento costuma ser a presença no início da reunião. A planilha não diz como cada vereador votou.",
    coletadoEm: agora,
    reunioes,
  };
  fs.writeFileSync(arq + ".tmp", JSON.stringify(saida) + "\n");
  fs.renameSync(arq + ".tmp", arq);
  const votacoes = reunioes.reduce((s, r) => s + (r.eventos || []).filter((e) => !e.inicio).length, 0);
  console.log(`OK: ${reunioes.length} reuniões, ${votacoes} votações, ${erros.length} planilhas com problema.`);
}

module.exports = { lerLista, lerPlanilhaVotacoes };
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
