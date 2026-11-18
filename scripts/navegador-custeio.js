// Trecho para rodar NO NAVEGADOR, na página
// https://www.cmbh.mg.gov.br/transparencia/vereadores/custeio-parlamentar
// Para cada mês pedido, escolhe o mês no formulário, clica em Pesquisar (como uma pessoa faria),
// lê a tabela de totais por vereador e espera 10 s antes do próximo mês.
// Devolve o JSON para scripts/juntar-custeio.js. Use poucos meses por vez (ex.: os 2 mais recentes).
//
// Uso no console da página:  await coletarCusteio(["11/2026", "10/2026"])
async function coletarCusteio(meses) {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const s = {};
  for (const m of meses) {
    const res = document.getElementById("resultadoPesquisa_custeio");
    res.innerHTML = "";
    document.getElementById("data").value = m;
    document.getElementById("pesquisar-custeio").click();
    for (let i = 0; i < 30 && !res.querySelector("table"); i++) await w(500);
    const linhas = [...res.querySelectorAll("tbody tr")].map((tr) => {
      const td = tr.querySelectorAll("td");
      const a = tr.querySelector("a.detalhar");
      return [td[0].innerText.trim(), a ? a.dataset.codvereador : "", td[td.length - 1].innerText.trim()];
    });
    s[m] = { coletadoEm: new Date().toISOString(), linhas, vazio: res.querySelector("table") ? null : res.innerText.trim().slice(0, 200) };
    await w(10000);
  }
  return JSON.stringify(s);
}
