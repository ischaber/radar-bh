// Junta os dados coletados em site/dados.json, o único arquivo que a página carrega.
// Não acessa a internet: só lê dados/.
const fs = require("fs");
const path = require("path");
const { normalizar, BASE } = require("./lib/cmbh");

const RAIZ = path.join(__dirname, "..");
// Tolera a marca BOM que o Bloco de Notas do Windows às vezes põe no início do arquivo.
const lerJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
const ler = (n) => lerJson(path.join(RAIZ, "dados", n));

const { vereadores, coletadoEm: vereadoresEm, fonte: fonteVereadores } = ler("vereadores.json");
const presenca = ler("presenca-mensal.json");
const apelidos = ler("apelidos.json");
const config = lerJson(process.env.RADAR_CONFIG || path.join(RAIZ, "radar.config.json"));
const correcoes = ler("correcoes.json").correcoes || [];

// Canal de correção: só e-mail com @ ou link http(s); qualquer outra coisa conta como não configurado.
function canalCorrecao(c = {}) {
  if (c.tipo === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.endereco || "")) return { tipo: "email", endereco: c.endereco };
  if (c.tipo === "link" && /^https?:\/\/\S+$/.test(c.url || "")) return { tipo: "link", url: c.url };
  console.warn("Aviso: canal de correção não configurado em radar.config.json. O site vai dizer que ele ainda não existe.");
  return null;
}
const porReuniao = fs.existsSync(path.join(RAIZ, "dados", "presenca-reunioes.json"))
  ? ler("presenca-reunioes.json")
  : { reunioes: [] };

// Reuniões do mês que ainda não está na tabela mensal viram meses "provisórios",
// no mesmo formato, com o link da planilha oficial em cada dia.
const ultimoMensal = presenca.meses.at(-1);
const mesesProvisorios = new Map();
for (const r of porReuniao.reunioes) {
  if (r.ano < ultimoMensal.ano || (r.ano === ultimoMensal.ano && r.mes <= ultimoMensal.mes)) continue; // a tabela mensal já cobre
  const k = `${r.ano}-${r.mes}`;
  if (!mesesProvisorios.has(k)) mesesProvisorios.set(k, { ano: r.ano, mes: r.mes, provisorio: true, porNome: new Map() });
  const m = mesesProvisorios.get(k);
  for (const v of r.vereadores) {
    if (!m.porNome.has(v.nome)) m.porNome.set(v.nome, []);
    m.porNome.get(v.nome).push({ dia: r.dia, codigo: v.codigo, url: r.url, reuniao: r.titulo });
  }
}
const todosOsMeses = [
  ...presenca.meses,
  ...[...mesesProvisorios.values()].map((m) => ({
    ano: m.ano,
    mes: m.mes,
    provisorio: true,
    vereadores: [...m.porNome].map(([nome, dias]) => ({ nome, dias })),
  })),
];
const ultimaReuniao = porReuniao.reunioes.at(-1);

const porChave = new Map(vereadores.map((v) => [normalizar(v.nome), v.slug]));
for (const [k, slug] of Object.entries(apelidos)) if (!k.startsWith("_")) porChave.set(normalizar(k), slug);

const vazio = () => ({ reunioes: 0, P: 0, F: 0, AJ: 0, LM: 0, SR: 0, AUS: 0, semRegistro: 0, outros: 0, meses: [] });
const registros = new Map(); // slug ou "fora:<nome>" -> resumo
const nomesFora = new Map();

for (const m of todosOsMeses) {
  for (const v of m.vereadores) {
    const chave = normalizar(v.nome);
    const id = porChave.get(chave) || `fora:${chave}`;
    if (id.startsWith("fora:")) nomesFora.set(id, v.nome);
    if (!registros.has(id)) registros.set(id, vazio());
    const r = registros.get(id);
    for (const { codigo } of v.dias) {
      r.reunioes++;
      if (codigo === "") r.semRegistro++;
      else if (codigo in r) r[codigo]++;
      else r.outros++;
    }
    r.meses.push({
      ano: m.ano,
      mes: m.mes,
      ...(m.provisorio ? { provisorio: true } : {}),
      dias: v.dias.map((d) => (d.url ? [d.dia, d.codigo, d.url, d.reuniao] : [d.dia, d.codigo])),
    });
  }
}

// ---------- Extras: comissões e homenagens (opcionais; o site funciona sem eles) ----------
const extra = (n) => (fs.existsSync(path.join(RAIZ, "dados", n)) ? ler(n) : null);
const comissoesDados = extra("comissoes.json");
const homenagensDados = extra("homenagens.json");
const comissoesPorSlug = new Map((comissoesDados?.vereadores || []).map((v) => [v.slug, v.comissoes]));
const homenagensPorSlug = new Map();
const homenagensSemDono = [];
const nomesForaChaves = new Set([...nomesFora.values()].map((n) => normalizar(n)));
// Alguns tipos vêm em CAIXA ALTA na fonte; só a caixa é ajustada, o texto não muda.
const caixa = (t) => (t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t);
for (const h of homenagensDados?.homenagens || []) {
  // O campo "Vereador" é texto livre: tenta o nome inteiro e, se não achar, partes separadas por vírgula, "e" ou "/".
  const chaveNome = (s) => normalizar(s).replace(/^(vereadora|vereador|ver)\s+/, "");
  let slugs = [porChave.get(chaveNome(h.vereador))].filter(Boolean);
  if (!slugs.length) slugs = h.vereador.split(/\s*(?:,|;|\/|\se\s)\s*/).map((p) => porChave.get(chaveNome(p))).filter(Boolean);
  if (!slugs.length && !nomesForaChaves.has(chaveNome(h.vereador))) homenagensSemDono.push(h.vereador);
  for (const s of new Set(slugs)) {
    if (!homenagensPorSlug.has(s)) homenagensPorSlug.set(s, []);
    homenagensPorSlug.get(s).push({ data: h.data, homenageado: h.homenageado, tipo: caixa(h.tipo) });
  }
}
if (homenagensSemDono.length)
  console.warn(`Aviso: homenagens sem vereador identificado (${homenagensSemDono.length}): ${[...new Set(homenagensSemDono)].join(" | ")}`);

// ---------- Votações por reunião (participação) e votos nominais transcritos ----------
const chaveVereador = (s) => porChave.get(normalizar(s).replace(/^(vereadora|vereador|ver)\s+/, ""));
const votacoesDados = extra("votacoes.json");
const listaVotacoes = []; // [data, nome da matéria, índice da planilha]
const planilhas = [];
const marcasPorSlug = new Map();
for (const r of (votacoesDados?.reunioes || []).filter((r) => !r.erro)) {
  const pi = planilhas.push({ data: r.data, titulo: r.titulo, url: r.url }) - 1;
  const idxEventos = r.eventos.map((e, i) => (e.inicio ? -1 : listaVotacoes.push([r.data, e.nome, pi]) - 1));
  for (const v of r.vereadores) {
    const slug = chaveVereador(v.nome);
    if (!slug) continue;
    if (!marcasPorSlug.has(slug)) marcasPorSlug.set(slug, {});
    const m = marcasPorSlug.get(slug);
    idxEventos.forEach((gi, i) => {
      if (gi >= 0) m[gi] = v.marcas[i] || "?";
    });
  }
}
// cada vereador: uma letra por votação da lista ("-" = não estava na planilha daquela reunião)
const marcasTexto = (slug) => {
  const m = marcasPorSlug.get(slug);
  if (!m) return null;
  return listaVotacoes.map((_, i) => m[i] || "-").join("");
};

const nominais = extra("votos-nominais.json");
const votosPorSlug = new Map();
const votosSemCartao = new Set();
const votacoesNominais = (nominais?.votacoes || []).map((vt, i) => {
  const contagem = {};
  for (const [nome, voto] of Object.entries(vt.votos)) {
    contagem[voto] = (contagem[voto] || 0) + 1;
    const slug = chaveVereador(nome);
    if (!slug) {
      votosSemCartao.add(nome); // ex-vereadores e suplentes: o voto conta no total, mas não há cartão
      continue;
    }
    if (!votosPorSlug.has(slug)) votosPorSlug.set(slug, []);
    votosPorSlug.get(slug).push([i, voto]);
  }
  for (const [k, n] of Object.entries(vt.totais || {}))
    if ((contagem[k] || 0) !== n) throw new Error(`${vt.materia} ${vt.turno}: a ficha diz ${n} "${k}", a transcrição tem ${contagem[k] || 0}. Confira dados/votos-nominais.json.`);
  const { votos, ...resto } = vt;
  return { ...resto, contagem };
});

// Projetos de lei votados no Plenário em mais de uma reunião. A planilha não diz o turno; em BH o
// PL passa por 2 turnos, então a votação seguinte costuma ser o 2º turno (mas pode ser veto etc.).
const projetosPorChave = new Map();
listaVotacoes.forEach(([data, nome, pi]) => {
  const m = nome.match(/^PL\s*(\d+)\s*\/\s*(\d{2}|\d{4})\b/i);
  if (!m) return;
  const numero = Number(m[1]);
  const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  const chave = `${numero}/${ano}`;
  if (!projetosPorChave.has(chave)) projetosPorChave.set(chave, { numero, ano, reunioes: new Map() });
  projetosPorChave.get(chave).reunioes.set(data, pi);
});
const transcritas = new Set(votacoesNominais.map((vt) => `${vt.materia}|${vt.turno}`));
const projetosVariasReunioes = [...projetosPorChave.values()]
  .filter((p) => p.reunioes.size >= 2)
  .map((p) => {
    const materia = `PL ${p.numero}/${p.ano}`;
    const reunioes = [...p.reunioes].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      materia,
      reunioes, // [[data, índice da planilha]]
      proposicao: `${BASE}/atividade-legislativa/pesquisar-proposicoes/projeto-de-lei/${p.numero}/${p.ano}`,
      segundoTurnoTranscrito: transcritas.has(`${materia}|2º turno`),
    };
  })
  .sort((a, b) => b.reunioes.at(-1)[0].localeCompare(a.reunioes.at(-1)[0]) || a.materia.localeCompare(b.materia));

// ---------- Custeio Parlamentar (gastos de gabinete por mês) ----------
const custeioDados = extra("custeio.json");
// O site mostra só a gestão 2025–2028. As contas de correio (Serviços Postais) chegam no mês seguinte ao
// serviço; as pagas em janeiro/2025 provavelmente são de dezembro/2024, ainda no mandato anterior (ex.: um
// ex-vereador, Professor Claudiney Dulim, aparece só com correios nesse mês). Elas saem dos totais e aparecem
// à parte, com aviso. A nota não informa o período, por isso o texto diz "provavelmente".
const DO_MANDATO_ANTERIOR = (mes, item) => mes === "2025-01" && item[0] === "Serviços Postais";
const AVISO_MANDATO_ANTERIOR =
  "Correios pagos em janeiro/2025 não entram no total: a conta chega no mês seguinte ao serviço, então provavelmente é de dezembro/2024, ainda no mandato anterior.";
const custeioPorSlug = new Map();
const custeioSemDono = new Set();
const mesAtual = new Date().toISOString().slice(0, 7);
for (const [mes, m] of Object.entries(custeioDados?.meses || {})) {
  for (const v of m.vereadores) {
    const slug = chaveVereador(v.nome);
    if (!slug) {
      custeioSemDono.add(v.nome);
      continue;
    }
    if (!custeioPorSlug.has(slug)) custeioPorSlug.set(slug, []);
    // [mês, total desta gestão, itens?, itens possivelmente do mandato anterior?]
    // itens = [[tipo, valor, idNota|null], ...] quando o detalhamento foi coletado
    if (!v.itens) {
      custeioPorSlug.get(slug).push([mes, v.valor]);
      continue;
    }
    const itens = v.itens.map((i) => [i[0], i[1], i[2]]);
    const anterior = itens.filter((i) => DO_MANDATO_ANTERIOR(mes, i));
    const desta = itens.filter((i) => !DO_MANDATO_ANTERIOR(mes, i));
    const valor = Math.round(desta.reduce((s, i) => s + i[1], 0) * 100) / 100;
    custeioPorSlug.get(slug).push(anterior.length ? [mes, valor, desta, anterior] : [mes, valor, desta]);
  }
}
if (custeioSemDono.size) console.log(`Custeio de quem não está na lista atual: ${[...custeioSemDono].join(", ")}`);
const custeioMeses = Object.keys(custeioDados?.meses || {});

// ---------- Equipe do gabinete e custo do mandato pela regra oficial ----------
// Equipe: dados/gabinetes.json (Consulta à Remuneração; sem nomes e sem salários, que a Câmara só mostra
// um a um, com verificação anti-robô). Subsídio e benefícios: valores fixos publicados na Estrutura
// Remuneratória dos vereadores, iguais para todos; o que muda é desde quando cada um exerce o mandato.
const REGRA = {
  fonte: `${BASE}/transparencia/pessoal/estrutura-remuneratoria/vereadores`,
  subsidio: 18402.02, // Lei 11.016/2016
  auxilio: 2374.0, // Lei 11.849, de 28/04/2025: contamos a partir de maio/2025
  auxilioDesde: "2025-05",
  inicioGestao: "2025-01-01",
};
const gabinetesDados = extra("gabinetes.json");
const mesEquipe = Object.keys(gabinetesDados?.meses || {}).at(-1) || null;
const equipePorSlug = new Map();
const inicioPorSlug = new Map();
const equipesSemDono = [];
for (const [lotacao, g] of Object.entries(gabinetesDados?.meses[mesEquipe]?.gabinetes || {})) {
  const slug = chaveVereador(lotacao);
  if (!slug) {
    equipesSemDono.push(lotacao);
    continue;
  }
  const ativos = g.servidores.filter((s) => !s.at(4));
  const grupos = new Map();
  for (const [, cargo, h] of ativos) {
    const k = `${cargo}|${h}`;
    grupos.set(k, (grupos.get(k) || 0) + 1);
  }
  equipePorSlug.set(slug, {
    mes: mesEquipe,
    pessoas: ativos.length,
    saiuNoMes: g.servidores.length - ativos.length,
    porCargo: [...grupos].map(([k, n]) => [...k.split("|").map((x, i) => (i ? Number(x) : x)), n]).sort((a, b) => b[2] - a[2]),
  });
  if (g.vereador?.admissao) inicioPorSlug.set(slug, g.vereador.admissao.split("/").reverse().join("-"));
}
if (equipesSemDono.length) console.log(`Gabinetes de quem não está na lista atual: ${equipesSemDono.join(", ")}`);

const mesesEntre = (de, ate) => {
  const r = [];
  let [a, m] = de.split("-").map(Number);
  const [A, M] = ate.split("-").map(Number);
  while (a < A || (a === A && m <= M)) {
    r.push(`${a}-${String(m).padStart(2, "0")}`);
    if (++m > 12) (m = 1), a++;
  }
  return r;
};
// Custo pela regra, do início do mandato (ou da gestão) até o último mês fechado.
const ultimoMesFechado = (() => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
})();
const centavos = (x) => Math.round(x * 100) / 100;
function custoMandato(slug) {
  // Só calcula com a data de posse da lista oficial. Sem ela (suplente que entrou depois do mês da lista
  // ou que exerceu o mandato por períodos), não estimamos.
  let inicio = inicioPorSlug.get(slug);
  if (!inicio) return null;
  if (inicio < REGRA.inicioGestao) inicio = REGRA.inicioGestao;
  // licença sem salário (SR) no Plenário: o valor pago foi menor que o da regra
  const sr = registros.get(slug)?.SR || 0;
  return { ...calcular(inicio), ...(sr ? { diasSemSalario: sr } : {}) };
}
function calcular(inicio) {
  const meses = mesesEntre(inicio.slice(0, 7), ultimoMesFechado);
  const dia = Number(inicio.slice(8, 10));
  const fracao = (mes, i) => {
    if (i > 0 || dia === 1) return 1;
    const [a, m] = mes.split("-").map(Number);
    const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return (dias - dia + 1) / dias;
  };
  let subsidio = 0;
  let auxilio = 0;
  meses.forEach((mes, i) => {
    subsidio += REGRA.subsidio * fracao(mes, i);
    if (mes >= REGRA.auxilioDesde) auxilio += REGRA.auxilio * fracao(mes, i);
  });
  // terço de férias: em janeiro, depois de 12 meses de mandato
  const ferias = meses.filter((m) => m.endsWith("-01") && inicio.slice(0, 7) <= `${Number(m.slice(0, 4)) - 1}-01`).length;
  const dezembros = meses.filter((m) => m.endsWith("-12")).map((m) => Number(m.slice(0, 4)));
  return {
    inicio,
    ate: ultimoMesFechado,
    meses: centavos(meses.reduce((s, m, i) => s + fracao(m, i), 0)),
    subsidio: centavos(subsidio),
    auxilio: centavos(auxilio),
    ferias: centavos((ferias * REGRA.subsidio) / 3),
    dezembros, // 13º: até um subsídio por ano, proporcional à presença; o valor pago não é publicado
  };
}

if (votosSemCartao.size) console.log(`Votos nominais de quem não está na lista atual (contam nos totais): ${[...votosSemCartao].join(", ")}`);

const saida = {
  atualizadoEm: presenca.coletadoEm,
  periodo: {
    de: presenca.meses[0] && { ano: presenca.meses[0].ano, mes: presenca.meses[0].mes },
    ate: { ano: todosOsMeses.at(-1).ano, mes: todosOsMeses.at(-1).mes },
    ultimaReuniao: mesesProvisorios.size ? { ano: ultimaReuniao.ano, mes: ultimaReuniao.mes, dia: ultimaReuniao.dia } : null,
  },
  correcao: canalCorrecao(config.correcao),
  correcoes,
  fontes: {
    presenca: presenca.fonte,
    reunioes: porReuniao.fonte || null,
    vereadores: fonteVereadores,
    vereadoresColetadosEm: vereadoresEm,
    homenagens: homenagensDados?.fonte || null,
    homenagensDesde: homenagensDados ? "2025-01-01" : null,
    comissoesColetadasEm: comissoesDados?.coletadoEm || null,
  },
  vereadores: vereadores.map((v) => ({
    slug: v.slug,
    nome: v.nome,
    partido: v.partido,
    foto: v.foto,
    perfil: v.perfil,
    nomeCivil: v.nomeCivil,
    telefone: v.telefone,
    sala: v.sala,
    email: v.email,
    presenca: registros.get(v.slug) || null,
    comissoes: comissoesPorSlug.get(v.slug) || null,
    homenagens: homenagensPorSlug.get(v.slug) || [],
    marcasVotacoes: marcasTexto(v.slug),
    votosNominais: votosPorSlug.get(v.slug) || [],
    custeio: custeioPorSlug.get(v.slug) || [],
    equipe: equipePorSlug.get(v.slug) || null,
    mandato: custoMandato(v.slug),
  })),
  mandato: {
    regra: REGRA,
    equipeFonte: gabinetesDados?.fonte || null,
    equipeMes: mesEquipe,
    equipeColetadaEm: gabinetesDados?.meses[mesEquipe]?.coletadoEm || null,
  },
  custeio: custeioDados
    ? {
        fonte: custeioDados.fonte,
        observacao: custeioDados.observacao,
        meses: custeioMeses,
        mesAberto: custeioMeses.includes(mesAtual) ? mesAtual : null,
        notaUrl: custeioDados.notaUrl || null,
        avisoAnterior: AVISO_MANDATO_ANTERIOR,
      }
    : null,
  votacoes: votacoesDados ? { fonte: votacoesDados.fonte, planilhas, lista: listaVotacoes } : null,
  votacoesNominais: nominais ? { criterio: nominais.criterio, lista: votacoesNominais } : null,
  projetosVariasReunioes: votacoesDados ? projetosVariasReunioes : null,
  foraDaListaAtual: [...nomesFora].map(([id, nome]) => ({ nome, presenca: registros.get(id) })),
};

const semPresenca = saida.vereadores.filter((v) => !v.presenca).map((v) => v.nome);
if (semPresenca.length) console.warn(`Aviso: sem presença encontrada para ${semPresenca.join(", ")}. Confira dados/apelidos.json.`);
if (saida.foraDaListaAtual.length)
  console.log(`Fora da lista atual (suplentes ou ex-vereadores?): ${saida.foraDaListaAtual.map((v) => v.nome).join(", ")}`);

fs.writeFileSync(path.join(RAIZ, "site", "dados.json"), JSON.stringify(saida));
console.log(
  `site/dados.json gerado: ${saida.vereadores.length} vereadores, ${presenca.meses.length} meses fechados, ${mesesProvisorios.size} mês(es) provisório(s).`
);
