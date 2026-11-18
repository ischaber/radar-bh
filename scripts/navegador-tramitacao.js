// Trecho para rodar NO NAVEGADOR (não no Node), já na página de uma proposição da Câmara, por exemplo
// https://www.cmbh.mg.gov.br/atividade-legislativa/pesquisar-proposicoes/projeto-de-lei/958/2026
// depois que ela carregar (a página carrega a tramitação sozinha; espere uns 8 segundos).
//
// Devolve um JSON { "958/2026": { autoria, ementa, decisoes: [[idDocumento, decisão, data], ...] } }.
// Junte os resultados num arquivo e rode: node scripts/juntar-fichas.js arquivo.json
//
// A pesquisa da Câmara recusa acesso por programa ("fonte não autorizada"). Por isso este trecho só
// lê a página que o navegador já abriu, uma de cada vez, no ritmo de uma pessoa (10 s ou mais entre páginas).
(() => {
  const t = document.body.innerText;
  const ementa = (t.match(/Ementa:\s*([^\n]+)/) || [])[1] || "";
  const autoria = (t.match(/Autoria:\s*([^\n]+)/) || [])[1] || "";
  const decisoes = [...document.querySelectorAll("a")]
    .filter((a) => /documentoVinculado/.test(a.href))
    .map((a) => [a.href.split("=")[1], ((a.closest("li,div") || {}).innerText || "").trim().replace(/\s+/g, " ")])
    .filter((x) => x[1].startsWith("Decisão e ocorrências"))
    .map((x) => {
      const m = x[1].replace("Decisão e ocorrências: ", "").match(/^(.*?)\s*Publicado em:\s*(\S+)/) || [0, x[1], ""];
      return [x[0], m[1], m[2]];
    });
  const chave = location.pathname.split("/").slice(-2).join("/");
  if (!autoria) return JSON.stringify({ erro: `a página de ${chave} não carregou a proposição` });
  return JSON.stringify({ [chave]: { autoria, ementa, decisoes } });
})();
