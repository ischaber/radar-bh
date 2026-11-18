// Trecho para rodar NO NAVEGADOR, na Consulta à Remuneração da Câmara
// (https://www.cmbh.mg.gov.br/transparencia/pessoal/consulta-a-remuneracao), DEPOIS que uma pessoa
// responder a verificação de entrada. Escolha o mês e o ano, cargo "Todos", e pesquise.
// Cada chamada lê a página da lista (só os parâmetros dos links "detalhes": matrícula, cargo, carga horária,
// lotação, admissão, exoneração), guarda em localStorage "equipes" e clica em "Próximo".
// Rode uma vez por página, com 10 s entre elas, até aparecer "FIM". Não recarregue a página: a verificação volta.
//
// Depois, gere a saída sem nomes:
//   const s = JSON.parse(localStorage.equipes), m = new Map();
//   for (const k in s) for (const p in s[k]) for (const r of s[k][p]) m.set(r[0] + "|" + r[4], r);
//   const rows = [...m.values()];
//   JSON.stringify({ mes: "AAAA-MM", totalServidores: rows.length, coletadoEm: new Date().toISOString(),
//     gabinetes: rows.filter((r) => /^VEREADOR/i.test(r[4] || "")).map((r) => [r[0], r[2], r[3], r[4], r[5], r[6]]) })
// salve num arquivo e rode: node scripts/juntar-equipes.js arquivo.json
// Confira que totalServidores é igual ao total de registros que a página mostra.
(() => {
  const rows = [...document.querySelectorAll('table a[href*="detalhes.php"]')].map((a) => {
    const p = new URLSearchParams(a.getAttribute("href").split("?")[1]);
    return [p.get("cm"), p.get("nomPessoa"), p.get("cargo"), p.get("cargaHoraria"), p.get("lotacao"), p.get("admissao"), p.get("exoneracao"), p.get("mes"), p.get("ano"), p.get("categoria")];
  });
  const pag = (document.querySelector("#pagina") || {}).value || "?";
  const cargo = document.querySelector("select[name=cargo]").value || "TODOS";
  const k = cargo + "|" + document.querySelector("select[name=ano]").value + "-" + document.querySelector("select[name=mes]").value;
  const s = JSON.parse(localStorage.getItem("equipes") || "{}");
  s[k] = s[k] || {};
  s[k][pag] = rows;
  localStorage.setItem("equipes", JSON.stringify(s));
  const next = document.querySelector("a.page-link.next");
  if (next) setTimeout(() => next.click(), 300);
  return k + " p" + pag + " " + rows.length + (next ? " -> próximo" : " FIM");
})();
