// =====================================================================
// LISTA DE ÍCONES PERSONALIZADOS (CAIXINHAS)
// Insira aqui os nomes dos arquivos que você colocar na pasta IMG/ do GitHub.
// O JS roda no lado do cliente e não consegue ler pastas sozinho.
// Exemplo: "caixa_zelda.png", "caixa_carro.webp", etc.
// =====================================================================
const ICONES_CAIXINHAS_PERSONALIZADOS = [
  "caixa_zelda.png",
  "caixa_carro.webp"
];

// =====================================================================
// CAIXA — app.js
// Estado local em memória + sincronização com a planilha via Apps Script
// =====================================================================

const PESSOA_LABEL = { davi: "Davi", gabriel: "Gabriel", ambos: "Juntos" };
const COLAPSO_STORAGE_KEY = "caixaFormsColapsados";
const PESSOA_STORAGE_KEY = "caixaPessoaAtual";
const CACHE_PREFIX = "caixaCache:";
const MES_ATUAL_STORAGE_KEY = "caixaMesAtual";
const MESES_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Lista/cores padrão — usada só como fallback enquanto a planilha não
// responde ainda, ou se a aba CONFIGS não existir/estiver vazia. Assim que
// os dados chegam da planilha (ver carregarDados), state.categoriasConfig
// passa a mandar de verdade: ver categoriasAtuais()/corDaCategoria() abaixo.
const CATEGORIAS_PADRAO = [
  "Alimentação", "Assinaturas & Serviços", "Beleza & Cuidados", "Bem-estar",
  "Carro", "Casa & Manutenção", "Celular & Internet", "Combustível", "Contas", "Delivery & Restaurantes",
  "Educação", "Estacionamento", "Financiamento", "Jogos", "Lazer",
  "Mercado", "Metas", "Outro", "Pessoal", "Pets", "Presente",
  "Reparação Histórica", "Saídas & Confraternizações", "Saúde & Farmácia",
  "Taxas & Tarifas", "Tech & Equipamentos", "Transporte",
  "Vestuário & Acessórios", "Viagens"
];

// Nomes de categoria em ordem (o que os <select> mostram) — vem da aba
// CONFIGS quando ela existe e tem linhas, senão cai na lista padrão acima.
function categoriasAtuais() {
  return (state.categoriasConfig && state.categoriasConfig.length)
    ? state.categoriasConfig.map((c) => c.nome)
    : CATEGORIAS_PADRAO;
}

// Cor de uma categoria: usa a cor cadastrada na aba CONFIGS se existir;
// senão cai na paleta fixa por posição (idxFallback), como sempre foi.
function corDaCategoria(nome, idxFallback) {
  if (state.categoriasConfig) {
    const achado = state.categoriasConfig.find((c) => c.nome === nome);
    if (achado && achado.cor) return achado.cor;
  }
  return PALETA_CATEGORIAS[idxFallback % PALETA_CATEGORIAS.length];
}

function dataHojeISO() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function preencherDatasComHoje() {
  document.querySelectorAll('.add-form input[type="date"].input-data').forEach((el) => {
    if (!el.value) el.value = dataHojeISO();
  });
}

function popularSelectsDeCategoria() {
  document.querySelectorAll("select.input-categoria").forEach((select) => {
    const opcaoVazia = select.querySelector('option[value=""]');
    select.innerHTML = "";
    select.appendChild(opcaoVazia || new Option("Categoria (opcional)", ""));
    categoriasAtuais().forEach((cat) => select.appendChild(new Option(cat, cat)));
  });
}

// ---------------------------------------------------------------------
// INDEXEDDB
// ---------------------------------------------------------------------
const IDB_NOME = "caixaDB";
const IDB_VERSAO = 1;
const IDB_LOJA_CACHE = "cache";
const IDB_LOJA_FILA = "filaOffline";

let idbPromise = null;
function abrirIdb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB indisponível neste navegador"));
      return;
    }
    const req = indexedDB.open(IDB_NOME, IDB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_LOJA_CACHE)) db.createObjectStore(IDB_LOJA_CACHE);
      if (!db.objectStoreNames.contains(IDB_LOJA_FILA)) db.createObjectStore(IDB_LOJA_FILA, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

async function idbGet(loja, chave) {
  try {
    const db = await abrirIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(loja, "readonly");
      const req = tx.objectStore(loja).get(chave);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

async function idbSet(loja, chave, valor) {
  try {
    const db = await abrirIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(loja, "readwrite");
      tx.objectStore(loja).put(valor, chave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {}
}

async function idbDelete(loja, chave) {
  try {
    const db = await abrirIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(loja, "readwrite");
      tx.objectStore(loja).delete(chave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {}
}

async function idbListarFila() {
  try {
    const db = await abrirIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_LOJA_FILA, "readonly");
      const store = tx.objectStore(IDB_LOJA_FILA);
      const itens = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          itens.push({ chaveIdb: cursor.key, valor: cursor.value });
          cursor.continue();
        } else {
          resolve(itens);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

function getMesAtualCache() {
  try {
    const raw = localStorage.getItem(MES_ATUAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

const mesAtualCache = getMesAtualCache();

const state = {
  ganhos: [],
  gastosFixos: [],
  gastosVariaveis: [],
  caixinhas: [],
  loaded: false,
  pessoaAtual: localStorage.getItem(PESSOA_STORAGE_KEY) || "davi",
  mesAtual: mesAtualCache ? mesAtualCache.mes : null,
  anoAtual: mesAtualCache ? mesAtualCache.ano : null,
  historico: null, 
  historicoAnoSelecionado: new Date().getFullYear(),
  categoriasConfig: null, // [{nome, cor}] vindo da aba CONFIGS, ou null pra usar a lista padrão
};

function renderMesAtual() {
  const el = document.getElementById("mesAtualBadge");
  if (!el) return;
  if (!state.mesAtual || !state.anoAtual) {
    el.textContent = "";
    return;
  }
  el.textContent = MESES_LABEL[state.mesAtual - 1] + "/" + state.anoAtual;
  try {
    localStorage.setItem(MES_ATUAL_STORAGE_KEY, JSON.stringify({ mes: state.mesAtual, ano: state.anoAtual }));
  } catch (err) {}
}

const prevTotals = { ganhos: null, fixos: null, variaveis: null, saldo: null, guardado: null };
let primeiraRenderCaixinhas = true;

const fmt = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtCampo = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function vibrar(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function isAmbos() {
  return state.pessoaAtual === "ambos";
}

async function getCache(pessoa) { return idbGet(IDB_LOJA_CACHE, CACHE_PREFIX + pessoa); }
async function setCache(pessoa, data) {
  return idbSet(IDB_LOJA_CACHE, CACHE_PREFIX + pessoa, {
    ganhos: data.ganhos || [],
    gastosFixos: data.gastosFixos || [],
    gastosVariaveis: data.gastosVariaveis || [],
    caixinhas: data.caixinhas || [],
    categorias: data.categorias || null,
  });
}
async function removerCache(pessoa) { return idbDelete(IDB_LOJA_CACHE, CACHE_PREFIX + pessoa); }

const syncEl = document.getElementById("syncStatus");
let syncModeAnterior = null;

function setSyncState(mode) {
  if (!syncEl) return;
  if (syncModeAnterior === "offline" && mode !== "offline" && mode !== "error") {
    syncEl.classList.add("is-reconectando");
    setTimeout(() => syncEl.classList.remove("is-reconectando"), 700);
  }
  if (syncModeAnterior === "saving" && mode === "idle") {
    syncModeAnterior = "saved";
    syncEl.dataset.state = "saved";
    setTimeout(() => {
      if (syncEl.dataset.state === "saved") {
        syncModeAnterior = "idle";
        syncEl.dataset.state = "idle";
      }
    }, 900);
    return;
  }
  syncModeAnterior = mode;
  syncEl.dataset.state = mode;
}

function atualizarBadgeOffline(n) {
  const badge = document.getElementById("syncBadge");
  if (badge) badge.textContent = n > 0 ? String(n) : "";
  if (syncEl) {
    if (n > 0) syncEl.setAttribute("aria-label", n === 1 ? "1 alteração pendente" : `${n} alterações pendentes`);
    else syncEl.removeAttribute("aria-label");
  }
}

function showToast(msg) { toastComAcao(msg, null, null); }
function toastComAcao(msg, textoAcao, onAcao) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.innerHTML = "";
  const span = document.createElement("span");
  span.className = "toast-msg";
  span.textContent = msg;
  t.appendChild(span);
  if (textoAcao && onAcao) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-acao";
    btn.textContent = textoAcao;
    btn.addEventListener("click", () => {
      clearTimeout(showToast._t);
      t.classList.remove("is-visible");
      onAcao();
    });
    t.appendChild(btn);
  }
  t.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), textoAcao ? 5200 : 2600);
}

const pilhaModais = []; 
let suprimirProximoPopstate = false; 

function registrarAberturaModal(id) {
  pilhaModais.push(id);
  history.pushState({ caixaModal: id }, "");
}

function fecharComHistorico(id, logicaDeFechar) {
  const idx = pilhaModais.lastIndexOf(id);
  logicaDeFechar();
  if (idx === -1) return;
  pilhaModais.splice(idx, 1);
  suprimirProximoPopstate = true;
  history.back();
}

window.addEventListener("popstate", () => {
  if (suprimirProximoPopstate) {
    suprimirProximoPopstate = false;
    return;
  }
  const id = pilhaModais.pop();
  if (!id) return;
  const fechar = FECHADORES_MODAL[id];
  if (fechar) fechar();
});

const FECHADORES_MODAL = {};

async function carregarDados() {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    setSyncState("error");
    showToast("Configure a URL do Apps Script em config.js");
    renderAll();
    return;
  }

  const pessoaRequisitada = state.pessoaAtual;
  const cache = await getCache(pessoaRequisitada);
  if (state.pessoaAtual !== pessoaRequisitada) return; 
  if (cache) {
    state.ganhos = cache.ganhos;
    state.gastosFixos = cache.gastosFixos;
    state.gastosVariaveis = cache.gastosVariaveis;
    state.caixinhas = cache.caixinhas || [];
    state.categoriasConfig = cache.categorias || null;
    state.loaded = true;
    popularSelectsDeCategoria();
    renderAll();
  } else {
    renderSkeletons();
  }

  if (!navigator.onLine) {
    setSyncState("offline");
    if (!cache) showToast("Sem internet. Assim que conectar eu atualizo sozinho.");
    return;
  }

  setSyncState("syncing");
  try {
    const url = `${API_URL}?pessoa=${encodeURIComponent(pessoaRequisitada)}`;
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.error || "Erro desconhecido");
    if (state.pessoaAtual !== pessoaRequisitada) return; 

    state.ganhos = data.ganhos || [];
    state.gastosFixos = data.gastosFixos || [];
    state.gastosVariaveis = data.gastosVariaveis || [];
    state.caixinhas = data.caixinhas || [];
    state.categoriasConfig = data.categorias || null;
    state.loaded = true;
    if (data.mesAtual) state.mesAtual = data.mesAtual;
    if (data.anoAtual) state.anoAtual = data.anoAtual;
    renderMesAtual();
    popularSelectsDeCategoria();
    setCache(pessoaRequisitada, data);
    setSyncState("idle");
    renderAll();
    prefetchOutrasPessoas(pessoaRequisitada);
    atualizarInsightComIA();
  } catch (err) {
    if (state.pessoaAtual !== pessoaRequisitada) return;
    setSyncState(ehErroDeRede(err) || !navigator.onLine ? "offline" : "error");
    if (!cache) {
      showToast("Não consegui carregar a planilha. Confira a API_URL.");
      renderAll();
    } else {
      showToast("Não consegui atualizar agora. Mostrando o último dado salvo.");
    }
  }
}

function prefetchOutrasPessoas(pessoaJaCarregada) {
  Object.keys(PESSOA_LABEL).filter((p) => p !== pessoaJaCarregada).forEach((p) => {
      fetch(`${API_URL}?pessoa=${encodeURIComponent(p)}`)
        .then((res) => res.json())
        .then((data) => { if (data && data.ok !== false) setCache(p, data); })
        .catch(() => {});
    });
}

const filaSalvar = new Map(); 

async function salvarBloco(action, payload) {
  if (isAmbos()) return; 
  const chave = `${state.pessoaAtual}:${action}`;
  let entrada = filaSalvar.get(chave);
  if (!entrada) {
    entrada = { emVoo: false, pendente: null };
    filaSalvar.set(chave, entrada);
  }

  entrada.pendente = payload;
  if (entrada.emVoo) return; 

  if (!navigator.onLine) {
    const pessoaOffline = state.pessoaAtual;
    const payloadOffline = entrada.pendente;
    entrada.pendente = null;
    await enfileirarOffline(pessoaOffline, action, payloadOffline);
    await atualizarIndicadorOffline();
    return;
  }

  entrada.emVoo = true;
  setSyncState("saving");
  const pessoaDoEnvio = state.pessoaAtual;
  let ultimoPayload = null;
  try {
    while (entrada.pendente !== null) {
      ultimoPayload = entrada.pendente;
      entrada.pendente = null;
      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action, payload: ultimoPayload, pessoa: pessoaDoEnvio }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok === false) throw new Error(data.error || "Erro desconhecido");
    }
    setSyncState("idle");
  } catch (err) {
    if (ehErroDeRede(err) && ultimoPayload !== null) {
      await enfileirarOffline(pessoaDoEnvio, action, ultimoPayload);
      await atualizarIndicadorOffline();
    } else {
      setSyncState("error");
      showToast("Não consegui salvar na planilha agora.");
    }
  } finally {
    entrada.emVoo = false;
  }
}

let flushEmAndamento = false;
function ehErroDeRede(err) { return err instanceof TypeError; }

async function enfileirarOffline(pessoa, action, payload) {
  const chave = `${pessoa}:${action}`;
  await idbSet(IDB_LOJA_FILA, chave, { pessoa, action, payload, quando: Date.now() });
  registrarSyncEmSegundoPlano();
}

async function registrarSyncEmSegundoPlano() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if (reg.sync) await reg.sync.register("caixa-flush-fila");
  } catch (_err) {}
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data === "caixa-flush-fila") flushFilaOffline();
  });
}

async function atualizarIndicadorOffline() {
  const itens = await idbListarFila();
  const n = itens.length;
  atualizarBadgeOffline(n);
  if (n > 0) {
    setSyncState("offline");
  }
  return n;
}

async function flushFilaOffline() {
  if (flushEmAndamento) return;
  if (!API_URL || API_URL.includes("COLE_AQUI")) return;
  if (!navigator.onLine) return;

  const itens = await idbListarFila();
  if (itens.length === 0) return;

  flushEmAndamento = true;
  setSyncState("saving");
  try {
    let restantes = itens.length;
    atualizarBadgeOffline(restantes);
    for (const { chaveIdb, valor } of itens) {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: valor.action, payload: valor.payload, pessoa: valor.pessoa }),
        });
        const data = await res.json().catch(() => null);
        if (data && data.ok === false) {
          showToast(`Não consegui salvar uma alteração pendente: ${data.error || "erro desconhecido"}`);
        }
        await idbDelete(IDB_LOJA_FILA, chaveIdb);
      } catch (err) {
        if (ehErroDeRede(err)) break; 
        await idbDelete(IDB_LOJA_FILA, chaveIdb); 
      }
      restantes -= 1;
      atualizarBadgeOffline(restantes); 
    }
  } finally {
    flushEmAndamento = false;
    const restante = await atualizarIndicadorOffline();
    if (restante === 0) setSyncState("idle");
  }
}

window.addEventListener("online", () => flushFilaOffline());
window.addEventListener("offline", () => {
  setSyncState("offline");
  atualizarIndicadorOffline();
});
setInterval(() => flushFilaOffline(), 20000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") flushFilaOffline();
});

if (syncEl) {
  syncEl.setAttribute("role", "button");
  syncEl.setAttribute("tabindex", "0");
  syncEl.setAttribute("aria-label", "Sincronizar agora");
  const tentarSincronizarAgora = async () => {
    if (syncEl.dataset.state === "saving" || syncEl.dataset.state === "syncing") return;
    vibrar(8);
    await flushFilaOffline();
    carregarDados();
  };
  syncEl.addEventListener("click", tentarSincronizarAgora);
  syncEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tentarSincronizarAgora();
    }
  });
}

// ---------------------------------------------------------------------
// SELETOR DE PESSOA E CAIXINHAS
// ---------------------------------------------------------------------
function renderIconSelector(containerId, inputName, selectedValue) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const valorMarcado = selectedValue || "";
  
  let html = `<div class="icone-selector">`;
  
  // Ícone padrão (sem imagem, só o desenho do cofrinho original)
  html += `
    <label class="icone-label" title="Padrão">
      <input type="radio" name="${inputName}" value="" ${valorMarcado === "" ? "checked" : ""} />
      <div class="icone-option">
        <span class="goal-icon sem-meta" style="width:100%; height:100%; background:transparent; color:var(--ink-text);">${ICONE_COFRINHO}</span>
      </div>
    </label>
  `;

  // Ícones personalizados vindos da lista lá do topo
  ICONES_CAIXINHAS_PERSONALIZADOS.forEach(icone => {
    html += `
      <label class="icone-label" title="${icone}">
        <input type="radio" name="${inputName}" value="${icone}" ${valorMarcado === icone ? "checked" : ""} />
        <div class="icone-option">
          <img src="IMG/${icone}" alt="${icone}" loading="lazy" />
        </div>
      </label>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function trocarPessoa(pessoa) {
  if (pessoa === state.pessoaAtual) return;
  state.pessoaAtual = pessoa;
  localStorage.setItem(PESSOA_STORAGE_KEY, pessoa);
  prevTotals.ganhos = null;
  prevTotals.fixos = null;
  prevTotals.variaveis = null;
  prevTotals.guardado = null;
  prevTotals.saldo = null;
  exibirInsightCacheOuPlaceholder();
  renderPessoaSwitch();
  atualizarVisibilidadeEdicao();
  atualizarVisibilidadeSplitCard(); 
  atualizarVisibilidadeVisaoGeral(); 
  atualizarVisibilidadeJuntosView(); 
  carregarDados();
  renderHistorico(); 
}

function atualizarVisibilidadeSplitCard() {
  const card = document.getElementById("splitCard");
  if (!card) return;
  card.classList.toggle("is-hidden", !isAmbos());
}
function atualizarVisibilidadeVisaoGeral() {
  const card = document.getElementById("visaoGeralCard");
  if (!card) return;
  card.classList.toggle("is-hidden", isAmbos());
}

function renderPessoaSwitch() {
  document.querySelectorAll(".person-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.pessoa === state.pessoaAtual);
  });
}

function atualizarVisibilidadeEdicao() {
  const ambos = isAmbos();
  document.querySelectorAll(".add-form, .goal-actions .btn-aporte, .modo-edicao").forEach((el) => {
    el.classList.toggle("is-hidden", ambos);
  });
  document.body.classList.toggle("modo-somente-leitura", ambos);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const semRestricao = btn.dataset.tab === "resumo" || btn.dataset.tab === "historico";
    btn.classList.toggle("is-hidden", ambos && !semRestricao);
  });

  if (ambos) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === "resumo"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-hidden", p.dataset.tab !== "resumo"));
  }
  posicionarIndicadorAba();
}

function sincronizarCacheAtual() {
  if (isAmbos()) return;
  setCache(state.pessoaAtual, {
    ganhos: state.ganhos,
    gastosFixos: state.gastosFixos,
    gastosVariaveis: state.gastosVariaveis,
    caixinhas: state.caixinhas,
  });
}

function criarOperacoesLista(key, action) {
  return {
    add(nome, valor, extra = {}) {
      if (isAmbos()) return;
      state[key].push({ nome, valor, ...extra });
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderAll();
    },
    remove(index) {
      if (isAmbos()) return;
      state[key].splice(index, 1);
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderAll();
    },
    edit(index, nome, valor, extra = {}) {
      if (isAmbos()) return;
      const item = state[key][index];
      if (!item) return;
      item.nome = nome;
      item.valor = valor;
      Object.assign(item, extra);
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderAll();
    },
  };
}

const opGanhos = criarOperacoesLista("ganhos", "saveGanhos");
const opFixos = criarOperacoesLista("gastosFixos", "saveGastosFixos");
const opVariaveis = criarOperacoesLista("gastosVariaveis", "saveGastosVariaveis");

function addCaixinha(nome, valorInicial, valorObjetivo, icone) {
  if (isAmbos()) return;
  state.caixinhas.push({
    nome,
    icone: icone || "", // Novo campo de ícone
    valorGuardado: 0,
    valorObjetivo: valorObjetivo || 0,
    valorGuardadoMes: valorInicial || 0,
  });
  salvarBloco("saveCaixinhas", state.caixinhas);
  if (valorInicial > 0) {
    state.gastosVariaveis.push({ nome: `Guardado: ${nome}`, valor: valorInicial, pago: true, tipo: "Metas", data: dataHojeISO() });
    salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  }
  sincronizarCacheAtual();
  renderAll();
}
function removeCaixinha(index) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const guardado = totalCaixinha(cx);
  state.caixinhas.splice(index, 1);
  if (guardado > 0) {
    state.ganhos.push({ nome: `Retirado da caixinha: ${cx.nome} (removida)`, valor: guardado, recebido: true, data: dataHojeISO() });
    salvarBloco("saveGanhos", state.ganhos);
  }
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  renderAll();
}
function editCaixinha(index, nome, valorObjetivo, icone) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const nomeAntigo = cx.nome;
  cx.nome = nome;
  cx.icone = icone || ""; // Atualizando o ícone
  cx.valorObjetivo = valorObjetivo || 0;
  if (nomeAntigo !== nome) {
    const rotuloAntigo = `Guardado: ${nomeAntigo}`;
    const rotuloNovo = `Guardado: ${nome}`;
    let mudouAlgo = false;
    state.gastosVariaveis.forEach((item) => {
      if (item.nome === rotuloAntigo) {
        item.nome = rotuloNovo;
        mudouAlgo = true;
      }
    });
    if (mudouAlgo) salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  }
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  renderAll();
}
function guardarNaCaixinha(index, valor) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  cx.valorGuardadoMes = (Number(cx.valorGuardadoMes) || 0) + valor;
  state.gastosVariaveis.push({ nome: `Guardado: ${cx.nome}`, valor, pago: true, tipo: "Metas", data: dataHojeISO() });
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  renderAll();
}
function retirarDaCaixinha(index, valor) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const doMes = Math.min(valor, Number(cx.valorGuardadoMes) || 0);
  const doResto = valor - doMes;
  cx.valorGuardadoMes = Math.max((Number(cx.valorGuardadoMes) || 0) - doMes, 0);
  cx.valorGuardado = Math.max((Number(cx.valorGuardado) || 0) - doResto, 0);
  state.ganhos.push({ nome: `Retirado da caixinha: ${cx.nome}`, valor, recebido: true, data: dataHojeISO() });
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  salvarBloco("saveGanhos", state.ganhos);
  renderAll();
}
function informarRendimentoCaixinha(index, novoMontanteTotal) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  
  const valorBaseAtual = Number(cx.valorGuardado) || 0;
  const rendimentoAnterior = Number(cx.rendimentoTotal) || 0;
  const guardadoMesAtual = Number(cx.valorGuardadoMes) || 0;
  const totalAtualNaTela = valorBaseAtual + rendimentoAnterior + guardadoMesAtual;
  
  const diferencaRendimento = novoMontanteTotal - totalAtualNaTela;
  
  if (diferencaRendimento !== 0) {
    cx.rendimentoTotal = rendimentoAnterior + diferencaRendimento;
  }
  
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  renderAll();
}

async function obterListaLocal(pessoa, chave) {
  if (pessoa === state.pessoaAtual && !isAmbos()) return [...state[chave]];
  const cache = await getCache(pessoa);
  if (cache) return [...(cache[chave] || [])];
  const data = await fetch(`${API_URL}?pessoa=${encodeURIComponent(pessoa)}`).then((r) => r.json());
  if (data && data.ok === false) throw new Error(data.error || "Erro ao ler dados atuais");
  return (data && data[chave]) || [];
}

function sufixoDivisao(pessoaCredora) {
  return ` (deve pra ${PESSOA_LABEL[pessoaCredora]})`;
}
const REGEX_SUFIXO_DIVISAO = / \(deve pra (Davi|Gabriel)\)$/;
function extrairCredorDivisao(nome) {
  const m = REGEX_SUFIXO_DIVISAO.exec(String(nome || ""));
  if (!m) return null;
  return Object.keys(PESSOA_LABEL).find((p) => PESSOA_LABEL[p] === m[1]) || null;
}
function removerSufixoDivisao(nome) {
  return String(nome || "").replace(REGEX_SUFIXO_DIVISAO, "");
}

async function dividirCompra(nome, valorTotal, categoria, opts) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    showToast("Configure a URL do Apps Script em config.js");
    return false;
  }
  opts = opts || {};
  const tipo = opts.tipo || "";
  const data = opts.data || "";
  const pago = opts.pago !== false;
  const quemPagouTudo = opts.quemPagouTudo || null;

  const metade = Math.round((valorTotal / 2) * 100) / 100;
  const action = categoria === "fixos" ? "saveGastosFixos" : "saveGastosVariaveis";
  const chave = categoria === "fixos" ? "gastosFixos" : "gastosVariaveis";
  const base = { tipo, data };

  let itemDavi, itemGabriel;
  if (quemPagouTudo) {
    const devedor = quemPagouTudo === "davi" ? "gabriel" : "davi";
    const itemPagador = { ...base, nome, valor: valorTotal, pago: true };
    const itemDevedor = pago
      ? { ...base, nome, valor: metade, pago: true }
      : { ...base, nome: nome + sufixoDivisao(quemPagouTudo), valor: metade, pago: false };
    if (quemPagouTudo === "davi") { itemDavi = itemPagador; itemGabriel = itemDevedor; }
    else { itemGabriel = itemPagador; itemDavi = itemDevedor; }
  } else {
    itemDavi = { ...base, nome, valor: metade, pago };
    itemGabriel = { ...base, nome, valor: metade, pago };
  }

  try {
    const [listaDavi, listaGabriel] = await Promise.all([
      obterListaLocal("davi", chave),
      obterListaLocal("gabriel", chave),
    ]);

    listaDavi.push(itemDavi);
    listaGabriel.push(itemGabriel);

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

    const [cacheDavi, cacheGabriel] = await Promise.all([getCache("davi"), getCache("gabriel")]);
    setCache("davi", { ...(cacheDavi || {}), [chave]: listaDavi });
    setCache("gabriel", { ...(cacheGabriel || {}), [chave]: listaGabriel });
    if (state.pessoaAtual === "davi") state[chave] = listaDavi;
    if (state.pessoaAtual === "gabriel") state[chave] = listaGabriel;
    removerCache("ambos"); 

    if (quemPagouTudo && pago) {
      const devedor = quemPagouTudo === "davi" ? "gabriel" : "davi";
      await creditarPagamentoDeDivisao(quemPagouTudo, devedor, nome, metade);
    }

    return true;
  } catch (err) {
    return false;
  }
}

async function creditarPagamentoDeDivisao(pagador, devedor, nomeOriginal, valor) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) return false;
  const hoje = dataHojeISO();
  try {
    const listaGanhosPagador = await obterListaLocal(pagador, "ganhos");
    listaGanhosPagador.push({
      nome: `Transferência de ${PESSOA_LABEL[devedor]}: ${nomeOriginal}`,
      valor, data: hoje, recebido: true,
    });

    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "saveGanhos", payload: listaGanhosPagador, pessoa: pagador }),
    });
    const data = await res.json().catch(() => null);
    if (!data || data.ok === false) throw new Error((data && data.error) || "Erro ao creditar transferência");

    const cachePagador = await getCache(pagador);
    setCache(pagador, { ...(cachePagador || {}), ganhos: listaGanhosPagador });
    if (state.pessoaAtual === pagador) state.ganhos = listaGanhosPagador;
    removerCache("ambos");
    return true;
  } catch (err) {
    showToast(`Não consegui creditar a metade pra ${PESSOA_LABEL[pagador]} automaticamente. Lança uma transferência manual pra acertar.`);
    return false;
  }
}

async function transferirEntrePessoas(de, para, nome, valor, tipo) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    showToast("Configure a URL do Apps Script em config.js");
    return false;
  }
  const descricao = (nome || "").trim() || "Transferência";
  const hoje = dataHojeISO();
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "transferir", de, para, nome, valor, tipo }),
    });
    const data = await res.json().catch(() => null);
    if (!data || data.ok === false) throw new Error((data && data.error) || "Erro desconhecido");

    const [listaVariaveisDe, listaGanhosPara] = await Promise.all([
      obterListaLocal(de, "gastosVariaveis"),
      obterListaLocal(para, "ganhos"),
    ]);
    listaVariaveisDe.push({
      nome: `Transferência p/ ${PESSOA_LABEL[para]}: ${descricao}`,
      valor, tipo: tipo || "", data: hoje, pago: true,
    });
    listaGanhosPara.push({
      nome: `Transferência de ${PESSOA_LABEL[de]}: ${descricao}`,
      valor, data: hoje, recebido: true,
    });

    const [cacheDe, cachePara] = await Promise.all([getCache(de), getCache(para)]);
    setCache(de, { ...(cacheDe || {}), gastosVariaveis: listaVariaveisDe });
    setCache(para, { ...(cachePara || {}), ganhos: listaGanhosPara });
    if (state.pessoaAtual === de) state.gastosVariaveis = listaVariaveisDe;
    if (state.pessoaAtual === para) state.ganhos = listaGanhosPara;
    removerCache("ambos");

    return true;
  } catch (err) {
    return false;
  }
}

function fixoEhPago(item) { return item.pago === true; }
function variavelEhPago(item) { return item.pago === true; }
function ganhoEhRecebido(item) { return item.recebido === true; }
function variavelContaNoSaldo(item) { return item.pago === true && item.lembrete !== true; }

function atualizarLinhaStatus(ulId, idx, ligado, rotuloOn, rotuloOff) {
  const ul = document.getElementById(ulId);
  if (!ul) return false;
  const checkbox = ul.querySelector(`input[type="checkbox"][data-idx="${idx}"]`);
  if (!checkbox) return false;
  const li = checkbox.closest(".item-list-row");
  const label = checkbox.closest(".pago-toggle");
  if (li) li.classList.toggle("is-pendente", !ligado);
  if (label) {
    label.classList.toggle("is-pago", ligado);
    const textoNode = label.lastChild;
    if (textoNode && textoNode.nodeType === Node.TEXT_NODE) {
      textoNode.textContent = ligado ? rotuloOn : rotuloOff;
    }
  }
  if (li && ligado) carimbarLinha(li, rotuloOn);
  return true;
}

function carimbarLinha(li, rotulo) {
  if (!li || !rotulo) return;
  const antigo = li.querySelector(".carimbo");
  if (antigo) antigo.remove();
  const selo = document.createElement("span");
  selo.className = "carimbo";
  selo.textContent = rotulo;
  li.appendChild(selo);

  requestAnimationFrame(() => selo.classList.add("is-batendo"));
  setTimeout(() => selo.classList.add("is-sumindo"), 850);
  setTimeout(() => selo.remove(), 1300);
}

function renderDerivadosDeStatus() {
  renderTotais();
  renderVisaoGeral();
  renderCategorias();
  renderRecentes();
  renderSplit();
  renderJuntosView();
  atualizarCarrosselGraficos();
}

function togglePagoFixo(index) {
  if (isAmbos()) return;
  const item = state.gastosFixos[index];
  if (!item) return;
  const vaiFicarPago = !fixoEhPago(item);
  item.pago = vaiFicarPago;

  const credor = vaiFicarPago ? extrairCredorDivisao(item.nome) : null;
  if (credor) {
    item.nome = removerSufixoDivisao(item.nome);
    creditarPagamentoDeDivisao(credor, state.pessoaAtual, item.nome, item.valor);
  }

  vibrar();
  sincronizarCacheAtual();
  salvarBloco("saveGastosFixos", state.gastosFixos);
  if (!credor && atualizarLinhaStatus("listaFixos", index, item.pago, "Pago", "Pendente")) {
    renderDerivadosDeStatus();
    return;
  }
  renderAll();
}
function togglePagoVariavel(index) {
  if (isAmbos()) return;
  const item = state.gastosVariaveis[index];
  if (!item) return;
  const vaiFicarPago = !variavelEhPago(item);
  item.pago = vaiFicarPago;
  if (item.lembrete) item.lembrete = false;

  const credor = vaiFicarPago ? extrairCredorDivisao(item.nome) : null;
  if (credor) {
    item.nome = removerSufixoDivisao(item.nome);
    creditarPagamentoDeDivisao(credor, state.pessoaAtual, item.nome, item.valor);
  }

  vibrar();
  sincronizarCacheAtual();
  salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  if (!credor && atualizarLinhaStatus("listaVariaveis", index, item.pago, "Pago", "Pendente")) {
    renderDerivadosDeStatus();
    return;
  }
  renderAll();
}
function toggleRecebidoGanho(index) {
  if (isAmbos()) return;
  const item = state.ganhos[index];
  if (!item) return;
  item.recebido = !ganhoEhRecebido(item);
  vibrar();
  sincronizarCacheAtual();
  salvarBloco("saveGanhos", state.ganhos);
  if (!atualizarLinhaStatus("listaGanhos", index, item.recebido, "Recebido", "Pendente")) {
    renderAll();
    return;
  }
  renderDerivadosDeStatus();
}

function soma(lista) { return lista.reduce((acc, i) => acc + (Number(i.valor) || 0), 0); }
function somaComStatus(lista, campo) { return lista.reduce((acc, i) => acc + (i[campo] === true ? Number(i.valor) || 0 : 0), 0); }
function somaFixosPagos(lista) { return somaComStatus(lista, "pago"); }
function somaCampo(lista, campo) { return lista.reduce((acc, i) => acc + (Number(i[campo]) || 0), 0); }
function totalCaixinha(cx) {
  return (Number(cx.valorGuardado) || 0) + (Number(cx.rendimentoTotal) || 0) + (Number(cx.valorGuardadoMes) || 0);
}
function somaTotalCaixinhas(lista) { return (lista || []).reduce((acc, cx) => acc + totalCaixinha(cx), 0); }
function somaVariaveisPagas(lista) {
  return lista.reduce((acc, i) => acc + (i.pago === true && i.lembrete !== true ? Number(i.valor) || 0 : 0), 0);
}

function ehLancamentoDeCaixinha(nome) { return typeof nome === "string" && nome.indexOf("Guardado: ") === 0; }

function animarNumero(el, de, para, duracao = 650) {
  if (!el) return;
  if (de === null || de === undefined || de === para) {
    el.textContent = fmt(para);
    return;
  }
  el.classList.remove("is-pulsing");
  void el.offsetWidth; 
  el.classList.add("is-pulsing");
  const inicio = performance.now();
  function passo(agora) {
    const p = Math.min((agora - inicio) / duracao, 1);
    const suavizado = 1 - Math.pow(1 - p, 4); 
    el.textContent = fmt(de + (para - de) * suavizado);
    if (p < 1) requestAnimationFrame(passo);
    else el.textContent = fmt(para);
  }
  requestAnimationFrame(passo);
}

function popValorFlutuante(container, delta, corFixa) {
  if (!container || !delta) return;
  const positivo = delta > 0;
  const cor = corFixa || (positivo ? "income" : "expense");
  const span = document.createElement("span");
  span.className = "value-pop " + cor;
  span.textContent = (positivo ? "+ " : "− ") + fmt(Math.abs(delta));
  container.appendChild(span);
  requestAnimationFrame(() => requestAnimationFrame(() => span.classList.add("is-animating")));
  setTimeout(() => span.classList.add("is-leaving"), 750);
  setTimeout(() => span.remove(), 1350);
}

function renderTotais() {
  const totalGanhosGeral = soma(state.ganhos);
  const totalGanhosRecebidos = somaComStatus(state.ganhos, "recebido");
  const totalGanhosAReceber = totalGanhosGeral - totalGanhosRecebidos;

  const totalFixosGeral = soma(state.gastosFixos);
  const totalFixosPagos = somaFixosPagos(state.gastosFixos);
  const totalFixosAPagar = totalFixosGeral - totalFixosPagos;

  const totalVariaveisGeral = soma(state.gastosVariaveis);
  const totalVariaveisPagos = somaVariaveisPagas(state.gastosVariaveis);
  const totalVariaveisAPagar = totalVariaveisGeral - totalVariaveisPagos;

  const totalGuardadoNoMes = somaCampo(state.caixinhas, "valorGuardadoMes");
  const saldo = totalGanhosRecebidos - totalFixosPagos - totalVariaveisPagos;

  const ganhosEl = document.getElementById("statGanhos");
  const fixosEl = document.getElementById("statFixos");
  const variaveisEl = document.getElementById("statVariaveis");
  const guardadoEl = document.getElementById("statGuardado");
  const saldoEl = document.getElementById("saldoValor");

  const primeiraVez = prevTotals.saldo === null;

  animarNumero(ganhosEl, prevTotals.ganhos, totalGanhosRecebidos);
  animarNumero(fixosEl, prevTotals.fixos, totalFixosPagos);
  animarNumero(variaveisEl, prevTotals.variaveis, totalVariaveisPagos);
  animarNumero(guardadoEl, prevTotals.guardado, totalGuardadoNoMes);
  animarNumero(saldoEl, prevTotals.saldo, saldo);

  if (!primeiraVez) {
    const heroStats = document.querySelectorAll(".hero-stat");
    popValorFlutuante(document.querySelector(".saldo-block"), saldo - prevTotals.saldo);
    popValorFlutuante(heroStats[0], totalGanhosRecebidos - prevTotals.ganhos, "income");
    popValorFlutuante(heroStats[1], totalGuardadoNoMes - prevTotals.guardado, "gold");
    popValorFlutuante(heroStats[2], totalFixosPagos - prevTotals.fixos, "expense");
    popValorFlutuante(heroStats[3], totalVariaveisPagos - prevTotals.variaveis, "expense");
  }

  saldoEl.classList.toggle("negative", saldo < 0);

  const saldoProjetado = totalGanhosGeral - totalFixosGeral - totalVariaveisGeral;
  const formulaEl = document.getElementById("saldoFormula");
  if (formulaEl) {
    formulaEl.textContent = `Projetado: ${fmt(saldoProjetado)}`;
    formulaEl.classList.toggle("negative", saldoProjetado < 0);
  }

  const ganhosPendenteEl = document.getElementById("statGanhosPendente");
  if (ganhosPendenteEl) ganhosPendenteEl.textContent = totalGanhosAReceber > 0 ? `+ ${fmt(totalGanhosAReceber)}` : "";
  const fixosPendenteEl = document.getElementById("statFixosPendente");
  if (fixosPendenteEl) fixosPendenteEl.textContent = totalFixosAPagar > 0 ? `− ${fmt(totalFixosAPagar)}` : "";
  const variaveisPendenteEl = document.getElementById("statVariaveisPendente");
  if (variaveisPendenteEl) variaveisPendenteEl.textContent = totalVariaveisAPagar > 0 ? `− ${fmt(totalVariaveisAPagar)}` : "";

  prevTotals.ganhos = totalGanhosRecebidos;
  prevTotals.fixos = totalFixosPagos;
  prevTotals.variaveis = totalVariaveisPagos;
  prevTotals.guardado = totalGuardadoNoMes;
  prevTotals.saldo = saldo;
}

function tagPessoa(item) {
  if (!isAmbos() || !item.pessoa) return "";
  return `<span class="pessoa-tag pessoa-${item.pessoa}">${PESSOA_LABEL[item.pessoa]}</span>`;
}

const ICONE_LAPIS = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_X = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICONE_PENA = `<svg viewBox="0 0 24 24" fill="none"><path d="M20.5 3.5c-4 .3-9.4 2-12.7 5.3C4.8 11.8 4 15.6 4 19c0 .3.2.5.5.5 3.4 0 7.2-.8 10.2-3.8 3.3-3.3 5-8.7 5.3-12.7a.5.5 0 0 0-.5-.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 11 4.5 19.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICONE_COFRINHO = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 11.5c0-3.6 3.4-6.5 8-6.5s8 2.9 8 6.5c0 1.5-.6 2.9-1.6 4v2.3a1.2 1.2 0 0 1-1.2 1.2h-1.6a1.2 1.2 0 0 1-1.2-1.2V17c-.7.13-1.5.2-2.4.2s-1.7-.07-2.4-.2v.8a1.2 1.2 0 0 1-1.2 1.2H7.2A1.2 1.2 0 0 1 6 17.8v-1.9C4.7 14.9 4 13.3 4 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="16.3" cy="10.8" r=".9" fill="currentColor" stroke="none"/><path d="M4 11h-1.6M9 5.4 8 3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICONE_LIVRO = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5c2.5-1.3 5.2-1.3 8 0 2.8-1.3 5.5-1.3 8 0v13c-2.5-1.3-5.2-1.3-8 0-2.8-1.3-5.5-1.3-8 0v-13Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 5.5v13" stroke="currentColor" stroke-width="1.5"/></svg>`;

function estadoVazio(texto, icone) {
  return `<div class="empty-state-wrap"><span class="empty-state-icone">${icone}</span><p class="empty-state">${texto}</p></div>`;
}

function formatarDataCurta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  return `${m[3]}/${m[2]}`;
}

function ehDoProximoMes(item) {
  if (!state.mesAtual || !state.anoAtual) return false;
  const m = /^(\d{4})-(\d{2})/.exec(String(item.data || ""));
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  let proxMes = state.mesAtual + 1;
  let proxAno = state.anoAtual;
  if (proxMes > 12) { proxMes = 1; proxAno += 1; }
  return ano === proxAno && mes === proxMes;
}

function ehDoMesAnterior(item) {
  if (!state.mesAtual || !state.anoAtual) return false;
  const m = /^(\d{4})-(\d{2})/.exec(String(item.data || ""));
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (ano < state.anoAtual) return true;
  return ano === state.anoAtual && mes < state.mesAtual;
}

function estaPendente(item) {
  if (typeof item.pago === "boolean") return !item.pago;
  if (typeof item.recebido === "boolean") return !item.recebido;
  return false;
}

function metaInfoHtml(item) {
  const partes = [];
  if (item.lembrete) {
    partes.push(`<span class="item-tag item-tag-lembrete" title="Pago no mês anterior, adiantado — não conta no saldo deste mês">Pago adiantado</span>`);
  } else if (ehDoProximoMes(item)) {
    partes.push(`<span class="item-tag item-tag-proximo" title="A data desse lançamento é do mês que vem">Mês que vem</span>`);
  } else if (estaPendente(item) && ehDoMesAnterior(item)) {
    partes.push(`<span class="item-tag item-tag-atrasado" title="Venceu no mês passado e ainda não foi pago">Atrasado</span>`);
  }
  if (item.tipo) partes.push(`<span class="item-tag item-tag-cat">${escapeHtml(item.tipo)}</span>`);
  if (item.parcela && /^\d+\s*\/\s*\d+$/.test(String(item.parcela).trim())) {
    partes.push(`<span class="item-tag item-tag-parcela">${escapeHtml(String(item.parcela).trim())}</span>`);
  }
  const dataCurta = formatarDataCurta(item.data);
  if (dataCurta) partes.push(`<span class="item-tag item-tag-data">${dataCurta}</span>`);
  return partes.length ? `<div class="item-meta">${partes.join("")}</div>` : "";
}

function nomeComParcela(item) {
  const nome = escapeHtml(item.nome);
  if (item.parcela && /^\d+\s*\/\s*\d+$/.test(String(item.parcela).trim())) {
    return `${nome} (${escapeHtml(String(item.parcela).trim())})`;
  }
  return nome;
}

function fecharSwipe(li) {
  if (!li) return;
  li.classList.remove("is-swiped");
  const content = li.querySelector(".swipe-content");
  if (content) content.style.transform = "";
}

const LARGURA_ACOES_SWIPE = 136;
const LIMIAR_ABRIR_SWIPE = 56;

function fecharTodosSwipes(ul, exceto) {
  ul.querySelectorAll(".item-list-row.is-swiped").forEach((li) => {
    if (li !== exceto) fecharSwipe(li);
  });
}

function habilitarSwipe(ul) {
  if (!ul || ul._swipeAtivado) return;
  ul._swipeAtivado = true;
  let ativo = null;

  const iniciar = (e) => {
    const li = e.target.closest(".item-list-row");
    if (!li || e.target.closest(".swipe-actions") || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    const jaAberto = li.classList.contains("is-swiped");
    fecharTodosSwipes(ul, li);
    
    ativo = { 
      li, 
      startX: clientX, 
      startY: clientY, 
      dragging: false, 
      jaAberto, 
      ultimoDelta: jaAberto ? -LARGURA_ACOES_SWIPE : 0, 
      vibrou: jaAberto 
    };
    
    if (!jaAberto) {
      ativo.longPressTimer = setTimeout(() => {
        if (!ativo || ativo.dragging) return;
        vibrar(16);
        li.classList.add("is-swiped");
        const content = li.querySelector(".swipe-content");
        if (content) content.style.transform = `translateX(-${LARGURA_ACOES_SWIPE}px)`;
      }, 480);
    }
  };

  const mover = (e) => {
    if (!ativo) return;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    const dx = clientX - ativo.startX;
    const dy = clientY - ativo.startY;
    
    if (!ativo.dragging) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      clearTimeout(ativo.longPressTimer); 
      if (Math.abs(dy) > Math.abs(dx)) {
        ativo = null; 
        return;
      }
      ativo.dragging = true;
    }
    
    if (ativo.dragging && e.cancelable) e.preventDefault(); 
    
    const base = ativo.jaAberto ? -LARGURA_ACOES_SWIPE : 0;
    const novo = Math.max(-LARGURA_ACOES_SWIPE, Math.min(0, base + dx));
    const content = ativo.li.querySelector(".swipe-content");
    if (content) {
      content.style.transition = "none";
      content.style.transform = `translateX(${novo}px)`;
    }
    
    const cruzouLimiar = novo <= -LIMIAR_ABRIR_SWIPE;
    if (cruzouLimiar && !ativo.vibrou) {
      vibrar();
      ativo.vibrou = true;
    } else if (!cruzouLimiar) {
      ativo.vibrou = false;
    }
    ativo.ultimoDelta = novo;
  };

  const finalizar = () => {
    if (!ativo) return;
    clearTimeout(ativo.longPressTimer);
    if (!ativo.dragging) {
      ativo = null;
      return;
    }
    const content = ativo.li.querySelector(".swipe-content");
    if (content) content.style.transition = "";
    const abrir = ativo.ultimoDelta <= -LIMIAR_ABRIR_SWIPE;
    ativo.li.classList.toggle("is-swiped", abrir);
    if (content) content.style.transform = abrir ? `translateX(-${LARGURA_ACOES_SWIPE}px)` : "";
    ativo = null;
  };

  ul.addEventListener("touchstart", iniciar, { passive: true });
  ul.addEventListener("touchmove", mover, { passive: false });
  ul.addEventListener("touchend", finalizar);
  ul.addEventListener("touchcancel", finalizar);

  ul.addEventListener("mousedown", iniciar);
  ul.addEventListener("mousemove", mover);
  window.addEventListener("mouseup", finalizar);
}

document.addEventListener("touchstart", (e) => {
    document.querySelectorAll(".item-list").forEach((ul) => {
      if (!e.target.closest(`#${ul.id}`)) fecharTodosSwipes(ul);
    });
  }, { passive: true }
);

document.addEventListener("mousedown", (e) => {
  document.querySelectorAll(".item-list").forEach((ul) => {
    if (!e.target.closest(`#${ul.id}`)) fecharTodosSwipes(ul);
  });
});

function compararDataAscendente(dataA, dataB) {
  const a = dataA || "";
  const b = dataB || "";
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function renderListaComStatus(ulId, lista, tipo, ops, tipoModal, statusKey, toggleFn, rotuloOn, rotuloOff) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = "";
  if (lista.length === 0) {
    ul.innerHTML = estadoVazio("Nada por aqui ainda. Adicione o primeiro item acima.", ICONE_PENA);
    return;
  }
  const ambos = isAmbos();
  const ordenados = lista
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => compararDataAscendente(a.item.data, b.item.data));
  ordenados.forEach(({ item, idx }, posicao) => {
    const on = item[statusKey] === true;
    const li = document.createElement("li");
    li.className = "item-list-row" + (on ? "" : " is-pendente");
    li.dataset.tipo = tipo;
    li.style.animationDelay = Math.min(posicao * 35, 250) + "ms";
    li.innerHTML = `
      ${ambos ? "" : `<div class="swipe-actions">
              <button class="swipe-btn swipe-edit" aria-label="Editar" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_LAPIS}</span><span>Editar</span></button>
              <button class="swipe-btn swipe-delete" aria-label="Excluir" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_X}</span><span>Excluir</span></button>
            </div>`}
      <div class="swipe-content">
        <span class="item-nome">${nomeComParcela(item)} ${tagPessoa(item)}</span>
        <span class="item-valor ${tipo}">${fmt(item.valor)}</span>
        ${metaInfoHtml(item) || `<div class="item-meta"></div>`}
        ${ambos ? `<span class="pago-toggle ${on ? "is-pago" : ""}" aria-disabled="true"><span class="dot"></span>${on ? rotuloOn : rotuloOff}</span>`
                : `<label class="pago-toggle ${on ? "is-pago" : ""}">
                    <input type="checkbox" data-idx="${idx}" ${on ? "checked" : ""} />
                    <span class="dot"></span>${on ? rotuloOn : rotuloOff}
                  </label>`
        }
      </div>
    `;
    if (!ambos) {
      li.querySelector('input[type="checkbox"]').addEventListener("change", () => toggleFn(idx));
      li.querySelector(".swipe-edit").addEventListener("click", () => {
        fecharSwipe(li);
        abrirModalEditar(tipoModal, idx, item);
      });
      li.querySelector(".swipe-delete").addEventListener("click", () => {
        fecharSwipe(li);
        abrirConfirmacao(`Remover "${item.nome}"?`, () => excluirComRisco(li, ops, idx, item));
      });
    }
    ul.appendChild(li);
  });
  habilitarSwipe(ul);
}

function excluirComRisco(li, ops, idx, item) {
  if (!li) {
    ops.remove(idx);
    return;
  }
  li.classList.add("is-riscando");
  vibrar(14);
  setTimeout(() => {
    recolherERemover(li, () => {
      suprimirEntradaNoProximoRenderAll = true;
      ops.remove(idx);
      showToast(`"${item.nome}" excluído`);
    });
  }, 620);
}

function recolherERemover(li, aoTerminar) {
  const altura = li.getBoundingClientRect().height;
  li.style.height = altura + "px";
  li.style.overflow = "hidden";
  void li.offsetHeight; 
  li.classList.add("is-recolhendo");
  requestAnimationFrame(() => { li.style.height = "0px"; });
  let terminou = false;
  const finalizar = () => {
    if (terminou) return;
    terminou = true;
    li.removeEventListener("transitionend", finalizar);
    aoTerminar();
  };
  li.addEventListener("transitionend", finalizar);
  setTimeout(finalizar, 360); 
}

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

function carimbarMetaBatida(card) {
  if (!card) return;
  const antigo = card.querySelector(".carimbo-meta");
  if (antigo) antigo.remove();
  const selo = document.createElement("span");
  selo.className = "carimbo carimbo-meta";
  selo.textContent = "Meta batida";
  card.appendChild(selo);
  requestAnimationFrame(() => selo.classList.add("is-batendo"));
  setTimeout(() => selo.classList.add("is-sumindo"), 1900);
  setTimeout(() => selo.remove(), 2350);
}

const ICONE_ALVO = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.7" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>`;
const ICONE_TROFEU = `<svg viewBox="0 0 24 24" fill="none"><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5v.5a3 3 0 0 0 3 3h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 5h2.5A1.5 1.5 0 0 1 20 6.5v.5a3 3 0 0 1-3 3h-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 19h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 15.2c0 1.6.9 2.6 2 2.6s2-1 2-2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function statusCaixinha(pct) {
  if (pct >= 90) return "Quase lá!";
  if (pct >= 50) return "Na metade";
  if (pct >= 25) return "Em ritmo";
  return "Começando";
}

function acionarEditarCaixinha(idx) {
  const cx = state.caixinhas[idx];
  if (!cx) return;
  abrirModalEditar("caixinhas", idx, { nome: cx.nome, valor: cx.valorObjetivo, icone: cx.icone });
}
function acionarExcluirCaixinha(idx) {
  const cx = state.caixinhas[idx];
  if (!cx) return;
  const guardado = totalCaixinha(cx);
  const aviso = guardado > 0
      ? `Remover a caixinha "${cx.nome}"? Os ${fmt(guardado)} guardados nela voltam pro saldo disponível como um ganho. Essa ação não pode ser desfeita.`
      : `Remover a caixinha "${cx.nome}"? Essa ação não pode ser desfeita.`;
  abrirConfirmacao(aviso, () => removeCaixinha(idx));
}

function montarCardCaixinha(cx, idx, ambos) {
  const valorBase = Number(cx.valorGuardado) || 0;
  const rendimentoTotal = Number(cx.rendimentoTotal) || 0;
  const guardadoMes = Number(cx.valorGuardadoMes) || 0;
  const guardado = valorBase + rendimentoTotal + guardadoMes;
  const objetivo = Number(cx.valorObjetivo) || 0;
  const temObjetivo = objetivo > 0;
  const falta = Math.max(objetivo - guardado, 0);
  const pct = temObjetivo ? Math.min((guardado / objetivo) * 100, 100) : 0;
  const completo = temObjetivo && falta <= 0;
  const vazia = guardado <= 0;

  if (completo && !cx._comemorado) {
    if (!primeiraRenderCaixinhas) cx._comemoraAoRenderizar = true;
    cx._comemorado = true;
  } else if (!completo) {
    cx._comemorado = false;
  }

  const iconeRendimentoUp = `<svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none"><path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6h6v6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const iconeRendimentoDown = `<svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none"><path d="M23 18l-9.5-9.5-5 5L1 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 18h6v-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const temRendimento = rendimentoTotal !== 0;
  const rendimentoEhGanho = rendimentoTotal > 0;

  const valoresHtml = `<span class="caixinha-guardado"><strong>${fmt(guardado)}</strong>${temObjetivo ? ` <span class="caixinha-de">/ ${fmt(objetivo)}</span>` : " guardados"}</span>
       ${temRendimento ? `<span class="item-tag ${rendimentoEhGanho ? "item-tag-rendimento" : "item-tag-perda"}" style="display:inline-flex;align-items:center;gap:4px;" title="${rendimentoEhGanho ? "Rendimento" : "Perda"}">${rendimentoEhGanho ? iconeRendimentoUp : iconeRendimentoDown}${fmt(Math.abs(rendimentoTotal))}</span>` : ""}`;

  let iconeHtml = "";
  if (cx.icone) {
    iconeHtml = `<span class="goal-icon-ring ${completo ? "completo" : ""}" style="--pct:${pct}%; padding:3px;"><span class="goal-icon-ring-inner" style="background:transparent; overflow:hidden; padding:0;"><img src="IMG/${cx.icone}" alt="Ícone" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" loading="lazy" /></span></span>`;
  } else if (temObjetivo) {
    iconeHtml = `<span class="goal-icon-ring ${completo ? "completo" : ""}" style="--pct:${pct}%"><span class="goal-icon-ring-inner">${completo ? ICONE_TROFEU : ICONE_ALVO}</span></span>`;
  } else {
    iconeHtml = `<span class="goal-icon sem-meta">${ICONE_COFRINHO}</span>`;
  }

  const quase = temObjetivo && !completo && pct >= 90;
  const chipFalta = temObjetivo
    ? `<span class="goal-falta ${completo ? "completo" : ""}">${completo ? ICONE_TROFEU + " Conquistada" : "faltam " + fmt(falta)}</span>`
    : "";

  const cardHtml = (temObjetivo && vazia)
    ? `
    <div class="goal-head goal-head-compacto">
      ${iconeHtml}
      <span class="goal-nome" title="${escapeHtml(cx.nome)}">${escapeHtml(cx.nome)} ${tagPessoa(cx)}</span>
      ${chipFalta}
    </div>
  `
    : `
    <div class="goal-head">
      ${iconeHtml}
      <span class="goal-nome">${escapeHtml(cx.nome)} ${tagPessoa(cx)}</span>
    </div>
    ${temObjetivo ? `<div class="goal-meta-linha">${chipFalta}</div>` : ""}
    ${temObjetivo ? `<div class="goal-bar-row"><div class="goal-bar-track"><div class="goal-bar-fill ${completo ? "completo" : ""}" style="width:${pct}%"></div></div><span class="goal-bar-pct ${completo ? "completo" : ""}">${Math.round(pct)}%</span></div>` : ""}
    ${!vazia ? `<div class="caixinha-valores">${valoresHtml}</div>` : ""}
  `;

  if (ambos) {
    const card = document.createElement("div");
    card.className = "goal-card caixinha-card" + (temObjetivo ? " tem-meta" : " sem-meta") + (completo ? " completo" : "") + (quase ? " quase" : "") + (temObjetivo && vazia ? " compacta" : "") + (cx._comemoraAoRenderizar ? " is-celebrando" : "");
    card.style.animationDelay = Math.min(idx * 40, 250) + "ms";
    card.innerHTML = cardHtml;
    if (cx._comemoraAoRenderizar) {
      dispararConfete();
      carimbarMetaBatida(card);
      cx._comemoraAoRenderizar = false;
    }
    return card;
  }

  const wrap = document.createElement("div");
  wrap.className = "caixinha-swipe";
  wrap.dataset.idx = idx;
  wrap.style.animationDelay = Math.min(idx * 40, 250) + "ms";
  wrap.innerHTML = `
    <div class="swipe-actions-caixinha swipe-actions-excluir">
      <button class="swipe-btn-caixinha swipe-excluir-caixinha" aria-label="Excluir caixinha" data-idx="${idx}">${ICONE_X}<span>Excluir</span></button>
    </div>
    <div class="swipe-actions-caixinha swipe-actions-editar">
      <button class="swipe-btn-caixinha swipe-editar-caixinha" aria-label="Editar caixinha" data-idx="${idx}">${ICONE_LAPIS}<span>Editar</span></button>
    </div>
    <div class="goal-card caixinha-card${temObjetivo ? " tem-meta" : " sem-meta"}${completo ? " completo" : ""}${quase ? " quase" : ""}${temObjetivo && vazia ? " compacta" : ""}${cx._comemoraAoRenderizar ? " is-celebrando" : ""}">${cardHtml}</div>
  `;
  wrap.querySelector(".swipe-editar-caixinha").addEventListener("click", () => {
    fecharSwipeCaixinha(wrap);
    acionarEditarCaixinha(idx);
  });
  wrap.querySelector(".swipe-excluir-caixinha").addEventListener("click", () => {
    fecharSwipeCaixinha(wrap);
    acionarExcluirCaixinha(idx);
  });
  const card = wrap.querySelector(".caixinha-card");
  if (cx._comemoraAoRenderizar) {
    dispararConfete();
    carimbarMetaBatida(card);
    cx._comemoraAoRenderizar = false;
  }
  return wrap;
}

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
    if (e.button) return; 
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
        try { ativo.card.setPointerCapture(ativo.pointerId); ativo.capturado = true; } catch (err) { }
      }
    }
    e.preventDefault();

    const bruto = ativo.base + dx;
    let novo;
    if (Math.abs(bruto) <= LARGURA_SWIPE_CAIXINHA) {
      novo = bruto;
    } else {
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
      try { card.releasePointerCapture(pointerId); } catch (err) { }
    }
    const idx = Number(wrap.dataset.idx);

    if (!dragging) {
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
      const ordenadas = state.caixinhas
        .map((cx, idx) => idx)
        .sort((a, b) => {
          const aTemMeta = (Number(state.caixinhas[a].valorObjetivo) || 0) > 0 ? 0 : 1;
          const bTemMeta = (Number(state.caixinhas[b].valorObjetivo) || 0) > 0 ? 0 : 1;
          return aTemMeta - bTemMeta;
        });
      ordenadas.forEach((idx) => wrap.appendChild(montarCardCaixinha(state.caixinhas[idx], idx, ambos)));
      if (!ambos) habilitarSwipeCaixinhas(wrap);
      primeiraRenderCaixinhas = false;
      
      const mini = document.getElementById("resumoCaixinhas");
      if (!mini) return;
      mini.innerHTML = "";
      if (state.caixinhas.length === 0) {
        mini.innerHTML = estadoVazio('Crie uma caixinha na aba "Caixinhas".', ICONE_COFRINHO);
      } else {
        state.caixinhas.forEach((cx) => {
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

    function itensRecentesPorCategoria(lista, tipo, tag, n) {
      return lista.slice(-n).reverse().map((i) => ({ ...i, tipo, tag }));
    }

    function renderRecentes() {
      const ledger = document.getElementById("ledgerRecentes");
      const todos = [
        ...itensRecentesPorCategoria(state.ganhos, "income", "Ganho", 3),
        ...itensRecentesPorCategoria(state.gastosFixos, "expense", "Fixo", 3),
        ...itensRecentesPorCategoria(state.gastosVariaveis, "expense", "Variável", 3),
      ];

      ledger.innerHTML = "";
      if (todos.length === 0) {
        ledger.innerHTML = estadoVazio('Ainda não há lançamentos. Comece pela aba "Ganhos".', ICONE_PENA);
        return;
      }
      todos.forEach((item) => {
        const pendente = item.tipo === "income" ? item.recebido === false : item.pago === false;
        const row = document.createElement("div");
        row.className = "ledger-item" + (pendente ? " is-pendente" : "");
        const tagPendente = item.tipo === "income" ? "A receber" : `${item.tag} · pendente`;
        row.innerHTML = `
          <span class="ledger-icon ${item.tipo}">${item.tipo === "income" ? ICONE_GANHO : ICONE_GASTO}</span>
          <div class="ledger-info">
            <span class="ledger-nome">${escapeHtml(item.nome)} ${tagPessoa(item)}</span>
            <span class="ledger-tag">${pendente ? tagPendente : item.tag}</span>
          </div>
          <span class="ledger-valor ${item.tipo}">${item.tipo === "income" ? "+" : "−"} ${fmt(item.valor)}</span>
        `;
        ledger.appendChild(row);
      });
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

    let suprimirEntradaNoProximoRenderAll = false;

    function renderAll() {
      const suprimirEntrada = suprimirEntradaNoProximoRenderAll;
      suprimirEntradaNoProximoRenderAll = false;
      if (suprimirEntrada) document.body.classList.add("sem-entrada-listas");

      renderTotais();
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

      if (!wrap.dataset.carrosselPronto) {
        wrap.dataset.carrosselPronto = "1";
        
        let agendado = null;
        wrap.addEventListener("scroll", () => {
            if (agendado) return;
            agendado = requestAnimationFrame(() => {
              agendado = null;
              marcarDotAtivo(wrap, dotsEl);
            });
          }, { passive: true }
        );

        let isDown = false;
        let startX;
        let scrollLeft;
        
        wrap.addEventListener('mousedown', (e) => {
          isDown = true;
          startX = e.pageX - wrap.offsetLeft;
          scrollLeft = wrap.scrollLeft;
          wrap.style.cursor = 'grabbing'; 
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
          const walk = (x - startX) * 1.5; 
          wrap.scrollLeft = scrollLeft - walk;
        });
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

      const alturaAlvo = cards[ativo].offsetHeight;
      if (alturaAlvo > 0 && wrap.dataset.alturaAtual !== String(alturaAlvo)) {
        wrap.dataset.alturaAtual = String(alturaAlvo);
        wrap.style.height = alturaAlvo + "px";
      }
    }

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

    const PALETA_CATEGORIAS = [
      "#b9862f", "#3c6e4f", "#a8482e", "#5c8aa6", "#8a6bb5",
      "#c99a3f", "#4d9e8a", "#c46a8f", "#7a9e4d", "#a67a4d",
      "#d96a53", "#6c8c77", "#b59b52", "#5b778c", "#9678a3", 
      "#80705a", "#a15a4b", "#4a7866", "#c2a36b", "#6a5c78", 
      "#8b7e66", "#588f82", "#b5725c", "#7d8c85", "#6e7580",
      "#4f5d8a", "#9e5a3f", "#5a8a5e", "#8a4f7a", "#c9885c",
      "#d35400", "#34495e", "#4b6584", "#eb3b5a", "#20bf6b"
    ];

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

    function categoriasMesAtual() {
      const mapa = {};
      [...state.gastosFixos.filter(fixoEhPago), ...state.gastosVariaveis.filter(variavelContaNoSaldo)].forEach((item) => {
        const cat = (item.tipo && String(item.tipo).trim()) || "Outros";
        mapa[cat] = (mapa[cat] || 0) + (Number(item.valor) || 0);
      });
      return mapa;
    }

    function mesesHistoricoOrdenados() {
      const anos = (state.historico && state.historico.anos) || [];
      const lista = [];
      anos.forEach((bloco) => (bloco.meses || []).forEach((m) => lista.push(Object.assign({ ano: bloco.ano }, m))));
      lista.sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
      return lista;
    }

    function mesAnteriorHistorico() {
      const lista = mesesHistoricoOrdenados();
      return lista.length ? lista[lista.length - 1] : null;
    }

    function mesesDoAnoHistorico(ano) {
      return mesesHistoricoOrdenados().filter((m) => m.ano === ano);
    }

    function mesmoMesAnoAnteriorHistorico() {
      if (!state.mesAtual || !state.anoAtual) return null;
      return mesesHistoricoOrdenados().find((m) => m.mes === state.mesAtual && m.ano === state.anoAtual - 1) || null;
    }

    function totaisDoAnoHistorico(ano) {
      const meses = mesesDoAnoHistorico(ano);
      return {
        ano,
        mesesFechados: meses.length,
        ganhos: meses.reduce((acc, m) => acc + totalGanhosDeUmMesHistorico(m), 0),
        gastos: meses.reduce((acc, m) => acc + totalDebitosDeUmMesHistorico(m), 0),
        guardado: meses.reduce((acc, m) => acc + totalGuardadoNoMesDeUmMesHistorico(m), 0),
      };
    }

    function categoriasDeUmMesHistorico(mesObj) {
      if (!mesObj) return {};
      if (state.pessoaAtual === "davi") return Object.assign({}, mesObj.categoriasDavi);
      if (state.pessoaAtual === "gabriel") return Object.assign({}, mesObj.categoriasGabriel);
      const mapa = Object.assign({}, mesObj.categoriasDavi);
      Object.entries(mesObj.categoriasGabriel || {}).forEach(([cat, v]) => { mapa[cat] = (mapa[cat] || 0) + v; });
      return mapa;
    }
    function totalGanhosDeUmMesHistorico(mesObj) {
      if (!mesObj) return 0;
      if (state.pessoaAtual === "davi") return mesObj.ganhosDavi || 0;
      if (state.pessoaAtual === "gabriel") return mesObj.ganhosGabriel || 0;
      return (mesObj.ganhosDavi || 0) + (mesObj.ganhosGabriel || 0);
    }
    function totalDebitosDeUmMesHistorico(mesObj) {
      if (!mesObj) return 0;
      if (state.pessoaAtual === "davi") return mesObj.debitosDavi || 0;
      if (state.pessoaAtual === "gabriel") return mesObj.debitosGabriel || 0;
      return (mesObj.debitosDavi || 0) + (mesObj.debitosGabriel || 0);
    }
    function totalGuardadoNoMesDeUmMesHistorico(mesObj) {
      if (!mesObj) return 0;
      if (state.pessoaAtual === "davi") return mesObj.guardadoMesDavi || 0;
      if (state.pessoaAtual === "gabriel") return mesObj.guardadoMesGabriel || 0;
      return (mesObj.guardadoMesDavi || 0) + (mesObj.guardadoMesGabriel || 0);
    }
    function totalGuardadoAcumuladoDeUmMesHistorico(mesObj) {
      if (!mesObj) return 0;
      if (state.pessoaAtual === "davi") return mesObj.guardadoDavi || 0;
      if (state.pessoaAtual === "gabriel") return mesObj.guardadoGabriel || 0;
      return (mesObj.guardadoDavi || 0) + (mesObj.guardadoGabriel || 0);
    }
    function totalGuardadoNoFimDoAno(ano) {
      const meses = mesesDoAnoHistorico(ano);
      if (!meses.length) return null;
      return totalGuardadoAcumuladoDeUmMesHistorico(meses[meses.length - 1]);
    }
    function totalGuardadoLiquidoNoPeriodo(totalFinal, ano) {
      const base = totalGuardadoNoFimDoAno(ano);
      return totalFinal - (base === null ? 0 : base);
    }

    function transferenciasDoMes() {
      if (state.pessoaAtual !== "ambos") return [];
      const regex = /^Transferência p\/ (.+?): (.*)$/i;
      return state.gastosVariaveis
        .map((item) => {
          const m = regex.exec(item.nome || "");
          if (!m) return null;
          return {
            de: PESSOA_LABEL[item.pessoa] || item.pessoa || "?",
            para: m[1].trim(),
            descricao: m[2].trim(),
            valor: Number(item.valor) || 0,
          };
        })
        .filter(Boolean);
    }

    function caixinhasDetalhadasParaInsight() {
      return (state.caixinhas || []).map((cx) => {
        const temMeta = Number(cx.valorObjetivo) > 0;
        const totalGuardadoDeVerdade = totalCaixinha(cx);
        return {
          nome: cx.nome,
          valorGuardado: totalGuardadoDeVerdade,
          valorObjetivo: temMeta ? Number(cx.valorObjetivo) : null,
          percentualDaMeta: temMeta ? Math.round((totalGuardadoDeVerdade / Number(cx.valorObjetivo)) * 100) : null,
          rendimentoTotal: Number(cx.rendimentoTotal) || 0,
          guardadoNesseMes: Number(cx.valorGuardadoMes) || 0,
        };
      });
    }

    function statusDoLancamento(item) {
      if (item.lembrete) return "pago_adiantado";
      if (ehDoProximoMes(item)) return "mes_que_vem";
      if (estaPendente(item)) return ehDoMesAnterior(item) ? "atrasado" : "pendente";
      return "pago";
    }
    function detalheItemParaInsight(item, tipoLancamento) {
      const det = {
        nome: item.nome,
        valor: Number(item.valor) || 0,
        categoria: (item.tipo && String(item.tipo).trim()) || "Outros",
        tipoLancamento,
        status: statusDoLancamento(item), 
      };
      if (item.pessoa) det.pessoa = PESSOA_LABEL[item.pessoa] || item.pessoa;
      if (item.parcela && /^\d+\s*\/\s*\d+$/.test(String(item.parcela).trim())) {
        det.parcela = String(item.parcela).trim();
      }
      return det;
    }

    function lancamentosComNomeDoMes() {
      const ganhos = (state.ganhos || [])
        .filter((g) => g.recebido === true)
        .map((g) => {
          const det = { nome: g.nome, valor: Number(g.valor) || 0 };
          if (g.pessoa) det.pessoa = PESSOA_LABEL[g.pessoa] || g.pessoa;
          return det;
        });
      const gastosFixos = (state.gastosFixos || []).map((g) => detalheItemParaInsight(g, "fixo"));
      const gastosVariaveis = (state.gastosVariaveis || [])
        .filter((g) => !ehLancamentoDeCaixinha(g.nome))
        .map((g) => detalheItemParaInsight(g, "variavel"));
      const gastos = gastosFixos.concat(gastosVariaveis);
      return {
        ganhosDoMes: ganhos.length ? ganhos : "Nenhum ganho recebido ainda esse mês",
        gastosDoMes: gastos.length ? gastos : "Nenhum gasto lançado ainda esse mês",
      };
    }

    function resumoPorPessoaMesAtual() {
      const porPessoa = {};
      ["davi", "gabriel"].forEach((p) => {
        const ganhosP = (state.ganhos || []).filter((g) => g.pessoa === p);
        const fixosPagosP = (state.gastosFixos || []).filter((g) => g.pessoa === p && fixoEhPago(g));
        const variaveisPagosP = (state.gastosVariaveis || []).filter((g) => g.pessoa === p && variavelContaNoSaldo(g));
        const categorias = {};
        fixosPagosP.concat(variaveisPagosP).forEach((g) => {
          const cat = (g.tipo && String(g.tipo).trim()) || "Outros";
          categorias[cat] = (categorias[cat] || 0) + (Number(g.valor) || 0);
        });
        porPessoa[p] = {
          nome: PESSOA_LABEL[p],
          ganhosRecebidos: somaComStatus(ganhosP, "recebido"),
          gastoFixoPago: soma(fixosPagosP),
          gastoVariavelPago: soma(variaveisPagosP),
          categorias,
        };
      });
      return porPessoa;
    }
    
    function porPessoaDeUmMesHistorico(mesObj) {
      if (!mesObj) return null;
      return {
        davi: { nome: PESSOA_LABEL.davi, ganhos: mesObj.ganhosDavi || 0, gastos: mesObj.debitosDavi || 0, categorias: mesObj.categoriasDavi || {} },
        gabriel: { nome: PESSOA_LABEL.gabriel, ganhos: mesObj.ganhosGabriel || 0, gastos: mesObj.debitosGabriel || 0, categorias: mesObj.categoriasGabriel || {} },
      };
    }

    function montarResumoParaInsight() {
      const nomePessoa = PESSOA_LABEL[state.pessoaAtual] || "Você";
      const nomeMesAtual = (state.mesAtual && MESES_LABEL[state.mesAtual - 1]) || MESES_LABEL[new Date().getMonth()];
      const anoAtualNum = state.anoAtual || new Date().getFullYear();
      const mesPassadoObj = mesAnteriorHistorico();
      const mesmoMesAnoPassadoObj = mesmoMesAnoAnteriorHistorico();

      const ganhosRecebidos = somaComStatus(state.ganhos, "recebido");
      const gastosFixosPagos = somaFixosPagos(state.gastosFixos);
      const gastosVariaveisPagos = somaVariaveisPagas(state.gastosVariaveis);
      const guardadoNoMes = somaCampo(state.caixinhas, "valorGuardadoMes");
      const caixinhas = caixinhasDetalhadasParaInsight();
      const totalRendimentoAcumulado = somaCampo(state.caixinhas, "rendimentoTotal");
      const totalGuardadoAgora = somaTotalCaixinhas(state.caixinhas);

      function somaPendenteDoMesAtual(lista) {
        return (lista || []).reduce((acc, item) => {
          if (estaPendente(item) && !ehDoProximoMes(item)) return acc + (Number(item.valor) || 0);
          return acc;
        }, 0);
      }
      const ganhosAReceber = somaPendenteDoMesAtual(state.ganhos);
      const gastosFixosAPagar = somaPendenteDoMesAtual(state.gastosFixos);
      const gastosVariaveisAPagar = somaPendenteDoMesAtual(state.gastosVariaveis);

      const totaisAnoAtualFechados = totaisDoAnoHistorico(anoAtualNum);
      const totaisAnoAnterior = totaisDoAnoHistorico(anoAtualNum - 1);

      const resumo = {
        pessoa: nomePessoa,
        moeda: "BRL",
        descricaoDoPeriodo: `Comparação entre o mês atual (${nomeMesAtual}/${anoAtualNum}, ainda em andamento) e o mês passado já fechado`,
        mesAtual: {
          nome: nomeMesAtual,
          ano: anoAtualNum,
          ganhosRecebidos,
          gastosFixosPagos,
          gastosVariaveisPagos,
          saldoDisponivelAgora: ganhosRecebidos - gastosFixosPagos - gastosVariaveisPagos,
          guardadoNoMes,
          categorias: categoriasMesAtual(),
          aindaAReceberEsseMes: ganhosAReceber > 0 ? ganhosAReceber : 0,
          aindaAPagarFixosEsseMes: gastosFixosAPagar > 0 ? gastosFixosAPagar : 0,
          aindaAPagarVariaveisEsseMes: gastosVariaveisAPagar > 0 ? gastosVariaveisAPagar : 0,
        },
        mesPassado: mesPassadoObj ? {
          nome: mesPassadoObj.nome,
          ano: mesPassadoObj.ano,
          ganhos: totalGanhosDeUmMesHistorico(mesPassadoObj),
          gastos: totalDebitosDeUmMesHistorico(mesPassadoObj),
          guardadoNoMes: totalGuardadoNoMesDeUmMesHistorico(mesPassadoObj),
          categorias: categoriasDeUmMesHistorico(mesPassadoObj),
        } : "Ainda não há nenhum mês fechado no histórico",
        mesmoMesAnoPassado: mesmoMesAnoPassadoObj ? {
          nome: nomeMesAtual,
          ano: anoAtualNum - 1,
          ganhos: totalGanhosDeUmMesHistorico(mesmoMesAnoPassadoObj),
          gastos: totalDebitosDeUmMesHistorico(mesmoMesAnoPassadoObj),
          guardadoNoMes: totalGuardadoNoMesDeUmMesHistorico(mesmoMesAnoPassadoObj),
          categorias: categoriasDeUmMesHistorico(mesmoMesAnoPassadoObj),
        } : `Ainda não há dados de ${nomeMesAtual}/${anoAtualNum - 1} no histórico`,
        anoAtualAteAgora: {
          ano: anoAtualNum,
          mesesFechadosNesteAno: totaisAnoAtualFechados.mesesFechados,
          ganhos: totaisAnoAtualFechados.ganhos + ganhosRecebidos,
          gastos: totaisAnoAtualFechados.gastos + gastosFixosPagos + gastosVariaveisPagos,
          guardado: totalGuardadoLiquidoNoPeriodo(totalGuardadoAgora, anoAtualNum - 1),
          observacao: `Soma dos ${totaisAnoAtualFechados.mesesFechados} meses já fechados de ${anoAtualNum} mais o mês atual (${nomeMesAtual}), que ainda está em andamento`,
        },
        anoAnteriorCompleto: totaisAnoAnterior.mesesFechados > 0 ? {
          ano: anoAtualNum - 1,
          mesesFechados: totaisAnoAnterior.mesesFechados,
          ganhos: totaisAnoAnterior.ganhos,
          gastos: totaisAnoAnterior.gastos,
          guardado: totalGuardadoLiquidoNoPeriodo(totalGuardadoNoFimDoAno(anoAtualNum - 1), anoAtualNum - 2),
        } : `Ainda não há nenhum mês fechado de ${anoAtualNum - 1} no histórico`,
        totalGuardadoAtualDeVerdade: totalGuardadoAgora,
        caixinhas: caixinhas.length ? caixinhas : "Nenhuma caixinha cadastrada ainda",
        rendimentoTotalAcumuladoEmTodasAsCaixinhas: totalRendimentoAcumulado,
        lancamentosComNomeDoMesAtual: lancamentosComNomeDoMes(),
      };

      if (state.pessoaAtual === "ambos") {
        const transferencias = transferenciasDoMes();
        resumo.transferenciasEntreOsDoisEsseMes = transferencias.length ? transferencias : "Nenhuma transferência entre os dois esse mês";
        resumo.mesAtual.porPessoa = resumoPorPessoaMesAtual();
        if (mesPassadoObj) resumo.mesPassado.porPessoa = porPessoaDeUmMesHistorico(mesPassadoObj);
      }

      return resumo;
    }

    function renderizarTextoInsight(texto) {
      const seguro = escapeHtml(String(texto || ""));
      return seguro
        .replace(/\{\{ganho:([^{}]+)\}\}/gi, '<span class="insight-valor-pos">$1</span>')
        .replace(/\{\{gasto:([^{}]+)\}\}/gi, '<span class="insight-valor-neg">$1</span>')
        .replace(/\{\{guardado:([^{}]+)\}\}/gi, '<span class="insight-valor-guardado">$1</span>')
        .replace(/\{\{rendimento:([^{}]+)\}\}/gi, '<span class="insight-valor-rendimento">$1</span>')
        .replace(/\{\{\+([^{}]+)\}\}/g, '<span class="insight-valor-pos">$1</span>')
        .replace(/\{\{-([^{}]+)\}\}/g, '<span class="insight-valor-neg">$1</span>')
        .replace(/\{\{([^{}]+)\}\}/g, "$1");
    }

    let insightTextoAtualExibido = null;

    function mostrarInsightTexto(texto, modo) {
      const el = document.getElementById("insightTexto");
      if (!el) return;

      if (modo === "ia" && texto === insightTextoAtualExibido && el.classList.contains("is-ia")) {
        return;
      }

      const aplicarConteudo = () => {
        el.classList.remove("is-ia", "is-erro", "is-carregando", "is-trocando");
        if (modo) el.classList.add(`is-${modo}`);
        el.innerHTML = modo === "carregando"
          ? '<span class="insight-loading" role="status" aria-label="Carregando insight"><span></span><span></span><span></span></span>'
          : renderizarTextoInsight(texto);
        if (modo === "ia") insightTextoAtualExibido = texto;
      };

      if (el.innerHTML.trim()) {
        el.classList.add("is-trocando");
        setTimeout(aplicarConteudo, 200);
      } else {
        aplicarConteudo();
      }
    }

    const INSIGHT_CACHE_PREFIX = "caixaInsightTexto:";
    const INSIGHT_FILA_PREFIX = "caixaInsightFila:";
    const INSIGHT_ESTOQUE_MINIMO = 2;

    function getInsightCache(pessoa) {
      try { return localStorage.getItem(INSIGHT_CACHE_PREFIX + pessoa); } catch (err) { return null; }
    }
    function setInsightCache(pessoa, texto) {
      try { localStorage.setItem(INSIGHT_CACHE_PREFIX + pessoa, texto); } catch (err) {}
    }
    function getInsightFila(pessoa) {
      try { return JSON.parse(localStorage.getItem(INSIGHT_FILA_PREFIX + pessoa) || "[]"); } catch (err) { return []; }
    }
    function setInsightFila(pessoa, lista) {
      try { localStorage.setItem(INSIGHT_FILA_PREFIX + pessoa, JSON.stringify(lista || [])); } catch (err) {}
    }

    function exibirInsightCacheOuPlaceholder() {
      const fila = getInsightFila(state.pessoaAtual);
      const cache = fila[0] || getInsightCache(state.pessoaAtual);
      mostrarInsightTexto(cache || "Sincronizando pra trazer um insight sobre suas finanças…", cache ? "ia" : "carregando");
    }

    async function pedirLoteDeInsights(pessoaDoPedido) {
      if (!state.historico) {
        await carregarHistorico();
        if (state.pessoaAtual !== pessoaDoPedido) throw new Error("__pessoa_trocou__");
      }
      const resumo = montarResumoParaInsight();
      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "gerarInsightIA", pessoa: pessoaDoPedido, periodo: "mes-vs-anterior", resumo }),
      });
      const data = await res.json().catch(() => null);
      if (state.pessoaAtual !== pessoaDoPedido) throw new Error("__pessoa_trocou__");
      if (!data || data.ok === false || !Array.isArray(data.textos) || !data.textos.length) {
        throw new Error((data && data.error) || "Erro desconhecido");
      }
      return data.textos;
    }

    async function atualizarInsightComIA() {
      if (!API_URL || API_URL.includes("COLE_AQUI")) return;
      if (!navigator.onLine) return; 

      const pessoaDoPedido = state.pessoaAtual;
      const fila = getInsightFila(pessoaDoPedido);

      if (fila.length > 0) {
        const proximo = fila.shift();
        setInsightFila(pessoaDoPedido, fila);
        setInsightCache(pessoaDoPedido, proximo);
        mostrarInsightTexto(proximo, "ia");
        if (fila.length >= INSIGHT_ESTOQUE_MINIMO) return; 

        pedirLoteDeInsights(pessoaDoPedido)
          .then((textos) => {
            if (state.pessoaAtual !== pessoaDoPedido) return;
            setInsightFila(pessoaDoPedido, getInsightFila(pessoaDoPedido).concat(textos));
          })
          .catch(() => {});
        return;
      }

      mostrarInsightTexto("Analisando os números…", "carregando");
      try {
        const textos = await pedirLoteDeInsights(pessoaDoPedido);
        const primeiro = textos.shift();
        setInsightCache(pessoaDoPedido, primeiro);
        setInsightFila(pessoaDoPedido, textos);
        mostrarInsightTexto(primeiro, "ia");
      } catch (err) {
        if (err && err.message === "__pessoa_trocou__") return;
        const detalhe = err && err.message ? `: ${err.message}` : ".";
        mostrarInsightTexto(`Não consegui gerar o insight agora${detalhe} Toque aqui pra tentar de novo.`, "erro");
      }
    }

    function tentarDeNovoInsightSeErro() {
      const el = document.getElementById("insightTexto");
      if (el && el.classList.contains("is-erro")) atualizarInsightComIA();
    }

    function agregarCategoriasDoAno(meses, pessoa) {
      const total = {};
      meses.forEach((m) => {
        const mapas =
          pessoa === "ambos"
            ? [m.categoriasDavi || {}, m.categoriasGabriel || {}]
            : [pessoa === "gabriel" ? m.categoriasGabriel || {} : m.categoriasDavi || {}];
        mapas.forEach((mapa) => {
          Object.keys(mapa).forEach((cat) => {
            total[cat] = (total[cat] || 0) + (Number(mapa[cat]) || 0);
          });
        });
      });
      return total;
    }

    function construirPaginaCategoriasHistorico(meses, pessoa, ano) {
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

      if (donut) {
        donut.style.background = `conic-gradient(var(--gold) 0% ${corte1}%, var(--expense) ${corte1}% ${corte2}%, var(--income) ${corte2}% 100%)`;
      }
      if (centro) {
        centro.innerHTML = `${spanCentro(fmt(totalGanhos))}<small>GANHO</small>`;
      }
      if (legend) {
        legend.innerHTML = `
          <div class="split-legend-item">
            <span class="dot" style="background:var(--gold)"></span>
            Guardado <strong>${pctGuardado.toFixed(0)}%</strong>
          </div>
          <div class="split-legend-item">
            <span class="dot" style="background:var(--expense)"></span>
            Gastos <strong>${pctGastos.toFixed(0)}%</strong>
          </div>
          <div class="split-legend-item">
            <span class="dot" style="background:var(--income)"></span>
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
      [...state.gastosFixos.filter(fixoEhPago), ...state.gastosVariaveis.filter(variavelContaNoSaldo)].forEach((item) => {
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
        centro.innerHTML = `${spanCentro(fmt(restante))}<small>${restante < 0 ? "no vermelho" : "sobrando"}</small>`;
      }

      const legend = document.getElementById("splitLegend");
      if (legend) {
        legend.innerHTML = `
          <div class="split-legend-item">
            <span class="dot" style="background:var(--income)"></span> Davi gastou <strong>${pctDavi.toFixed(0)}%</strong>
          </div>
          <div class="split-legend-item">
            <span class="dot" style="background:var(--expense)"></span> Gabriel gastou <strong>${pctGabriel.toFixed(0)}%</strong>
          </div>
          <div class="split-legend-item">
            <span class="dot" style="background:var(--line-soft)"></span> Ainda sobrando <strong>${pctRestante.toFixed(0)}%</strong>
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
      if (variaveisEl) variaveisEl.innerHTML = ["davi", "gabriel"].map((p) => cardJuntos(p, somaVariaveisPagas(variaveisPorPessoa[p]), soma(variaveisPorPessoa[p]), "expense")).join("");
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

    async function getCacheHistorico() { return idbGet(IDB_LOJA_CACHE, CACHE_PREFIX + "historico"); }
    async function setCacheHistorico(data) { return idbSet(IDB_LOJA_CACHE, CACHE_PREFIX + "historico", { anos: data.anos || [] }); }

    async function carregarHistorico() {
      const cache = await getCacheHistorico();
      if (cache) {
        state.historico = cache;
        renderHistorico();
      } else {
        renderHistoricoSkeleton();
      }
      if (!API_URL || API_URL.includes("COLE_AQUI")) return;
      try {
        const res = await fetch(`${API_URL}?pessoa=historico`);
        const data = await res.json();
        if (data && data.ok === false) throw new Error(data.error || "Erro desconhecido");
        state.historico = data;
        if (data.mesAtual) state.mesAtual = data.mesAtual;
        if (data.anoAtual) state.anoAtual = data.anoAtual;
        renderMesAtual();
        setCacheHistorico(data);
        renderHistorico();
      } catch (err) {
        if (!cache) {
          const wrap = document.getElementById("historicoLista");
          if (wrap) wrap.innerHTML = `<p class="empty-state">Não consegui carregar o histórico agora.</p>`;
        }
      }
    }

    function renderHistoricoSkeleton() {
      const wrap = document.getElementById("historicoLista");
      if (!wrap) return;
      wrap.innerHTML = Array.from({ length: 2 }).map(() => `
          <div class="historico-mes-card">
            <div class="skeleton" style="width:40%;height:16px;margin-bottom:12px;">.</div>
            <div class="skeleton" style="width:100%;height:13px;margin-bottom:8px;">.</div>
            <div class="skeleton" style="width:100%;height:13px;">.</div>
          </div>`).join("");
    }

    function construirGraficoHistoricoMultiSvg(mesesAsc, pessoa) {
      const W = 320, H = 160, padL = 14, padR = 14, padT = 16, padB = 28;

      const getVal = (m, campo) => {
        if (pessoa === 'ambos') return (m[`${campo}Davi`] || 0) + (m[`${campo}Gabriel`] || 0);
        const sufixo = pessoa.charAt(0).toUpperCase() + pessoa.slice(1);
        return m[`${campo}${sufixo}`] || 0;
      };

      const ptsGanhos = mesesAsc.map(m => getVal(m, 'ganhos'));
      const ptsDebitos = mesesAsc.map(m => getVal(m, 'debitos'));
      const ptsGuardado = mesesAsc.map(m => getVal(m, 'guardadoMes'));
      const ptsRendimento = mesesAsc.map(m => getVal(m, 'rendimento'));

      const todos = [...ptsGanhos, ...ptsDebitos, ...ptsGuardado, ...ptsRendimento];
      let min = Math.min(0, ...todos);
      let max = Math.max(0, ...todos);
      if (min === max) max = min + 1;

      const amplitude = max - min;
      min -= amplitude * 0.05;
      max += amplitude * 0.15; 

      const n = mesesAsc.length;
      const passoX = n > 1 ? (W - padL - padR) / (n - 1) : 0;
      const x = (i) => n === 1 ? W / 2 : padL + i * passoX;
      const y = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));

      const caminhoSuave = (pts) => {
        if (pts.length === 0) return "";
        let d = `M${x(0).toFixed(1)},${y(pts[0]).toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const cpX = (x(i) + x(i + 1)) / 2;
          d += ` C${cpX.toFixed(1)},${y(pts[i]).toFixed(1)} ${cpX.toFixed(1)},${y(pts[i + 1]).toFixed(1)} ${x(i + 1).toFixed(1)},${y(pts[i + 1]).toFixed(1)}`;
        }
        return d;
      };

      const larguraFaixa = passoX > 0 ? passoX : W;

      const gruposMes = mesesAsc.map((m, i) => {
        const nomeMes = m.nome.charAt(0).toUpperCase() + m.nome.slice(1).toLowerCase();
        const vGanhos = getVal(m, 'ganhos');
        const vGastos = getVal(m, 'debitos');
        const vGuardado = getVal(m, 'guardadoMes');
        const vRendimento = getVal(m, 'rendimento');
        const cx = x(i).toFixed(1);
        
        const rx = (x(i) - larguraFaixa / 2).toFixed(1);

        return `
          <g class="mes-hover-group" data-mes="${nomeMes}" data-ganhos="${fmt(vGanhos)}" data-gastos="${fmt(vGastos)}" data-guardado="${fmt(vGuardado)}" data-rendimento="${fmt(vRendimento)}">
            <rect x="${rx}" y="0" width="${larguraFaixa}" height="${H}" fill="transparent" class="hover-area" />
            
            <line x1="${cx}" y1="${padT}" x2="${cx}" y2="${H - padB - 4}" stroke="var(--line)" stroke-dasharray="4,4" class="guia-vertical" />
            
            <circle cx="${cx}" cy="${y(vGanhos).toFixed(1)}" r="4.2" fill="var(--income)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
            <circle cx="${cx}" cy="${y(vGastos).toFixed(1)}" r="4.2" fill="var(--expense)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
            <circle cx="${cx}" cy="${y(vGuardado).toFixed(1)}" r="4.2" fill="var(--gold)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
            <circle cx="${cx}" cy="${y(vRendimento).toFixed(1)}" r="4.2" fill="var(--yield)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
          </g>
        `;
      }).join("");

      const rotulos = mesesAsc.map((m, i) => {
        const nomeCru = m.nome || "";
        const rotulo = /^\d{4}$/.test(nomeCru) ? nomeCru : nomeCru.slice(0, 3).toUpperCase();
        return `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="9" text-anchor="middle" font-family="var(--font-mono)" font-weight="600" fill="var(--muted)">${escapeHtml(rotulo)}</text>`;
      }).join("");
      const linhaZero = y(0).toFixed(1);

      return `
        <div class="historico-grafico-wrap">
          <svg class="historico-grafico" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            <line x1="${padL}" y1="${linhaZero}" x2="${W - padR}" y2="${linhaZero}" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="4,4" />
            
            <path d="${caminhoSuave(ptsGanhos)}" fill="none" stroke="var(--income)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${caminhoSuave(ptsDebitos)}" fill="none" stroke="var(--expense)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${caminhoSuave(ptsGuardado)}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6,4" />
            <path d="${caminhoSuave(ptsRendimento)}" fill="none" stroke="var(--yield)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2,3" />
            
            ${gruposMes}
            ${rotulos}
          </svg>
          <div class="historico-grafico-legenda">
            <span class="legenda-item"><span class="legenda-dot" style="background:var(--income)"></span>Ganhos</span>
            <span class="legenda-item"><span class="legenda-dot" style="background:var(--expense)"></span>Gastos</span>
            <span class="legenda-item"><span class="legenda-dot" style="background:var(--gold)"></span>Guardado</span>
            <span class="legenda-item"><span class="legenda-dot" style="background:var(--yield)"></span>Rendimento</span>
          </div>
        </div>`;
    }

    function renderHistorico() {
      const wrap = document.getElementById("historicoLista");
      const controles = document.getElementById("historicoControles");
      const selectAno = document.getElementById("historicoAnoSelect");
      if (!wrap) return;

      const anos = (state.historico && state.historico.anos) || [];
      if (anos.length === 0) {
        if (controles) controles.style.display = "none";
        wrap.innerHTML = estadoVazio('Nenhum mês fechado ainda.', ICONE_LIVRO);
        return;
      }

      if (controles) controles.style.display = "block";

      if (selectAno && selectAno.options.length !== anos.length + 1) {
        selectAno.innerHTML = "";
        const optTodos = document.createElement("option");
        optTodos.value = "todos";
        optTodos.textContent = "Todos os anos";
        selectAno.appendChild(optTodos);
        [...anos].sort((a, b) => b.ano - a.ano).forEach(bloco => {
          const opt = document.createElement("option");
          opt.value = bloco.ano;
          opt.textContent = `Ano ${bloco.ano}`;
          selectAno.appendChild(opt);
        });
      }

      let anoAlvo = state.historicoAnoSelecionado;
      if (anoAlvo !== "todos" && !anos.find(a => a.ano === anoAlvo)) {
        anoAlvo = anos[0].ano;
        state.historicoAnoSelecionado = anoAlvo;
      }
      if (selectAno) selectAno.value = anoAlvo;

      const modoTodos = anoAlvo === "todos";
      if (!modoTodos && !anos.find(a => a.ano === anoAlvo)) return;

      const pessoa = state.pessoaAtual;
      const getVal = (m, campo) => {
        if (pessoa === 'ambos') return (m[`${campo}Davi`] || 0) + (m[`${campo}Gabriel`] || 0);
        const sufixo = pessoa.charAt(0).toUpperCase() + pessoa.slice(1);
        return m[`${campo}${sufixo}`] || 0;
      };

      const paginaAnterior = paginaCarrosselAtiva("historicoGraficosCarousel");

      const camposSoma = ["ganhosDavi", "ganhosGabriel", "debitosDavi", "debitosGabriel", "guardadoMesDavi", "guardadoMesGabriel", "saldoDavi", "saldoGabriel", "rendimentoDavi", "rendimentoGabriel"];
      
      const agregarAnoComoRegistro = (bloco) => {
        const registro = { nome: String(bloco.ano), mes: bloco.ano };
        camposSoma.forEach((c) => { registro[c] = 0; });
        bloco.meses.forEach((m) => camposSoma.forEach((c) => { registro[c] += (m[c] || 0); }));
        return registro;
      };

      let mesesAscendentes, mesesOrdenados, mesesParaCategorias;
      if (modoTodos) {
        const registrosPorAno = [...anos].sort((a, b) => a.ano - b.ano).map(agregarAnoComoRegistro);
        mesesAscendentes = registrosPorAno;
        mesesOrdenados = [...registrosPorAno].sort((a, b) => b.mes - a.mes);
        mesesParaCategorias = anos.flatMap((a) => a.meses);
      } else {
        const bloco = anos.find(a => a.ano === anoAlvo);
        mesesAscendentes = [...bloco.meses].sort((a, b) => a.mes - b.mes);
        mesesOrdenados = [...bloco.meses].sort((a, b) => b.mes - a.mes);
        mesesParaCategorias = bloco.meses;
      }

      const grafico = construirGraficoHistoricoMultiSvg(mesesAscendentes, pessoa);
      const paginaCategorias = construirPaginaCategoriasHistorico(mesesParaCategorias, pessoa, modoTodos ? "todos" : anoAlvo);

      const cards = mesesOrdenados.map((m) => {
        const ganhos = getVal(m, 'ganhos');
        const debitos = getVal(m, 'debitos');
        const guardado = getVal(m, 'guardadoMes');
        const rendimento = getVal(m, 'rendimento');
        const saldo = getVal(m, 'saldo');
        const nomeMes = modoTodos ? `Ano ${m.nome}` : (m.nome.charAt(0) + m.nome.slice(1).toLowerCase());

        return `
        <div class="historico-mes-card">
          <div class="historico-mes-head">
            <span class="historico-mes-nome">${nomeMes}</span>
            <span class="historico-mes-saldo ${saldo < 0 ? "negative" : ""}">${fmt(saldo)}</span>
          </div>
          <div class="historico-mes-linha">
            <span>Ganhos</span><span class="income">${fmt(ganhos)}</span>
          </div>
          <div class="historico-mes-linha">
            <span>Débitos</span><span class="expense">${fmt(Math.abs(debitos))}</span>
          </div>
          ${guardado > 0 ? `<div class="historico-mes-linha"><span>Guardado</span><span class="gold">${fmt(guardado)}</span></div>` : ""}
          ${rendimento > 0 ? `<div class="historico-mes-linha"><span>Rendeu no mês</span><span class="income">+ ${fmt(rendimento)}</span></div>` : ""}
          ${pessoa === 'ambos' ? `
          <div class="historico-mes-pessoas">
            <span class="pessoa-tag pessoa-davi">Davi ${fmt(m.saldoDavi)}</span>
            <span class="pessoa-tag pessoa-gabriel">Gabriel ${fmt(m.saldoGabriel)}</span>
          </div>` : ''}
        </div>`;
      }).join("");

      let alturaFixa = "";
      const carrosselAtual = document.getElementById("historicoGraficosCarousel");
      if (carrosselAtual && carrosselAtual.style.height) {
        alturaFixa = `height: ${carrosselAtual.style.height};`;
      }

      wrap.innerHTML = `
        <div class="historico-ano-bloco">
          <div class="graficos-carousel-wrap">
            <div class="graficos-carousel" id="historicoGraficosCarousel" style="${alturaFixa}">
              ${grafico}
              ${paginaCategorias}
            </div>
            <div class="graficos-dots is-hidden" id="historicoGraficosDots" aria-hidden="true"></div>
          </div>
          ${cards}
        </div>`;

      atualizarCarrosselGraficos("historicoGraficosCarousel", "historicoGraficosDots");
      restaurarPaginaCarrossel("historicoGraficosCarousel", "historicoGraficosDots", paginaAnterior);
    }

    function getColapsoState() {
      try {
        const raw = localStorage.getItem(COLAPSO_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (err) { return {}; }
    }
    function setColapsoState(estado) {
      try { localStorage.setItem(COLAPSO_STORAGE_KEY, JSON.stringify(estado)); } catch (err) {}
    }

    function aplicarColapso(btn, alvo, colapsado) {
      alvo.classList.toggle("is-collapsed", colapsado);
      btn.classList.toggle("is-collapsed", colapsado);
      btn.setAttribute("aria-expanded", String(!colapsado));
    }

    function initGavetas() {
      const estado = getColapsoState();
      document.querySelectorAll(".collapse-toggle").forEach((btn) => {
        const chave = btn.dataset.collapse;
        const alvo = document.getElementById("collapsible-" + chave);
        if (!alvo) return;
        const colapsado = estado[chave] === undefined ? true : !!estado[chave];
        alvo.classList.add("sem-transicao-inicial");
        btn.classList.add("sem-transicao-inicial");
        aplicarColapso(btn, alvo, colapsado);
        void alvo.offsetHeight; 
        requestAnimationFrame(() => {
          alvo.classList.remove("sem-transicao-inicial");
          btn.classList.remove("sem-transicao-inicial");
        });
        btn.addEventListener("click", () => {
          const novoColapsado = !alvo.classList.contains("is-collapsed");
          aplicarColapso(btn, alvo, novoColapsado);
          const estadoAtual = getColapsoState();
          estadoAtual[chave] = novoColapsado;
          setColapsoState(estadoAtual);
        });
      });
    }

    function posicionarIndicadorAba() {
      const indicador = document.getElementById("tabIndicator");
      const tabbar = document.getElementById("tabbar");
      if (!indicador || !tabbar) return;
      const ativa = tabbar.querySelector(".tab-btn.is-active:not(.is-hidden)");
      if (!ativa) {
        indicador.classList.remove("is-visible");
        return;
      }
      const largura = 26;
      indicador.style.width = largura + "px";
      indicador.style.left = ativa.offsetLeft + (ativa.offsetWidth - largura) / 2 + "px";
      indicador.classList.add("is-visible");
    }

    const tabbarEl = document.getElementById("tabbar");
    if (tabbarEl) {
      tabbarEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".tab-btn");
        if (!btn) return;
        const tab = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-hidden", p.dataset.tab !== tab));
        window.scrollTo({ top: 0, behavior: "smooth" });
        posicionarIndicadorAba();
        if (tab === "historico") carregarHistorico();
      });
    }
    window.addEventListener("resize", posicionarIndicadorAba);

    const personSwitchEl = document.getElementById("personSwitch");
    if (personSwitchEl) {
      personSwitchEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".person-btn");
        if (!btn) return;
        trocarPessoa(btn.dataset.pessoa);
      });
    }

    function parseValor(v) {
      if (v === null || v === undefined) return 0;
      const texto = String(v).trim();
      if (!texto) return 0;
      const normalizado = texto.indexOf(",") !== -1 ? texto.replace(/\./g, "").replace(",", ".") : texto;
      const num = parseFloat(normalizado);
      return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
    }

    function aplicarMascaraMoeda(el) {
      if (!el) return;
      el.addEventListener("input", () => {
        let digitos = el.value.replace(/\D/g, "");
        if (!digitos) { el.value = ""; return; }
        digitos = digitos.replace(/^0+(?=\d)/, ""); 
        while (digitos.length < 3) digitos = "0" + digitos; 
        const centavos = digitos.slice(-2);
        const inteiros = digitos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        el.value = `${inteiros},${centavos}`;
      });
    }

    function aplicarMascaraMoedaEmTodos() {
      ["#formGanhos [name=valor]", "#formFixos [name=valor]", "#formVariaveis [name=valor]"].forEach((sel) => {
        document.querySelectorAll(sel).forEach(aplicarMascaraMoeda);
      });
      ["aporteValor", "editValor", "dividirValor", "transferirValor"].forEach((id) =>
        aplicarMascaraMoeda(document.getElementById(id))
      );
      const form = document.getElementById("formCaixinhas");
      if (form) {
        aplicarMascaraMoeda(form.querySelector("[name=valorInicial]"));
        aplicarMascaraMoeda(form.querySelector("[name=valorObjetivo]"));
      }
    }

    function on(id, evento, handler) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(evento, handler);
    }

    on("formGanhos", "submit", (e) => {
      e.preventDefault();
      if (isAmbos()) return;
      const f = e.target;
      const nome = f.nome.value.trim();
      const valor = parseValor(f.valor.value);
      if (!nome || !(valor > 0)) return;
      const recebido = f.recebido ? f.recebido.checked : false;
      const data = f.data ? f.data.value : "";
      opGanhos.add(nome, valor, { recebido, data });
      f.reset();
      preencherDatasComHoje();
    });

    function parcelaValida(texto) {
      const v = String(texto || "").trim();
      if (!v) return true;
      return /^\d+\s*\/\s*\d+$/.test(v);
    }

    on("formFixos", "submit", (e) => {
      e.preventDefault();
      if (isAmbos()) return;
      const f = e.target;
      const nome = f.nome.value.trim();
      const valorTotal = parseValor(f.valor.value);
      if (!nome || !(valorTotal > 0)) return;
      const pago = f.pago ? f.pago.checked : false;
      const tipo = f.tipo ? f.tipo.value : "";
      const data = f.data ? f.data.value : "";

      const numParcelas = f.parcelas ? Number(f.parcelas.value) : 0;
      let valor = valorTotal;
      let parcela = "";
      if (numParcelas > 0) {
        valor = Math.round((valorTotal / numParcelas) * 100) / 100;
        parcela = `1/${numParcelas}`;
      }

      opFixos.add(nome, valor, { pago, tipo, data, parcela });
      f.reset();
      preencherDatasComHoje();
    });

    on("formVariaveis", "submit", (e) => {
      e.preventDefault();
      if (isAmbos()) return;
      const f = e.target;
      const nome = f.nome.value.trim();
      const valor = parseValor(f.valor.value);
      if (!nome || !(valor > 0)) return;
      const pago = f.pago ? f.pago.checked : false;
      const tipo = f.tipo ? f.tipo.value : "";
      const data = f.data ? f.data.value : "";
      opVariaveis.add(nome, valor, { pago, tipo, data });
      f.reset();
      preencherDatasComHoje();
    });

    // ========== NOVO: SUBMIT CAIXINHAS LENDO ÍCONE ==========
    on("formCaixinhas", "submit", (e) => {
      e.preventDefault();
      if (isAmbos()) return;
      const f = e.target;
      const nome = f.nome.value.trim();
      const valorInicial = f.valorInicial.value ? parseValor(f.valorInicial.value) : 0;
      const valorObjetivo = f.valorObjetivo.value ? parseValor(f.valorObjetivo.value) : 0;
      const icone = f.icone_caixinha ? f.icone_caixinha.value : ""; // Captura o ícone

      if (!nome || valorInicial < 0) return;
      addCaixinha(nome, valorInicial, valorObjetivo, icone);
      f.reset();
      renderIconSelector("caixaIconContainer", "icone_caixinha", ""); // reseta
    });

    let onConfirmarValor = null;
    let valorMinimoModal = null;
    const modalBackdrop = document.getElementById("modalBackdrop");

    function abrirModalValor(titulo, callback, textoBotao, valorInicial, dica, minimo, opts) {
      if (isAmbos()) return;
      onConfirmarValor = callback;
      valorMinimoModal = typeof minimo === "number" ? minimo : null;
      document.getElementById("modalTitle").textContent = titulo;
      const inputValor = document.getElementById("aporteValor");
      inputValor.value = valorInicial ? fmtCampo(valorInicial) : "";
      inputValor.classList.remove("input-erro");
      const elHint = document.getElementById("modalHint");
      if (elHint) {
        elHint.textContent = dica || "";
        elHint.classList.toggle("is-hidden", !dica);
      }
      const botaoConfirmar = document.getElementById("modalConfirmar");
      if (botaoConfirmar) botaoConfirmar.textContent = textoBotao || "Guardar";
      modalBackdrop.classList.remove("is-hidden");
      if (!opts || !opts.semHistorico) registrarAberturaModal("modalBackdrop");
      setTimeout(() => {
        inputValor.focus();
        inputValor.select();
      }, 50);
    }
    
    function fecharModal() {
      fecharComHistorico("modalBackdrop", () => {
        modalBackdrop.classList.add("is-hidden");
        onConfirmarValor = null;
        valorMinimoModal = null;
        document.getElementById("aporteValor").classList.remove("input-erro");
      });
    }
    FECHADORES_MODAL.modalBackdrop = fecharModal;
    on("modalCancelar", "click", fecharModal);
    if (modalBackdrop) {
      modalBackdrop.addEventListener("click", (e) => {
        if (e.target === modalBackdrop) fecharModal();
      });
    }

    on("aporteValor", "input", (e) => {
      if (valorMinimoModal == null) return;
      const valor = parseValor(e.target.value);
      e.target.classList.toggle("input-erro", e.target.value !== "" && valor < valorMinimoModal);
    });

    on("formAporte", "submit", (e) => {
      e.preventDefault();
      if (isAmbos()) return;
      const inputValor = document.getElementById("aporteValor");
      const valor = parseValor(inputValor.value);
      if (!(valor > 0) || !onConfirmarValor) return;
      if (valorMinimoModal != null && valor < valorMinimoModal) {
        inputValor.classList.add("input-erro");
        inputValor.classList.remove("input-tremer");
        void inputValor.offsetWidth; 
        inputValor.classList.add("input-tremer");
        showToast(`O valor não pode ser menor que o que já está guardado (${fmt(valorMinimoModal)})`);
        return;
      }
      onConfirmarValor(valor);
      fecharModal();
    });

    const TITULOS_CAIXINHA = {
      guardar: (nome) => `Guardar em — ${nome}`,
      retirar: (nome) => `Retirar de — ${nome}`,
      rendimento: (nome) => `Rendimento ganho — ${nome}`,
    };
    const BOTOES_CAIXINHA = {
      guardar: "Guardar",
      retirar: "Retirar",
      rendimento: "Confirmar",
    };
    function abrirModalCaixinha(acao, idx, opts) {
      const cx = state.caixinhas[idx];
      if (!cx) return;
      const titulo = TITULOS_CAIXINHA[acao](cx.nome);
      const acoes = {
        guardar: (valor) => guardarNaCaixinha(idx, valor),
        retirar: (valor) => retirarDaCaixinha(idx, valor),
        rendimento: (valor) => informarRendimentoCaixinha(idx, valor),
      };

      const totalAtualCaixinha = totalCaixinha(cx);
      const valorInicial = acao === "rendimento" ? totalAtualCaixinha : null;
      const dica = acao === "rendimento"
        ? "Digite o valor TOTAL que a caixinha tem hoje (não só o quanto rendeu) — o app calcula a diferença sozinho."
        : null;
      const minimo = acao === "rendimento" ? totalAtualCaixinha : null;
      abrirModalValor(titulo, acoes[acao], BOTOES_CAIXINHA[acao], valorInicial, dica, minimo, opts);
    }

    let editContext = null; 
    const editBackdrop = document.getElementById("editBackdrop");
    const TITULOS_EDICAO = {
      ganhos: "Editar ganho",
      fixos: "Editar gasto fixo",
      variaveis: "Editar gasto variável",
      caixinhas: "Editar caixinha",
    };
    const EDICAO_TEM_CATEGORIA = { fixos: true, variaveis: true };
    const EDICAO_TEM_DATA = { ganhos: true, fixos: true, variaveis: true };
    const EDICAO_TEM_PARCELA = { fixos: true };

    // ========== NOVO: ABRIR MODAL EDITAR COM ÍCONES ==========
    function abrirModalEditar(tipo, idx, item) {
      if (isAmbos()) return;
      editContext = { tipo, idx };
      const tituloEl = document.getElementById("editTitle");
      if (tituloEl) tituloEl.textContent = TITULOS_EDICAO[tipo] || "Editar item";
      document.getElementById("editNome").value = item.nome;
      const valorEl = document.getElementById("editValor");
      valorEl.value = item.valor ? fmtCampo(item.valor) : "";
      valorEl.placeholder = tipo === "caixinhas" ? "Objetivo, R$ (0 = sem meta)" : "0,00";

      const categoriaEl = document.getElementById("editCategoria");
      const dataEl = document.getElementById("editData");
      const parcelaEl = document.getElementById("editParcela");
      const temCategoria = !!EDICAO_TEM_CATEGORIA[tipo];
      const temData = !!EDICAO_TEM_DATA[tipo];
      const temParcela = !!EDICAO_TEM_PARCELA[tipo];

      if (categoriaEl) {
        categoriaEl.classList.toggle("is-hidden", !temCategoria);
        categoriaEl.value = temCategoria ? item.tipo || "" : "";
      }
      if (dataEl) {
        dataEl.classList.toggle("is-hidden", !temData);
        dataEl.value = temData ? item.data || "" : "";
      }
      if (parcelaEl) {
        parcelaEl.classList.toggle("is-hidden", !temParcela);
        parcelaEl.value = temParcela ? item.parcela || "" : "";
      }

      // Mostra o seletor de ícones apenas se for uma edição de caixinha
      const wrapperIcone = document.getElementById("editIconContainerWrapper");
      if (wrapperIcone) {
        if (tipo === "caixinhas") {
          wrapperIcone.classList.remove("is-hidden");
          renderIconSelector("editIconContainer", "edit_icone_caixinha", item.icone);
        } else {
          wrapperIcone.classList.add("is-hidden");
        }
      }

      if (editBackdrop) editBackdrop.classList.remove("is-hidden");
      registrarAberturaModal("editBackdrop");
      setTimeout(() => document.getElementById("editNome").focus(), 50);
    }
    
    function fecharModalEditar() {
      fecharComHistorico("editBackdrop", () => {
        if (editBackdrop) editBackdrop.classList.add("is-hidden");
        editContext = null;
      });
    }
    FECHADORES_MODAL.editBackdrop = fecharModalEditar;
    on("editCancelar", "click", fecharModalEditar);
    if (editBackdrop) {
      editBackdrop.addEventListener("click", (e) => {
        if (e.target === editBackdrop) fecharModalEditar();
      });
    }

    // ========== NOVO: SALVAR EDIÇÃO COM ÍCONE ==========
    on("formEditar", "submit", (e) => {
      e.preventDefault();
      if (!editContext || isAmbos()) return;
      const nome = document.getElementById("editNome").value.trim();
      const valor = parseValor(document.getElementById("editValor").value) || 0;
      const { tipo, idx } = editContext;
      if (!nome || (tipo !== "caixinhas" && !(valor > 0))) return;

      if (tipo === "fixos") {
        const parcela = document.getElementById("editParcela").value.trim();
        if (!parcelaValida(parcela)) {
          showToast('Parcela inválida — use o formato "atual/total", ex: 2/48.');
          return;
        }
      }

      if (tipo === "ganhos") {
        const data = document.getElementById("editData").value;
        opGanhos.edit(idx, nome, valor, { data });
      } else if (tipo === "fixos") {
        const categoria = document.getElementById("editCategoria").value;
        const data = document.getElementById("editData").value;
        const parcela = document.getElementById("editParcela").value.trim();
        opFixos.edit(idx, nome, valor, { tipo: categoria, data, parcela });
      } else if (tipo === "variaveis") {
        const categoria = document.getElementById("editCategoria").value;
        const data = document.getElementById("editData").value;
        opVariaveis.edit(idx, nome, valor, { tipo: categoria, data, lembrete: false });
      } else if (tipo === "caixinhas") {
        const icone = document.querySelector('input[name="edit_icone_caixinha"]:checked')?.value || "";
        editCaixinha(idx, nome, valor, icone);
      }
      fecharModalEditar();
    });

    const acoesBackdrop = document.getElementById("acoesBackdrop");
    const acoesMenuView = document.getElementById("acoesMenuView");
    const formDividir = document.getElementById("formDividir");
    const formTransferir = document.getElementById("formTransferir");
    let categoriaDividir = "variaveis";
    let direcaoTransferir = { de: "davi", para: "gabriel" };

    function abrirAcoesConjunto() {
      if (acoesMenuView) acoesMenuView.classList.remove("is-hidden");
      if (formDividir) formDividir.classList.add("is-hidden");
      if (formTransferir) formTransferir.classList.add("is-hidden");
      if (acoesBackdrop) acoesBackdrop.classList.remove("is-hidden");
      registrarAberturaModal("acoesBackdrop");
    }
    function fecharAcoesConjunto() {
      fecharComHistorico("acoesBackdrop", () => {
        if (acoesBackdrop) acoesBackdrop.classList.add("is-hidden");
      });
    }
    FECHADORES_MODAL.acoesBackdrop = fecharAcoesConjunto;
    on("btnAcoesConjunto", "click", () => {
      esconderDicaAcoesConjunto();
      abrirAcoesConjunto();
    });
    on("acoesFechar", "click", fecharAcoesConjunto);

    const CHAVE_DICA_ACOES = "caixa-dica-acoes-conjunto-vista";
    function jaViuDicaAcoesConjunto() {
      try { return localStorage.getItem(CHAVE_DICA_ACOES) === "1"; } catch { return false; }
    }
    function esconderDicaAcoesConjunto() {
      const tip = document.getElementById("acoesConjuntoTip");
      if (tip) {
        tip.classList.remove("is-visivel");
        setTimeout(() => tip.classList.add("is-hidden"), 250);
      }
      try { localStorage.setItem(CHAVE_DICA_ACOES, "1"); } catch {}
    }
    function mostrarDicaAcoesConjuntoSeNecessario() {
      if (jaViuDicaAcoesConjunto()) return;
      const tip = document.getElementById("acoesConjuntoTip");
      if (!tip) return;
      tip.classList.remove("is-hidden");
      requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add("is-visivel")));
      setTimeout(esconderDicaAcoesConjunto, 6000);
      document.addEventListener("pointerdown", (e) => {
          if (!e.target.closest("#btnAcoesConjunto")) esconderDicaAcoesConjunto();
        }, { once: true });
    }
    if (acoesBackdrop) {
      acoesBackdrop.addEventListener("click", (e) => {
        if (e.target === acoesBackdrop) fecharAcoesConjunto();
      });
    }

    const dividirQuemPagouEl = document.getElementById("dividirQuemPagou");
    const dividirPagoCheckbox = document.getElementById("dividirPago");
    const dividirPagoTexto = document.getElementById("dividirPagoTexto");
    const dividirHintEl = document.getElementById("dividirHint");

    function atualizarTextoDividir() {
      const valor = dividirQuemPagouEl ? dividirQuemPagouEl.value : "metade";
      if (valor === "metade") {
        if (dividirHintEl) dividirHintEl.textContent = "O valor total é dividido ao meio — metade entra no Davi, metade no Gabriel.";
        if (dividirPagoTexto) dividirPagoTexto.textContent = "Já está pago (as duas partes)";
      } else {
        const pagador = PESSOA_LABEL[valor];
        const devedor = PESSOA_LABEL[valor === "davi" ? "gabriel" : "davi"];
        if (dividirHintEl) dividirHintEl.textContent = `${pagador} paga o valor cheio agora; ${devedor} fica devendo a metade.`;
        if (dividirPagoTexto) dividirPagoTexto.textContent = `${devedor} já pagou a parte dele`;
      }
    }
    if (dividirQuemPagouEl) dividirQuemPagouEl.addEventListener("change", atualizarTextoDividir);

    on("btnAbrirDividir", "click", () => {
      if (acoesMenuView) acoesMenuView.classList.add("is-hidden");
      if (formDividir) formDividir.classList.remove("is-hidden");
      document.getElementById("dividirNome").value = "";
      document.getElementById("dividirValor").value = "";
      const dividirTipoEl = document.getElementById("dividirTipo");
      if (dividirTipoEl) dividirTipoEl.value = "";
      const dividirDataEl = document.getElementById("dividirData");
      if (dividirDataEl) dividirDataEl.value = dataHojeISO();
      if (dividirQuemPagouEl) dividirQuemPagouEl.value = "metade";
      if (dividirPagoCheckbox) dividirPagoCheckbox.checked = true;
      atualizarTextoDividir();
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

      const dividirTipoEl = document.getElementById("dividirTipo");
      const dividirDataEl = document.getElementById("dividirData");
      const tipo = dividirTipoEl ? dividirTipoEl.value : "";
      const data = dividirDataEl ? dividirDataEl.value : "";
      const pago = dividirPagoCheckbox ? dividirPagoCheckbox.checked : true;
      const quemPagouTudo = dividirQuemPagouEl && dividirQuemPagouEl.value !== "metade" ? dividirQuemPagouEl.value : null;

      const btnSubmit = document.getElementById("dividirSubmit");
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Dividindo…";
      }

      const ok = await dividirCompra(nome, valor, categoriaDividir, { tipo, data, pago, quemPagouTudo });

      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Dividir";
      }

      if (ok) {
        showToast(
          quemPagouTudo && !pago
            ? `"${nome}" lançado — ${PESSOA_LABEL[quemPagouTudo === "davi" ? "gabriel" : "davi"]} fica devendo a metade`
            : `"${nome}" dividido — metade pra cada um`
        );
        fecharAcoesConjunto();
        renderAll();
      } else {
        showToast("Não consegui dividir agora. Tenta de novo em instantes.");
      }
    });

    on("btnAbrirTransferir", "click", () => {
      if (acoesMenuView) acoesMenuView.classList.add("is-hidden");
      if (formTransferir) formTransferir.classList.remove("is-hidden");
      document.getElementById("transferirNome").value = "";
      document.getElementById("transferirValor").value = "";
      const categoriaEl = document.getElementById("transferirCategoria");
      if (categoriaEl) categoriaEl.value = "";
      direcaoTransferir = { de: "davi", para: "gabriel" };
      renderDirecaoTransferir();
      setTimeout(() => document.getElementById("transferirValor").focus(), 50);
    });
    on("transferirVoltar", "click", () => {
      if (formTransferir) formTransferir.classList.add("is-hidden");
      if (acoesMenuView) acoesMenuView.classList.remove("is-hidden");
    });
    on("transferirInverter", "click", () => {
      direcaoTransferir = { de: direcaoTransferir.para, para: direcaoTransferir.de };
      renderDirecaoTransferir();
    });

    function renderDirecaoTransferir() {
      const deEl = document.getElementById("transferirDe");
      const paraEl = document.getElementById("transferirPara");
      if (deEl) deEl.textContent = PESSOA_LABEL[direcaoTransferir.de];
      if (paraEl) paraEl.textContent = PESSOA_LABEL[direcaoTransferir.para];
    }

    function mostrarProcessando(id) {
      const overlay = document.getElementById(id);
      if (overlay) overlay.classList.remove("is-hidden");
    }
    function esconderProcessando(id) {
      const overlay = document.getElementById(id);
      if (overlay) overlay.classList.add("is-hidden");
    }

    on("formTransferir", "submit", async (e) => {
      e.preventDefault();
      const nome = document.getElementById("transferirNome").value.trim() || "Transferência";
      const valor = parseValor(document.getElementById("transferirValor").value);
      if (!(valor > 0)) return;
      const categoriaEl = document.getElementById("transferirCategoria");
      const tipo = categoriaEl ? categoriaEl.value : "";

      const btnSubmit = document.getElementById("transferirSubmit");
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Transferindo…";
      }
      mostrarProcessando("transferirOverlay");

      const { de, para } = direcaoTransferir;
      const ok = await transferirEntrePessoas(de, para, nome, valor, tipo);

      esconderProcessando("transferirOverlay");
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Transferir";
      }

      if (ok) {
        showToast(`${fmt(valor)} transferido de ${PESSOA_LABEL[de]} pra ${PESSOA_LABEL[para]}`);
        fecharAcoesConjunto();
        renderAll();
      } else {
        showToast("Não consegui transferir agora. Tenta de novo em instantes.");
      }
    });

    const fecharMesBackdrop = document.getElementById("fecharMesBackdrop");

    function abrirFecharMes() {
      prepararFormFecharMes();
      if (fecharMesBackdrop) fecharMesBackdrop.classList.remove("is-hidden");
      registrarAberturaModal("fecharMesBackdrop");
    }
    function fecharModalFecharMes() {
      fecharComHistorico("fecharMesBackdrop", () => {
        if (fecharMesBackdrop) fecharMesBackdrop.classList.add("is-hidden");
      });
    }
    FECHADORES_MODAL.fecharMesBackdrop = fecharModalFecharMes;
    on("mesAtualBadge", "click", abrirFecharMes);
    on("fecharMesCancelar", "click", fecharModalFecharMes);
    if (fecharMesBackdrop) {
      fecharMesBackdrop.addEventListener("click", (e) => {
        if (e.target === fecharMesBackdrop) fecharModalFecharMes();
      });
    }

    function prepararFormFecharMes() {
      const selectMes = document.getElementById("fecharMesSelect");
      const inputAno = document.getElementById("fecharAnoInput");
      if (selectMes && selectMes.options.length === 0) {
        MESES_LABEL.forEach((nome, idx) => {
          const opt = document.createElement("option");
          opt.value = String(idx + 1);
          opt.textContent = nome;
          selectMes.appendChild(opt);
        });
      }
      const agora = new Date();
      const mes = state.mesAtual || agora.getMonth() + 1;
      const ano = state.anoAtual || agora.getFullYear();
      if (selectMes) selectMes.value = String(mes);
      if (inputAno) inputAno.value = ano;
    }

    async function fecharMesRequisicao(mes, ano) {
      if (!API_URL || API_URL.includes("COLE_AQUI")) {
        showToast("Configure a URL do Apps Script em config.js");
        return null;
      }
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({ action: "fecharMes", mes, ano }),
        });
        const data = await res.json().catch(() => null);
        if (!data || data.ok === false) throw new Error((data && data.error) || "Erro desconhecido");
        return data;
      } catch (err) { return null; }
    }

    on("formFecharMes", "submit", async (e) => {
      e.preventDefault();
      const mes = Number(document.getElementById("fecharMesSelect").value);
      const ano = Number(document.getElementById("fecharAnoInput").value);
      if (!mes || !ano) return;

      const btnSubmit = document.getElementById("fecharMesSubmit");
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Fechando…";
      }
      mostrarProcessando("fecharMesOverlay");

      const resultado = await fecharMesRequisicao(mes, ano);

      esconderProcessando("fecharMesOverlay");
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Fechar mês";
      }

      if (resultado) {
        const f = resultado.fechado;
        state.mesAtual = resultado.mesAtual;
        state.anoAtual = resultado.anoAtual;
        renderMesAtual();

        ["davi", "gabriel", "ambos", "historico"].forEach((p) => removerCache(p));

        showToast(`${MESES_LABEL[f.mes - 1]}/${f.ano} fechado — Davi ${fmt(f.saldoDavi)} · Gabriel ${fmt(f.saldoGabriel)}`);
        fecharModalFecharMes();
        carregarDados();
        carregarHistorico();
      } else {
        showToast("Não consegui fechar o mês agora. Tenta de novo em instantes.");
      }
    });

    let confirmCallback = null;
    const confirmBackdrop = document.getElementById("confirmBackdrop");

    function abrirConfirmacao(texto, onConfirm) {
      confirmCallback = onConfirm;
      const textoEl = document.getElementById("confirmText");
      if (textoEl) textoEl.textContent = texto;
      if (confirmBackdrop) confirmBackdrop.classList.remove("is-hidden");
      registrarAberturaModal("confirmBackdrop");
    }
    function fecharConfirmacao() {
      fecharComHistorico("confirmBackdrop", () => {
        if (confirmBackdrop) confirmBackdrop.classList.add("is-hidden");
        confirmCallback = null;
      });
    }
    FECHADORES_MODAL.confirmBackdrop = fecharConfirmacao;
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

    // =====================================================================
    // LÓGICA DO TOOLTIP CONSOLIDADO E INIT
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

        chartTooltip.classList.add("is-visible");

        const rect = grupo.querySelector('.hover-area').getBoundingClientRect();
        const svgRect = grupo.closest('svg').getBoundingClientRect();
        const tooltipWidth = chartTooltip.offsetWidth;
        let centerLeft = rect.left + (rect.width / 2);
        const margin = 14;
        const minCenter = (tooltipWidth / 2) + margin;
        const maxCenter = window.innerWidth - (tooltipWidth / 2) - margin;
        
        centerLeft = Math.max(minCenter, Math.min(centerLeft, maxCenter));
        
        chartTooltip.style.left = (centerLeft + window.scrollX) + "px";
        chartTooltip.style.top = (svgRect.top + window.scrollY - 10) + "px";
        
        document.querySelectorAll(".mes-hover-group.is-active").forEach(el => el.classList.remove("is-active"));
        grupo.classList.add("is-active");
      };

      document.body.addEventListener("mouseover", (e) => {
        const grupo = e.target.closest(".mes-hover-group");
        if (grupo) mostrarTooltip(grupo);
      });

      document.body.addEventListener("mouseout", (e) => {
        if (e.target.closest(".mes-hover-group")) esconderTooltip();
      });

      document.body.addEventListener("touchstart", (e) => {
        const grupo = e.target.closest(".mes-hover-group");
        if (grupo) {
          mostrarTooltip(grupo);
        } else if (!e.target.closest(".grafico-tooltip")) {
          esconderTooltip(); 
        }
      }, { passive: true });

      document.body.addEventListener("touchmove", (e) => {
        const wrap = e.target.closest(".historico-grafico-wrap");
        if (wrap) {
          const touch = e.touches[0];
          const el = document.elementFromPoint(touch.clientX, touch.clientY);
          const grupo = el ? el.closest(".mes-hover-group") : null;
          if (grupo) {
            mostrarTooltip(grupo);
          }
        }
      }, { passive: true });
    }

    if (!document.body.dataset.tooltipInit) {
      initChartTooltip();
      document.body.dataset.tooltipInit = "1";
    }

    // INIT E LISTENERS FINAIS
    renderPessoaSwitch();
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
    exibirInsightCacheOuPlaceholder();
    on("insightCard", "click", tentarDeNovoInsightSeErro);
    
    // RENDERIZANDO OS ÍCONES NA HORA DE ABRIR!
    renderIconSelector("caixaIconContainer", "icone_caixinha", "");
    
    carregarDados();
    setTimeout(mostrarDicaAcoesConjuntoSeNecessario, 1200);

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
