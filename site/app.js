(function () {
  "use strict";
  var MESES = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var NOMES = { P: "presente", F: "falta", AJ: "ausência justificada", LM: "licença médica", SR: "licença sem salário", AUS: "ausente, tipo ainda não informado", "": "sem registro" };
  var dados = null;

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function link(href, txt) {
    var a = el("a", null, txt);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }
  function semAcento(s) {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  function plural(n, um, varios) {
    return n + " " + (n === 1 ? um : varios);
  }

  function resumo(p) {
    if (!p) return { principal: "Ainda sem presença publicada neste mandato", detalhe: [{ txt: "A Câmara publica a presença do mês depois que ele termina. Quem assumiu há pouco ainda não aparece." }] };
    var detalhe = [];
    detalhe.push({ txt: plural(p.F, "falta", "faltas"), falta: p.F > 0 });
    detalhe.push({ txt: plural(p.AJ, "ausência justificada", "ausências justificadas") });
    var lic = p.LM + p.SR;
    if (lic) detalhe.push({ txt: plural(lic, "dia de licença", "dias de licença") });
    if (p.AUS) detalhe.push({ txt: plural(p.AUS, "ausência ainda sem tipo informado", "ausências ainda sem tipo informado") });
    if (p.semRegistro) detalhe.push({ txt: plural(p.semRegistro, "dia sem registro", "dias sem registro") });
    if (p.outros) detalhe.push({ txt: plural(p.outros, "dia com código que a Câmara não explica", "dias com código que a Câmara não explica") });
    return { principal: [p.P, p.reunioes], detalhe: detalhe };
  }

  // Link para avisar erro: e-mail já preenchido ou o link configurado (formulário etc.).
  function linkCorrecao(nomeVereador) {
    var c = dados.correcao;
    if (!c) return null;
    if (c.tipo === "link") {
      // {vereador} no link do formulário vira o nome do vereador (campo já preenchido).
      var url = c.url.split("{vereador}").join(encodeURIComponent(nomeVereador || ""));
      return link(url, "Avisar um erro");
    }
    var assunto = "Erro no Radar BH" + (nomeVereador ? ": " + nomeVereador : "");
    var corpo = [
      "Vereador(a): " + (nomeVereador || ""),
      "Mês e dia: ",
      "O que está errado: ",
      "Link da fonte oficial, se tiver: ",
      "",
      "(Mensagem enviada pelo site Radar BH)"
    ].join("\n");
    var a = el("a", null, "Avisar um erro por e-mail");
    a.href = "mailto:" + c.endereco + "?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(corpo);
    return a;
  }

  function montarCorrecao() {
    var acao = document.getElementById("correcao-acao");
    var a = linkCorrecao(null);
    if (a) {
      acao.textContent = "";
      a.className = "botao";
      acao.append(a);
      if (dados.correcao.tipo === "email") acao.append(" ", el("span", "suave", "ou escreva para " + dados.correcao.endereco));
    }
    var lista = dados.correcoes || [];
    if (lista.length) {
      document.getElementById("sem-correcoes").hidden = true;
      var ul = document.getElementById("lista-correcoes");
      ul.hidden = false;
      lista.slice().reverse().forEach(function (c) {
        var li = el("li");
        var data = c.data ? new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR") : "";
        li.append(el("b", null, data + (c.vereador ? " · " + c.vereador : "")), document.createTextNode(" " + (c.o_que || "")));
        ul.append(li);
      });
    }
  }

  function blocoComissoes(v) {
    var b = el("div", "bloco");
    if (!v.comissoes) return b;
    b.append(el("h4", "titulo-bloco", "Comissões"));
    if (!v.comissoes.length) {
      b.append(el("p", "suave", "Não aparece em nenhuma comissão na página oficial do vereador."));
      return b;
    }
    var ul = el("ul", "lista-simples");
    v.comissoes.forEach(function (c) {
      var li = el("li");
      li.append(el("b", null, (c.cargo || "Participa") + ": "), link(c.url, c.comissao.replace(/^Comissão de /, "")));
      ul.append(li);
    });
    b.append(ul);
    return b;
  }

  function dataBr(iso) { return iso.split("-").reverse().join("/"); }

  var CLASSE_VOTO = { "Sim": "v-sim", "Não": "v-nao", "Não votou": "v-nv", "Presidência": "v-pres" };

  function blocoVotosNominais(v) {
    var b = el("div", "bloco");
    var vn = dados.votacoesNominais;
    if (!vn) return b;
    b.append(el("h4", "titulo-bloco", "Como votou (votações nominais transcritas)"));
    if (!v.votosNominais.length) {
      b.append(el("p", "suave", "Nenhum voto deste vereador nas votações transcritas até agora."));
      return b;
    }
    var ul = el("ul", "lista-simples");
    v.votosNominais.forEach(function (par) {
      var vt = vn.lista[par[0]], voto = par[1];
      var li = el("li");
      li.append(el("span", "voto " + (CLASSE_VOTO[voto] || ""), voto), " ",
        link(vt.ficha, vt.materia + " (" + vt.turno + ")"),
        el("span", "suave", " · " + dataBr(vt.data) + " · " + vt.resultado));
      ul.append(li);
    });
    b.append(ul);
    return b;
  }

  function contarMarcas(s) {
    var c = { P: 0, F: 0, X: 0, total: 0 };
    for (var i = 0; i < s.length; i++) {
      var m = s.charAt(i);
      if (m === "-") continue;
      c.total++;
      if (c[m] !== undefined) c[m]++;
    }
    return c;
  }

  function itemVotacao(i, marca) {
    var vt = dados.votacoes.lista[i], pl = dados.votacoes.planilhas[vt[2]];
    var li = el("li");
    var rotulo = { P: "presente", F: "ausente", X: "presidindo" }[marca] || "sem registro";
    li.append(el("span", "marca m-" + (marca === "?" ? "q" : marca), rotulo), " ",
      el("span", "suave", dataBr(vt[0]) + " · "), document.createTextNode(vt[1] + " "), link(pl.url, "planilha"));
    return li;
  }

  function blocoVotacoes(v) {
    var b = el("div", "bloco");
    if (!dados.votacoes || !v.marcasVotacoes) return b;
    var c = contarMarcas(v.marcasVotacoes);
    if (!c.total) return b;
    b.append(el("h4", "titulo-bloco", "Votações no Plenário"));
    var p = el("p");
    var desde = dados.votacoes.planilhas.length ? dataBr(dados.votacoes.planilhas[0].data) : "";
    p.append("Registrou presença em ", el("b", null, String(c.P)), " de " + plural(c.total, "votação", "votações") + (desde ? " desde " + desde : ""));
    if (c.X) p.append(" e presidiu a sessão em " + plural(c.X, "outra", "outras"));
    p.append(".");
    b.append(p);
    b.append(el("p", "suave nota-mes", "Presença registrada não diz como votou. Ausência numa votação pode ter justificativa. A lista oficial de relatórios por reunião só alcança as reuniões a partir de " + desde + "; antes disso, só há a presença por dia."));
    var faltou = [];
    for (var i = v.marcasVotacoes.length - 1; i >= 0; i--) if (v.marcasVotacoes.charAt(i) === "F") faltou.push(i);
    if (faltou.length) {
      var t = el("p", null, "Ausente nestas votações:");
      var ul = el("ul", "lista-simples");
      faltou.slice(0, 8).forEach(function (i) { ul.append(itemVotacao(i, "F")); });
      b.append(t, ul);
    }
    var acoes = el("p", "acoes-bloco");
    var todas = el("button", "ver-mais", "Ver todas as " + c.total + " votações");
    todas.type = "button";
    todas.addEventListener("click", function () {
      var ul2 = el("ul", "lista-simples lista-longa");
      for (var i = v.marcasVotacoes.length - 1; i >= 0; i--) {
        var m = v.marcasVotacoes.charAt(i);
        if (m !== "-") ul2.append(itemVotacao(i, m));
      }
      acoes.before(ul2);
      todas.remove();
    });
    acoes.append(todas, link(dados.votacoes.fonte, "Fonte oficial (relatório por reunião)"));
    b.append(acoes);
    return b;
  }

  function montarNominais() {
    var vn = dados.votacoesNominais;
    if (!vn || !vn.lista.length) return;
    document.getElementById("nominais").hidden = false;
    document.getElementById("nominais-criterio").textContent = vn.criterio;
    var ul = document.getElementById("lista-nominais");
    vn.lista.slice().reverse().forEach(function (vt) {
      var li = el("li", "nominal");
      var t = el("p", "nominal-titulo");
      t.append(el("b", null, vt.materia + " · " + vt.turno), el("span", "suave", " · " + dataBr(vt.data) + " · " + vt.reuniao));
      var tot = el("p");
      tot.append(el("b", null, vt.resultado), " · ");
      ["Sim", "Não", "Não votou"].forEach(function (k, i) {
        if (i) tot.append(" · ");
        tot.append(el("span", "voto " + CLASSE_VOTO[k], k + ": " + (vt.contagem[k] || 0)));
      });
      var em = el("p", "suave", vt.ementa + (vt.autoria ? " Autoria: " + vt.autoria + "." : ""));
      var lk = el("p", "acoes-bloco");
      lk.append(link(vt.ficha, "Ficha oficial da votação (PDF)"), link(vt.proposicao, "Proposição na Câmara"));
      li.append(t, tot, em, lk);
      ul.append(li);
    });
  }

  function blocoHomenagens(v) {
    var b = el("div", "bloco");
    if (!dados.fontes.homenagens) return b;
    b.append(el("h4", "titulo-bloco", "Homenagens em reunião solene"));
    var fonte = dados.fontes.homenagens + "?field_home_vereador_value=" + encodeURIComponent(v.nome);
    if (!v.homenagens.length) {
      var p = el("p", "suave", "Nenhuma desde janeiro de 2025. ");
      p.append(link(fonte, "Conferir na Câmara"));
      b.append(p);
      return b;
    }
    var hoje = new Date().toISOString().slice(0, 10);
    var ul = el("ul", "lista-simples");
    v.homenagens.forEach(function (h, i) {
      var li = el("li");
      if (i >= 5) li.className = "a-mais";
      var data = h.data.split("-").reverse().join("/");
      li.append(el("span", "suave", data + (h.data > hoje ? " (agendada)" : "") + " · "), document.createTextNode(h.homenageado + " "), el("span", "suave", "— " + h.tipo));
      ul.append(li);
    });
    b.append(ul);
    var rodape = el("p", "acoes-bloco");
    if (v.homenagens.length > 5) {
      var mais = el("button", "ver-mais", "Ver todas as " + v.homenagens.length);
      mais.type = "button";
      mais.addEventListener("click", function () { ul.classList.add("aberta"); mais.remove(); });
      rodape.append(mais);
    }
    rodape.append(link(fonte, "Fonte oficial das homenagens"));
    b.append(rodape);
    return b;
  }

  function cartao(v, fora) {
    var node = document.getElementById("tpl-vereador").content.firstElementChild.cloneNode(true);
    var foto = node.querySelector(".foto");
    if (v.foto) { foto.src = v.foto; foto.alt = "Foto de " + v.nome; }
    else foto.replaceWith(el("span", "foto")); // mantém a coluna da foto para o layout não quebrar
    node.querySelector(".nome").textContent = v.nome;
    node.querySelector(".partido").textContent = fora ? "Não está na lista atual de vereadores" : v.partido;

    var r = resumo(v.presenca);
    var principal = node.querySelector(".principal");
    if (Array.isArray(r.principal)) {
      principal.append("Presente em ", el("b", null, String(r.principal[0])), " de " + plural(r.principal[1], "reunião", "reuniões"));
    } else principal.textContent = r.principal;
    var det = node.querySelector(".detalhe");
    r.detalhe.forEach(function (d, i) {
      if (i) det.append(" · ");
      det.append(el("span", d.falta ? "tem-falta" : null, d.txt));
    });

    var extras = [];
    if (v.marcasVotacoes) {
      var cv = contarMarcas(v.marcasVotacoes);
      if (cv.total) extras.push("presente em " + cv.P + " de " + cv.total + " votações");
    }
    if (v.comissoes) extras.push(plural(v.comissoes.length, "comissão", "comissões"));
    if (dados.fontes.homenagens && !fora) extras.push(plural(v.homenagens.length, "homenagem", "homenagens"));
    if (extras.length) node.querySelector(".numeros").append(el("span", "extras", extras.join(" · ")));

    if (!fora) node.querySelector(".corpo").prepend(blocoVotosNominais(v), blocoVotacoes(v), blocoComissoes(v), blocoHomenagens(v));
    var meses = node.querySelector(".meses");
    meses.before(el("h4", "titulo-bloco", "Presença no Plenário"));
    (v.presenca ? v.presenca.meses : []).slice().reverse().forEach(function (m) {
      var bloco = el("div", "mes");
      var h3 = el("h3", null, MESES[m.mes] + " de " + m.ano);
      if (m.provisorio) h3.append(" ", el("span", "selo", "provisório"));
      bloco.append(h3);
      if (m.provisorio) bloco.append(el("p", "nota-mes", "Mês ainda aberto: vem do relatório de cada reunião. Toque num dia para abrir a planilha oficial. Ausências ainda podem ser justificadas."));
      var dias = el("div", "dias");
      m.dias.forEach(function (d) {
        var cod = d[1];
        var cls = cod === "" ? "c-vazio" : NOMES[cod] ? "c-" + cod : "c-outro";
        var q = d[2] ? link(d[2], null) : el("span");
        q.className = "dia " + cls;
        q.title = "Dia " + d[0] + ": " + (NOMES[cod] || "código \"" + cod + "\", sem explicação na legenda oficial") + (d[3] ? " (" + d[3] + ")" : "");
        q.setAttribute("aria-label", q.title);
        q.append(el("small", null, String(d[0])), document.createTextNode(cod || "–"));
        dias.append(q);
      });
      bloco.append(dias);
      meses.append(bloco);
    });

    var links = node.querySelector(".links");
    links.append(link(dados.fontes.presenca, "Fonte oficial da presença (escolha ano e mês)"));
    if (v.perfil) links.append(link(v.perfil, "Perfil oficial na Câmara"));
    if (v.email) links.append(link("mailto:" + v.email, v.email));
    if (v.telefone) links.append(el("span", null, "Gabinete: " + v.telefone));
    var aviso = linkCorrecao(v.nome);
    if (aviso) { aviso.textContent = "Viu algo errado aqui? Avise"; aviso.className = "avisar"; links.append(aviso); }

    node.dataset.busca = semAcento(v.nome + " " + (v.partido || "") + " " + (v.nomeCivil || ""));
    return node;
  }

  function filtrar() {
    var q = semAcento(document.getElementById("busca").value.trim());
    var visiveis = 0;
    document.querySelectorAll("#lista .cartao").forEach(function (c) {
      var ok = !q || c.dataset.busca.indexOf(q) !== -1;
      c.hidden = !ok;
      if (ok) visiveis++;
    });
    document.getElementById("contagem").textContent = plural(visiveis, "vereador", "vereadores") + (q ? " encontrados" : " em exercício");
  }

  function iniciar(d) {
    dados = d;
    var de = d.periodo.de, ate = d.periodo.ate, ult = d.periodo.ultimaReuniao;
    var quando = new Date(d.atualizadoEm).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });
    var doisDig = function (n) { return (n < 10 ? "0" : "") + n; };
    var ateTxt = ult
      ? doisDig(ult.dia) + "/" + doisDig(ult.mes) + "/" + ult.ano + " (" + MESES[ult.mes] + " ainda provisório)"
      : MESES[ate.mes] + "/" + ate.ano;
    document.getElementById("atualizado").textContent =
      "Mandato 2025–2028 · reuniões de " + MESES[de.mes] + "/" + de.ano + " a " + ateTxt + " · dados copiados em " + quando;
    document.getElementById("fonte-presenca").href = d.fontes.presenca;
    montarCorrecao();
    montarNominais();

    var lista = document.getElementById("lista");
    d.vereadores.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); })
      .forEach(function (v) { lista.append(cartao(v, false)); });
    if (d.foraDaListaAtual.length) {
      document.getElementById("fora").hidden = false;
      var lf = document.getElementById("lista-fora");
      d.foraDaListaAtual.forEach(function (v) { lf.append(cartao(v, true)); });
    }
    document.getElementById("busca").addEventListener("input", filtrar);
    filtrar();
  }

  fetch("dados.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(iniciar)
    .catch(function () {
      document.getElementById("atualizado").textContent = "Não foi possível carregar os dados agora. Tente recarregar a página.";
    });
})();
