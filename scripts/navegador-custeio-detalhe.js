// Trecho para rodar NO NAVEGADOR, na página
// https://www.cmbh.mg.gov.br/transparencia/vereadores/custeio-parlamentar
// Para cada mês pedido: pesquisa o mês, clica em "Detalhamento das despesas" de cada vereador (como uma
// pessoa faria), lê os itens (tipo, valor, nota), volta e espera 10 s antes do próximo clique.
// O progresso fica salvo no próprio navegador (localStorage "cust_det"); se a página cair, rode de novo
// e ele continua de onde parou. No fim, copie JSON.stringify(JSON.parse(localStorage.cust_det)) para um
// arquivo e rode: node scripts/juntar-custeio-detalhe.js arquivo.json
//
// Uso no console da página:  await detalharCusteio(["11/2026", "10/2026"])
async function detalharCusteio(meses) {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = document.getElementById("resultadoPesquisa_custeio");
  const S = () => JSON.parse(localStorage.getItem("cust_det") || "{}");
  const salvar = (s) => localStorage.setItem("cust_det", JSON.stringify(s));
  for (const m of meses) {
    let s = S();
    if (s[m] && s[m].completo) continue;
    res.innerHTML = "";
    document.getElementById("data").value = m;
    document.getElementById("pesquisar-custeio").click();
    for (let i = 0; i < 40 && !res.querySelector("a.detalhar"); i++) await w(500);
    const lista = [...res.querySelectorAll("a.detalhar")].map((a) => [a.dataset.codvereador, a.closest("tr").querySelector("td").innerText.trim()]);
    s[m] = s[m] || { vereadores: {} };
    s[m].lista = lista;
    salvar(s);
    await w(10000);
    for (const [cod, nome] of lista) {
      s = S();
      if (s[m].vereadores[cod]) continue;
      const a = [...res.querySelectorAll("a.detalhar")].find((x) => x.dataset.codvereador === cod);
      if (!a) {
        s[m].vereadores[cod] = { nome, erro: "link não encontrado" };
        salvar(s);
        continue;
      }
      a.click();
      for (let i = 0; i < 40 && !/Arquivo/.test(res.innerText); i++) await w(500);
      if (!/Arquivo/.test(res.innerText)) {
        // o detalhamento não abriu: registra e segue (rode de novo depois para tentar só os que faltam)
        s[m].vereadores[cod] = { nome, erro: "detalhamento não abriu" };
        salvar(s);
        await w(10000);
        continue;
      }
      const itens = [...res.querySelectorAll("tbody tr")]
        .filter((tr) => !/^Total/.test(tr.innerText.trim()))
        .map((tr) => {
          const td = tr.querySelectorAll("td");
          const l = tr.querySelector("a");
          return [td[1].innerText.trim(), td[2].innerText.trim(), l ? l.innerText.trim() : "", l ? l.href : ""];
        });
      s[m].vereadores[cod] = { nome, itens };
      salvar(s);
      document.getElementById("voltarPesquisa_custeio")?.click();
      for (let i = 0; i < 20 && !res.querySelector("a.detalhar"); i++) await w(300);
      await w(10000);
    }
    s = S();
    s[m].completo = true;
    salvar(s);
  }
  return "ok";
}
