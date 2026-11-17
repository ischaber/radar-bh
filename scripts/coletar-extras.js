// Coleta complementar do Radar BH: homenagens em reunião solene e participação em comissões.
// Páginas abertas do portal da CMBH, 1 requisição a cada 10 s.
//
//   node scripts/coletar-extras.js            -> incremental
//   node scripts/coletar-extras.js --tudo     -> refaz tudo
//
// Roda separado da presença: se falhar, a presença continua sendo publicada
// e os arquivos de extras ficam com a última versão boa.
const fs = require("fs");
const path = require("path");
const { BASE, baixar, texto } = require("./lib/cmbh");

const DADOS = path.join(__dirname, "..", "dados");
const INICIO_MANDATO = "2025-01-01";
const COMISSOES_VALIDADE_DIAS = 7;
const URL_HOMENAGENS = "/atividade-legislativa/homenagens";
const args = new Set(process.argv.slice(2));

const lerJson = (n, padrao) => {
  const p = path.join(DADOS, n);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")) : padrao;
};
const gravar = (n, obj) => {
  const p = path.join(DADOS, n);
  fs.writeFileSync(p + ".tmp", JSON.stringify(obj, null, 1) + "\n");
  fs.renameSync(p + ".tmp", p);
};
const falhar = (msg) => {
  throw new Error(`Coleta de extras abortada, nada foi gravado: ${msg}`);
};
const isoDeBr = (d) => {
  const m = String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// ---------- Homenagens ----------
function lerPaginaHomenagens(html) {
  const linhas = [...html.matchAll(/<tr>\s*<th scope="row"[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  const itens = linhas.map((tr) => {
    const campo = (titulo) => texto((tr.match(new RegExp(`data-title="${titulo}\\s*">([\\s\\S]*?)</td>`)) || [])[1] || "");
    const data = isoDeBr(texto((tr.match(/date-display-single">([^<]+)</) || [])[1] || ""));
    return { data, homenageado: campo("Homenageado"), horario: campo("Horário") || null, vereador: campo("Vereador"), tipo: campo("Tipo") };
  });
  if (itens.some((i) => !i.data || !i.homenageado)) falhar("linha de homenagem sem data ou sem homenageado");
  const total = Number((html.match(/pager-current">\s*\d+ de (\d+)/) || [])[1] || 0);
  return { itens, totalPaginas: total };
}

async function coletarHomenagens(agora) {
  const antigo = lerJson("homenagens.json", { homenagens: [] });
  const chave = (h) => [h.data, h.homenageado, h.vereador].join("|");
  const conhecidas = new Set(antigo.homenagens.map(chave));
  const limiteIncremental = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const novas = [];
  let totalPaginas = 1;
  for (let p = 0; p < totalPaginas; p++) {
    const { itens, totalPaginas: t } = lerPaginaHomenagens(await baixar(URL_HOMENAGENS + (p ? `?page=${p}` : "")));
    if (p === 0) {
      if (!itens.length || !t) falhar("a primeira página de homenagens veio vazia");
      totalPaginas = t;
    }
    console.log(`  homenagens, página ${p + 1} de ${totalPaginas}`);
    novas.push(...itens.filter((i) => i.data >= INICIO_MANDATO));
    const maisAntiga = itens.at(-1)?.data || "";
    if (maisAntiga < INICIO_MANDATO) break; // passou do início do mandato
    // incremental: página toda já conhecida e com mais de 60 dias -> o resto não muda
    if (!args.has("--tudo") && itens.every((i) => conhecidas.has(chave(i))) && maisAntiga < limiteIncremental) {
      const daqui = antigo.homenagens.filter((h) => h.data < itens.at(-1).data);
      novas.push(...daqui);
      break;
    }
  }
  const unicas = [...new Map(novas.map((h) => [chave(h), h])).values()].sort((a, b) => b.data.localeCompare(a.data));
  if (unicas.length < antigo.homenagens.length * 0.9) falhar(`vieram ${unicas.length} homenagens, eram ${antigo.homenagens.length}`);
  return {
    fonte: BASE + URL_HOMENAGENS,
    observacao: "Homenagens entregues em reunião solene da Câmara (diplomas, títulos, medalhas), com a data da cerimônia. Não inclui moções de aplauso ou de pesar, que são outro tipo de proposição.",
    coletadoEm: agora,
    homenagens: unicas,
  };
}

// ---------- Comissões ----------
function lerComissoes(html) {
  const bloco = (html.match(/block-consulta-comissoes-consulta-comissoes-ver[\s\S]*?<\/section>/) || [""])[0];
  return [...bloco.matchAll(/<h3><a href='([^']+)'>([\s\S]*?)<\/a><\/h3>\s*<table[\s\S]*?<\/table>/g)].map((m) => {
    const cargos = [...m[0].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => texto(c[1])).filter(Boolean);
    return { comissao: texto(m[2]), cargo: cargos.join(", ") || null, url: BASE + encodeURI(decodeURI(m[1])) };
  });
}

async function coletarComissoes(agora) {
  const { vereadores } = lerJson("vereadores.json", { vereadores: [] });
  if (!vereadores.length) falhar("dados/vereadores.json não existe; rode antes scripts/coletar.js");
  const antigo = Object.fromEntries((lerJson("comissoes.json", { vereadores: [] }).vereadores || []).map((v) => [v.slug, v]));
  const validade = Date.now() - COMISSOES_VALIDADE_DIAS * 864e5;
  const saida = [];
  for (const v of vereadores) {
    const ant = antigo[v.slug];
    if (!args.has("--tudo") && ant && Date.parse(ant.coletadoEm) > validade) {
      saida.push(ant);
      continue;
    }
    console.log(`  comissões: ${v.nome}`);
    const html = await baixar(`/vereadores/${encodeURIComponent(v.slug)}/comissoes`);
    if (!html.includes("Participação em comissões")) falhar(`a página de comissões de ${v.nome} mudou de formato`);
    saida.push({ slug: v.slug, nome: v.nome, coletadoEm: agora, comissoes: lerComissoes(html) });
  }
  const comAlguma = saida.filter((v) => v.comissoes.length).length;
  if (comAlguma < vereadores.length / 2) falhar(`só ${comAlguma} vereadores com comissão; formato pode ter mudado`);
  return { fonte: `${BASE}/vereadores/<vereador>/comissoes`, coletadoEm: agora, vereadores: saida };
}

async function main() {
  const agora = new Date().toISOString();
  console.log("1/2 Homenagens em reunião solene");
  const homenagens = await coletarHomenagens(agora);
  console.log("2/2 Comissões");
  const comissoes = await coletarComissoes(agora);
  gravar("homenagens.json", homenagens);
  gravar("comissoes.json", comissoes);
  console.log(`OK: ${homenagens.homenagens.length} homenagens desde ${INICIO_MANDATO}, comissões de ${comissoes.vereadores.length} vereadores.`);
}

module.exports = { lerPaginaHomenagens, lerComissoes };
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
