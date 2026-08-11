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

// guarda os últimos totais renderizados, pra animar contagem e mostrar o valor flutuante
const prevTotals = { ganhos: null, fixos: null, variaveis: null, saldo: null };

// evita comemorar metas que já chegaram completas do servidor (só comemora quem "acabou de bater")
let primeiraRenderObjetivos = true;

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
  // troca de pessoa não é "o valor mudando" — não deve animar nem fazer pop
  prevTotals.ganhos = null;
  prevTotals.fixos = null;
  prevTotals.variaveis = null;
  prevTotals.saldo = null;
  primeiraRenderObjetivos = true;
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
// No modo Ambos, também só a aba Resumo faz sentido (é a única com dados agregados úteis).
function atualizarVisibilidadeEdicao() {
  const ambos = isAmbos();
  document.querySelectorAll(".add-form, .goal-actions .btn-aporte, .modo-edicao").forEach((el) => {
    el.classList.toggle("is-hidden", ambos);
  });
  document.body.classList.toggle("modo-somente-leitura", ambos);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const ehResumo = btn.dataset.tab === "resumo";
    btn.classList.toggle("is-hidden", ambos && !ehResumo);
  });

  if (ambos) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === "resumo"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-hidden", p.dataset.tab !== "resumo"));
  }
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
    edit(index, nome, valor) {
      if (isAmbos()) return;
      const item = state[key][index];
      if (!item) return;
      item.nome = nome;
      item.valor = valor;
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
function editObjetivo(index, nome, custo) {
  if (isAmbos()) return;
  const obj = state.objetivos[index];
  if (!obj) return;
  obj.nome = nome;
  obj.custo = custo;
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
// AÇÕES EM CONJUNTO — dividir uma compra entre Davi e Gabriel
// Busca os dados atuais de cada um, soma metade do valor no fixo/variável
// escolhido, e salva os dois de uma vez — independe de quem está selecionado.
// ---------------------------------------------------------------------

async function dividirCompra(nome, valorTotal, categoria) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    showToast("Configure a URL do Apps Script em config.js");
    return false;
  }
  const metade = Math.round((valorTotal / 2) * 100) / 100;
  const action = categoria === "fixos" ? "saveGastosFixos" : "saveGastosVariaveis";
  const chave = categoria === "fixos" ? "gastosFixos" : "gastosVariaveis";

  try {
    const [daviData, gabrielData] = await Promise.all([
      fetch(`${API_URL}?pessoa=davi`).then((r) => r.json()),
      fetch(`${API_URL}?pessoa=gabriel`).then((r) => r.json()),
    ]);
    if ((daviData && daviData.ok === false) || (gabrielData && gabrielData.ok === false)) {
      throw new Error("Erro ao ler dados atuais");
    }

    const listaDavi = (daviData && daviData[chave]) || [];
    const listaGabriel = (gabrielData && gabrielData[chave]) || [];

    const item = { nome, valor: metade };
    if (categoria === "fixos") item.pago = false;

    listaDavi.push({ ...item });
    listaGabriel.push({ ...item });

    const [resDavi, resGabriel] = await Promise.all([
      fetch(API_URL, { method: "POST", body: JSON.stringify({ action, payload: listaDavi, pessoa: "davi" }) }),
      fetch(API_URL, { method: "POST", body: JSON.stringify({ action, payload: listaGabriel, pessoa: "gabriel" }) }),
    ]);
    const [dataDavi, dataGabriel] = await Promise.all([
      resDavi.json().catch(() => null),
      resGabriel.json().catch(() => null),
    ]);
    if ((dataDavi && dataDavi.ok === false) || (dataGabriel && dataGabriel.ok === false)) {
      throw new Error("Erro ao salvar em um dos dois");
    }
    return true;
  } catch (err) {
    return false;
  }
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

// Anima um número de "de" até "para", contando em tempo real (efeito de contador).
function animarNumero(el, de, para, duracao = 550) {
  if (!el) return;
  if (de === null || de === undefined || de === para) {
    el.textContent = fmt(para);
    return;
  }
  el.classList.remove("is-pulsing");
  void el.offsetWidth; // reinicia a animação de pulso mesmo se já estava rodando
  el.classList.add("is-pulsing");
  const inicio = performance.now();
  function passo(agora) {
    const p = Math.min((agora - inicio) / duracao, 1);
    const suavizado = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(de + (para - de) * suavizado);
    if (p < 1) requestAnimationFrame(passo);
    else el.textContent = fmt(para);
  }
  requestAnimationFrame(passo);
}

// Mostra um valorzinho flutuante tipo "+ R$ 20,00" ou "− R$ 20,00" subindo e sumindo,
// perto do número que mudou — a "cor" pode ser fixa (income/expense) ou seguir o sinal do delta.
function popValorFlutuante(container, delta, corFixa) {
  if (!container || !delta) return;
  const positivo = delta > 0;
  const cor = corFixa || (positivo ? "income" : "expense");
  const span = document.createElement("span");
  span.className = "value-pop " + cor;
  span.textContent = (positivo ? "+ " : "− ") + fmt(Math.abs(delta));
  container.appendChild(span);
  requestAnimationFrame(() => requestAnimationFrame(() => span.classList.add("is-animating")));
  setTimeout(() => span.remove(), 1100);
}

function renderTotais() {
  const totalGanhos = soma(state.ganhos);
  const totalFixosGeral = soma(state.gastosFixos);
  const totalFixosPagos = somaFixosPagos(state.gastosFixos);
  const totalFixosAPagar = totalFixosGeral - totalFixosPagos;
  const totalVariaveis = soma(state.gastosVariaveis);
  const saldo = totalGanhos - totalFixosPagos - totalVariaveis;

  const ganhosEl = document.getElementById("statGanhos");
  const fixosEl = document.getElementById("statFixos");
  const variaveisEl = document.getElementById("statVariaveis");
  const saldoEl = document.getElementById("saldoValor");

  const primeiraVez = prevTotals.saldo === null;

  animarNumero(ganhosEl, prevTotals.ganhos, totalGanhos);
  animarNumero(fixosEl, prevTotals.fixos, totalFixosPagos);
  animarNumero(variaveisEl, prevTotals.variaveis, totalVariaveis);
  animarNumero(saldoEl, prevTotals.saldo, saldo);

  if (!primeiraVez) {
    const heroStats = document.querySelectorAll(".hero-stat");
    popValorFlutuante(document.querySelector(".saldo-block"), saldo - prevTotals.saldo);
    popValorFlutuante(heroStats[0], totalGanhos - prevTotals.ganhos, "income");
    popValorFlutuante(heroStats[1], totalFixosPagos - prevTotals.fixos, "expense");
    popValorFlutuante(heroStats[2], totalVariaveis - prevTotals.variaveis, "expense");
  }

  saldoEl.classList.toggle("negative", saldo < 0);

  const formulaEl = document.getElementById("saldoFormula");
  if (formulaEl) {
    formulaEl.textContent =
      totalFixosAPagar > 0
        ? `ganhos − fixos pagos − variáveis · ${fmt(totalFixosAPagar)} em fixos a pagar`
        : "ganhos − fixos pagos − variáveis";
  }

  prevTotals.ganhos = totalGanhos;
  prevTotals.fixos = totalFixosPagos;
  prevTotals.variaveis = totalVariaveis;
  prevTotals.saldo = saldo;
}

// ---------------------------------------------------------------------
// RENDER — LISTAS SIMPLES (ganhos / fixos / variáveis)
// ---------------------------------------------------------------------

function tagPessoa(item) {
  if (!isAmbos() || !item.pessoa) return "";
  return `<span class="pessoa-tag pessoa-${item.pessoa}">${PESSOA_LABEL[item.pessoa]}</span>`;
}

const ICONE_LAPIS = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_X = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

function renderLista(ulId, lista, tipo, ops, tipoModal) {
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
            : `<button class="btn-edit" aria-label="Editar" data-idx="${idx}">${ICONE_LAPIS}</button>
              <button class="btn-remove" aria-label="Remover" data-idx="${idx}">${ICONE_X}</button>`
        }
      </div>
    `;
    if (!ambos) {
      li.querySelector(".btn-edit").addEventListener("click", () =>
        abrirModalEditar(tipoModal, idx, item.nome, item.valor)
      );
      li.querySelector(".btn-remove").addEventListener("click", () =>
        abrirConfirmacao(`Remover "${item.nome}"? Essa ação não pode ser desfeita.`, () => ops.remove(idx))
      );
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
            : `<button class="btn-edit" aria-label="Editar" data-idx="${idx}">${ICONE_LAPIS}</button>
              <button class="btn-remove" aria-label="Remover" data-idx="${idx}">${ICONE_X}</button>`
        }
      </div>
    `;
    if (!ambos) {
      li.querySelector('input[type="checkbox"]').addEventListener("change", () => togglePagoFixo(idx));
      li.querySelector(".btn-edit").addEventListener("click", () => abrirModalEditar("fixos", idx, item.nome, item.valor));
      li.querySelector(".btn-remove").addEventListener("click", () =>
        abrirConfirmacao(`Remover "${item.nome}"? Essa ação não pode ser desfeita.`, () => opFixos.remove(idx))
      );
    }
    ul.appendChild(li);
  });
}

// ---------------------------------------------------------------------
// CONFETE — comemoração quando uma meta bate 100%
// ---------------------------------------------------------------------

const CORES_CONFETE = ["#b9862f", "#3c6e4f", "#a8482e", "#93691f", "#f1e9d8", "#5b9c78"];

function dispararConfete() {
  const container = document.createElement("div");
  container.className = "confete-container";
  document.body.appendChild(container);

  const n = 70;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    p.className = "confete-particula";
    p.style.background = CORES_CONFETE[Math.floor(Math.random() * CORES_CONFETE.length)];
    p.style.left = Math.random() * 100 + "%";
    p.style.setProperty("--drift", Math.round(Math.random() * 180 - 90) + "px");
    p.style.setProperty("--giro", Math.round(Math.random() * 720 - 360) + "deg");
    p.style.animationDuration = (1.5 + Math.random() * 1.2).toFixed(2) + "s";
    p.style.animationDelay = (Math.random() * 0.35).toFixed(2) + "s";
    if (Math.random() > 0.5) p.style.borderRadius = "50%";
    if (Math.random() > 0.6) {
      p.style.width = "6px";
      p.style.height = "6px";
    }
    container.appendChild(p);
  }

  showToast("Meta batida! 🎉");
  setTimeout(() => container.remove(), 3200);
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

      // dispara o confete só quando a meta ACABOU de ser batida nesta sessão —
      // não quando ela já chega completa do servidor no primeiro carregamento.
      if (completo && !obj._comemorado) {
        if (!primeiraRenderObjetivos) obj._comemoraAoRenderizar = true;
        obj._comemorado = true;
      } else if (!completo) {
        obj._comemorado = false;
      }

      const card = document.createElement("div");
      card.className = "goal-card" + (obj._comemoraAoRenderizar ? " is-celebrando" : "");
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
                  <button class="btn-edit" aria-label="Editar meta" data-edit="${idx}">${ICONE_LAPIS}</button>
                  <button class="btn-aporte" data-idx="${idx}">+ guardar</button>
                  <button class="btn-remove" aria-label="Remover meta" data-remove="${idx}">${ICONE_X}</button>
                </div>`
          }
        </div>
      `;
      if (!ambos) {
        card.querySelector("[data-edit]").addEventListener("click", () => abrirModalEditar("objetivos", idx, obj.nome, obj.custo));
        card.querySelector(".btn-aporte").addEventListener("click", () => abrirModalAporte(idx, obj.nome));
        card.querySelector("[data-remove]").addEventListener("click", () =>
          abrirConfirmacao(`Remover a meta "${obj.nome}"? Essa ação não pode ser desfeita.`, () => removeObjetivo(idx))
        );
      }
      if (obj._comemoraAoRenderizar) {
        dispararConfete();
        obj._comemoraAoRenderizar = false;
      }
      wrap.appendChild(card);
    });
  }

  primeiraRenderObjetivos = false;

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
  renderLista("listaGanhos", state.ganhos, "income", opGanhos, "ganhos");
  renderFixos();
  renderLista("listaVariaveis", state.gastosVariaveis, "expense", opVariaveis, "variaveis");
  renderObjetivos();
  renderRecentes();
  renderSplit();
}

// ---------------------------------------------------------------------
// RENDER — DIVISÃO DO CASAL (só aparece no modo "Ambos")
// Mostra o total que os dois ganharam juntos, e quanto fatia cada um já gastou.
// ---------------------------------------------------------------------

function renderSplit() {
  const card = document.getElementById("splitCard");
  if (!card) return;
  const ambos = isAmbos();
  card.classList.toggle("is-hidden", !ambos);
  if (!ambos) return;

  const totalGanhos = soma(state.ganhos);
  const gastoPorPessoa = { davi: 0, gabriel: 0 };
  [...state.gastosFixos.filter(fixoEhPago), ...state.gastosVariaveis].forEach((item) => {
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
  if (donut) {
    donut.style.background = `conic-gradient(var(--income) 0% ${corte1}%, var(--expense) ${corte1}% ${corte2}%, var(--line-soft) ${corte2}% 100%)`;
  }
  const centro = document.getElementById("splitDonutCenter");
  if (centro) {
    centro.innerHTML = `<span>${fmt(restante)}</span><small>${restante < 0 ? "no vermelho" : "sobrando"}</small>`;
  }

  const legend = document.getElementById("splitLegend");
  if (legend) {
    legend.innerHTML = `
      <div class="split-legend-item">
        <span class="dot" style="background:var(--income)"></span>
        Davi gastou
        <strong>${pctDavi.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:var(--expense)"></span>
        Gabriel gastou
        <strong>${pctGabriel.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:var(--line-soft)"></span>
        Ainda sobrando
        <strong>${pctRestante.toFixed(0)}%</strong>
      </div>
    `;
  }
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
// MODAL DE EDIÇÃO (ganhos, fixos, variáveis e objetivos)
// ---------------------------------------------------------------------

let editContext = null; // { tipo, idx }
const editBackdrop = document.getElementById("editBackdrop");
const TITULOS_EDICAO = {
  ganhos: "Editar ganho",
  fixos: "Editar gasto fixo",
  variaveis: "Editar gasto variável",
  objetivos: "Editar objetivo",
};

function abrirModalEditar(tipo, idx, nome, valor) {
  if (isAmbos()) return;
  editContext = { tipo, idx };
  const tituloEl = document.getElementById("editTitle");
  if (tituloEl) tituloEl.textContent = TITULOS_EDICAO[tipo] || "Editar item";
  document.getElementById("editNome").value = nome;
  document.getElementById("editValor").value = valor;
  if (editBackdrop) editBackdrop.classList.remove("is-hidden");
  setTimeout(() => document.getElementById("editNome").focus(), 50);
}
function fecharModalEditar() {
  if (editBackdrop) editBackdrop.classList.add("is-hidden");
  editContext = null;
}
on("editCancelar", "click", fecharModalEditar);
if (editBackdrop) {
  editBackdrop.addEventListener("click", (e) => {
    if (e.target === editBackdrop) fecharModalEditar();
  });
}
on("formEditar", "submit", (e) => {
  e.preventDefault();
  if (!editContext || isAmbos()) return;
  const nome = document.getElementById("editNome").value.trim();
  const valor = parseValor(document.getElementById("editValor").value);
  if (!nome || !(valor > 0)) return;
  const { tipo, idx } = editContext;
  if (tipo === "ganhos") opGanhos.edit(idx, nome, valor);
  else if (tipo === "fixos") opFixos.edit(idx, nome, valor);
  else if (tipo === "variaveis") opVariaveis.edit(idx, nome, valor);
  else if (tipo === "objetivos") editObjetivo(idx, nome, valor);
  fecharModalEditar();
});

// ---------------------------------------------------------------------
// MODAL DE AÇÕES EM CONJUNTO (dividir compra)
// ---------------------------------------------------------------------

const acoesBackdrop = document.getElementById("acoesBackdrop");
const acoesMenuView = document.getElementById("acoesMenuView");
const formDividir = document.getElementById("formDividir");
let categoriaDividir = "variaveis";

function abrirAcoesConjunto() {
  if (acoesMenuView) acoesMenuView.classList.remove("is-hidden");
  if (formDividir) formDividir.classList.add("is-hidden");
  if (acoesBackdrop) acoesBackdrop.classList.remove("is-hidden");
}
function fecharAcoesConjunto() {
  if (acoesBackdrop) acoesBackdrop.classList.add("is-hidden");
}
on("btnAcoesConjunto", "click", abrirAcoesConjunto);
on("acoesFechar", "click", fecharAcoesConjunto);
if (acoesBackdrop) {
  acoesBackdrop.addEventListener("click", (e) => {
    if (e.target === acoesBackdrop) fecharAcoesConjunto();
  });
}

on("btnAbrirDividir", "click", () => {
  if (acoesMenuView) acoesMenuView.classList.add("is-hidden");
  if (formDividir) formDividir.classList.remove("is-hidden");
  document.getElementById("dividirNome").value = "";
  document.getElementById("dividirValor").value = "";
  setTimeout(() => document.getElementById("dividirNome").focus(), 50);
});
on("dividirVoltar", "click", () => {
  if (formDividir) formDividir.classList.add("is-hidden");
  if (acoesMenuView) acoesMenuView.classList.remove("is-hidden");
});

const segmentedDividirEl = document.getElementById("dividirCategoria");
if (segmentedDividirEl) {
  segmentedDividirEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    categoriaDividir = btn.dataset.categoria;
    segmentedDividirEl.querySelectorAll(".segmented-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
  });
}

on("formDividir", "submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("dividirNome").value.trim();
  const valor = parseValor(document.getElementById("dividirValor").value);
  if (!nome || !(valor > 0)) return;

  const btnSubmit = document.getElementById("dividirSubmit");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Dividindo…";
  }

  const ok = await dividirCompra(nome, valor, categoriaDividir);

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Dividir";
  }

  if (ok) {
    showToast(`"${nome}" dividido — metade pra cada um`);
    fecharAcoesConjunto();
    carregarDados();
  } else {
    showToast("Não consegui dividir agora. Tenta de novo em instantes.");
  }
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
