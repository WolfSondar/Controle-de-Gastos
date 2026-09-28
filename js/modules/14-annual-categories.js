// =====================================================================
// MÓDULO: 14-annual-categories
// Categorias no histórico anual
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

// ---------------------------------------------------------------------
// HISTÓRICO — página 2 do carrossel: "Gastos por categoria" do ano
// selecionado, somando o texto "Categoria:Valor,Categoria:Valor" que o GS
// grava em cada mês fechado (ver categoriasDavi/categoriasGabriel, vindos
// já parseados do backend). Mesmo visual do card de categoria do Resumo,
// só que olhando pro ano inteiro em vez do mês corrente — por isso é uma
// pizza (o que importa aqui é a fatia de cada categoria no total do ano,
// não a variação mês a mês, que já tem sua própria linha do tempo na
// primeira página do carrossel).
// ---------------------------------------------------------------------

function agregarCategoriasDoAno(meses, pessoa) {
  const total = {};
  meses.forEach((m) => {
    const mapas =
      pessoa === "ambos"
        ? [m.categoriasDavi || {}, m.categoriasGabriel || {}]
        : [pessoa === "gabriel" ? m.categoriasGabriel || {} : m.categoriasDavi || {}];
    mapas.forEach((mapa) => {
      Object.keys(mapa).forEach((cat) => {
        if (String(cat).trim().toLowerCase() === "metas") return;
        total[cat] = (total[cat] || 0) + (Number(mapa[cat]) || 0);
      });
    });
  });
  return total;
}

function construirPaginaCategoriasHistorico(meses, pessoa, ano) {
  // "todos" é o valor especial do select de ano (ver renderHistorico) —
  // aqui só ajusta o texto pra fazer sentido gramatical no plural.
  const modoTodos = ano === "todos";
  const porCategoria = agregarCategoriasDoAno(meses, pessoa);
  const categorias = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
  const total = categorias.reduce((acc, c) => acc + porCategoria[c], 0);

  if (categorias.length === 0 || total <= 0) {
    return `
      <div class="split-card historico-categoria-page">
        <div class="ledger-line"><h2 class="section-title">Gastos por categoria</h2></div>
        <p class="empty-state">Sem gastos com categoria fechados ${modoTodos ? "ainda" : `em ${ano} ainda`}.</p>
      </div>`;
  }

  let acumulado = 0;
  const partes = categorias.map((cat, idx) => {
    const cor = corDaCategoria(cat, idx);
    const pct = (porCategoria[cat] / total) * 100;
    const inicio = acumulado;
    acumulado += pct;
    return { cat, cor, pct, valor: porCategoria[cat], inicio, fim: acumulado };
  });

  const gradiente = partes.map((p) => `${p.cor} ${p.inicio}% ${p.fim}%`).join(", ");
  const legendaHtml = partes
    .map(
      (p) => `
        <div class="split-legend-item">
          <span class="dot" style="background:${p.cor}"></span>
          <span class="legend-label">${escapeHtml(p.cat)}</span>
          <strong>${formatarPctCategoria(p.pct)}</strong>
        </div>`
    )
    .join("");

  return `
    <div class="split-card historico-categoria-page">
      <div class="ledger-line"><h2 class="section-title">Gastos por categoria</h2></div>
      <p class="section-hint">${modoTodos ? "Soma de todos os anos" : `Soma do ano de ${ano}`}, pra onde o dinheiro foi.</p>
      <div class="split-chart-wrap split-chart-wrap-categorias">
        <div class="split-donut" style="background: conic-gradient(${gradiente})">
          <div class="split-donut-center">${spanCentro(fmt(total))}<small>${modoTodos ? "gasto no total" : "gasto no ano"}</small></div>
        </div>
        <div class="split-legend split-legend-categorias">${legendaHtml}</div>
      </div>
    </div>`;
}

function renderVisaoGeral() {
  atualizarVisibilidadeVisaoGeral();
  if (isAmbos()) return; 

  const donut = document.getElementById("visaoGeralDonut");
  const centro = document.getElementById("visaoGeralDonutCenter");
  const legend = document.getElementById("visaoGeralLegend");
  if (!donut && !centro && !legend) return;

  const totalGanhos = somaComStatus(state.ganhos, "recebido");
  const variaveisSemGuardado = state.gastosVariaveis.filter((i) => !ehLancamentoDeCaixinha(i.nome));
  const totalGastos = somaFixosPagos(state.gastosFixos) + somaVariaveisPagas(variaveisSemGuardado);
  const totalGuardado = somaCampo(state.caixinhas, "valorGuardadoMes");
  const livre = totalGanhos - totalGastos - totalGuardado;
  const base = Math.max(totalGanhos, totalGastos + totalGuardado, 0.01);

  const pctGuardado = Math.max((totalGuardado / base) * 100, 0);
  const pctGastos = Math.max((totalGastos / base) * 100, 0);
  const pctLivre = Math.max(100 - pctGuardado - pctGastos, 0);

  const corte1 = pctGuardado;
  const corte2 = pctGuardado + pctGastos;

  const temaAtualResumo = document.documentElement.dataset.caixaTheme || "default";
  const modoEscuroResumo = document.documentElement.dataset.theme === "dark";
  const temaEspecial = ["christmas", "halloween"].includes(temaAtualResumo);

  // A "Visão geral" tem uma paleta própria por tema. O gráfico de
  // "Gastos por categoria" continua usando exclusivamente as cores das
  // categorias/configuração e não é alterado por estas regras.
  let corGuardado = "var(--gold)";
  let corGastos = "var(--expense)";
  let corLivre = "var(--income)";

  if (temaAtualResumo === "christmas") {
    if (modoEscuroResumo) {
      // Noite de Natal: gelo, azul de inverno e prata.
      corGuardado = "#8fe8f6";
      corGastos = "#6d9edb";
      corLivre = "#d8e8f0";
    } else {
      // Natal claro: paleta cristalina, sem o verde do tema padrão.
      corGuardado = "#58bcd3";
      corGastos = "#7298c7";
      corLivre = "#b7cbd8";
    }
  } else if (temaAtualResumo === "halloween") {
    corGuardado = "var(--theme-summary-saved)";
    corGastos = "var(--theme-summary-expense)";
    corLivre = "var(--theme-summary-free)";
  }
  if (donut) {
    // O Natal chegou a receber um background sólido por regras de tema,
    // então o gráfico passa a ser desenhado com SVG. Assim os 3 segmentos
    // ficam independentes do background/shorthand do CSS e nunca somem.
    const temaAtual = document.documentElement.dataset.caixaTheme || "default";
    const modoEscuro = document.documentElement.dataset.theme === "dark";
    const rootStyle = getComputedStyle(document.documentElement);
    const resolverCor = (valor, fallback) => {
      const bruto = rootStyle.getPropertyValue(valor).trim();
      return bruto || fallback;
    };
    // Halloween possui variáveis próprias no tema. O Natal, porém, não
    // precisa depender dessas variáveis: se elas não existirem, usamos as
    // cores normais do sistema para que os segmentos nunca desapareçam.
    const chaveCor1 = temaAtual === "halloween" ? "--theme-summary-saved" : "--gold";
    const chaveCor2 = temaAtual === "halloween" ? "--theme-summary-expense" : "--expense";
    const chaveCor3 = temaAtual === "halloween" ? "--theme-summary-free" : "--income";
    const cor1 = temaAtual === "christmas" ? corGuardado : resolverCor(chaveCor1, corGuardado);
    const cor2 = temaAtual === "christmas" ? corGastos : resolverCor(chaveCor2, corGastos);
    const cor3 = temaAtual === "christmas" ? corLivre : resolverCor(chaveCor3, corLivre);
    let svg = donut.querySelector(":scope > .caixa-visao-geral-svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("caixa-visao-geral-svg");
      svg.setAttribute("viewBox", "0 0 128 128");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = `<g transform="rotate(-90 64 64)"><circle class="seg seg-1" cx="64" cy="64" r="50"></circle><circle class="seg seg-2" cx="64" cy="64" r="50"></circle><circle class="seg seg-3" cx="64" cy="64" r="50"></circle></g>`;
      donut.insertBefore(svg, donut.firstChild);
    }
    const circ = 2 * Math.PI * 50;
    const gapPx = temaAtual === "halloween" ? 0 : 2.1;
    const valores = [pctGuardado, pctGastos, pctLivre];
    const cores = [cor1, cor2, cor3];
    let acumulado = 0;
    svg.querySelectorAll(".seg").forEach((seg, idx) => {
      const pct = Math.max(0, valores[idx]);
      const comprimento = circ * pct / 100;
      const desenho = Math.max(0, comprimento - (pct > 0 ? gapPx : 0));
      seg.setAttribute("stroke", cores[idx]);
      seg.setAttribute("stroke-width", "30");
      seg.setAttribute("fill", "none");
      seg.setAttribute("stroke-linecap", "butt");
      seg.setAttribute("stroke-dasharray", `${desenho} ${circ}`);
      seg.setAttribute("stroke-dashoffset", `${-circ * acumulado / 100}`);
      acumulado += pct;
    });
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:3;overflow:visible;display:block";
    donut.style.setProperty("position", "relative", "important");
    donut.style.setProperty("background", "transparent", "important");
    donut.style.setProperty("background-image", "none", "important");
    donut.style.setProperty("box-shadow", temaAtual === "halloween"
      ? "0 0 0 1px rgba(85,223,255,.24), 0 8px 24px rgba(61,31,78,.14)"
      : "0 8px 24px rgba(35,52,78,.12)", "important");
    if (centro) {
      centro.style.position = "absolute";
      centro.style.zIndex = "4";
    }
  }
  if (centro) {
    // Texto alterado para exibir apenas o valor e a palavra "GANHO"
    centro.innerHTML = `${spanCentro(fmt(totalGanhos))}<small>GANHO</small>`;
  }
  if (legend) {
    legend.innerHTML = `
      <div class="split-legend-item">
        <span class="dot" style="background:${corGuardado}"></span>
        Guardado <strong>${pctGuardado.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:${corGastos}"></span>
        Gastos <strong>${pctGastos.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:${corLivre}"></span>
        Livre <strong>${pctLivre.toFixed(0)}%</strong>
      </div>
    `;
  }
}

function renderSplit() {
  const card = document.getElementById("splitCard");
  if (!card) return;
  const ambos = isAmbos();
  card.classList.toggle("is-hidden", !ambos);
  if (!ambos) return;

  const totalGanhos = somaComStatus(state.ganhos, "recebido");
  const gastoPorPessoa = { davi: 0, gabriel: 0 };
  [...state.gastosFixos.filter(fixoEhPago), ...state.gastosVariaveis.filter((item) => gastoVariavelEhReal(item) && variavelContaNoSaldo(item))].forEach((item) => {
    if (item.pessoa === "davi" || item.pessoa === "gabriel") {
      gastoPorPessoa[item.pessoa] += Number(item.valor) || 0;
    }
  });
  const gastoDavi = gastoPorPessoa.davi;
  const gastoGabriel = gastoPorPessoa.gabriel;
  const restante = totalGanhos - gastoDavi - gastoGabriel;
  const base = Math.max(totalGanhos, gastoDavi + gastoGabriel, 0.01);

  const pctDavi = Math.max((gastoDavi / base) * 100, 0);
  const pctGabriel = Math.max((gastoGabriel / base) * 100, 0);
  const pctRestante = Math.max(100 - pctDavi - pctGabriel, 0);

  const corte1 = pctDavi;
  const corte2 = pctDavi + pctGabriel;

  const donut = document.getElementById("splitDonut");
  const temaEspecial = ["christmas", "halloween"].includes(document.documentElement.dataset.caixaTheme);
  const corPessoaA = temaEspecial ? "var(--theme-summary-free)" : "var(--income)";
  const corPessoaB = temaEspecial ? "var(--theme-summary-expense)" : "var(--expense)";
  const corRestante = temaEspecial ? "var(--theme-summary-rest)" : "var(--line-soft)";
  if (donut) {
    donut.style.background = `conic-gradient(${corPessoaA} 0% ${corte1}%, ${corPessoaB} ${corte1}% ${corte2}%, ${corRestante} ${corte2}% 100%)`;
  }
  const centro = document.getElementById("splitDonutCenter");
  if (centro) {
    centro.innerHTML = `${spanCentro(fmt(restante))}<small>${restante < 0 ? "no vermelho" : "sobrando"}</small>`;
  }

  const legend = document.getElementById("splitLegend");
  if (legend) {
    legend.innerHTML = `
      <div class="split-legend-item">
        <span class="dot" style="background:${corPessoaA}"></span> Davi gastou <strong>${pctDavi.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:${corPessoaB}"></span> Gabriel gastou <strong>${pctGabriel.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:${corRestante}"></span> Ainda sobrando <strong>${pctRestante.toFixed(0)}%</strong>
      </div>
    `;
  }
}

const AVATAR_LETRA = { davi: "D", gabriel: "G" };

function agruparPorPessoa(lista) {
  const grupos = { davi: [], gabriel: [] };
  lista.forEach((item) => {
    if (item.pessoa === "davi" || item.pessoa === "gabriel") grupos[item.pessoa].push(item);
  });
  return grupos;
}

function cardJuntos(pessoa, atual, projetado, corClasse) {
  const mostraProjetado = projetado !== null && projetado !== undefined;
  return `
    <div class="juntos-card">
      <span class="juntos-avatar avatar-${pessoa}">${AVATAR_LETRA[pessoa]}</span>
      <div class="juntos-card-info">
        <span class="juntos-card-nome">${PESSOA_LABEL[pessoa]}</span>
        ${mostraProjetado ? `<span class="juntos-card-projetado">Projetado: ${fmt(projetado)}</span>` : ""}
      </div>
      <span class="juntos-card-valor ${corClasse}">${fmt(atual)}</span>
    </div>`;
}

function atualizarVisibilidadeJuntosView() {
  const ambos = isAmbos();
  const view = document.getElementById("juntosView");
  if (view) view.classList.toggle("is-hidden", !ambos);
  const resumoPadrao = document.getElementById("resumoPadrao");
  if (resumoPadrao) resumoPadrao.classList.toggle("is-hidden", ambos);
}

function renderJuntosView() {
  atualizarVisibilidadeJuntosView();
  if (!isAmbos()) return;

  const ganhosPorPessoa = agruparPorPessoa(state.ganhos);
  const fixosPorPessoa = agruparPorPessoa(state.gastosFixos);
  const variaveisPorPessoa = agruparPorPessoa(state.gastosVariaveis);
  const caixinhasPorPessoa = agruparPorPessoa(state.caixinhas);

  const ganhosEl = document.getElementById("juntosGanhos");
  if (ganhosEl) ganhosEl.innerHTML = ["davi", "gabriel"].map((p) => cardJuntos(p, somaComStatus(ganhosPorPessoa[p], "recebido"), soma(ganhosPorPessoa[p]), "income")).join("");

  const guardadoEl = document.getElementById("juntosGuardado");
  if (guardadoEl) guardadoEl.innerHTML = ["davi", "gabriel"].map((p) => cardJuntos(p, somaTotalCaixinhas(caixinhasPorPessoa[p]), null, "gold")).join("");

  const fixosEl = document.getElementById("juntosFixos");
  if (fixosEl) fixosEl.innerHTML = ["davi", "gabriel"].map((p) => cardJuntos(p, somaFixosPagos(fixosPorPessoa[p]), soma(fixosPorPessoa[p]), "expense")).join("");

  const variaveisEl = document.getElementById("juntosVariaveis");
  if (variaveisEl) variaveisEl.innerHTML = ["davi", "gabriel"].map((p) => cardJuntos(p, somaVariaveisPagas(variaveisPorPessoa[p]), soma(variaveisPorPessoa[p].filter(gastoVariavelEhReal)), "expense")).join("");
}

function spanCentro(valorFormatado) {
  let tamanho = 13.5;
  if (valorFormatado.length > 9) tamanho = 12;
  if (valorFormatado.length > 11) tamanho = 10.5;
  if (valorFormatado.length > 13) tamanho = 9.5;
  return `<span style="font-size:${tamanho}px">${valorFormatado}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

