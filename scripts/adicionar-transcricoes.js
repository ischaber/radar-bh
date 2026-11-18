// Acrescenta transcrições compactas de fichas de 2º turno em dados/transcricoes-2turno.json.
//
//   node scripts/adicionar-transcricoes.js lote.txt
//   node scripts/montar-votos.js            (confere com a ficha e a planilha; só grava se tudo bater)
//
// Uma linha por ficha, campos separados por "|":
//   PL | data (dd/mm/aaaa) | nº da reunião (ex.: 93, ou 5E para extraordinária) | quórum | resultado |
//   Sim,Não[,Abstenção] | exceções | evento da planilha (opcional)
// Quórum: M (maioria dos membros), 2/3, 3/5 ou o texto da ficha (ex.: "Maioria dos presentes").
// Exceções: só quem NÃO segue o padrão da planilha (presente = Sim, ausente = Não votou, presidindo = Presidência),
//   no formato "Nome=V; Nome=V", com V = S (Sim), N (Não), A (Abstenção), NV (Não votou), P (Presidência).
//   "*=N" muda o padrão dos presentes para Não (útil quando a maioria votou Não).
// Evento: o nome exato da votação na planilha da reunião, quando houver mais de uma do mesmo PL.
//
// Exemplo:
//   958/2026 | 12/11/2026 | 98 | 2/3 | Aprovado | 32,0,5 | Iza Lourença=A; Pedro Patrus=A
const fs = require("fs");
const path = require("path");

const arq = path.join(__dirname, "..", "dados", "transcricoes-2turno.json");
const j = JSON.parse(fs.readFileSync(arq, "utf8"));
const Q = { M: "Maioria dos membros", "2/3": "Dois terços dos membros", "3/5": "Três quintos dos membros" };
const V = { S: "Sim", N: "Não", A: "Abstenção", NV: "Não votou", P: "Presidência" };
const hoje = new Date().toISOString().slice(0, 10);
let n = 0;

for (const linha of fs.readFileSync(process.argv[2], "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
  if (!linha.trim() || linha.startsWith("#")) continue;
  const [pl, data, reu, q, res, tot, exc, evento] = linha.split("|").map((s) => s.trim());
  if (!/^\d+\/\d{4}$/.test(pl)) throw new Error(`PL inválido: "${pl}" (use 958/2026)`);
  const [d, m, y] = data.split("/");
  const [s, nao, a] = tot.split(",").map(Number);
  const excecoes = {};
  for (const par of (exc || "").split(";").filter((x) => x.trim())) {
    const [nome, v] = par.split("=").map((x) => x.trim());
    if (!V[v]) throw new Error(`voto "${v}" desconhecido em ${pl}`);
    excecoes[nome] = V[v];
  }
  const padraoPresente = excecoes["*"];
  delete excecoes["*"];
  const totais = { Sim: s, Não: nao };
  if (a) totais["Abstenção"] = a;
  const extra = /E$/i.test(reu);
  j.transcricoes[pl] = {
    data: `${y}-${m}-${d}`,
    reuniao: `${reu.replace(/E$/i, "")}ª Reunião ${extra ? "Extraordinária" : "Ordinária"}`,
    quorum: Q[q] || q,
    resultado: res,
    totais,
    transcritoEm: hoje,
    ...(padraoPresente ? { padraoPresente } : {}),
    excecoes,
    ...(evento ? { evento } : {}),
  };
  n++;
}
fs.writeFileSync(arq, JSON.stringify(j, null, 1) + "\n");
console.log(`${n} transcrição(ões) acrescentada(s); ${Object.keys(j.transcricoes).length} no total.`);
