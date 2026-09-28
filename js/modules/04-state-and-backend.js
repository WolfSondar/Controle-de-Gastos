// =====================================================================
// MÓDULO: 04-state-and-backend
// Estado da aplicação, API e helpers de backend
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

const PESSOAS_VALIDAS = new Set(["davi", "gabriel", "ambos"]);
const pessoaSalvaInicial = (() => { try { const p = localStorage.getItem(PESSOA_STORAGE_KEY); return PESSOAS_VALIDAS.has(p) ? p : "davi"; } catch (e) { return "davi"; } })();

const state = {
  ganhos: [],
  gastosFixos: [],
  gastosVariaveis: [],
  caixinhas: [],
  saldoInicialConta: 0,
  saldoInicialBeneficio: 0,
  loaded: false,
  // Incrementa a cada alteração feita pelo usuário. Uma busca iniciada antes
  // dessa alteração nunca pode sobrescrever o estado local mais novo.
  versaoAlteracaoLocal: 0,
  // Ações que ainda estão sendo persistidas. Enquanto um salvamento está
  // em andamento, uma leitura GET não pode substituir o estado local com
  // uma versão antiga que ainda está na Firebase.
  salvamentosEmAndamento: new Set(),
  pessoaAtual: pessoaSalvaInicial,
  // O mês/ano do perfil nunca vem do cache local.
  // O Firebase é a fonte de verdade, evitando voltar para um mês anterior
  // após Ctrl+Shift+R/F5.
  mesAtual: null,
  anoAtual: null,
  mesAtualDavi: null,
  anoAtualDavi: null,
  mesAtualGabriel: null,
  anoAtualGabriel: null,
  historico: null, 
  historicoAnoSelecionado: new Date().getFullYear(),
  categoriasConfig: null, // [{nome, cor}] vindas da configuração do usuário
  iconCategorias: [], // regras [{categoria, padroes}] vindas da configuração
  iconNomes: {}, // nomes amigáveis dos ícones
  temasConfig: null, // temas sazonais e regras administrativas
  faturas: [], // [{id,nome,dia,pessoa}] configuradas pelo usuário
};

function renderMesAtual() {
  const el = document.getElementById("mesAtualBadge");
  if (!el) return;

  const pessoa = state.pessoaAtual;
  const formato = (mes, ano) => mes && ano ? `${MESES_LABEL[Number(mes) - 1]}/${ano}` : "";

  if (pessoa === "ambos") {
    const davi = formato(state.mesAtualDavi, state.anoAtualDavi);
    const gabriel = formato(state.mesAtualGabriel, state.anoAtualGabriel);
    el.textContent = davi && gabriel
      ? `Davi · ${davi}  •  Gabriel · ${gabriel}`
      : davi || gabriel || "";
    el.classList.add("is-disabled");
    el.disabled = true;
    el.setAttribute("aria-disabled", "true");
    el.title = "Juntos é somente leitura — cada perfil tem seu próprio mês.";
  } else {
    el.textContent = formato(state.mesAtual, state.anoAtual);
    el.classList.remove("is-disabled");
    el.disabled = false;
    el.setAttribute("aria-disabled", "false");
    el.title = "Fechar mês";
  }

  el.hidden = !el.textContent;
  try {
    if (state.mesAtual && state.anoAtual) {
      localStorage.setItem(MES_ATUAL_STORAGE_KEY + ":" + state.pessoaAtual, JSON.stringify({ mes: state.mesAtual, ano: state.anoAtual }));
    }
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

function temBackendDados() {
  return !!(window.CAIXA_FIREBASE && typeof window.CAIXA_FIREBASE.get === "function");
}

async function caixaApiRequest(options = {}) {
  const bodyText = options?.body;
  let body = null;
  try { body = typeof bodyText === "string" ? JSON.parse(bodyText) : bodyText; } catch (_err) {}
  if (!window.CAIXA_FIREBASE || typeof window.CAIXA_FIREBASE.request !== "function") {
    throw new Error("Firebase ainda não terminou de carregar.");
  }
  return window.CAIXA_FIREBASE.request({ method: options.method || "POST", body });
}

async function fetchApiGet(params = {}) {
  if (!window.CAIXA_FIREBASE || typeof window.CAIXA_FIREBASE.get !== "function") {
    throw new Error("Firebase ainda não terminou de carregar.");
  }
  const pessoa = String(params?.pessoa || "davi").toLowerCase();
  return window.CAIXA_FIREBASE.get({ pessoa });
}

async function carregarSnapshotMigracaoFirebase() {
  // A migração não consulta mais o Web App do Firebase. O snapshot é
  // carregado localmente e foi gerado a partir da Firebase fornecida para a
  // migração. O snapshot é local e não depende de nenhum serviço legado.
  const modulo = await import("./firebase-migration-data.js?v=35");
  if (!modulo?.CAIXA_MIGRATION_SNAPSHOT) throw new Error("Snapshot de migração não encontrado.");
  return modulo.CAIXA_MIGRATION_SNAPSHOT;
}

async function lerFonteLegadaParaMigracao() {
  const snapshot = await carregarSnapshotMigracaoFirebase();
  return {
    fonte: snapshot.fonte || {},
    historico: snapshot.historico || { anos: [] },
  };
}

function resumoMigracaoFonte(fonte, historico) {
  const pessoa = (d = {}) => ({
    ganhos: Array.isArray(d.ganhos) ? d.ganhos.length : 0,
    gastosFixos: Array.isArray(d.gastosFixos) ? d.gastosFixos.length : 0,
    gastosVariaveis: Array.isArray(d.gastosVariaveis) ? d.gastosVariaveis.length : 0,
    caixinhas: Array.isArray(d.caixinhas) ? d.caixinhas.length : 0,
    mesAtual: d.mesAtual,
    anoAtual: d.anoAtual,
  });
  return { davi: pessoa(fonte?.davi), gabriel: pessoa(fonte?.gabriel), anosHistorico: Array.isArray(historico?.anos) ? historico.anos.length : 0 };
}

async function verificarFontePlanilhaFirebase() {
  try {
    const { fonte, historico } = await lerFonteLegadaParaMigracao();
    const resultado = { ok: true, origem: "Snapshot da Firebase para migração", resumo: resumoMigracaoFonte(fonte, historico) };
    console.info("CAIXA — fonte de migração verificada sem consultar o Firebase:", resultado);
    return resultado;
  } catch (err) {
    const mensagem = err?.message || String(err);
    console.error("CAIXA — não foi possível carregar a fonte de migração:", err);
    return { ok: false, origem: "Snapshot da Firebase para migração", error: mensagem };
  }
}
window.CAIXA_VERIFICAR_FONTE_MIGRACAO = verificarFontePlanilhaFirebase;

async function migrarPlanilhaParaFirebase() {
  if (!window.CAIXA_FIREBASE || typeof window.CAIXA_FIREBASE.importarDados !== "function") {
    throw new Error("Firebase não está configurado.");
  }
  const { fonte, historico } = await lerFonteLegadaParaMigracao();
  const resumo = resumoMigracaoFonte(fonte, historico);
  console.info("CAIXA — iniciando migração para o Firestore:", resumo);
  const resultado = await window.CAIXA_FIREBASE.importarDados({ fonte, historico, resumoMigracao: resumo });
  return { ...resultado, resumo };
}
window.CAIXA_MIGRAR_PLANILHA_FIREBASE = migrarPlanilhaParaFirebase;
window.CAIXA_VERIFICAR_MIGRACAO_FIREBASE = async function () {
  if (!window.CAIXA_FIREBASE || typeof window.CAIXA_FIREBASE.verificarMigracaoFirebase !== "function") {
    throw new Error("Firebase não está configurado.");
  }
  const resultado = await window.CAIXA_FIREBASE.verificarMigracaoFirebase();
  console.info("CAIXA — estado da migração no Firestore:", resultado);
  return resultado;
};

async function getCache(pessoa) { return idbGet(IDB_LOJA_CACHE, CACHE_PREFIX + pessoa); }
async function setCache(pessoa, data) {
  return idbSet(IDB_LOJA_CACHE, CACHE_PREFIX + pessoa, {
    ganhos: data.ganhos || [],
    gastosFixos: data.gastosFixos || [],
    gastosVariaveis: data.gastosVariaveis || [],
    caixinhas: data.caixinhas || [],
    saldoInicialConta: Number(data.saldoInicialConta) || 0,
    saldoInicialBeneficio: Number(data.saldoInicialBeneficio) || 0,
    categorias: data.categorias || null,
    iconCategorias: data.iconCategorias || [],
    iconNomes: data.iconNomes || {},
    temasConfig: data.temasConfig || null,
    temaAtivo: data.temaAtivo || (typeof caixaTemaAtivoGlobal === "function" ? caixaTemaAtivoGlobal() : "default"),
    faturas: Array.isArray(data.faturas) ? data.faturas : [],
    mesAtual: data.mesAtual || null,
    anoAtual: data.anoAtual || null,
  });
}
async function removerCache(pessoa) { return idbDelete(IDB_LOJA_CACHE, CACHE_PREFIX + pessoa); }

// Marca uma mutação feita localmente. Isso impede que uma resposta GET
// iniciada antes da ação do usuário volte depois e "desfaça" a alteração.
function marcarAlteracaoLocal() {
  state.versaoAlteracaoLocal = (state.versaoAlteracaoLocal || 0) + 1;
}

const syncEl = document.getElementById("syncStatus");
let syncModeAnterior = null;

function setSyncState(mode) {
  if (!syncEl) return;
  // Voltou de "sem internet" pra qualquer outro estado: dá o solavanco
  // suave no ícone de wifi (ver .is-reconectando no style.css) em vez de
  // só trocar o ícone seco.
  if (syncModeAnterior === "offline" && mode !== "offline" && mode !== "error") {
    syncEl.classList.add("is-reconectando");
    setTimeout(() => syncEl.classList.remove("is-reconectando"), 700);
  }
  // Acabou de salvar com sucesso (saving -> idle, ou seja, uma alteração
  // enviada pra Firebase, não só uma busca): pisca o check (ver
  // .sync-icone-check no style.css) por um instante antes de assentar no
  // wifi parado — um "confirmado" rápido, em vez de pular direto pro idle
  // sem feedback. Uma simples busca de dados (syncing -> idle) não passa
  // por aqui, então não mostra o check.
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

// Atualiza só o numerozinho de alterações pendentes (badge ao lado do ícone
// de wifi), sem mexer no estado geral do indicador — usado durante o envio
// da fila offline pra ir encolhendo o número item por item.
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

function caixaTemaAtivoGlobal() {
  try { return localStorage.getItem("caixa-tema-estilo-v1") || "default"; } catch (_) { return "default"; }
}

function metadadosTemaApp(id) {
  return window.CAIXA_OBTER_TEMA?.(id)?.meta || {};
}

function regraTemaSazonalGlobal(id) {
  const cfg = state.temasConfig || {};
  return cfg[id] || null;
}

function lerDiaTema(regra, campo, fallback) {
  const direto = Number(regra?.[campo]);
  if (Number.isFinite(direto) && direto >= 1 && direto <= 31) return direto;
  const legado = regra?.[campo === "inicioDia" ? "inicio" : "fim"];
  const m = String(legado || "").match(/(?:^|-)\d{2}-(\d{2})(?:T|$)/);
  const dia = m ? Number(m[1]) : NaN;
  return Number.isFinite(dia) ? dia : fallback;
}

function mesTemaSazonal(id) {
  return id === "christmas" ? 12 : id === "halloween" ? 10 : null;
}

function caixaTemaPodeSerUsadoGlobal(id) {
  if (id === "default") return true;
  const regra = regraTemaSazonalGlobal(id);
  const calendario = metadadosTemaApp(id).seasonal;
  if (!regra || !calendario) return false;
  if (regra.forcarAgora === true) return true;
  const hoje = new Date();
  if (hoje.getMonth() + 1 !== Number(calendario.month)) return false;
  const dia = hoje.getDate();
  return dia >= Number(calendario.startDay) && dia <= Number(calendario.endDay);
}

function caixaGarantirCssTemaGlobal(id) {
  const tema = String(id || "default");
  const config = window.CAIXA_OBTER_TEMA?.(tema);
  const href = config?.css;
  if (!href || !document.head) return;
  window.CAIXA_TEMA_CORE?.aplicarEstilos?.(tema);
}

