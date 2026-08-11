// =====================================================================
// CAIXA — app.js
// Estado local em memória + sincronização com a planilha via Apps Script
// Agora com seletor de pessoa: davi | gabriel | ambos (somente leitura)
// =====================================================================

const PESSOA_LABEL = { davi: "Davi", gabriel: "Gabriel", ambos: "Ambos" };
const PESSOA_STORAGE_KEY = "caixaPessoaAtual";

const state = {
  ganhos: [],
  gastosFixos: [],
  gastosVariaveis: [],
  objetivos: [],
  loaded: false,
  pessoaAtual: localStorage.getItem(PESSOA_STORAGE_KEY) || "davi",
};

const fmt = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function isAmbos() {
  return state.pessoaAtual === "ambos";
}

// ---------------------------------------------------------------------
// SINCRONIZAÇÃO COM A PLANILHA
// ---------------------------------------------------------------------

const syncEl = document.getElementById("syncStatus");

function setSyncState(mode, text) {
  if (!syncEl) return;
  syncEl.dataset.state = mode;
  const label = syncEl.querySelector(".sync-text");
  if (label) label.textContent = text;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2600);
}

async function carregarDados() {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    setSyncState("error", "Configure a API");
    showToast("Configure a URL do Apps Script em config.js");
    renderAll();
    return;
  }
  setSyncState("saving", "Carregando…");
  renderSkeletons();
  try {
    const url = `${API_URL}?pessoa=${encodeURIComponent(state.pessoaAtual)}`;
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();
    if (data && data.ok === false) {
      throw new Error(data.error || "Erro desconhecido");
    }
    state.ganhos = data.ganhos || [];
    state.gastosFixos = data.gastosFixos || [];
    state.gastosVariaveis = data.gastosVariaveis || [];
    state.objetivos = data.objetivos || [];
    state.loaded = true;
    setSyncState("idle", "Sincronizado");
    renderAll();
  } catch (err) {
    setSyncState("error", "Erro ao carregar");
    showToast("Não consegui carregar a planilha. Confira a API_URL.");
    renderAll();
  }
}

async function salvarBloco(action, payload) {
  if (isAmbos()) return; // trava de segurança: modo Ambos nunca salva
  setSyncState("saving", "Salvando…");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action, payload, pessoa: state.pessoaAtual }),
    });
    const data = await res.json().catch(() => null);
    if (data && data.ok === false) {
      throw new Error(data.error || "Erro desconhecido");
    }
    setSyncState("idle", "Salvo");
  } catch (err) {
    setSyncState("error", "Falha ao salvar");
    showToast("Não consegui salvar na planilha agora.");
  }
}

// ---------------------------------------------------------------------
// SELETOR DE PESSOA (Davi / Gabriel / Ambos)
// ---------------------------------------------------------------------

function trocarPessoa(pessoa) {
  if (pessoa === state.pessoaAtual) return;
  state.pessoaAtual = pessoa;
  localStorage.setItem(PESSOA_STORAGE_KEY, pessoa);
  renderPessoaSwitch();
  atualizarVisibilidadeEdicao();
  carregarDados();
}

function renderPessoaSwitch() {
  document.querySelectorAll(".person-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.pessoa === state.pessoaAtual);
  });
}

// Esconde formulários de adicionar e ações de excluir/aportar no modo Ambos.
function atualizarVisibilidadeEdicao() {
  const ambos = isAmbos();
  document.querySelectorAll(".add-form, .goal-actions .btn-aporte, .modo-edicao").forEach((el) => {
    el.classList.toggle("is-hidden", ambos);
  });
  document.body.classList.toggle("modo-somente-leitura", ambos);
}

// ---------------------------------------------------------------------
// OPERAÇÕES — GANHOS / FIXOS / VARIÁVEIS (nome + valor)
// ---------------------------------------------------------------------

function criarOperacoesLista(key, action) {
  return {
    add(nome, valor, extra = {}) {
      if (isAmbos()) return;
      state[key].push({ nome, valor, ...extra });
      salvarBloco(action, state[key]);
      renderAll();
    },
    remove(index) {
      if (isAmbos()) return;
      state[key].splice(index, 1);
      salvarBloco(action, state[key]);
      renderAll();
    },
  };
}

const opGanhos = criarOperacoesLista("ganhos", "saveGanhos");
const opFixos = criarOperacoesLista("gastosFixos", "saveGastosFixos");
const opVariaveis = criarOperacoesLista("gastosVariaveis", "saveGastosVariaveis");

// ---------------------------------------------------------------------
// OPERAÇÕES — OBJETIVOS
// ---------------------------------------------------------------------

function addObjetivo(nome, custo) {
  if (isAmbos()) return;
  state.objetivos.push({ nome, custo, valorAdicionado: 0 });
  salvarBloco("saveObjetivos", state.objetivos);
  renderAll();
}
function removeObjetivo(index) {
  if (isAmbos()) return;
  state.objetivos.splice(index, 1);
  salvarBloco("saveObjetivos", state.objetivos);
  renderAll();
}
function aportarObjetivo(index, valor) {
  if (isAmbos()) return;
  const obj = state.objetivos[index];
  obj.valorAdicionado = (Number(obj.valorAdicionado) || 0) + valor;
  salvarBloco("saveObjetivos", state.objetivos);
  renderAll();
}

// ---------------------------------------------------------------------
// GASTOS FIXOS — status "pago" (coluna PAGO na planilha, VERDADEIRO/FALSO)
// ---------------------------------------------------------------------

function fixoEhPago(item) {
  return item.pago === true;
}

function togglePagoFixo(index) {
  if (isAmbos()) return;
  const item = state.gastosFixos[index];
  if (!item) return;
  item.pago = !fixoEhPago(item);
  salvarBloco("saveGastosFixos", state.gastosFixos);
  renderAll();
}

// ---------------------------------------------------------------------
// TOTAIS
// ---------------------------------------------------------------------

function soma(lista) {
  return lista.reduce((acc, i) => acc + (Number(i.valor) || 0), 0);
}

function somaFixosPagos(lista) {
  return lista.reduce((acc, i) => acc + (fixoEhPago(i) ? Number(i.valor) || 0 : 0), 0);
}

function renderTotais() {
  const totalGanhos = soma(state.ganhos);
  const totalFixosGeral = soma(state.gastosFixos);
  const totalFixosPagos = somaFixosPagos(state.gastosFixos);
  const totalFixosAPagar = totalFixosGeral - totalFixosPagos;
  const totalVariaveis = soma(state.gastosVariaveis);
  const saldo = totalGanhos - totalFixosPagos - totalVariaveis;

  document.getElementById("statGanhos").textContent = fmt(totalGanhos);
  document.getElementById("statFixos").textContent = fmt(totalFixosPagos);
  document.getElementById("statVariaveis").textContent = fmt(totalVariaveis);

  const saldoEl = document.getElementById("saldoValor");
  saldoEl.textContent = fmt(saldo);
  saldoEl.classList.toggle("negative", saldo < 0);

  const formulaEl = document.getElementById("saldoFormula");
  if (formulaEl) {
    formulaEl.textContent =
      totalFixosAPagar > 0
        ? `ganhos − fixos pagos − variáveis · ${fmt(totalFixosAPagar)} em fixos a pagar`
        : "ganhos − fixos pagos − variáveis";
  }
}

// ---------------------------------------------------------------------
// RENDER — LISTAS SIMPLES (ganhos / fixos / variáveis)
// ---------------------------------------------------------------------

function tagPessoa(item) {
  if (!isAmbos() || !item.pessoa) return "";
  return `<span class="pessoa-tag pessoa-${item.pessoa}">${PESSOA_LABEL[item.pessoa]}</span>`;
}

function renderLista(ulId, lista, tipo, onRemove) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = "";
  if (lista.length === 0) {
    ul.innerHTML = `<p class="empty-state">Nada por aqui ainda. Adicione o primeiro item acima.</p>`;
    return;
  }
  const ambos = isAmbos();
  lista.forEach((item, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="item-info">
        <span class="item-nome">${escapeHtml(item.nome)} ${tagPessoa(item)}</span>
      </div>
      <div class="item-row">
        <span class="item-valor ${tipo}">${fmt(item.valor)}</span>
        ${
          ambos
            ? ""
            : `<button class="btn-remove" aria-label="Remover" data-idx="${idx}">
                <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>`
        }
      </div>
    `;
    if (!ambos) {
      li.querySelector(".btn-remove").addEventListener("click", () => onRemove(idx));
    }
    ul.appendChild(li);
  });
}

// ---------------------------------------------------------------------
// RENDER — GASTOS FIXOS (com toggle de status "pago")
// ---------------------------------------------------------------------

function renderFixos() {
  const ul = document.getElementById("listaFixos");
  ul.innerHTML = "";
  if (state.gastosFixos.length === 0) {
    ul.innerHTML = `<p class="empty-state">Nada por aqui ainda. Adicione o primeiro item acima.</p>`;
    return;
  }
  const ambos = isAmbos();
  state.gastosFixos.forEach((item, idx) => {
    const pago = fixoEhPago(item);
    const li = document.createElement("li");
    li.className = pago ? "" : "is-pendente";
    li.innerHTML = `
      <div class="item-info">
        <span class="item-nome">${escapeHtml(item.nome)} ${tagPessoa(item)}</span>
      </div>
      <div class="item-row">
        <span class="item-valor expense">${fmt(item.valor)}</span>
        ${
          ambos
            ? `<span class="pago-toggle ${pago ? "is-pago" : ""}" aria-disabled="true"><span class="dot"></span>${pago ? "Pago" : "Pendente"}</span>`
            : `<label class="pago-toggle ${pago ? "is-pago" : ""}">
                <input type="checkbox" data-idx="${idx}" ${pago ? "checked" : ""} />
                <span class="dot"></span>${pago ? "Pago" : "Pendente"}
              </label>`
        }
        ${
          ambos
            ? ""
            : `<button class="btn-remove" aria-label="Remover" data-idx="${idx}">
                <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>`
        }
      </div>
    `;
    if (!ambos) {
      li.querySelector('input[type="checkbox"]').addEventListener("change", () => togglePagoFixo(idx));
      li.querySelector(".btn-remove").addEventListener("click", () => opFixos.remove(idx));
    }
    ul.appendChild(li);
  });
}

// ---------------------------------------------------------------------
// RENDER — OBJETIVOS
// ---------------------------------------------------------------------

function renderObjetivos() {
  const ambos = isAmbos();
  const wrap = document.getElementById("listaObjetivos");
  wrap.innerHTML = "";
  if (state.objetivos.length === 0) {
    wrap.innerHTML = `<p class="empty-state">Nenhum objetivo ainda. Que tal criar um?</p>`;
  } else {
    state.objetivos.forEach((obj, idx) => {
      const custo = Number(obj.custo) || 0;
      const guardado = Number(obj.valorAdicionado) || 0;
      const falta = Math.max(custo - guardado, 0);
      const pct = custo > 0 ? Math.min((guardado / custo) * 100, 100) : 0;
      const completo = falta <= 0 && custo > 0;

      const card = document.createElement("div");
      card.className = "goal-card";
      card.innerHTML = `
        <div class="goal-head">
          <span class="goal-nome">${escapeHtml(obj.nome)} ${tagPessoa(obj)}</span>
          <span class="goal-falta ${completo ? "completo" : ""}">${
            completo ? "Meta batida ✓" : "faltam " + fmt(falta)
          }</span>
        </div>
        <div class="goal-bar-track">
          <div class="goal-bar-fill ${completo ? "completo" : ""}" style="width:${pct}%"></div>
        </div>
        <div class="goal-foot">
          <span class="goal-valores"><strong>${fmt(guardado)}</strong> de ${fmt(custo)}</span>
          ${
            ambos
              ? ""
              : `<div class="goal-actions">
                  <button class="btn-aporte" data-idx="${idx}">+ guardar</button>
                  <button class="btn-remove" aria-label="Remover meta" data-remove="${idx}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  </button>
                </div>`
          }
        </div>
      `;
      if (!ambos) {
        card.querySelector(".btn-aporte").addEventListener("click", () => abrirModalAporte(idx, obj.nome));
        card.querySelector("[data-remove]").addEventListener("click", () =>
          abrirConfirmacao(`Remover a meta "${obj.nome}"? Essa ação não pode ser desfeita.`, () => removeObjetivo(idx))
        );
      }
      wrap.appendChild(card);
    });
  }

  // mini lista no resumo
  const mini = document.getElementById("resumoObjetivos");
  mini.innerHTML = "";
  if (state.objetivos.length === 0) {
    mini.innerHTML = `<p class="empty-state">Crie um objetivo na aba "Metas".</p>`;
  } else {
    state.objetivos.forEach((obj) => {
      const custo = Number(obj.custo) || 0;
      const guardado = Number(obj.valorAdicionado) || 0;
      const pct = custo > 0 ? Math.min((guardado / custo) * 100, 100) : 0;
      const row = document.createElement("div");
      row.className = "mini-goal";
      row.innerHTML = `
        <div class="mini-goal-info">
          <div class="mini-goal-nome">${escapeHtml(obj.nome)} ${tagPessoa(obj)}</div>
          <div class="goal-bar-track"><div class="goal-bar-fill ${pct >= 100 ? "completo" : ""}" style="width:${pct}%"></div></div>
        </div>
        <span class="mini-goal-pct">${pct.toFixed(0)}%</span>
      `;
      mini.appendChild(row);
    });
  }
}

// ---------------------------------------------------------------------
// RENDER — RESUMO: lançamentos recentes (mistura tudo, mais recentes primeiro)
// ---------------------------------------------------------------------

const ICONE_GANHO = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_GASTO = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function itensRecentesPorCategoria(lista, tipo, tag, n) {
  return lista
    .slice(-n)
    .reverse()
    .map((i) => ({ ...i, tipo, tag }));
}

function renderRecentes() {
  const ledger = document.getElementById("ledgerRecentes");
  // Pega os últimos N de cada categoria, e não os últimos N do total —
  // assim ganhos nunca somem da lista só porque há muitos gastos depois.
  const todos = [
    ...itensRecentesPorCategoria(state.ganhos, "income", "Ganho", 3),
    ...itensRecentesPorCategoria(state.gastosFixos, "expense", "Fixo", 3),
    ...itensRecentesPorCategoria(state.gastosVariaveis, "expense", "Variável", 3),
  ];

  ledger.innerHTML = "";
  if (todos.length === 0) {
    ledger.innerHTML = `<p class="empty-state">Ainda não há lançamentos. Comece pela aba "Ganhos".</p>`;
    return;
  }
  todos.forEach((item) => {
    const pendente = item.tipo === "expense" && item.pago === false;
    const row = document.createElement("div");
    row.className = "ledger-item" + (pendente ? " is-pendente" : "");
    row.innerHTML = `
      <span class="ledger-icon ${item.tipo}">${item.tipo === "income" ? ICONE_GANHO : ICONE_GASTO}</span>
      <div class="ledger-info">
        <span class="ledger-nome">${escapeHtml(item.nome)} ${tagPessoa(item)}</span>
        <span class="ledger-tag">${pendente ? "Fixo · pendente" : item.tag}</span>
      </div>
      <span class="ledger-valor ${item.tipo}">${item.tipo === "income" ? "+" : "−"} ${fmt(item.valor)}</span>
    `;
    ledger.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// SKELETON LOADING — mostrado enquanto os dados vêm da planilha
// ---------------------------------------------------------------------

function skeletonItemRows(n) {
  return Array.from({ length: n })
    .map(
      () => `
      <li>
        <span class="skeleton" style="width:55%;height:13px;">.</span>
        <span class="skeleton" style="width:64px;height:13px;">.</span>
      </li>`
    )
    .join("");
}

function skeletonLedgerRows(n) {
  return Array.from({ length: n })
    .map(
      () => `
      <div class="ledger-item">
        <span class="skeleton" style="width:34px;height:34px;border-radius:50%;">.</span>
        <div class="ledger-info">
          <span class="skeleton" style="width:65%;height:12px;margin-bottom:6px;">.</span>
          <span class="skeleton" style="width:35%;height:9px;">.</span>
        </div>
        <span class="skeleton" style="width:58px;height:13px;">.</span>
      </div>`
    )
    .join("");
}

function skeletonGoalCards(n) {
  return Array.from({ length: n })
    .map(
      () => `
      <div class="goal-card">
        <div class="skeleton" style="width:55%;height:17px;margin-bottom:16px;">.</div>
        <div class="skeleton" style="height:10px;border-radius:100px;margin-bottom:14px;">.</div>
        <div class="skeleton" style="width:40%;height:12px;">.</div>
      </div>`
    )
    .join("");
}

function skeletonMiniGoals(n) {
  return Array.from({ length: n })
    .map(
      () => `
      <div class="mini-goal">
        <div class="mini-goal-info">
          <div class="skeleton" style="width:50%;height:12px;margin-bottom:8px;">.</div>
          <div class="skeleton" style="height:6px;border-radius:100px;">.</div>
        </div>
        <span class="skeleton" style="width:30px;height:12px;">.</span>
      </div>`
    )
    .join("");
}

function renderSkeletons() {
  ["listaGanhos", "listaFixos", "listaVariaveis"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = skeletonItemRows(3);
  });
  const ledger = document.getElementById("ledgerRecentes");
  if (ledger) ledger.innerHTML = skeletonLedgerRows(4);
  const resumoObj = document.getElementById("resumoObjetivos");
  if (resumoObj) resumoObj.innerHTML = skeletonMiniGoals(2);
  const listaObjetivos = document.getElementById("listaObjetivos");
  if (listaObjetivos) listaObjetivos.innerHTML = skeletonGoalCards(2);
}

// ---------------------------------------------------------------------
// RENDER GERAL
// ---------------------------------------------------------------------

function renderAll() {
  renderTotais();
  renderLista("listaGanhos", state.ganhos, "income", opGanhos.remove);
  renderFixos();
  renderLista("listaVariaveis", state.gastosVariaveis, "expense", opVariaveis.remove);
  renderObjetivos();
  renderRecentes();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// NAVEGAÇÃO POR ABAS
// ---------------------------------------------------------------------

const tabbarEl = document.getElementById("tabbar");
if (tabbarEl) {
  tabbarEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const tab = btn.dataset.tab;

    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-hidden", p.dataset.tab !== tab));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

const personSwitchEl = document.getElementById("personSwitch");
if (personSwitchEl) {
  personSwitchEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".person-btn");
    if (!btn) return;
    trocarPessoa(btn.dataset.pessoa);
  });
} else {
  console.warn('Caixa: elemento #personSwitch não encontrado. Confira se o index.html foi atualizado junto com o app.js (falta a <div id="personSwitch"> no cabeçalho).');
}

// ---------------------------------------------------------------------
// FORMULÁRIOS
// ---------------------------------------------------------------------

function parseValor(v) {
  return Math.round(parseFloat(v) * 100) / 100;
}

// Liga um listener só se o elemento existir — evita que um elemento faltando
// no HTML derrube o script inteiro (e trave o resto do app).
function on(id, evento, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`Caixa: elemento #${id} não encontrado no HTML.`);
    return;
  }
  el.addEventListener(evento, handler);
}

on("formGanhos", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  opGanhos.add(nome, valor);
  f.reset();
});

on("formFixos", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  const pago = f.pago ? f.pago.checked : false;
  opFixos.add(nome, valor, { pago });
  f.reset();
});

on("formVariaveis", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  opVariaveis.add(nome, valor);
  f.reset();
});

on("formObjetivos", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const custo = parseValor(f.custo.value);
  if (!nome || !(custo > 0)) return;
  addObjetivo(nome, custo);
  f.reset();
});

// ---------------------------------------------------------------------
// MODAL DE APORTE
// ---------------------------------------------------------------------

let objetivoAtualIdx = null;
const modalBackdrop = document.getElementById("modalBackdrop");

function abrirModalAporte(idx, nome) {
  if (isAmbos()) return;
  objetivoAtualIdx = idx;
  document.getElementById("modalTitle").textContent = `Guardar valor — ${nome}`;
  document.getElementById("aporteValor").value = "";
  modalBackdrop.classList.remove("is-hidden");
  setTimeout(() => document.getElementById("aporteValor").focus(), 50);
}
function fecharModal() {
  modalBackdrop.classList.add("is-hidden");
  objetivoAtualIdx = null;
}
on("modalCancelar", "click", fecharModal);
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) fecharModal();
  });
}
on("formAporte", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const valor = parseValor(document.getElementById("aporteValor").value);
  if (!(valor > 0) || objetivoAtualIdx === null) return;
  aportarObjetivo(objetivoAtualIdx, valor);
  fecharModal();
});

// ---------------------------------------------------------------------
// MODAL DE CONFIRMAÇÃO (usado hoje para remover metas)
// ---------------------------------------------------------------------

let confirmCallback = null;
const confirmBackdrop = document.getElementById("confirmBackdrop");

function abrirConfirmacao(texto, onConfirm) {
  confirmCallback = onConfirm;
  const textoEl = document.getElementById("confirmText");
  if (textoEl) textoEl.textContent = texto;
  if (confirmBackdrop) confirmBackdrop.classList.remove("is-hidden");
}
function fecharConfirmacao() {
  if (confirmBackdrop) confirmBackdrop.classList.add("is-hidden");
  confirmCallback = null;
}
on("confirmCancelar", "click", fecharConfirmacao);
on("confirmOk", "click", () => {
  const cb = confirmCallback;
  fecharConfirmacao();
  if (cb) cb();
});
if (confirmBackdrop) {
  confirmBackdrop.addEventListener("click", (e) => {
    if (e.target === confirmBackdrop) fecharConfirmacao();
  });
}

// ---------------------------------------------------------------------
// INÍCIO
// ---------------------------------------------------------------------

renderPessoaSwitch();
atualizarVisibilidadeEdicao();
carregarDados();
