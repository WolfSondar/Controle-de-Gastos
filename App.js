// =====================================================================
// CAIXA — app.js
// Estado local em memória + sincronização com a planilha via Apps Script
// =====================================================================

const state = {
  ganhos: [],
  gastosFixos: [],
  gastosVariaveis: [],
  objetivos: [],
  loaded: false,
};

const fmt = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------------------------------------------------------------------
// SINCRONIZAÇÃO COM A PLANILHA
// ---------------------------------------------------------------------

const syncEl = document.getElementById("syncStatus");

function setSyncState(mode, text) {
  syncEl.dataset.state = mode;
  syncEl.querySelector(".sync-text").textContent = text;
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
  try {
    const res = await fetch(API_URL, { method: "GET" });
    const data = await res.json();
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
  setSyncState("saving", "Salvando…");
  try {
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action, payload }),
    });
    setSyncState("idle", "Salvo");
  } catch (err) {
    setSyncState("error", "Falha ao salvar");
    showToast("Não consegui salvar na planilha agora.");
  }
}

// ---------------------------------------------------------------------
// OPERAÇÕES — GANHOS / FIXOS / VARIÁVEIS (nome + valor)
// ---------------------------------------------------------------------

function criarOperacoesLista(key, action) {
  return {
    add(nome, valor) {
      state[key].push({ nome, valor });
      salvarBloco(action, state[key]);
      renderAll();
    },
    remove(index) {
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
  state.objetivos.push({ nome, custo, valorAdicionado: 0 });
  salvarBloco("saveObjetivos", state.objetivos);
  renderAll();
}
function removeObjetivo(index) {
  state.objetivos.splice(index, 1);
  salvarBloco("saveObjetivos", state.objetivos);
  renderAll();
}
function aportarObjetivo(index, valor) {
  const obj = state.objetivos[index];
  obj.valorAdicionado = (Number(obj.valorAdicionado) || 0) + valor;
  salvarBloco("saveObjetivos", state.objetivos);
  renderAll();
}

// ---------------------------------------------------------------------
// TOTAIS
// ---------------------------------------------------------------------

function soma(lista) {
  return lista.reduce((acc, i) => acc + (Number(i.valor) || 0), 0);
}

function renderTotais() {
  const totalGanhos = soma(state.ganhos);
  const totalFixos = soma(state.gastosFixos);
  const totalVariaveis = soma(state.gastosVariaveis);
  const saldo = totalGanhos - totalFixos - totalVariaveis;

  document.getElementById("statGanhos").textContent = fmt(totalGanhos);
  document.getElementById("statFixos").textContent = fmt(totalFixos);
  document.getElementById("statVariaveis").textContent = fmt(totalVariaveis);

  const saldoEl = document.getElementById("saldoValor");
  saldoEl.textContent = fmt(saldo);
  saldoEl.classList.toggle("negative", saldo < 0);
}

// ---------------------------------------------------------------------
// RENDER — LISTAS SIMPLES (ganhos / fixos / variáveis)
// ---------------------------------------------------------------------

function renderLista(ulId, lista, tipo, onRemove) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = "";
  if (lista.length === 0) {
    ul.innerHTML = `<p class="empty-state">Nada por aqui ainda. Adicione o primeiro item acima.</p>`;
    return;
  }
  lista.forEach((item, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="item-info">
        <span class="item-nome">${escapeHtml(item.nome)}</span>
      </div>
      <div class="item-row">
        <span class="item-valor ${tipo}">${fmt(item.valor)}</span>
        <button class="btn-remove" aria-label="Remover" data-idx="${idx}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
    `;
    li.querySelector(".btn-remove").addEventListener("click", () => onRemove(idx));
    ul.appendChild(li);
  });
}

// ---------------------------------------------------------------------
// RENDER — OBJETIVOS
// ---------------------------------------------------------------------

function renderObjetivos() {
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
          <span class="goal-nome">${escapeHtml(obj.nome)}</span>
          <span class="goal-falta ${completo ? "completo" : ""}">${
            completo ? "Meta batida ✓" : "faltam " + fmt(falta)
          }</span>
        </div>
        <div class="goal-bar-track">
          <div class="goal-bar-fill ${completo ? "completo" : ""}" style="width:${pct}%"></div>
        </div>
        <div class="goal-foot">
          <span class="goal-valores"><strong>${fmt(guardado)}</strong> de ${fmt(custo)}</span>
          <div class="goal-actions">
            <button class="btn-aporte" data-idx="${idx}">+ guardar</button>
            <button class="btn-remove" aria-label="Remover meta" data-remove="${idx}">
              <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      `;
      card.querySelector(".btn-aporte").addEventListener("click", () => abrirModalAporte(idx, obj.nome));
      card.querySelector("[data-remove]").addEventListener("click", () => removeObjetivo(idx));
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
          <div class="mini-goal-nome">${escapeHtml(obj.nome)}</div>
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

function renderRecentes() {
  const ledger = document.getElementById("ledgerRecentes");
  const todos = [
    ...state.ganhos.map((i) => ({ ...i, tipo: "income", tag: "Ganho" })),
    ...state.gastosFixos.map((i) => ({ ...i, tipo: "expense", tag: "Fixo" })),
    ...state.gastosVariaveis.map((i) => ({ ...i, tipo: "expense", tag: "Variável" })),
  ];

  ledger.innerHTML = "";
  if (todos.length === 0) {
    ledger.innerHTML = `<p class="empty-state">Ainda não há lançamentos. Comece pela aba "Ganhos".</p>`;
    return;
  }
  const recentes = todos.slice(-8).reverse();
  recentes.forEach((item) => {
    const row = document.createElement("div");
    row.className = "ledger-item";
    row.innerHTML = `
      <span><span class="tag">${item.tag}</span>${escapeHtml(item.nome)}</span>
      <span class="valor ${item.tipo}">${item.tipo === "income" ? "+" : "−"} ${fmt(item.valor)}</span>
    `;
    ledger.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// RENDER GERAL
// ---------------------------------------------------------------------

function renderAll() {
  renderTotais();
  renderLista("listaGanhos", state.ganhos, "income", opGanhos.remove);
  renderLista("listaFixos", state.gastosFixos, "expense", opFixos.remove);
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

document.getElementById("tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  const tab = btn.dataset.tab;

  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-hidden", p.dataset.tab !== tab));
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ---------------------------------------------------------------------
// FORMULÁRIOS
// ---------------------------------------------------------------------

function parseValor(v) {
  return Math.round(parseFloat(v) * 100) / 100;
}

document.getElementById("formGanhos").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  opGanhos.add(nome, valor);
  f.reset();
});

document.getElementById("formFixos").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  opFixos.add(nome, valor);
  f.reset();
});

document.getElementById("formVariaveis").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  opVariaveis.add(nome, valor);
  f.reset();
});

document.getElementById("formObjetivos").addEventListener("submit", (e) => {
  e.preventDefault();
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
document.getElementById("modalCancelar").addEventListener("click", fecharModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) fecharModal();
});
document.getElementById("formAporte").addEventListener("submit", (e) => {
  e.preventDefault();
  const valor = parseValor(document.getElementById("aporteValor").value);
  if (!(valor > 0) || objetivoAtualIdx === null) return;
  aportarObjetivo(objetivoAtualIdx, valor);
  fecharModal();
});

// ---------------------------------------------------------------------
// INÍCIO
// ---------------------------------------------------------------------

carregarDados();
