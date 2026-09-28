// =====================================================================
// MÓDULO: 13-dashboard
// Dashboard, gráficos e resumo mensal
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

// ---------------------------------------------------------------------
// SWIPE BIDIRECIONAL DAS CAIXINHAS (arrastar p/ esquerda = editar,
// p/ direita = excluir) + toque simples abre o menu de ações.
//
// Usa Pointer Events (em vez de touch+mouse separados) de propósito: ter
// os dois tipos de listener ao mesmo tempo faz o navegador processar o
// mesmo toque duas vezes (o touch "de verdade" e depois um clique
// sintético ~300ms depois), o que deixava o menu abrindo de forma
// inconsistente no celular. Com Pointer Events só existe um evento por
// interação, então isso não acontece.
// ---------------------------------------------------------------------
const LARGURA_SWIPE_CAIXINHA = 92;
const LIMIAR_SWIPE_CAIXINHA = 44;
const LIMIAR_SWIPE_CAIXINHA_TOTAL = 132;

function fecharSwipeCaixinha(wrap) {
  if (!wrap) return;
  wrap.classList.remove("is-revelado-editar", "is-revelado-excluir");
  const card = wrap.querySelector(".caixinha-card");
  if (card) card.style.transform = "";
}
function fecharTodosSwipesCaixinha(lista, exceto) {
  lista.querySelectorAll(".caixinha-swipe").forEach((el) => {
    if (el !== exceto) fecharSwipeCaixinha(el);
  });
}

function habilitarSwipeCaixinhas(lista) {
  if (!lista || lista._swipeCaixinhaAtivado) return;
  lista._swipeCaixinhaAtivado = true;
  let ativo = null;

  const iniciar = (e) => {
    if (e.button) return; // ignora clique direito/do meio no PC
    const wrap = e.target.closest(".caixinha-swipe");
    if (!wrap || e.target.closest(".swipe-actions-caixinha") || e.target.tagName === "BUTTON") return;
    const jaEditar = wrap.classList.contains("is-revelado-editar");
    const jaExcluir = wrap.classList.contains("is-revelado-excluir");
    fecharTodosSwipesCaixinha(lista, wrap);
    ativo = {
      wrap,
      card: wrap.querySelector(".caixinha-card"),
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      capturado: false,
      base: jaEditar ? -LARGURA_SWIPE_CAIXINHA : jaExcluir ? LARGURA_SWIPE_CAIXINHA : 0,
      ultimoDelta: jaEditar ? -LARGURA_SWIPE_CAIXINHA : jaExcluir ? LARGURA_SWIPE_CAIXINHA : 0,
      vibrou: jaEditar || jaExcluir,
    };
  };

  const mover = (e) => {
    if (!ativo || e.pointerId !== ativo.pointerId) return;
    const dx = e.clientX - ativo.startX;
    const dy = e.clientY - ativo.startY;

    if (!ativo.dragging) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { ativo = null; return; }
      ativo.dragging = true;
      if (ativo.card && ativo.card.setPointerCapture) {
        try { ativo.card.setPointerCapture(ativo.pointerId); ativo.capturado = true; } catch (err) { /* ignora */ }
      }
    }
    e.preventDefault();

    const bruto = ativo.base + dx;
    let novo;
    if (Math.abs(bruto) <= LARGURA_SWIPE_CAIXINHA) {
      novo = bruto;
    } else {
      // Resistência elástica depois de revelar o botão inteiro — dá pra
      // continuar arrastando pra executar na hora, mas com esforço maior.
      const sinal = Math.sign(bruto);
      const extra = Math.abs(bruto) - LARGURA_SWIPE_CAIXINHA;
      novo = sinal * (LARGURA_SWIPE_CAIXINHA + extra * 0.3);
    }
    novo = Math.max(-LIMIAR_SWIPE_CAIXINHA_TOTAL, Math.min(LIMIAR_SWIPE_CAIXINHA_TOTAL, novo));

    if (ativo.card) {
      ativo.card.style.transition = "none";
      ativo.card.style.transform = `translateX(${novo}px)`;
    }
    const cruzouLimiar = Math.abs(novo) >= LIMIAR_SWIPE_CAIXINHA;
    if (cruzouLimiar && !ativo.vibrou) { vibrar(); ativo.vibrou = true; }
    else if (!cruzouLimiar) ativo.vibrou = false;
    ativo.ultimoDelta = novo;
  };

  const finalizar = (e) => {
    if (!ativo || (e && e.pointerId !== undefined && e.pointerId !== ativo.pointerId)) return;
    const { wrap, card, ultimoDelta, dragging, base, capturado, pointerId } = ativo;
    if (capturado && card && card.releasePointerCapture) {
      try { card.releasePointerCapture(pointerId); } catch (err) { /* ignora */ }
    }
    const idx = Number(wrap.dataset.idx);

    if (!dragging) {
      // Toque simples: se já estava revelado, só fecha; senão abre o menu.
      if (base !== 0) fecharSwipeCaixinha(wrap);
      else abrirAcoesCaixinha(idx);
      ativo = null;
      return;
    }

    if (card) card.style.transition = "";
    const swipeCompleto = Math.abs(ultimoDelta) >= LIMIAR_SWIPE_CAIXINHA_TOTAL - 6;

    if (swipeCompleto) {
      fecharSwipeCaixinha(wrap);
      vibrar(18);
      if (ultimoDelta < 0) acionarEditarCaixinha(idx);
      else acionarExcluirCaixinha(idx);
    } else if (ultimoDelta <= -LIMIAR_SWIPE_CAIXINHA) {
      wrap.classList.add("is-revelado-editar");
      wrap.classList.remove("is-revelado-excluir");
      if (card) card.style.transform = `translateX(-${LARGURA_SWIPE_CAIXINHA}px)`;
    } else if (ultimoDelta >= LIMIAR_SWIPE_CAIXINHA) {
      wrap.classList.add("is-revelado-excluir");
      wrap.classList.remove("is-revelado-editar");
      if (card) card.style.transform = `translateX(${LARGURA_SWIPE_CAIXINHA}px)`;
    } else {
      fecharSwipeCaixinha(wrap);
    }
    ativo = null;
  };

  const cancelar = (e) => {
    if (!ativo || (e && e.pointerId !== undefined && e.pointerId !== ativo.pointerId)) return;
    fecharSwipeCaixinha(ativo.wrap);
    ativo = null;
  };

  lista.addEventListener("pointerdown", iniciar);
  lista.addEventListener("pointermove", mover, { passive: false });
  lista.addEventListener("pointerup", finalizar);
  lista.addEventListener("pointercancel", cancelar);
}

document.addEventListener("pointerdown", (e) => {
  const lista = document.getElementById("listaCaixinhas");
  if (lista && !e.target.closest("#listaCaixinhas")) fecharTodosSwipesCaixinha(lista);
});

// Menu de ações da caixinha (guardar / retirar / % rendeu) — abre ao tocar
// no card (sem arrastar).
let acoesCaixinhaIdx = null;
const acoesCaixinhaBackdrop = document.getElementById("acoesCaixinhaBackdrop");
function abrirAcoesCaixinha(idx) {
  const cx = state.caixinhas[idx];
  if (!cx || isAmbos()) return;
  acoesCaixinhaIdx = idx;
  const tituloEl = document.getElementById("acoesCaixinhaTitulo");
  if (tituloEl) tituloEl.textContent = cx.nome;
  if (acoesCaixinhaBackdrop) acoesCaixinhaBackdrop.classList.remove("is-hidden");
  registrarAberturaModal("acoesCaixinhaBackdrop");
}
function fecharAcoesCaixinha() {
  fecharComHistorico("acoesCaixinhaBackdrop", () => {
    if (acoesCaixinhaBackdrop) acoesCaixinhaBackdrop.classList.add("is-hidden");
    acoesCaixinhaIdx = null;
  });
}
FECHADORES_MODAL.acoesCaixinhaBackdrop = fecharAcoesCaixinha;
on("acoesCaixinhaFechar", "click", fecharAcoesCaixinha);
if (acoesCaixinhaBackdrop) {
  acoesCaixinhaBackdrop.addEventListener("click", (e) => {
    if (e.target === acoesCaixinhaBackdrop) fecharAcoesCaixinha();
  });
}

// Troca o menu de ações pelo modal de valor SEM passar por
// history.back() + history.pushState() em sequência: como o back() é
// assíncrono, empilhar um pushState logo em seguida corrompia o
// histórico do navegador (era isso que causava o modal fechar sozinho e,
// às vezes, abrir uma aba nova em vez de mostrar o formulário). Em vez
// disso, substitui a entrada atual do histórico na hora, sem navegar.
function trocarAcoesCaixinhaPorValor(acao) {
  const idx = acoesCaixinhaIdx;
  if (idx == null) return;
  if (acoesCaixinhaBackdrop) acoesCaixinhaBackdrop.classList.add("is-hidden");
  acoesCaixinhaIdx = null;
  const posicaoPilha = pilhaModais.lastIndexOf("acoesCaixinhaBackdrop");
  if (posicaoPilha !== -1) {
    pilhaModais[posicaoPilha] = "modalBackdrop";
    history.replaceState({ caixaModal: "modalBackdrop" }, "");
  } else {
    pilhaModais.push("modalBackdrop");
    history.pushState({ caixaModal: "modalBackdrop" }, "");
  }
  abrirModalCaixinha(acao, idx, { semHistorico: true });
}
on("btnAcaoCaixinhaGuardar", "click", () => trocarAcoesCaixinhaPorValor("guardar"));
on("btnAcaoCaixinhaRetirar", "click", () => trocarAcoesCaixinhaPorValor("retirar"));
on("btnAcaoCaixinhaRendimento", "click", () => trocarAcoesCaixinhaPorValor("rendimento"));

function renderCaixinhas() {
  const ambos = isAmbos();
  const wrap = document.getElementById("listaCaixinhas");
  if (wrap) {
    wrap.innerHTML = "";
    if (state.caixinhas.length === 0) {
      wrap.innerHTML = estadoVazio("Nenhuma caixinha ainda. Que tal criar uma?", ICONE_COFRINHO);
    } else {
      // Prioridade: quem está mais perto de concluir a meta aparece primeiro.
      // Caixinhas com meta ficam antes das sem objetivo; entre as sem objetivo,
      // preservamos a ordem original para não ficar reorganizando sem necessidade.
      const ordenadas = state.caixinhas
        .map((cx, idx) => ({ cx, idx }))
        .sort((a, b) => {
          const oa = Number(a.cx.valorObjetivo) || 0;
          const ob = Number(b.cx.valorObjetivo) || 0;
          if (oa <= 0 && ob <= 0) return a.idx - b.idx;
          if (oa <= 0) return 1;
          if (ob <= 0) return -1;
          const pa = Math.min((totalCaixinha(a.cx) / oa) * 100, 100);
          const pb = Math.min((totalCaixinha(b.cx) / ob) * 100, 100);
          return pb - pa || a.idx - b.idx;
        })
        .map(({ idx }) => idx);
      ordenadas.forEach((idx) => wrap.appendChild(montarCardCaixinha(state.caixinhas[idx], idx, ambos)));
      if (!ambos) habilitarSwipeCaixinhas(wrap);
    }
  }

  primeiraRenderCaixinhas = false;
  
  const mini = document.getElementById("resumoCaixinhas");
  if (!mini) return;
  mini.innerHTML = "";
  if (state.caixinhas.length === 0) {
    mini.innerHTML = estadoVazio('Crie uma caixinha na aba "Caixinhas".', ICONE_COFRINHO);
  } else {
    const ordenadasResumo = state.caixinhas
      .map((cx, idx) => ({ cx, idx }))
      .sort((a, b) => {
        const oa = Number(a.cx.valorObjetivo) || 0;
        const ob = Number(b.cx.valorObjetivo) || 0;
        if (oa <= 0 && ob <= 0) return a.idx - b.idx;
        if (oa <= 0) return 1;
        if (ob <= 0) return -1;
        const pa = Math.min((totalCaixinha(a.cx) / oa) * 100, 100);
        const pb = Math.min((totalCaixinha(b.cx) / ob) * 100, 100);
        return pb - pa || a.idx - b.idx;
      });
    ordenadasResumo.forEach(({ cx }) => {
      const guardado = totalCaixinha(cx);
      const objetivo = Number(cx.valorObjetivo) || 0;
      const temObjetivo = objetivo > 0;
      const pct = temObjetivo ? Math.min((guardado / objetivo) * 100, 100) : 0;
      const row = document.createElement("div");
      row.className = "mini-goal";
      row.innerHTML = temObjetivo
        ? `<div class="mini-goal-info">
          <div class="mini-goal-nome">${escapeHtml(cx.nome)} ${tagPessoa(cx)}</div>
          <div class="goal-bar-track"><div class="goal-bar-fill ${pct >= 100 ? "completo" : ""}" style="width:${pct}%"></div></div>
        </div><span class="mini-goal-pct">${fmt(guardado)}</span>`
        : `<div class="mini-goal-info">
          <div class="mini-goal-nome">${escapeHtml(cx.nome)} ${tagPessoa(cx)}</div>
        </div><span class="mini-goal-pct">${fmt(guardado)}</span>`;
      mini.appendChild(row);
    });
  }
}

const ICONE_GANHO = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_GASTO = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_GUARDADO = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m8.8 11.7 3.2 3.2 3.2-3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function itensRecentesPorCategoria(lista, tipo, tag) {
  return (lista || []).map((i) => ({ ...i, tipo, tag }));
}

let mostrarTodosRecentes = false;

function formatarCabecalhoDataExtrato(data, hoje) {
  const d = new Date(`${data}T00:00:00`);
  const isoHoje = dataHojeISO();
  const ontemDate = new Date(hoje);
  ontemDate.setDate(ontemDate.getDate() - 1);
  const isoOntem = `${ontemDate.getFullYear()}-${String(ontemDate.getMonth() + 1).padStart(2, "0")}-${String(ontemDate.getDate()).padStart(2, "0")}`;
  const dia = String(d.getDate()).padStart(2, "0");
  const diaSemana = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const mes = d.toLocaleDateString("pt-BR", { month: "long" });

  let destaque = "";
  if (data === isoHoje) destaque = "Hoje";
  else if (data === isoOntem) destaque = "Ontem";

  return `
    <span class="ledger-date-number">${dia}</span>
    <span class="ledger-date-copy">
      <strong>${destaque || escapeHtml(diaSemana)}</strong>
      <small>${destaque ? escapeHtml(`${diaSemana} · ${dia} de ${mes}`) : escapeHtml(`${dia} de ${mes}`)}</small>
    </span>
    <span class="ledger-date-line"></span>`;
}

function renderRecentes() {
  const ledger = document.getElementById("ledgerRecentes");
  if (!ledger) return;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicio7 = new Date(hoje);
  inicio7.setDate(inicio7.getDate() - 6);

  const base = [
    ...itensRecentesPorCategoria(state.ganhos, "income", "Ganho"),
    ...itensRecentesPorCategoria(state.gastosFixos, "expense", "Fixo"),
    ...itensRecentesPorCategoria(state.gastosVariaveis, "expense", "Variável"),
  ].map((item, idx) => ({ ...item, _ordem: idx }))
   .filter((item) => {
      // Lançamentos recentes representam dinheiro que efetivamente entrou ou saiu.
      // Pendentes continuam disponíveis na seção "Pendentes" das respectivas abas.
      const concluido = item.tipo === "income" ? item.recebido === true : item.pago === true;
      if (!concluido) return false;
      const data = String(item.data || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
      const d = new Date(`${data}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d >= inicio7 && d <= hoje;
   })
   .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || b._ordem - a._ordem);

  let exibidos;
  if (mostrarTodosRecentes) {
    exibidos = base;
  } else {
    // "Mostrar menos" mantém os dois dias mais recentes completos.
    const ultimasDatas = [...new Set(base.map((item) => String(item.data || "").slice(0, 10)))].slice(0, 2);
    const datasPermitidas = new Set(ultimasDatas);
    exibidos = base.filter((item) => datasPermitidas.has(String(item.data || "").slice(0, 10)));
  }
  ledger.innerHTML = "";

  if (!base.length) {
    ledger.innerHTML = estadoVazio("Nenhum lançamento registrado nos últimos 7 dias.", ICONE_PENA);
    return;
  }

  let dataAnterior = null;
  exibidos.forEach((item) => {
    const data = String(item.data || "").slice(0, 10);
    if (data !== dataAnterior) {
      const heading = document.createElement("div");
      heading.className = "ledger-date-heading";
      heading.innerHTML = formatarCabecalhoDataExtrato(data, hoje);
      ledger.appendChild(heading);
      dataAnterior = data;
    }

    const row = document.createElement("div");
    const benefit = item.tipo === "income" && ganhoEhBeneficio(item);
    const guardado = item.tipo === "expense" && ehLancamentoDeCaixinha(item.nome);
    row.className = `ledger-item ${item.tipo === "income" ? (benefit ? "income-beneficio" : "income-saldo") : (guardado ? "expense-guardado" : "expense")}`;
    row.innerHTML = `
      <span class="ledger-icon ${item.tipo}${benefit ? " income-beneficio" : ""}${guardado ? " guardado" : ""}">${item.tipo === "income" ? ICONE_GANHO : (guardado ? ICONE_GUARDADO : ICONE_GASTO)}</span>
      <div class="ledger-info">
        <span class="ledger-nome">${escapeHtml(nomeExibicaoItem(item))} ${tagPessoa(item)}</span>
        <span class="ledger-tag">${escapeHtml(item.tag)}</span>
      </div>
      <span class="ledger-valor ${item.tipo}${benefit ? " income-beneficio" : ""}${guardado ? " guardado" : ""}">${item.tipo === "income" ? "+" : "−"} ${fmt(item.valor)}</span>
    `;
    ledger.appendChild(row);
  });

  const temMais = base.length > 2;
  if (temMais) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "ledger-more-btn";
    more.innerHTML = mostrarTodosRecentes
      ? `<span>Mostrar menos</span><span class="ledger-more-arrow">↑</span>`
      : `<span>Ver mais dos últimos 7 dias</span><span class="ledger-more-arrow">↓</span>`;
    more.addEventListener("click", () => {
      mostrarTodosRecentes = !mostrarTodosRecentes;
      renderRecentes();
    });
    ledger.appendChild(more);
  }
}

function dataLimiteISO(base, diasAtras) {
  const d = new Date(base);
  d.setDate(d.getDate() - diasAtras);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function skeletonItemRows(n) {
  return Array.from({ length: n }).map(() => `
      <li>
        <span class="skeleton" style="width:55%;height:13px;">.</span>
        <span class="skeleton" style="width:64px;height:13px;">.</span>
      </li>`).join("");
}

function skeletonLedgerRows(n) {
  return Array.from({ length: n }).map(() => `
      <div class="ledger-item">
        <span class="skeleton" style="width:34px;height:34px;border-radius:50%;">.</span>
        <div class="ledger-info">
          <span class="skeleton" style="width:65%;height:12px;margin-bottom:6px;">.</span>
          <span class="skeleton" style="width:35%;height:9px;">.</span>
        </div>
        <span class="skeleton" style="width:58px;height:13px;">.</span>
      </div>`).join("");
}

function skeletonGoalCards(n) {
  return Array.from({ length: n }).map(() => `
      <div class="goal-card">
        <div class="skeleton" style="width:55%;height:17px;margin-bottom:16px;">.</div>
        <div class="skeleton" style="height:10px;border-radius:100px;margin-bottom:14px;">.</div>
        <div class="skeleton" style="width:40%;height:12px;">.</div>
      </div>`).join("");
}

function skeletonMiniGoals(n) {
  return Array.from({ length: n }).map(() => `
      <div class="mini-goal">
        <div class="mini-goal-info">
          <div class="skeleton" style="width:50%;height:12px;margin-bottom:8px;">.</div>
          <div class="skeleton" style="height:6px;border-radius:100px;">.</div>
        </div>
        <span class="skeleton" style="width:30px;height:12px;">.</span>
      </div>`).join("");
}

function renderSkeletons() {
  ["listaGanhos", "listaFixos", "listaVariaveis"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = skeletonItemRows(3);
  });
  const ledger = document.getElementById("ledgerRecentes");
  if (ledger) ledger.innerHTML = skeletonLedgerRows(4);
  const resumoCx = document.getElementById("resumoCaixinhas");
  if (resumoCx) resumoCx.innerHTML = skeletonMiniGoals(2);
  const listaCaixinhas = document.getElementById("listaCaixinhas");
  if (listaCaixinhas) listaCaixinhas.innerHTML = skeletonGoalCards(2);
  renderVisaoGeralSkeleton();
  if (isAmbos()) renderSplitSkeleton();
}

function renderVisaoGeralSkeleton() {
  const donut = document.getElementById("visaoGeralDonut");
  if (donut) donut.style.background = "var(--paper-deep)";
  const centro = document.getElementById("visaoGeralDonutCenter");
  if (centro) centro.innerHTML = `<span class="skeleton" style="width:76px;height:16px;">.</span>`;
  const legend = document.getElementById("visaoGeralLegend");
  if (legend) legend.innerHTML = [0, 1, 2].map(() => `<div class="split-legend-item"><span class="skeleton" style="width:100%;height:14px;">.</span></div>`).join("");
}

function renderSplitSkeleton() {
  const donut = document.getElementById("splitDonut");
  if (donut) donut.style.background = "var(--paper-deep)";
  const centro = document.getElementById("splitDonutCenter");
  if (centro) centro.innerHTML = `<span class="skeleton" style="width:76px;height:16px;">.</span>`;
  const legend = document.getElementById("splitLegend");
  if (legend) legend.innerHTML = [0, 1, 2].map(() => `<div class="split-legend-item"><span class="skeleton" style="width:100%;height:14px;">.</span></div>`).join("");
}

var suprimirEntradaNoProximoRenderAll = false;

function colecaoMudou(antes, depois) {
  try { return JSON.stringify(antes || []) !== JSON.stringify(depois || []); }
  catch { return true; }
}
function renderIncremental(mudancas) {
  const financeiroMudou = mudancas.ganhos || mudancas.gastosFixos || mudancas.gastosVariaveis || mudancas.caixinhas;
  const semEntrada = financeiroMudou;
  if (semEntrada) document.body.classList.add("sem-entrada-listas");

  if (mudancas.ganhos) {
    renderPendentesDestaque("pendentesGanhos", state.ganhos, "income", "recebido", toggleRecebidoGanho, "Pendente", opGanhos, "ganhos");
    renderListaComStatus("listaGanhos", state.ganhos, "income", opGanhos, "ganhos", "recebido", toggleRecebidoGanho, "Recebido", "Pendente");
  }
  if (mudancas.gastosFixos) {
    renderPendentesDestaque("pendentesFixos", state.gastosFixos, "expense", "pago", togglePagoFixo, "Pendente", opFixos, "fixos");
    renderListaComStatus("listaFixos", state.gastosFixos, "expense", opFixos, "fixos", "pago", togglePagoFixo, "Pago", "Pendente");
  }
  if (mudancas.gastosVariaveis) {
    renderPendentesDestaque("pendentesVariaveis", state.gastosVariaveis, "expense", "pago", togglePagoVariavel, "Pendente", opVariaveis, "variaveis");
    renderListaComStatus("listaVariaveis", state.gastosVariaveis, "expense", opVariaveis, "variaveis", "pago", togglePagoVariavel, "Pago", "Pendente");
  }
  if (mudancas.caixinhas) renderCaixinhas();
  if (financeiroMudou) {
    renderTotais(); renderVisaoGeral(); renderCategorias(); renderRecentes(); renderSplit(); renderJuntosView(); atualizarCarrosselGraficos();
      if (typeof window.renderResumoAcontecimentos === "function") window.renderResumoAcontecimentos();
  }
  if (mudancas.categoriasConfig || mudancas.iconCategorias) {
    popularSelectsDeCategoria();
    if (!mudancas.gastosFixos) renderListaComStatus("listaFixos", state.gastosFixos, "expense", opFixos, "fixos", "pago", togglePagoFixo, "Pago", "Pendente");
    if (!mudancas.gastosVariaveis) renderListaComStatus("listaVariaveis", state.gastosVariaveis, "expense", opVariaveis, "variaveis", "pago", togglePagoVariavel, "Pago", "Pendente");
  }

  if (semEntrada) requestAnimationFrame(() => document.body.classList.remove("sem-entrada-listas"));
}

function renderAll() {
  const suprimirEntrada = suprimirEntradaNoProximoRenderAll;
  suprimirEntradaNoProximoRenderAll = false;
  if (suprimirEntrada) document.body.classList.add("sem-entrada-listas");

  renderTotais();
  renderPendentesDestaque("pendentesGanhos", state.ganhos, "income", "recebido", toggleRecebidoGanho, "Pendente", opGanhos, "ganhos");
  renderPendentesDestaque("pendentesFixos", state.gastosFixos, "expense", "pago", togglePagoFixo, "Pendente", opFixos, "fixos");
  renderPendentesDestaque("pendentesVariaveis", state.gastosVariaveis, "expense", "pago", togglePagoVariavel, "Pendente", opVariaveis, "variaveis");
  renderListaComStatus("listaGanhos", state.ganhos, "income", opGanhos, "ganhos", "recebido", toggleRecebidoGanho, "Recebido", "Pendente");
  renderListaComStatus("listaFixos", state.gastosFixos, "expense", opFixos, "fixos", "pago", togglePagoFixo, "Pago", "Pendente");
  renderListaComStatus("listaVariaveis", state.gastosVariaveis, "expense", opVariaveis, "variaveis", "pago", togglePagoVariavel, "Pago", "Pendente");
  renderCaixinhas();
  renderVisaoGeral();
  renderCategorias();
  renderRecentes();
  renderSplit();
  renderJuntosView();
  atualizarCarrosselGraficos();

  if (suprimirEntrada) requestAnimationFrame(() => document.body.classList.remove("sem-entrada-listas"));
}

// Função atualizada para suportar clique e arrasto no PC. Recebe os ids do
// wrap/dots pra poder tocar mais de um carrossel na página com o mesmo
// código (o do Resumo e, agora, o novo de 2 páginas do Histórico).
function atualizarCarrosselGraficos(wrapId = "graficosCarousel", dotsId = "graficosDots") {
  const wrap = document.getElementById(wrapId);
  const dotsEl = document.getElementById(dotsId);
  if (!wrap || !dotsEl) return;

  const cards = Array.from(wrap.children).filter((el) => !el.classList.contains("is-hidden"));

  if (cards.length <= 1) {
    dotsEl.classList.add("is-hidden");
    dotsEl.innerHTML = "";
    return;
  }

  dotsEl.classList.remove("is-hidden");
  
  // Cria os pontos e adiciona evento de clique para o PC
  if (dotsEl.children.length !== cards.length) {
    dotsEl.innerHTML = cards.map((_, i) => `<span class="dot-item" style="cursor:pointer;" data-index="${i}"></span>`).join("");
    
    dotsEl.querySelectorAll('.dot-item').forEach((dot, index) => {
      dot.addEventListener('click', () => {
        const targetCard = cards[index];
        wrap.scrollTo({
          left: targetCard.offsetLeft - wrap.offsetLeft,
          behavior: 'smooth'
        });
      });
    });
  }

  // Observa mudanças de altura internas (por exemplo, quando a descrição da
  // IA do Status financeiro substitui o texto inicial). Assim a altura do
  // carrossel acompanha o card imediatamente, sem depender de um novo swipe.
  if (typeof ResizeObserver !== "undefined" && !wrap._carrosselResizeObserver) {
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => sincronizarAlturaCarrossel(wrap));
    });
    cards.forEach((card) => observer.observe(card));
    wrap._carrosselResizeObserver = observer;
  }

  if (!wrap.dataset.carrosselPronto) {
    wrap.dataset.carrosselPronto = "1";
    
    // Sincroniza a bolinha ativa ao rolar
    let agendado = null;
    wrap.addEventListener("scroll", () => {
        if (agendado) return;
        agendado = requestAnimationFrame(() => {
          agendado = null;
          marcarDotAtivo(wrap, dotsEl);
        });
      }, { passive: true }
    );

    // Permite "Arrastar e Soltar" (Drag-to-scroll) com o mouse no PC
    let isDown = false;
    let startX;
    let scrollLeft;
    
    wrap.addEventListener('mousedown', (e) => {
      isDown = true;
      startX = e.pageX - wrap.offsetLeft;
      scrollLeft = wrap.scrollLeft;
      wrap.style.cursor = 'grabbing'; // Muda o ponteiro do mouse
    });
    wrap.addEventListener('mouseleave', () => {
      isDown = false;
      wrap.style.cursor = 'auto';
    });
    wrap.addEventListener('mouseup', () => {
      isDown = false;
      wrap.style.cursor = 'auto';
    });
    wrap.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - wrap.offsetLeft;
      const walk = (x - startX) * 1.5; // Velocidade do arrasto
      wrap.scrollLeft = scrollLeft - walk;
    });
  }
  
  if (wrapId === "graficosCarousel" && !wrap.dataset.resumoPaginaRestaurada) {
    wrap.dataset.resumoPaginaRestaurada = "1";
    const salvo = lerPaginaGraficoResumo();
    let alvo = salvo ? cards.find((card) => card.id === salvo) : null;
    if (!alvo && /^\d+$/.test(String(salvo))) {
      alvo = cards[Math.min(Number(salvo), cards.length - 1)];
    }
    if (!alvo) alvo = cards[0];
    if (alvo) {
      requestAnimationFrame(() => {
        wrap.scrollLeft = Math.max(0, alvo.offsetLeft - wrap.offsetLeft);
        marcarDotAtivo(wrap, dotsEl);
      });
    }
  }
  marcarDotAtivo(wrap, dotsEl);
}

function marcarDotAtivo(wrap, dotsEl) {
  const cards = Array.from(wrap.children).filter((el) => !el.classList.contains("is-hidden"));
  const dots = dotsEl.querySelectorAll(".dot-item");
  if (!cards.length) return;
  const centro = wrap.scrollLeft + wrap.clientWidth / 2;
  let ativo = 0;
  let menorDist = Infinity;

  cards.forEach((card, i) => {
    const distCentro = card.offsetLeft + card.offsetWidth / 2 - centro;
    const dist = Math.abs(distCentro);
    if (dist < menorDist) {
      menorDist = dist;
      ativo = i;
    }
    const proporcao = Math.min(dist / wrap.clientWidth, 1);
    card.style.opacity = String(1 - proporcao * 0.6);
    card.style.transform = `scale(${1 - proporcao * 0.08})`;
  });

  if (dots.length) dots.forEach((d, i) => d.classList.toggle("is-active", i === ativo));
  if (wrap.id === "graficosCarousel") salvarPaginaGraficoResumo(cards[ativo]?.id || "");

  sincronizarAlturaCarrossel(wrap, cards, ativo);
}

// Recalcula a altura quando o conteúdo de um card muda depois da renderização.
// Isso é importante para o Status financeiro: primeiro entra o texto local e,
// alguns instantes depois, a descrição da IA pode ficar maior. Antes, o
// carrossel mantinha a altura antiga e cortava a parte inferior até o usuário
// trocar de página.
function sincronizarAlturaCarrossel(wrap, cards = null, ativo = null) {
  if (!wrap) return;
  const lista = cards || Array.from(wrap.children).filter((el) => !el.classList.contains("is-hidden"));
  if (!lista.length) return;
  let indice = Number.isInteger(ativo) ? ativo : 0;
  if (!Number.isInteger(ativo)) {
    const centro = wrap.scrollLeft + wrap.clientWidth / 2;
    let menorDist = Infinity;
    lista.forEach((card, i) => {
      const dist = Math.abs(card.offsetLeft + card.offsetWidth / 2 - centro);
      if (dist < menorDist) { menorDist = dist; indice = i; }
    });
  }
  const cardAtivo = lista[Math.max(0, Math.min(indice, lista.length - 1))];
  if (!cardAtivo) return;
  const alturaAlvo = cardAtivo.offsetHeight;
  if (alturaAlvo > 0 && wrap.dataset.alturaAtual !== String(alturaAlvo)) {
    wrap.dataset.alturaAtual = String(alturaAlvo);
    wrap.style.height = alturaAlvo + "px";
  }
}

// Descobre em qual página do carrossel o usuário está no momento (pelo
// card mais próximo do centro), pra dar pra restaurar depois de um
// re-render que reconstrói o HTML do zero (ex: renderHistorico ao
// terminar de buscar dados novos da rede).
function paginaCarrosselAtiva(wrapId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return 0;
  const cards = Array.from(wrap.children).filter((el) => !el.classList.contains("is-hidden"));
  if (!cards.length) return 0;
  const centro = wrap.scrollLeft + wrap.clientWidth / 2;
  let ativo = 0;
  let menorDist = Infinity;
  cards.forEach((card, i) => {
    const dist = Math.abs(card.offsetLeft + card.offsetWidth / 2 - centro);
    if (dist < menorDist) { menorDist = dist; ativo = i; }
  });
  return ativo;
}

// Reposiciona o carrossel na página que o usuário já estava vendo (sem
// animação — é instantâneo, o conteúdo já "nasce" na página certa) e
// atualiza bolinha/altura na hora, sem esperar o evento de scroll (que é
// assíncrono e deixaria um flash de um frame com a página errada).
function restaurarPaginaCarrossel(wrapId, dotsId, indice) {
  const wrap = document.getElementById(wrapId);
  const dotsEl = document.getElementById(dotsId);
  if (!wrap) return;
  if (indice) {
    const cards = Array.from(wrap.children).filter((el) => !el.classList.contains("is-hidden"));
    const alvo = cards[indice];
    if (alvo) wrap.scrollLeft = alvo.offsetLeft - wrap.offsetLeft;
  }
  if (dotsEl) marcarDotAtivo(wrap, dotsEl);
}


// Formata a % de uma categoria pro legend. Sem isso, uma categoria com
// gasto real mas fatia pequena (ex: 0,3% do total) aparecia como "0%"
// depois do toFixed(0) — parecendo que não teve gasto nenhum, quando na
// verdade teve (foi o que o Davi notou no filtro "Juntos": uma categoria
// dava 1% pra ele e nada pro Gabriel, mas a soma junta virava "0%").
// Abaixo de 1%, mostra uma casa decimal (ex: "0,3%") em vez do genérico
// "<1%" — assim dá pra diferenciar um item que é quase 1% de um que é
// bem menor mesmo (ex: Estacionamento a 0,3% vs. outra categoria a 0,9%).
function formatarPctCategoria(pct) {
  if (pct > 0 && pct < 1) return `${pct.toFixed(1).replace(".", ",")}%`;
  return `${pct.toFixed(0)}%`;
}

function renderCategorias() {
  const card = document.getElementById("categoriaCard");
  const donut = document.getElementById("categoriaDonut");
  const centro = document.getElementById("categoriaDonutCenter");
  const legend = document.getElementById("categoriaLegend");
  if (!card && !donut && !centro && !legend) return;

  const gastos = [...state.gastosFixos.filter(fixoEhPago), ...state.gastosVariaveis.filter(variavelContaNoSaldo)];

  const porCategoria = {};
  gastos.forEach((item) => {
    const cat = (item.tipo && String(item.tipo).trim()) || "Outros";
    porCategoria[cat] = (porCategoria[cat] || 0) + (Number(item.valor) || 0);
  });
  const categorias = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
  const total = categorias.reduce((acc, c) => acc + porCategoria[c], 0);

  if (card) card.classList.toggle("is-hidden", categorias.length === 0 || total <= 0);
  if (categorias.length === 0 || total <= 0) return;

  let acumulado = 0;
  const partes = categorias.map((cat, idx) => {
    const cor = corDaCategoria(cat, idx);
    const pct = (porCategoria[cat] / total) * 100;
    const inicio = acumulado;
    acumulado += pct;
    return { cat, cor, pct, inicio, fim: acumulado, valor: porCategoria[cat] };
  });

  if (donut) {
    donut.style.background = `conic-gradient(${partes.map((p) => `${p.cor} ${p.inicio}% ${p.fim}%`).join(", ")})`;
  }
  if (centro) {
    centro.innerHTML = `${spanCentro(fmt(total))}<small>gasto no total</small>`;
  }
  if (legend) {
    legend.innerHTML = partes.map((p) => `
        <div class="split-legend-item">
          <span class="dot" style="background:${p.cor}"></span>
          <span class="legend-label">${escapeHtml(p.cat)}</span>
          <strong>${formatarPctCategoria(p.pct)}</strong>
        </div>`).join("");
  }
}

