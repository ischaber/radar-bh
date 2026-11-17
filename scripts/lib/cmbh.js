// Acesso ao portal da CMBH: identificação clara, uma requisição a cada 10 s
// (Crawl-delay do robots.txt) e novas tentativas em caso de erro temporário.
const BASE = "https://www.cmbh.mg.gov.br";
const USER_AGENT =
  "radarBH/0.1 (coleta de dados publicos de presenca de vereadores; 1 requisicao a cada 10s)";
const INTERVALO_MS = Number(process.env.RADAR_INTERVALO_MS || 10_000);

let ultimaRequisicao = 0;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixar(caminho, { form, binario } = {}) {
  const url = caminho.startsWith("http") ? caminho : BASE + caminho;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const falta = ultimaRequisicao + INTERVALO_MS - Date.now();
    if (falta > 0) await esperar(falta);
    ultimaRequisicao = Date.now();
    try {
      const resp = await fetch(url, {
        method: form ? "POST" : "GET",
        headers: {
          "User-Agent": USER_AGENT,
          ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: AbortSignal.timeout(60_000),
      });
      if (resp.status >= 500 || resp.status === 429) throw new Error(`HTTP ${resp.status}`);
      if (!resp.ok) throw Object.assign(new Error(`HTTP ${resp.status} em ${url}`), { fatal: true });
      return binario ? Buffer.from(await resp.arrayBuffer()) : await resp.text();
    } catch (err) {
      if (err.fatal || tentativa === 3) throw err;
      console.warn(`  aviso: ${err.message} em ${url}; nova tentativa em ${30 * tentativa}s`);
      await esperar(30_000 * tentativa);
    }
  }
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", atilde: "ã", ccedil: "ç" };
function texto(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENTIDADES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// Chave para casar nomes que vêm escritos de jeitos diferentes em páginas diferentes.
function normalizar(nome) {
  return texto(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

module.exports = { BASE, baixar, texto, normalizar };
