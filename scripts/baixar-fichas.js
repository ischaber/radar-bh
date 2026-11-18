// Baixa as fichas de 2º turno listadas em dados/fichas-encontradas.json para fichas/<numero>-<ano>.pdf.
// Pula as que já foram baixadas. Respeita o intervalo de 10 s entre pedidos (lib/cmbh).
//
//   node scripts/baixar-fichas.js
const fs = require("fs");
const path = require("path");
const { baixar } = require("./lib/cmbh");

const RAIZ = path.join(__dirname, "..");
const PASTA = path.join(RAIZ, "fichas");
const URL_FICHA = "https://cmbhsildownload.cmbh.mg.gov.br/silinternet/servico/download/documentoVinculado?idDocumento=";
const { projetos } = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados", "fichas-encontradas.json"), "utf8"));

(async () => {
  fs.mkdirSync(PASTA, { recursive: true });
  let n = 0;
  for (const [k, p] of Object.entries(projetos)) {
    if (!p.segundoTurno) continue;
    const destino = path.join(PASTA, k.replace("/", "-") + ".pdf");
    if (fs.existsSync(destino)) continue;
    try {
      const buf = await baixar(URL_FICHA + p.segundoTurno.id, { binario: true });
      if (buf.slice(0, 4).toString() !== "%PDF") throw new Error("não é PDF");
      fs.writeFileSync(destino, buf);
      console.log(`${++n} ${k} ok`);
    } catch (e) {
      console.log(`${k} ERRO ${e.message}`);
    }
  }
  console.log("fim", n);
})();
