// Leitor mínimo de XLSX (só a primeira planilha), sem dependências.
const zlib = require("zlib");

function lerZip(buf) {
  const arquivos = {};
  let fim = buf.length - 22;
  while (fim >= 0 && buf.readUInt32LE(fim) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error("arquivo não é um XLSX/ZIP válido");
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let i = 0; i < total; i++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + nLen);
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(ini, ini + tamComp);
    arquivos[nome] = metodo === 8 ? zlib.inflateRawSync(dados) : dados;
    p += 46 + nLen + xLen + cLen;
  }
  return arquivos;
}

const desescapar = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// Devolve [{ linha: 4, A: "...", B: "..." }, ...]
function lerPlanilha(buf) {
  const z = lerZip(buf);
  const ss = (z["xl/sharedStrings.xml"] || "").toString("utf8");
  const textos = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desescapar([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join("")));
  const sh = z["xl/worksheets/sheet1.xml"].toString("utf8");
  const linhas = [];
  for (const row of sh.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const l = { linha: Number(row[1]) };
    for (const c of row[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tipo = (c[2].match(/t="(\w+)"/) || [])[1];
      const v = ((c[3] || "").match(/<v>([^<]*)<\/v>/) || [])[1];
      const inline = ((c[3] || "").match(/<t[^>]*>([^<]*)<\/t>/) || [])[1];
      if (v === undefined && inline === undefined) continue;
      l[c[1]] = tipo === "s" ? textos[Number(v)] : desescapar(v ?? inline);
    }
    linhas.push(l);
  }
  return linhas;
}

module.exports = { lerPlanilha };
