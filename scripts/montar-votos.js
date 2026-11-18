// Monta os votos nominais de 2º turno a partir de transcrições compactas (dados/transcricoes-2turno.json).
//
// Cada transcrição traz o que está impresso na ficha oficial: data, reunião, quórum, resultado, totais
// e só os votos que NÃO são o padrão. O padrão vem da planilha oficial de presença daquela reunião,
// na coluna da votação: presente (P) = "Sim", ausente (F) = "Não votou", presidindo (X) = "Presidência".
// Depois de aplicar as exceções, a contagem tem de bater com os totais impressos na ficha; se não
// bater, o script para e nada é gravado.
//
//   node scripts/montar-votos.js
const fs = require("fs");
const path = require("path");
const { normalizar } = require("./lib/cmbh");

const DADOS = path.join(__dirname, "..", "dados");
const ler = (n) => JSON.parse(fs.readFileSync(path.join(DADOS, n), "utf8").replace(/^﻿/, ""));
const URL_FICHA = "https://cmbhsildownload.cmbh.mg.gov.br/silinternet/servico/download/documentoVinculado?idDocumento=";
const PADRAO = { P: "Sim", F: "Não votou", X: "Presidência" };
const VOTOS = new Set(["Sim", "Não", "Abstenção", "Não votou", "Presidência"]);

const transcricoes = ler("transcricoes-2turno.json").transcricoes;
const { projetos } = ler("fichas-encontradas.json");
const { reunioes } = ler("votacoes.json");
const apelidos = ler("apelidos.json");
const nominais = ler("votos-nominais.json");

const chave = (s) => normalizar(s).replace(/^(dra|dr|vereadora|vereador)\s+/, "");
const erros = [];
const montadas = [];

for (const [pl, t] of Object.entries(transcricoes)) {
  try {
    const [numero, ano] = pl.split("/");
    const proj = projetos[pl];
    if (!proj || !proj.segundoTurno) throw new Error("sem ficha de 2º turno em fichas-encontradas.json");
    const r = reunioes.find((x) => x.data === t.data && !x.erro);
    if (!r) throw new Error(`não há planilha de presença de ${t.data}`);
    const reEvento = new RegExp(`^PL\\s*${numero}\\s*/\\s*(${ano}|${ano.slice(2)})\\s*$`, "i");
    let idx;
    if (t.evento) idx = r.eventos.findIndex((e) => e.nome === t.evento);
    else {
      let cands = r.eventos.map((e, i) => [e.nome, i]).filter(([n]) => reEvento.test(n.trim()));
      // Sem votação "PL n/aa" pura: a ficha principal costuma ser a do substitutivo (parte não destacada).
      if (!cands.length) {
        const doPl = r.eventos.map((e, i) => [e.nome, i]).filter(([n]) => new RegExp(`^PL\\s*${numero}\\s*/\\s*(${ano}|${ano.slice(2)})\\b`, "i").test(n.trim()));
        cands = doPl.filter(([n]) => !/destaque|destacad|emenda|art\.?\s*\d|artigo|§/i.test(n));
      }
      if (cands.length !== 1)
        throw new Error(`não achei uma única votação "PL ${numero}" na planilha de ${t.data}: ${r.eventos.filter((e) => e.nome.includes(numero)).map((e) => e.nome).join(" | ") || "nenhuma"}`);
      idx = cands[0][1];
    }
    if (idx < 0) throw new Error(`evento "${t.evento}" não está na planilha de ${t.data}`);

    const votos = {};
    const porChave = new Map();
    for (const v of r.vereadores) {
      // padraoPresente: quando a maioria dos presentes votou Não, a transcrição lista os "Sim" como exceção.
      const m = v.marcas[idx];
      votos[v.nome] = m === "P" && t.padraoPresente ? t.padraoPresente : PADRAO[m] || "?";
      porChave.set(chave(v.nome), v.nome);
    }
    for (const [nome, voto] of Object.entries(t.excecoes || {})) {
      if (!VOTOS.has(voto)) throw new Error(`voto desconhecido "${voto}" para ${nome}`);
      const k = chave(nome);
      const alvo =
        porChave.get(k) ||
        porChave.get(chave(apelidos[normalizar(nome)] || "").replace(/-/g, " ")) ||
        [...porChave].find(([ck]) => ck.includes(k) || k.includes(ck))?.[1];
      if (!alvo) throw new Error(`"${nome}" não está na planilha de ${t.data}`);
      votos[alvo] = voto;
    }
    const indefinidos = Object.entries(votos).filter(([, v]) => v === "?").map(([n]) => n);
    if (indefinidos.length) throw new Error(`sem marca na planilha e sem exceção: ${indefinidos.join(", ")}`);
    const contagem = {};
    for (const v of Object.values(votos)) contagem[v] = (contagem[v] || 0) + 1;
    for (const [k, n] of Object.entries(t.totais))
      if ((contagem[k] || 0) !== n) throw new Error(`a ficha diz ${n} "${k}", a montagem dá ${contagem[k] || 0} (${JSON.stringify(contagem)})`);
    for (const k of ["Sim", "Não", "Abstenção"])
      if ((contagem[k] || 0) && !(k in t.totais)) throw new Error(`a montagem tem ${contagem[k]} "${k}" que a ficha não registra`);

    montadas.push({
      materia: `PL ${numero}/${ano}`,
      turno: "2º turno",
      data: t.data,
      reuniao: t.reuniao,
      autoria: proj.autoria.replace(/Ver\.\(a\)\s*/g, "").replace(/;\s*/g, ", "),
      ementa: proj.ementa,
      quorum: t.quorum,
      resultado: t.resultado,
      decisao: proj.segundoTurno.decisao,
      totais: t.totais,
      ficha: URL_FICHA + proj.segundoTurno.id,
      proposicao: `https://www.cmbh.mg.gov.br/atividade-legislativa/pesquisar-proposicoes/projeto-de-lei/${numero}/${ano}`,
      transcritoEm: t.transcritoEm,
      origem: "ficha + planilha da reunião",
      votos,
    });
  } catch (e) {
    erros.push(`${pl}: ${e.message}`);
  }
}

if (erros.length) {
  console.error(`Nada foi gravado. ${erros.length} transcrição(ões) com problema:\n` + erros.join("\n"));
  process.exit(1);
}
const manuais = nominais.votacoes.filter((v) => v.origem !== "ficha + planilha da reunião");
const jaManuais = new Set(manuais.map((v) => `${v.materia}|${v.turno}`));
nominais.votacoes = [...manuais, ...montadas.filter((v) => !jaManuais.has(`${v.materia}|${v.turno}`))].sort(
  (a, b) => a.data.localeCompare(b.data) || a.materia.localeCompare(b.materia)
);
fs.writeFileSync(path.join(DADOS, "votos-nominais.json"), JSON.stringify(nominais, null, 1) + "\n");
console.log(`OK: ${montadas.length} votações montadas e conferidas; ${nominais.votacoes.length} no total.`);
