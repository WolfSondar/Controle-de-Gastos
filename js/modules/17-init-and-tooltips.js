// =====================================================================
// MÓDULO: 17-init-and-tooltips
// Inicialização, listeners e tooltips
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

// ---------------------------------------------------------------------
// INIT E LISTENERS
// ---------------------------------------------------------------------

renderPessoaSwitch();
// Bootstrap visual: usa imediatamente o último tema conhecido enquanto o Firebase é consultado.
// O tema sazonal válido será recalculado assim que as regras em cache/Firebase chegarem.
(function inicializarTemaVisualCache(){
  const tema = caixaTemaAtivoGlobal();
  if (["default", "christmas", "halloween"].includes(tema)) {
    document.documentElement.dataset.caixaTheme = tema;
    caixaGarantirCssTemaGlobal(tema);
    if (tema === "christmas" && typeof garantirEstiloNatalRefinado === "function") garantirEstiloNatalRefinado();
  }
})();

renderMesAtual();
popularSelectsDeCategoria();
preencherDatasComHoje();
atualizarVisibilidadeEdicao();
atualizarVisibilidadeSplitCard();
atualizarVisibilidadeVisaoGeral();
atualizarVisibilidadeJuntosView();
initGavetas();
aplicarMascaraMoedaEmTodos();
posicionarIndicadorAba();
// Leituras da Firebase acontecem na abertura da página. Depois disso, a
// navegação e a troca de perfil usam os dados em memória/cache; alterações
// feitas pelo usuário continuam sendo enviadas normalmente via POST.
carregarDados();
carregarHistorico();
setTimeout(mostrarDicaAcoesConjuntoSeNecessario, 1200);

// Listener do novo Seletor de Ano no Histórico
const selectAno = document.getElementById("historicoAnoSelect");
if (selectAno) {
  selectAno.addEventListener("change", (e) => {
    state.historicoAnoSelecionado = e.target.value === "todos" ? "todos" : parseInt(e.target.value);
    renderHistorico();
  });
}

atualizarIndicadorOffline().then((n) => {
  if (n > 0) flushFilaOffline();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// =====================================================================
// LÓGICA DO TOOLTIP CONSOLIDADO (BORDAS INTELIGENTES E EFEITO DESLIZAR)
// =====================================================================
let chartTooltip = null;

function initChartTooltip() {
  if (!chartTooltip) {
    chartTooltip = document.createElement("div");
    chartTooltip.className = "grafico-tooltip";
    document.body.appendChild(chartTooltip);
  }

  const esconderTooltip = () => {
    chartTooltip.classList.remove("is-visible");
    document.querySelectorAll(".mes-hover-group.is-active").forEach(el => el.classList.remove("is-active"));
  };

  const mostrarTooltip = (grupo) => {
    const mes = grupo.dataset.mes;
    const ganhos = grupo.dataset.ganhos;
    const gastos = grupo.dataset.gastos;
    const guardado = grupo.dataset.guardado;
    const rendimento = grupo.dataset.rendimento;

    chartTooltip.innerHTML = `
      <div class="tooltip-titulo">${mes}</div>
      <div class="tooltip-linha"><span style="color: #8fd4ab">Ganhos</span> <span class="valor">${ganhos}</span></div>
      <div class="tooltip-linha"><span style="color: #e8a58c">Gastos</span> <span class="valor">${gastos}</span></div>
      <div class="tooltip-linha"><span style="color: #e3c581">Guardado</span> <span class="valor">${guardado}</span></div>
      <div class="tooltip-linha"><span style="color: #8ec2dd">Rendimento</span> <span class="valor">${rendimento}</span></div>
    `;

    // Deixa visível primeiro para o navegador calcular a largura da caixinha
    chartTooltip.classList.add("is-visible");

    const rect = grupo.querySelector('.hover-area').getBoundingClientRect();
    const svgRect = grupo.closest('svg').getBoundingClientRect();
    
    // Mede a largura real do tooltip na tela
    const tooltipWidth = chartTooltip.offsetWidth;
    
    // Calcula o centro perfeito onde o tooltip DEVERIA ficar
    let centerLeft = rect.left + (rect.width / 2);
    
    // LÓGICA ANTI-BORDA: Define limites mínimos e máximos com 14px de margem de respiro
    const margin = 14;
    const minCenter = (tooltipWidth / 2) + margin;
    const maxCenter = window.innerWidth - (tooltipWidth / 2) - margin;
    
    // Prende o valor de centro dentro dos limites da tela
    centerLeft = Math.max(minCenter, Math.min(centerLeft, maxCenter));
    
    // Aplica a posição protegida
    chartTooltip.style.left = (centerLeft + window.scrollX) + "px";
    chartTooltip.style.top = (svgRect.top + window.scrollY - 10) + "px";
    
    document.querySelectorAll(".mes-hover-group.is-active").forEach(el => el.classList.remove("is-active"));
    grupo.classList.add("is-active");
  };

  // 1. Mouse (Computador)
  document.body.addEventListener("mouseover", (e) => {
    const grupo = e.target.closest(".mes-hover-group");
    if (grupo) mostrarTooltip(grupo);
  });

  document.body.addEventListener("mouseout", (e) => {
    if (e.target.closest(".mes-hover-group")) esconderTooltip();
  });

  // 2. Toque no Celular (Fica fixo até tocar em outro lugar)
  document.body.addEventListener("touchstart", (e) => {
    const grupo = e.target.closest(".mes-hover-group");
    if (grupo) {
      mostrarTooltip(grupo);
    } else if (!e.target.closest(".grafico-tooltip")) {
      // Se tocar no fundo do site (fora do gráfico), esconde
      esconderTooltip(); 
    }
  }, { passive: true });

  // 3. Deslizar o Dedo no Celular (Scrubbing Mágico)
  document.body.addEventListener("touchmove", (e) => {
    const wrap = e.target.closest(".historico-grafico-wrap");
    if (wrap) {
      const touch = e.touches[0];
      // Escaneia a tela em tempo real pra ver qual mês está embaixo do dedo agora
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const grupo = el ? el.closest(".mes-hover-group") : null;
      if (grupo) {
        mostrarTooltip(grupo);
      }
    }
  }, { passive: true });
}

// ---------------------------------------------------------------------
// BOTÃO FLUTUANTE DE CRIAÇÃO
// O + não abre mais um formulário separado: ele abre o mesmo Assistente Caixa
// em modo de cadastro conversacional. Isso mantém uma única experiência de
// entrada e evita formulários duplicados espalhados pelas abas.
const fabCriar = document.getElementById("fabCriar");
fabCriar?.addEventListener("click", () => {
  document.dispatchEvent(new CustomEvent("caixa:abrirCadastroChat"));
});
atualizarVisibilidadeFab();

// Inicializa! (Limpando execuções duplicadas caso você recarregue a página)
if (!document.body.dataset.tooltipInit) {
  initChartTooltip();
  document.body.dataset.tooltipInit = "1";
}


// Carrega os ícones personalizados depois que o HTML da aplicação estiver disponível.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    inicializarPickersIcones();
    carregarIconesCaixinhas();
  }, { once: true });
} else {
  inicializarPickersIcones();
  carregarIconesCaixinhas();
}


/* ============================================================
   CAIXA — ASSISTENTE FINANCEIRO LOCAL
   Respostas rápidas locais:
   - os números são calculados do state atual;
   - o pequeno atraso é apenas visual para manter a sensação de resposta natural.
   ============================================================ */

