// Coleta oficial do Radar BH: vereadores e presença mensal em plenário (CMBH).
//
//   node scripts/coletar.js           -> coleta incremental (meses novos e os 2 mais recentes)
//   node scripts/coletar.js --tudo    -> refaz todos os meses do mandato
//   node scripts/coletar.js --perfis  -> força a atualização dos perfis
//
// Se algo vier incompleto ou estranho, o script para com erro e NÃO grava nada:
// os arquivos em dados/ continuam com a última versão boa.
const fs = require("fs");
const path = require("path");
const { BASE, baixar, texto, normalizar } = require("./lib/cmbh");
const { lerPlanilha } = require("./lib/xlsx");

const DADOS = path.join(__dirname, "..", "dados");
const INICIO_MANDATO = 2025;
const MIN_VEREADORES = 35; // a Câmara tem 41 cadeiras
const PERFIL_VALIDADE_DIAS = 7;
const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CODIGOS = new Set(["P", "F", "AJ", "LM", "SR", ""]);
const URL_PRESENCA = "/transparencia/vereadores/presenca-mensal-consolidada";

const args = new Set(process.argv.slice(2));
const lerJson = (nome, padrao) => {
  const p = path.join(DADOS, nome);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : padrao;
};
const falhar = (msg) => {
  throw new Error(`Coleta abortada, nada foi gravado: ${msg}`);
};

// ---------- Vereadores ----------
function lerListaVereadores(html) {
  const cartoes = html.split('<div class="vereador">').slice(1);
  return cartoes.map((c) => {
    const slug = decodeURIComponent((c.match(/href="\/vereadores\/([^"]+)"/) || [])[1] || "");
    const nome = texto((c.match(/views-field-title[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/) || [])[1] || "");
    const partido = texto((c.match(/views-field-field-sigla[\s\S]*?field-content">([\s\S]*?)<\/div>/) || [])[1] || "");
    const foto = (c.match(/<img[^>]+src="([^"]+)"/) || [])[1] || null;
    return { slug, nome, partido, foto, perfil: `${BASE}/vereadores/${encodeURIComponent(slug)}` };
  });
}

function lerPerfil(html) {
  const campo = (re) => texto((html.match(re) || [])[1] || "") || null;
  const mandatos = [...html.matchAll(/date-display-start">(\d{4})<\/span> a <span class="date-display-end">(\d{4})/g)].map((m) => `${m[1]}–${m[2]}`);
  return {
    nomeCivil: campo(/field-name-field-nome-civil[\s\S]*?field-item even">([\s\S]*?)<\/div>/),
    partidoCompleto: campo(/field-name-partido-composto[\s\S]*?field-item even">([\s\S]*?)<\/div>/),
    mandatos,
    telefone: campo(/views-field-field-telefone[\s\S]*?field-content">([\s\S]*?)<\/div>/),
    sala: campo(/views-field-field-sala separador">\s*Sala:([\s\S]*?)<\/div>/),
    email: (html.match(/mailto:([^"]+@cmbh\.mg\.gov\.br)"/) || [])[1] || null, // só e-mail institucional
  };
}

// ---------- Presença ----------
function lerPresencaMensal(html, ano, mes) {
  const titulo = texto((html.match(/<h2>(Presença Mensal Consolidada[\s\S]*?)<\/h2>/) || [])[1] || "");
  const esperado = `${MESES[+mes]} de ${ano}`;
  if (!titulo.endsWith(esperado)) falhar(`pedi ${esperado}, a página respondeu "${titulo || "sem título"}"`);
  const blocos = [...html.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<div class="table-responsive">([\s\S]*?)<\/table>/g)];
  const vereadores = blocos.map(([, nome, tabela]) => {
    const dias = [...tabela.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => Number(texto(m[1])));
    const codigos = [...tabela.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]).toUpperCase());
    if (dias.length !== codigos.length || dias.some((d) => !(d >= 1 && d <= 31)))
      falhar(`tabela de ${texto(nome)} em ${esperado} está desalinhada`);
    for (const c of codigos) if (!CODIGOS.has(c)) console.warn(`  aviso: código desconhecido "${c}" (${texto(nome)}, ${esperado})`);
    return { nome: texto(nome), dias: dias.map((dia, i) => ({ dia, codigo: codigos[i] })) };
  });
  if (vereadores.length < MIN_VEREADORES) falhar(`${esperado} veio com só ${vereadores.length} vereadores`);
  return { ano: Number(ano), mes: Number(mes), titulo, vereadores };
}

// ---------- Presença por reunião (XLSX), usada para o mês que ainda não fechou ----------
const URL_REUNIOES = "/transparencia/vereadores/relatorio-individualizado-reuniao";
const AUSENCIAS = new Set(["F", "AJ", "LM", "SR"]);

function lerListaReunioes(html) {
  return [...html.matchAll(/<a href="([^"]+\.xlsx)">([\s\S]*?)<\/a>/g)].map((m) => {
    const titulo = texto(m[2]).replace(/^Relatório Individualizado de Presença - /, "");
    const [, dia, mes, ano] = (titulo.match(/ - (\d{2})\/(\d{2})\/(\d{4})/) || []).map(Number);
    if (!dia) falhar(`não entendi a data da reunião "${titulo}"`);
    return { titulo: titulo.replace(/\s*\(data de publicação.*$/, ""), url: m[1], ano, mes, dia };
  });
}

function lerPlanilhaReuniao(buf, r) {
  const linhas = lerPlanilha(buf);
  const serial = Number((linhas.find((l) => l.linha === 1) || {}).F);
  const data = new Date(Math.round((serial - 25569) * 864e5));
  if (data.getUTCFullYear() !== r.ano || data.getUTCMonth() + 1 !== r.mes || data.getUTCDate() !== r.dia)
    falhar(`a planilha de "${r.titulo}" traz outra data (${serial})`);
  const vereadores = [];
  for (const l of linhas) {
    const m = String(l.F || "").match(/^\s*\d+\.\s*(.+?)\s*$/);
    if (!m || !/^(PRESENTE|AUSENTE)$/.test(l.D || "")) continue;
    const marcado = String(l.E || "").trim().toUpperCase();
    // A coluna D (PRESENTE/AUSENTE) é a que confere com a presença mensal.
    // Na ausência, a coluna E diz o tipo; se ela vier com erro, fica "AUS" (tipo não informado).
    const codigo = l.D === "PRESENTE" ? "P" : AUSENCIAS.has(marcado) ? marcado : "AUS";
    vereadores.push({ nome: m[1], codigo, eventos: Number(l.B) || null, presenteEm: Number(l.A) || 0 });
  }
  if (vereadores.length < MIN_VEREADORES) falhar(`"${r.titulo}" veio com só ${vereadores.length} vereadores`);
  return vereadores;
}

async function coletarMesAberto(meses, agora) {
  const ultimo = meses.at(-1);
  const depoisDoMensal = (r) => r.ano > ultimo.ano || (r.ano === ultimo.ano && r.mes > ultimo.mes);
  const reunioes = [];
  for (let pagina = 0; pagina < 5; pagina++) {
    const lista = lerListaReunioes(await baixar(URL_REUNIOES + (pagina ? `?page=${pagina}` : "")));
    if (!lista.length) falhar("a lista de relatórios por reunião veio vazia");
    reunioes.push(...lista.filter(depoisDoMensal));
    if (lista.some((r) => !depoisDoMensal(r))) break; // já chegou nos meses que a tabela mensal cobre
  }
  for (const r of reunioes) {
    console.log(`  ${r.titulo}`);
    r.vereadores = lerPlanilhaReuniao(await baixar(r.url, { binario: true }), r);
    r.coletadoEm = agora;
  }
  return reunioes.sort((a, b) => a.ano - b.ano || a.mes - b.mes || a.dia - b.dia);
}

const mesesDaPagina = (html) =>
  [...(html.match(/name="mes"[\s\S]*?<\/select>/) || [""])[0].matchAll(/<option value="(\d+)"/g)].map((m) => m[1]);
const anosDaPagina = (html) =>
  [...(html.match(/name="ano"[\s\S]*?<\/select>/) || [""])[0].matchAll(/<option value="(\d{4})"/g)].map((m) => Number(m[1]));

async function main() {
  const agora = new Date().toISOString();
  console.log("1/4 Lista de vereadores");
  const lista = lerListaVereadores(await baixar("/vereadores"));
  if (lista.length < MIN_VEREADORES || lista.some((v) => !v.slug || !v.nome)) falhar(`lista de vereadores veio com ${lista.length} nomes ou com campos vazios`);

  console.log("2/4 Perfis");
  const anteriores = Object.fromEntries((lerJson("vereadores.json", { vereadores: [] }).vereadores || []).map((v) => [v.slug, v]));
  const validade = Date.now() - PERFIL_VALIDADE_DIAS * 864e5;
  for (const v of lista) {
    const ant = anteriores[v.slug];
    if (!args.has("--perfis") && ant?.perfilColetadoEm && Date.parse(ant.perfilColetadoEm) > validade) {
      Object.assign(v, { ...pick(ant, ["nomeCivil", "partidoCompleto", "mandatos", "telefone", "sala", "email", "perfilColetadoEm"]) });
      continue;
    }
    console.log(`  ${v.nome}`);
    Object.assign(v, lerPerfil(await baixar(`/vereadores/${encodeURIComponent(v.slug)}`)), { perfilColetadoEm: agora });
  }

  console.log("3/4 Presença mensal consolidada");
  const antigo = lerJson("presenca-mensal.json", { meses: [] });
  const guardados = new Map(antigo.meses.map((m) => [`${m.ano}-${m.mes}`, m]));
  const primeira = await baixar(URL_PRESENCA);
  const anoAtual = Math.max(...anosDaPagina(primeira));
  if (!(anoAtual >= INICIO_MANDATO)) falhar("não encontrei a lista de anos na página de presença");
  const meses = [];
  for (let ano = INICIO_MANDATO; ano <= anoAtual; ano++) {
    const paginaAno = await baixar(URL_PRESENCA, { form: { ano } });
    const disponiveis = mesesDaPagina(paginaAno); // do mais recente para o mais antigo
    if (!disponiveis.length) falhar(`nenhum mês listado para ${ano}`);
    for (const [i, mes] of disponiveis.entries()) {
      const chave = `${ano}-${Number(mes)}`;
      const recente = ano === anoAtual && i < 2;
      if (!args.has("--tudo") && !recente && guardados.has(chave)) {
        meses.push(guardados.get(chave));
        continue;
      }
      console.log(`  ${MESES[+mes]} de ${ano}`);
      const html = i === 0 ? paginaAno : await baixar(URL_PRESENCA, { form: { ano, mes } });
      meses.push({ ...lerPresencaMensal(html, ano, mes), coletadoEm: agora });
    }
  }
  meses.sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  if (meses.length < antigo.meses.length) falhar(`a coleta trouxe menos meses (${meses.length}) que a anterior (${antigo.meses.length})`);

  console.log("4/4 Reuniões do mês que ainda não está na tabela mensal");
  const reunioes = await coletarMesAberto(meses, agora);

  // Só grava depois que tudo deu certo.
  fs.mkdirSync(DADOS, { recursive: true });
  gravar("vereadores.json", { fonte: `${BASE}/vereadores`, coletadoEm: agora, vereadores: lista });
  gravar("presenca-mensal.json", {
    fonte: BASE + URL_PRESENCA,
    observacao: "Página oficial mostra apenas os dias em que houve reunião. Códigos: P presente, F falta, AJ ausência justificada, LM licença médica, SR licença sem remuneração.",
    coletadoEm: agora,
    meses,
  });
  gravar("presenca-reunioes.json", {
    fonte: BASE + URL_REUNIOES,
    observacao:
      "Relatórios por reunião (XLSX) das reuniões posteriores ao último mês da tabela mensal. Provisório: ausências ainda podem ser justificadas até o 5º dia útil do mês seguinte. Códigos: P presente; F, AJ, LM, SR como na tabela mensal; AUS ausente sem tipo informado na planilha.",
    coletadoEm: agora,
    reunioes,
  });
  console.log(`OK: ${lista.length} vereadores, ${meses.length} meses de presença, ${reunioes.length} reuniões do mês aberto.`);
}

function pick(o, ks) {
  return Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));
}
function gravar(nome, obj) {
  const destino = path.join(DADOS, nome);
  fs.writeFileSync(destino + ".tmp", JSON.stringify(obj, null, 1) + "\n");
  fs.renameSync(destino + ".tmp", destino);
}

module.exports = { lerListaVereadores, lerPerfil, lerPresencaMensal, lerListaReunioes, lerPlanilhaReuniao, normalizar };
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
