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

// ---------------------------------------------------------------------
// ÍCONES PERSONALIZADOS DAS CAIXINHAS
// Lê automaticamente IMG/ do próprio repositório GitHub e usa apenas
// arquivos PNG/WEBP cujo nome começa com "caixa" (ex.: caixa_zelda.png).
// ---------------------------------------------------------------------
const CAIXINHA_ICON_STORAGE_KEY = "caixaIconesPersonalizados";
const CAIXINHA_ICON_USAGE_KEY = "caixaIconesUso";
const CAIXINHA_ICON_CACHE_NAME = "caixinha-icones-v2";
const CAIXINHA_ICON_DIR = "IMG/";
const CAIXINHA_ICON_GITHUB_FALLBACK = ""; // Se usar domínio próprio, informe "usuario/repositorio".

function normalizarNomeIcone(nome) {
  return String(nome || "").split("/").pop().trim();
}

function urlIconeCaixinha(nome) {
  const arquivo = normalizarNomeIcone(nome);
  if (!arquivo) return "";
  if (/^https?:\/\//i.test(String(nome || ""))) return String(nome);
  return `${CAIXINHA_ICON_DIR}${encodeURIComponent(arquivo)}`;
}

function isArquivoIconeCaixinha(nome) {
  const arquivo = normalizarNomeIcone(nome);
  return /^caixa/i.test(arquivo) && /\.(png|webp)$/i.test(arquivo);
}

function obterRepositorioGitHub() {
  if (CAIXINHA_ICON_GITHUB_FALLBACK) return CAIXINHA_ICON_GITHUB_FALLBACK;
  const host = window.location.hostname;
  if (!/\.github\.io$/i.test(host)) return "";
  const owner = host.split(".")[0];
  const partes = window.location.pathname.split("/").filter(Boolean);
  const repo = partes[0] || "";
  return owner && repo ? `${owner}/${repo}` : "";
}

let iconesCaixinhas = [];
let iconesCaixinhasCarregando = false;

function salvarIconesCaixinhasCache() {
  try { localStorage.setItem(CAIXINHA_ICON_STORAGE_KEY, JSON.stringify(iconesCaixinhas)); } catch (_err) {}
}

function carregarIconesCaixinhasCache() {
  try {
    const raw = localStorage.getItem(CAIXINHA_ICON_STORAGE_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista.filter(isArquivoIconeCaixinha) : [];
  } catch (_err) { return []; }
}

function carregarUsoIconesCaixinhas() {
  try {
    const raw = localStorage.getItem(CAIXINHA_ICON_USAGE_KEY);
    const uso = raw ? JSON.parse(raw) : {};
    return uso && typeof uso === "object" ? uso : {};
  } catch (_err) { return {}; }
}

function registrarUsoIconeCaixinha(nome) {
  const arquivo = normalizarNomeIcone(nome);
  if (!arquivo || !isArquivoIconeCaixinha(arquivo)) return;
  try {
    const uso = carregarUsoIconesCaixinhas();
    uso[arquivo] = { count: Number(uso[arquivo]?.count || 0) + 1, last: Date.now() };
    localStorage.setItem(CAIXINHA_ICON_USAGE_KEY, JSON.stringify(uso));
  } catch (_err) {}
  // Mantém os mais usados disponíveis no cache do navegador.
  cachearImagemIcone(arquivo);
}

function ordenarIconesPorUso(lista) {
  const uso = carregarUsoIconesCaixinhas();
  return [...lista].sort((a, b) => {
    const ua = uso[a]?.count || 0;
    const ub = uso[b]?.count || 0;
    if (ua !== ub) return ub - ua;
    const la = uso[a]?.last || 0;
    const lb = uso[b]?.last || 0;
    if (la !== lb) return lb - la;
    return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
  });
}

async function cachearImagemIcone(nome) {
  if (!window.caches) return;
  try {
    const url = urlIconeCaixinha(nome);
    if (!url) return;
    const cache = await caches.open(CAIXINHA_ICON_CACHE_NAME);
    const req = new Request(url, { cache: "no-cache" });
    if (!(await cache.match(req))) await cache.add(req);
  } catch (_err) {}
}

function preCachearIconesMaisUsados(lista) {
  const uso = carregarUsoIconesCaixinhas();
  [...lista]
    .sort((a, b) => (uso[b]?.count || 0) - (uso[a]?.count || 0))
    .filter((nome) => (uso[nome]?.count || 0) > 0)
    .slice(0, 16)
    .forEach(cachearImagemIcone);
}

function obterCategoriaIcone(nome) {
  const arquivo = normalizarNomeIcone(nome);
  const base = arquivo.replace(/\.(png|webp)$/i, "").toLowerCase();
  const regras = Array.isArray(state.iconCategorias) ? state.iconCategorias : [];
  for (const regra of regras) {
    for (const padraoBruto of (regra.padroes || [])) {
      const padrao = normalizarTextoBuscaIcone(padraoBruto).replace(/\.(png|webp)$/i, "");
      if (!padrao) continue;
      const prefixo = padrao.endsWith("*") ? padrao.slice(0, -1) : padrao;
      if (prefixo && base === prefixo || (prefixo && base.startsWith(prefixo))) return regra.categoria;
    }
  }
  return "Outros";
}

function categoriasDeIconesDisponiveis() {
  const lista = iconesCaixinhas.map(obterCategoriaIcone);
  return [...new Set(lista)].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function nomeIconeBonito(nome) {
  return normalizarNomeIcone(nome).replace(/\.(png|webp)$/i, "");
}

function aplicarPreviewIcone(picker, nome) {
  if (!picker) return;
  const previewAtual = picker.querySelector(".caixinha-icon-picker-preview");
  if (previewAtual) {
    previewAtual.classList.remove("is-changing");
    void previewAtual.offsetWidth;
    previewAtual.classList.add("is-changing");
    window.setTimeout(() => previewAtual.classList.remove("is-changing"), 360);
  }
  const preview = picker.querySelector(".caixinha-icon-picker-preview");
  const hidden = picker.querySelector('input[type="hidden"]');
  if (!preview) return;
  if (hidden) hidden.value = nome || "";
  preview.innerHTML = "";
  preview.classList.toggle("is-default", !nome);
  if (nome) {
    const img = document.createElement("img");
    img.src = urlIconeCaixinha(nome);
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => {
      preview.innerHTML = "Ícone indisponível";
      preview.classList.add("is-default");
      if (hidden) hidden.value = "";
    };
    preview.appendChild(img);
  } else {
    preview.textContent = "Sem ícone";
  }
}

function posicionarMenuIcone(picker) {
  if (!picker) return;
  const trigger = picker.querySelector(".caixinha-icon-picker-trigger");
  const menu = picker.querySelector(".caixinha-icon-picker-menu");
  if (!trigger || !menu) return;

  const rect = trigger.getBoundingClientRect();
  const margem = 12;
  const gap = 7;
  const viewportW = document.documentElement.clientWidth || window.innerWidth;
  const viewportH = window.innerHeight;
  const tabbar = document.getElementById("tabbar");

  // A navegação inferior é fixa. O seletor nunca pode ocupar a área dela.
  // Usamos o topo real da tabbar como limite inferior útil, inclusive no
  // mobile, onde a altura muda por causa do safe-area-inset.
  const tabbarTop = tabbar ? tabbar.getBoundingClientRect().top : viewportH;
  const limiteInferior = Math.min(viewportH, tabbarTop) - margem;
  const espacoAbaixo = limiteInferior - rect.bottom;
  const espacoAcima = rect.top - margem;

  // Em vez de deixar o menu enorme sobre outros campos quando não cabe
  // abaixo, damos prioridade ao espaço abaixo da tabbar e abrimos acima
  // somente quando realmente houver mais espaço nessa direção.
  const alturaNatural = Math.min(menu.scrollHeight || 270, 300);
  const abrirAcima = espacoAbaixo < Math.min(alturaNatural, 220) && espacoAcima > espacoAbaixo;

  menu.style.position = "fixed";
  menu.style.right = "auto";
  menu.style.bottom = "auto";

  const largura = Math.min(560, Math.max(0, viewportW - margem * 2));
  menu.style.width = `${largura}px`;

  let alturaDisponivel;
  let top;

  if (abrirAcima) {
    alturaDisponivel = Math.max(150, Math.min(300, espacoAcima - gap));
    const altura = Math.min(alturaNatural, alturaDisponivel);
    top = Math.max(margem, rect.top - altura - gap);
    menu.classList.add("is-above");
  } else {
    alturaDisponivel = Math.max(150, Math.min(300, espacoAbaixo - gap));
    const altura = Math.min(alturaNatural, alturaDisponivel);
    top = Math.min(limiteInferior - altura, rect.bottom + gap);
    top = Math.max(margem, top);
    menu.classList.remove("is-above");
  }

  menu.style.left = `${Math.max(margem, Math.min(rect.left, viewportW - largura - margem))}px`;
  menu.style.top = `${top}px`;
  menu.style.maxHeight = `${Math.max(150, Math.min(300, alturaDisponivel))}px`;
}

function atualizarMenusIconesAbertos() {
  document.querySelectorAll(".caixinha-icon-picker.is-open").forEach(posicionarMenuIcone);
}

function fecharPickersIcones(excepto) {
  document.querySelectorAll(".caixinha-icon-picker.is-open").forEach((picker) => {
    if (picker !== excepto) {
      picker.classList.remove("is-open");
      const trigger = picker.querySelector(".caixinha-icon-picker-trigger");
      const menu = picker.querySelector(".caixinha-icon-picker-menu");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (menu) menu.classList.remove("is-above");
    }
  });
}

function normalizarTextoBuscaIcone(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function renderOpcoesIconesCaixinhas(picker) {
  if (!picker) return;
  const menu = picker.querySelector(".caixinha-icon-picker-menu");
  if (!menu) return;

  menu.innerHTML = `
    <div class="caixinha-icon-picker-search-wrap">
      <span class="caixinha-icon-picker-search-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"></circle><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>
      </span>
      <input type="search" class="caixinha-icon-picker-search" placeholder="Pesquisar ícone..." autocomplete="off" spellcheck="false" aria-label="Pesquisar ícone">
      <button type="button" class="caixinha-icon-picker-search-clear is-hidden" aria-label="Limpar pesquisa">×</button>
    </div>
    <div class="caixinha-icon-picker-category-wrap">
      <button type="button" class="caixinha-icon-category is-active" data-category="__todos">Todos</button>
      ${categoriasDeIconesDisponiveis().map(cat => `<button type="button" class="caixinha-icon-category" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join("")}
    </div>
    <div class="caixinha-icon-picker-options" role="listbox" aria-label="Ícones disponíveis"></div>
    <div class="caixinha-icon-picker-empty is-hidden">Nenhum ícone encontrado.</div>
  `;

  const search = menu.querySelector(".caixinha-icon-picker-search");
  const clear = menu.querySelector(".caixinha-icon-picker-search-clear");
  const optionsWrap = menu.querySelector(".caixinha-icon-picker-options");
  const empty = menu.querySelector(".caixinha-icon-picker-empty");
  const iconeAtual = normalizarNomeIcone(picker.querySelector('input[type="hidden"]')?.value || "");
  let categoriaAtual = "__todos";
  const opcoes = [{ nome: "", label: "Sem ícone", categoria: "__todos" }, ...ordenarIconesPorUso(iconesCaixinhas).map((nome) => ({ nome, label: nomeIconeBonito(nome), categoria: obterCategoriaIcone(nome) }))];

  const desenhar = (termo = "") => {
    const busca = normalizarTextoBuscaIcone(termo);
    optionsWrap.innerHTML = "";
    const filtradas = opcoes.filter(({ nome, label, categoria }) => {
      const passaCategoria = categoriaAtual === "__todos" || categoria === categoriaAtual || (!nome && categoriaAtual === "__todos");
      if (!passaCategoria) return false;
      if (!busca) return true;
      if (!nome) return "sem icone sem ícone".includes(busca);
      return normalizarTextoBuscaIcone(`${nome} ${label} ${categoria}`).includes(busca);
    });

    filtradas.forEach(({ nome, label, categoria }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "caixinha-icon-option";
      btn.setAttribute("role", "option");
      btn.dataset.icone = nome;
      btn.dataset.categoria = categoria;
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.setAttribute("aria-selected", nome === iconeAtual ? "true" : "false");
      if (nome === iconeAtual) btn.classList.add("is-selected");

      if (!nome) {
        btn.innerHTML = '<span class="caixinha-icon-option-none">×</span>';
      } else {
        const img = document.createElement("img");
        img.src = urlIconeCaixinha(nome);
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.onerror = () => btn.remove();
        btn.appendChild(img);
      }

      btn.addEventListener("click", () => {
        aplicarPreviewIcone(picker, nome);
        if (nome) registrarUsoIconeCaixinha(nome);
        menu.querySelectorAll(".caixinha-icon-option").forEach((el) => {
          el.classList.remove("is-selected");
          el.setAttribute("aria-selected", "false");
        });
        btn.classList.add("is-selected");
        btn.setAttribute("aria-selected", "true");
        fecharPickersIcones();
      });
      optionsWrap.appendChild(btn);
    });

    empty.classList.toggle("is-hidden", filtradas.length > 0);
    clear.classList.toggle("is-hidden", !busca);
  };

  menu.querySelectorAll(".caixinha-icon-category").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaAtual = btn.dataset.category || "__todos";
      menu.querySelectorAll(".caixinha-icon-category").forEach((el) => el.classList.toggle("is-active", el === btn));
      desenhar(search.value);
    });
  });

  search.addEventListener("input", () => desenhar(search.value));
  clear.addEventListener("click", () => {
    search.value = "";
    desenhar("");
    search.focus();
  });
  search.addEventListener("click", (e) => e.stopPropagation());
  desenhar("");
}

function inicializarPickersIcones() {
  document.querySelectorAll(".caixinha-icon-picker").forEach((picker) => {
    const trigger = picker.querySelector(".caixinha-icon-picker-trigger");
    if (!trigger || trigger.dataset.iconPickerBound) return;
    trigger.dataset.iconPickerBound = "1";
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const abrir = !picker.classList.contains("is-open");
      fecharPickersIcones(picker);
      picker.classList.toggle("is-open", abrir);
      trigger.setAttribute("aria-expanded", abrir ? "true" : "false");
      if (abrir) {
        renderOpcoesIconesCaixinhas(picker);
        requestAnimationFrame(() => posicionarMenuIcone(picker));
      }
    });
  });
}

async function carregarIconesCaixinhas() {
  if (iconesCaixinhasCarregando) return;
  iconesCaixinhasCarregando = true;

  const cache = carregarIconesCaixinhasCache();
  if (cache.length) {
    iconesCaixinhas = cache;
    document.querySelectorAll(".caixinha-icon-picker").forEach(renderOpcoesIconesCaixinhas);
  }

  const repo = obterRepositorioGitHub();
  if (!repo) {
    iconesCaixinhasCarregando = false;
    inicializarPickersIcones();
    return;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/IMG`, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
    const arquivos = await res.json();
    if (!Array.isArray(arquivos)) throw new Error("Pasta IMG inválida");

    iconesCaixinhas = arquivos
      .filter((arquivo) => arquivo && arquivo.type === "file" && isArquivoIconeCaixinha(arquivo.name))
      .map((arquivo) => arquivo.name);
    iconesCaixinhas = ordenarIconesPorUso(iconesCaixinhas);

    salvarIconesCaixinhasCache();
    preCachearIconesMaisUsados(iconesCaixinhas);
    document.querySelectorAll(".caixinha-icon-picker").forEach(renderOpcoesIconesCaixinhas);
  } catch (_err) {
    // Mantém o último cache se o GitHub estiver indisponível.
  } finally {
    iconesCaixinhasCarregando = false;
    inicializarPickersIcones();
  }
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".caixinha-icon-picker")) fecharPickersIcones();
});

window.addEventListener("resize", atualizarMenusIconesAbertos);
window.addEventListener("scroll", atualizarMenusIconesAbertos, true);

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
  // Incrementa a cada alteração feita pelo usuário. Uma busca iniciada antes
  // dessa alteração nunca pode sobrescrever o estado local mais novo.
  versaoAlteracaoLocal: 0,
  pessoaAtual: localStorage.getItem(PESSOA_STORAGE_KEY) || "davi",
  mesAtual: mesAtualCache ? mesAtualCache.mes : null,
  anoAtual: mesAtualCache ? mesAtualCache.ano : null,
  historico: null, 
  historicoAnoSelecionado: new Date().getFullYear(),
  categoriasConfig: null, // [{nome, cor}] vindo da aba CONFIGS, ou null pra usar a lista padrão
  iconCategorias: [], // regras [{categoria, padroes}] vindas da aba CONFIGS
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
    iconCategorias: data.iconCategorias || [],
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
  // enviada pra planilha, não só uma busca): pisca o check (ver
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

async function carregarDados() {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    setSyncState("error");
    showToast("Configure a URL do Apps Script em config.js");
    renderAll();
    return;
  }

  const pessoaRequisitada = state.pessoaAtual;
  const versaoNoInicio = state.versaoAlteracaoLocal;
  const cache = await getCache(pessoaRequisitada);
  if (state.pessoaAtual !== pessoaRequisitada) return;
  // Se o usuário alterou qualquer coisa enquanto o cache era lido, o cache
  // antigo não pode entrar por cima do que ele acabou de fazer.
  if (state.versaoAlteracaoLocal !== versaoNoInicio) return;
  if (cache) {
    state.ganhos = cache.ganhos;
    state.gastosFixos = cache.gastosFixos;
    state.gastosVariaveis = cache.gastosVariaveis;
    state.caixinhas = cache.caixinhas || [];
    state.categoriasConfig = cache.categorias || null;
    state.iconCategorias = cache.iconCategorias || [];
    state.loaded = true;
    popularSelectsDeCategoria();
    renderAll();
  } else {
    renderSkeletons();
  }

  // Sem internet: nem tenta buscar — fica só no ícone de sem internet
  // (sem nenhuma animação de "tentando"), mostrando o que já tem em cache.
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
    // A resposta pode ter ficado alguns segundos em trânsito. Se houve uma
    // ação local desde o início desta busca, ela é mais nova e deve vencer.
    if (state.versaoAlteracaoLocal !== versaoNoInicio) return;

    const mudancas = {
      ganhos: colecaoMudou(state.ganhos, data.ganhos || []),
      gastosFixos: colecaoMudou(state.gastosFixos, data.gastosFixos || []),
      gastosVariaveis: colecaoMudou(state.gastosVariaveis, data.gastosVariaveis || []),
      caixinhas: colecaoMudou(state.caixinhas, data.caixinhas || []),
      categoriasConfig: colecaoMudou(state.categoriasConfig || [], data.categorias || []),
      iconCategorias: colecaoMudou(state.iconCategorias || [], data.iconCategorias || []),
    };
    state.ganhos = data.ganhos || [];
    state.gastosFixos = data.gastosFixos || [];
    state.gastosVariaveis = data.gastosVariaveis || [];
    state.caixinhas = data.caixinhas || [];
    state.categoriasConfig = data.categorias || null;
    state.iconCategorias = data.iconCategorias || [];
    state.loaded = true;
    if (data.mesAtual) state.mesAtual = data.mesAtual;
    if (data.anoAtual) state.anoAtual = data.anoAtual;
    renderMesAtual();
    setCache(pessoaRequisitada, data);
    setSyncState("idle");
    if (Object.values(mudancas).some(Boolean)) {
      renderIncremental(mudancas);
    }
    // IA no primeiro carregamento deste dispositivo sem cache. Se já existe
    // cache financeiro local, recarregar a página não consome Gemini.
    if (!cache) {
      atualizarInsightComIA({ motivo: "pagina", semCacheInicial: true });
    }
    prefetchOutrasPessoas(pessoaRequisitada);
  } catch (err) {
    if (state.pessoaAtual !== pessoaRequisitada) return;
    // Caiu a conexão no meio da busca: mesmo tratamento calmo do offline
    // (sem ícone de erro em vermelho, que é pra falha de verdade).
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

  // Sem internet: nem tenta — manda direto pra fila offline, sem passar
  // pela animação de "salvando" (que só ia demorar e falhar mesmo).
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
    // Toda alteração financeira salva com sucesso atualiza o próximo lote de
    // insights. O debounce junta várias gravações da mesma ação (ex.: caixinha
    // + lançamento automático) em uma única chamada ao Gemini.
    if (["saveGanhos", "saveGastosFixos", "saveGastosVariaveis", "saveCaixinhas"].includes(action)) {
      agendarInsightPorAlteracaoFinanceira();
    }
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
  // Sem internet: nem tenta — evita ficar piscando a animação de "enviando"
  // só pra falhar em seguida. Fica parado no ícone de sem internet até o
  // navegador avisar que voltou (evento "online", ver abaixo).
  if (!navigator.onLine) return;

  // Confere ANTES de mexer em qualquer estado de sync: se não tem nada pra
  // enviar, sai sem tocar no ícone — senão essa checagem (que é rápida,
  // porque só olha o IndexedDB local) ficava sempre "ganhando a corrida" e
  // resetando pra "idle" por cima da animação de sincronizando que
  // carregarDados() acabara de ligar (ver tentarSincronizarAgora).
  const itens = await idbListarFila();
  if (itens.length === 0) return;

  flushEmAndamento = true;
  setSyncState("saving");
  let houveAlteracaoFinanceira = false;
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
        } else if (["saveGanhos", "saveGastosFixos", "saveGastosVariaveis", "saveCaixinhas"].includes(valor.action)) {
          houveAlteracaoFinanceira = true;
        }
        await idbDelete(IDB_LOJA_FILA, chaveIdb);
      } catch (err) {
        if (ehErroDeRede(err)) break; 
        await idbDelete(IDB_LOJA_FILA, chaveIdb); 
      }
      restantes -= 1;
      atualizarBadgeOffline(restantes); // encolhe o numerozinho a cada alteração sincronizada
    }
  } finally {
    flushEmAndamento = false;
    const restante = await atualizarIndicadorOffline();
    if (restante === 0) setSyncState("idle");
    if (houveAlteracaoFinanceira) agendarInsightPorAlteracaoFinanceira();
  }
}

window.addEventListener("online", () => flushFilaOffline());
window.addEventListener("offline", () => {
  // Reflete na hora — não espera uma tentativa falhar pra só então mostrar
  // o ícone de sem internet.
  setSyncState("offline");
  atualizarIndicadorOffline();
});
setInterval(() => flushFilaOffline(), 20000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") flushFilaOffline();
});

// A leitura da planilha acontece somente na abertura/recarregamento da página.
// O indicador continua mostrando o estado de salvamento, mas não existe mais
// uma ação manual que faça um GET e reconcilie tudo no meio da navegação.
if (syncEl) {
  syncEl.removeAttribute("role");
  syncEl.removeAttribute("tabindex");
  syncEl.setAttribute("aria-label", "Os dados são sincronizados ao recarregar a página");
}

// ---------------------------------------------------------------------
// SELETOR DE PESSOA
// ---------------------------------------------------------------------
async function trocarPessoa(pessoa) {
  if (pessoa === state.pessoaAtual) return;

  // Trocar de perfil não faz mais uma nova leitura na planilha. A página já
  // carregou os perfis necessários na abertura e cada perfil fica disponível
  // no cache local. Assim a troca é instantânea e não reconstrói a tela por
  // causa de um GET no meio da navegação.
  const pessoaAnterior = state.pessoaAtual;
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

  const cache = await getCache(pessoa);
  // Se o usuário trocou de perfil novamente enquanto o cache era lido, não
  // deixa a resposta assíncrona sobrescrever a tela do perfil atual.
  if (state.pessoaAtual !== pessoa) return;

  if (cache) {
    state.ganhos = cache.ganhos || [];
    state.gastosFixos = cache.gastosFixos || [];
    state.gastosVariaveis = cache.gastosVariaveis || [];
    state.caixinhas = cache.caixinhas || [];
    state.categoriasConfig = cache.categorias || null;
    state.iconCategorias = cache.iconCategorias || [];
    state.loaded = true;
    popularSelectsDeCategoria();
    renderIncremental({
      ganhos: true,
      gastosFixos: true,
      gastosVariaveis: true,
      caixinhas: true,
      categoriasConfig: true,
      iconCategorias: true,
    });
  } else {
    // Não busca a planilha aqui. Se esse perfil ainda não tiver sido
    // pré-carregado no cache durante a abertura, deixa os dados locais
    // atuais e informa de forma discreta que a atualização ocorrerá no
    // próximo recarregamento.
    showToast("Este perfil será atualizado quando você recarregar a página.");
  }
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
      marcarAlteracaoLocal();
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderAll();
    },
    remove(index) {
      if (isAmbos()) return;
      state[key].splice(index, 1);
      marcarAlteracaoLocal();
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
      marcarAlteracaoLocal();
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderAll();
    },
  };
}

const opGanhos = criarOperacoesLista("ganhos", "saveGanhos");
const opFixos = criarOperacoesLista("gastosFixos", "saveGastosFixos");
const opVariaveis = criarOperacoesLista("gastosVariaveis", "saveGastosVariaveis");

function marcarComemoracaoSeMetaBatida(cx, estavaCompleta) {
  if (!cx) return;
  const objetivo = Number(cx.valorObjetivo) || 0;
  const completaAgora = objetivo > 0 && totalCaixinha(cx) >= objetivo;
  if (!estavaCompleta && completaAgora) cx._comemoraAoRenderizar = true;
}

function addCaixinha(nome, valorInicial, valorObjetivo, icone = "", data = "") {
  if (isAmbos()) return;
  const novaCaixinha = {
    nome,
    valorGuardado: 0,
    valorObjetivo: valorObjetivo || 0,
    valorGuardadoMes: valorInicial || 0,
    icone: normalizarNomeIcone(icone),
    data: String(data || "").trim(),
  };
  state.caixinhas.push(novaCaixinha);
  marcarAlteracaoLocal();
  marcarComemoracaoSeMetaBatida(novaCaixinha, false);
  salvarBloco("saveCaixinhas", state.caixinhas);
  if (valorInicial > 0) {
    state.gastosVariaveis.push({ nome: `Guardado: ${nome}`, valor: valorInicial, pago: true, tipo: "Metas", data: dataHojeISO(), origem: "saldo" });
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
  marcarAlteracaoLocal();
  if (guardado > 0) {
    state.ganhos.push({ nome: `Retirado da caixinha: ${cx.nome} (removida)`, valor: guardado, recebido: true, data: dataHojeISO() });
    salvarBloco("saveGanhos", state.ganhos);
  }
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  renderAll();
}
function editCaixinha(index, nome, valorObjetivo, icone = "", data = "") {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const nomeAntigo = cx.nome;
  const objetivoAntes = Number(cx.valorObjetivo) || 0;
  const estavaCompleta = objetivoAntes > 0 && totalCaixinha(cx) >= objetivoAntes;
  cx.nome = nome;
  cx.valorObjetivo = valorObjetivo || 0;
  marcarAlteracaoLocal();
  cx.icone = normalizarNomeIcone(icone);
  cx.data = String(data || "").trim();
  marcarComemoracaoSeMetaBatida(cx, estavaCompleta);
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
  const objetivoAntes = Number(cx.valorObjetivo) || 0;
  const estavaCompleta = objetivoAntes > 0 && totalCaixinha(cx) >= objetivoAntes;
  // O depósito entra só no "guardado no mês" — ele só é somado à base (valorGuardado)
  // quando o mês fecha. O total exibido (totalCaixinha) já soma os dois, então o
  // saldo mostrado pro usuário não muda, só onde o valor fica guardado até o fechamento.
  cx.valorGuardadoMes = (Number(cx.valorGuardadoMes) || 0) + valor;
  marcarAlteracaoLocal();
  marcarComemoracaoSeMetaBatida(cx, estavaCompleta);
  state.gastosVariaveis.push({ nome: `Guardado: ${cx.nome}`, valor, pago: true, tipo: "Metas", data: dataHojeISO(), origem: "saldo" });
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  renderAll();
}
function retirarDaCaixinha(index, valor) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  // Tira primeiro do que foi guardado neste mês (o mais "recente"), e só desconta
  // da base (valorGuardado) o que sobrar — assim o total cai exatamente o valor
  // retirado, sem zerar um campo e deixar o outro alto por engano.
  const doMes = Math.min(valor, Number(cx.valorGuardadoMes) || 0);
  const doResto = valor - doMes;
  cx.valorGuardadoMes = Math.max((Number(cx.valorGuardadoMes) || 0) - doMes, 0);
  cx.valorGuardado = Math.max((Number(cx.valorGuardado) || 0) - doResto, 0);
  marcarAlteracaoLocal();
  state.ganhos.push({ nome: `Retirado da caixinha: ${cx.nome}`, valor, recebido: true, data: dataHojeISO() });
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  salvarBloco("saveGanhos", state.ganhos);
  renderAll();
}
// O usuário informa o valor TOTAL ATUALIZADO da caixinha (o que está
// mostrando hoje no banco/investimento) — não quanto rendeu. O app calcula
// a diferença sozinho (positiva = rendeu, negativa = essa caixinha perdeu
// valor no período) e acumula em rendimentoTotal, que vai pra coluna S na
// planilha (RENDIMENTO). Ver o badge em renderCaixinhas(): mostra em verde
// quando é ganho e em vermelho quando é perda, em vez de só sumir quando
// negativo (perda também é informação — esconder isso seria mascarar que a
// caixinha desvalorizou).
function informarRendimentoCaixinha(index, novoMontanteTotal) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const objetivoAntes = Number(cx.valorObjetivo) || 0;
  const estavaCompleta = objetivoAntes > 0 && totalCaixinha(cx) >= objetivoAntes;
  
  const valorBaseAtual = Number(cx.valorGuardado) || 0;
  const rendimentoAnterior = Number(cx.rendimentoTotal) || 0;
  const guardadoMesAtual = Number(cx.valorGuardadoMes) || 0;
  const totalAtualNaTela = valorBaseAtual + rendimentoAnterior + guardadoMesAtual;
  
  // O valor novo menos o total atual da tela dá o rendimento positivo (ex: 219 - 200 = 19)
  const diferencaRendimento = novoMontanteTotal - totalAtualNaTela;
  
  if (diferencaRendimento !== 0) {
    cx.rendimentoTotal = rendimentoAnterior + diferencaRendimento;
    marcarAlteracaoLocal();
  }
  marcarComemoracaoSeMetaBatida(cx, estavaCompleta);
  
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

// Marcador guardado dentro do PRÓPRIO nome do lançamento (não tem coluna
// extra sobrando na planilha pra isso) pra lembrar que aquela "metade" é uma
// dívida de uma compra dividida, e de quem é o dinheiro quando for paga.
// Ex: "Mercado (deve pra Davi)" — assim que a pessoa marca como paga (ver
// togglePagoVariavel/togglePagoFixo), a gente credita o Davi sozinho e tira
// esse pedacinho do nome, que volta a ficar limpo ("Mercado").
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

function nomeGanhoDivisao(devedor, nomeOriginal) {
  return `A receber de ${PESSOA_LABEL[devedor]}: ${String(nomeOriginal || "").trim()}`;
}
function encontrarGanhoDivisao(listaGanhos, devedor, nomeOriginal, valor, data) {
  const esperado = nomeGanhoDivisao(devedor, nomeOriginal);
  const candidatos = (listaGanhos || []).map((item, idx) => ({ item, idx })).filter(({ item }) => {
    if (String(item.nome || "") !== esperado) return false;
    if (Math.abs((Number(item.valor) || 0) - (Number(valor) || 0)) > 0.009) return false;
    return !data || !item.data || String(item.data).slice(0, 10) === String(data).slice(0, 10);
  });
  return candidatos.length ? candidatos[candidatos.length - 1] : null;
}
async function criarGanhoAReceberDivisao(credor, devedor, nomeOriginal, valor, tipo, data, recebido) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) return false;
  try {
    const lista = await obterListaLocal(credor, "ganhos");
    lista.push({ nome: nomeGanhoDivisao(devedor, nomeOriginal), valor, data: data || dataHojeISO(), recebido: !!recebido, tipo: tipo || "" });
    if (state.pessoaAtual === credor) marcarAlteracaoLocal();
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "saveGanhos", payload: lista, pessoa: credor }) });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) throw new Error("Erro ao criar ganho a receber");
    const cache = await getCache(credor);
    setCache(credor, { ...(cache || {}), ganhos: lista });
    if (state.pessoaAtual === credor) state.ganhos = lista;
    removerCache("ambos");
    agendarInsightPorAlteracaoFinanceira();
    return true;
  } catch { return false; }
}
async function atualizarGanhoDivisao(credor, devedor, nomeOriginal, valor, data, recebido) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) return false;
  try {
    const lista = await obterListaLocal(credor, "ganhos");
    const achado = encontrarGanhoDivisao(lista, devedor, nomeOriginal, valor, data);
    if (!achado) return false;
    achado.item.recebido = !!recebido;
    if (state.pessoaAtual === credor) marcarAlteracaoLocal();
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "saveGanhos", payload: lista, pessoa: credor }) });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) throw new Error("Erro ao atualizar ganho da divisão");
    const cache = await getCache(credor);
    setCache(credor, { ...(cache || {}), ganhos: lista });
    if (state.pessoaAtual === credor) state.ganhos = lista;
    removerCache("ambos");
    agendarInsightPorAlteracaoFinanceira();
    return true;
  } catch { return false; }
}

// opts: { tipo, data, pago, quemPagouTudo }
//   - quemPagouTudo ausente/null: modo padrão, metade pro Davi e metade pro
//     Gabriel, cada entrada com o status de "pago" escolhido no checkbox.
//   - quemPagouTudo = "davi" | "gabriel": essa pessoa pagou o valor CHEIO na
//     hora (entra como gasto integral e já pago pra ela); a outra entra só
//     com a metade, que é uma dívida com ela — se "pago" já vier marcado, a
//     metade já é creditada de cara; se não, fica pendente e só é creditada
//     quando a pessoa marcar essa metade como paga depois (ver os toggles).
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
  const base = { tipo, data, origem: "saldo" };

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
    // A partir daqui há uma alteração local lógica para a pessoa que estiver
    // em foco; qualquer GET antigo não pode sobrescrevê-la.
    if (state.pessoaAtual === "davi" || state.pessoaAtual === "gabriel") marcarAlteracaoLocal();

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
    removerCache("ambos"); // visão "Juntos" combina os dois — só invalida, recalcula quando for aberta

    // Se uma pessoa pagou tudo, a metade da outra vira um ganho A RECEBER
    // para quem pagou. O mesmo lançamento será marcado como recebido quando
    // a outra pessoa confirmar o pagamento; a categoria original é herdada.
    if (quemPagouTudo) {
      const devedor = quemPagouTudo === "davi" ? "gabriel" : "davi";
      const criouGanho = await criarGanhoAReceberDivisao(quemPagouTudo, devedor, nome, metade, tipo, data, pago);
      if (!criouGanho) return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

// Credita quem pagou a conta na hora quando a metade da outra pessoa é
// finalmente paga — só o ganho do pagador é criado aqui, porque o gasto de
// quem devia já é o próprio lançamento que acabou de ser marcado como pago
// (não duplica como uma transferência à parte).
async function creditarPagamentoDeDivisao(pagador, devedor, nomeOriginal, valor, tipo, data, recebido = true) {
  const atualizado = await atualizarGanhoDivisao(pagador, devedor, nomeOriginal, valor, data, recebido);
  if (atualizado) return true;
  return criarGanhoAReceberDivisao(pagador, devedor, nomeOriginal, valor, tipo, data, recebido);
}

// Espelha o que o backend (transferirEntrePessoas em Code.gs) faz: lança um
// gasto variável já pago de quem transfere e um ganho já recebido de quem
// recebe. Atualizando local/cache direto (em vez de invalidar e ter que
// buscar tudo de novo na planilha com carregarDados()), a tela responde na
// hora — igual já era feito em dividirCompra.
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
    if (state.pessoaAtual === de || state.pessoaAtual === para) marcarAlteracaoLocal();

    const [cacheDe, cachePara] = await Promise.all([getCache(de), getCache(para)]);
    setCache(de, { ...(cacheDe || {}), gastosVariaveis: listaVariaveisDe });
    setCache(para, { ...(cachePara || {}), ganhos: listaGanhosPara });
    if (state.pessoaAtual === de) state.gastosVariaveis = listaVariaveisDe;
    if (state.pessoaAtual === para) state.ganhos = listaGanhosPara;
    removerCache("ambos");
    agendarInsightPorAlteracaoFinanceira();

    return true;
  } catch (err) {
    return false;
  }
}

function fixoEhPago(item) { return item.pago === true; }
function variavelEhPago(item) { return item.pago === true; }
function ganhoEhRecebido(item) { return item.recebido === true; }

/* Benefício é qualquer ganho cujo nome contenha "beneficio", com ou sem
   acento e inclusive dentro de palavras como "Multibeneficio". */
function ganhoEhBeneficio(item) {
  const nome = String(item && item.nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return nome.includes("beneficio");
}

function separarGanhosPorOrigem(lista) {
  return (lista || []).reduce((acc, item) => {
    if (!ganhoEhRecebido(item)) return acc;
    const valor = Number(item.valor) || 0;
    if (ganhoEhBeneficio(item)) acc.beneficios += valor;
    else acc.ganhos += valor;
    return acc;
  }, { beneficios: 0, ganhos: 0 });
}
// Um "lembrete" (compra do mês que vem, paga adiantada) aparece na lista
// como pago, mas não deve contar de novo no saldo nem nos gastos por
// categoria deste mês — já foi debitado no mês em que a compra foi paga.
function variavelContaNoSaldo(item) { return item.pago === true && item.lembrete !== true; }
function variavelEhBeneficio(item) { return String(item && item.origem || "saldo").toLowerCase() === "beneficio"; }

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

  // Essa parcela é a "metade" de uma compra dividida (ver dividirCompra) e
  // acabou de ser marcada como paga: credita quem pagou a conta na hora e
  // tira a marcação do nome, que volta a ficar limpo.
  const credor = extrairCredorDivisao(item.nome);
  const nomeOriginal = removerSufixoDivisao(item.nome);
  if (credor) {
    if (vaiFicarPago) item.nome = nomeOriginal;
    atualizarGanhoDivisao(credor, state.pessoaAtual, nomeOriginal, item.valor, item.data, vaiFicarPago);
  } else if (!vaiFicarPago) {
    const outro = state.pessoaAtual === "davi" ? "gabriel" : "davi";
    atualizarGanhoDivisao(outro, state.pessoaAtual, item.nome, item.valor, item.data, false);
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
  // Mexer manualmente no status tira o item do modo "lembrete" (compra
  // adiantada) — a partir daqui ele volta a ser um lançamento comum, que
  // entra ou sai do saldo normalmente conforme o novo status.
  if (item.lembrete) item.lembrete = false;

  // Mesma lógica do togglePagoFixo acima: se essa metade era uma dívida de
  // compra dividida, credita quem pagou a conta na hora.
  const credor = extrairCredorDivisao(item.nome);
  const nomeOriginal = removerSufixoDivisao(item.nome);
  if (credor) {
    if (vaiFicarPago) item.nome = nomeOriginal;
    atualizarGanhoDivisao(credor, state.pessoaAtual, nomeOriginal, item.valor, item.data, vaiFicarPago);
  } else if (!vaiFicarPago) {
    const outro = state.pessoaAtual === "davi" ? "gabriel" : "davi";
    atualizarGanhoDivisao(outro, state.pessoaAtual, item.nome, item.valor, item.data, false);
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
// Total "de verdade" guardado numa caixinha: base + rendimento acumulado + o que foi
// depositado neste mês (que só é somado à base no fechamento do mês). Usar sempre essa
// função pra exibir "quanto tem guardado", em vez de olhar só valorGuardado.
function totalCaixinha(cx) {
  return (Number(cx.valorGuardado) || 0) + (Number(cx.rendimentoTotal) || 0) + (Number(cx.valorGuardadoMes) || 0);
}
function somaTotalCaixinhas(lista) { return (lista || []).reduce((acc, cx) => acc + totalCaixinha(cx), 0); }
// Soma dos Gastos Variáveis pagos que contam no saldo — exclui os marcados
// como "lembrete" (compra do mês que vem, paga adiantada: já foi debitada
// no mês em que foi paga, então não conta de novo aqui). Ver fecharMes() no
// Code.gs e o comentário em variavelContaNoSaldo().
function somaVariaveisPagas(lista) {
  return lista.reduce((acc, i) => acc + (i.pago === true && i.lembrete !== true ? Number(i.valor) || 0 : 0), 0);
}

function ehLancamentoDeCaixinha(nome) { return typeof nome === "string" && nome.indexOf("Guardado: ") === 0; }

function animarNumero(el, de, para, duracao = 650, pulsar = true) {
  if (!el) return;
  if (de === null || de === undefined || de === para) {
    el.textContent = fmt(para);
    return;
  }
  if (pulsar) {
    el.classList.remove("is-pulsing");
    void el.offsetWidth;
    el.classList.add("is-pulsing");
  }
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

function renderTotais() {
  const totalGanhosGeral = soma(state.ganhos);
  const totalGanhosRecebidos = somaComStatus(state.ganhos, "recebido");
  const ganhosPorOrigem = separarGanhosPorOrigem(state.ganhos);
  const totalGanhosAReceber = totalGanhosGeral - totalGanhosRecebidos;

  const totalFixosGeral = soma(state.gastosFixos);
  const totalFixosPagos = somaFixosPagos(state.gastosFixos);
  const totalFixosAPagar = totalFixosGeral - totalFixosPagos;

  const totalVariaveisGeral = soma(state.gastosVariaveis);
  const totalVariaveisPagos = somaVariaveisPagas(state.gastosVariaveis);
  const totalVariaveisAPagar = totalVariaveisGeral - totalVariaveisPagos;

  // "Guardado" aqui é o quanto entrou nas caixinhas ESSE mês — igual aos
  // outros 3 cards do topo (Ganhos/Fixos/Variáveis), que também são do mês
  // atual, não um acumulado. O total "de verdade" guardado em cada caixinha
  // (base + rendimento + o que entrou esse mês) já aparece no card de cada
  // caixinha individualmente — aqui é só a movimentação do mês.
  const totalGuardadoAtual = somaTotalCaixinhas(state.caixinhas);
  const totalGuardadoNoMes = somaCampo(state.caixinhas, "valorGuardadoMes");
  const saldo = totalGanhosRecebidos - totalFixosPagos - totalVariaveisPagos;

  const ganhosEl = document.getElementById("statGanhos");
  const fixosEl = document.getElementById("statFixos");
  const variaveisEl = document.getElementById("statVariaveis");
  const guardadoEl = document.getElementById("statGuardado");
  const saldoEl = document.getElementById("saldoValor");
  const beneficiosEl = document.getElementById("saldoBeneficios");
  const ganhosSaldoEl = document.getElementById("saldoGanhos");

  const primeiraVez = prevTotals.saldo === null;

  animarNumero(ganhosEl, prevTotals.ganhos, totalGanhosRecebidos);
  animarNumero(fixosEl, prevTotals.fixos, totalFixosPagos);
  animarNumero(variaveisEl, prevTotals.variaveis, totalVariaveisPagos);
  animarNumero(guardadoEl, prevTotals.guardado, totalGuardadoAtual);
  const guardadoMesEl = document.getElementById("statGuardadoMes");
  if (guardadoMesEl) guardadoMesEl.textContent = totalGuardadoNoMes > 0 ? `+ ${fmt(totalGuardadoNoMes)} neste mês` : "";

  // O saldo tem um pequeno indicador de variação dentro do próprio visor.
  // Nunca usamos textContent diretamente no container do saldo, porque isso
  // apagaria o indicador a cada frame da animação numérica.
  let saldoNumeroEl = saldoEl ? saldoEl.querySelector(".saldo-numero") : null;
  if (saldoEl && !saldoNumeroEl) {
    saldoNumeroEl = document.createElement("span");
    saldoNumeroEl.className = "saldo-numero";
    saldoNumeroEl.textContent = saldoEl.textContent.trim();
    saldoEl.textContent = "";
    saldoEl.appendChild(saldoNumeroEl);
  }
  // O saldo muda suavemente, mas o visor nunca pulsa.
  animarNumero(saldoNumeroEl, prevTotals.saldo, saldo, 650, false);

  // O visor do saldo mantém dimensões fixas e mostra apenas a variação
  // da última sincronização no canto direito — sem criar/remover o card.
  if (saldoEl) {
    let deltaEl = saldoEl.querySelector(".saldo-delta");
    if (!deltaEl) {
      deltaEl = document.createElement("span");
      deltaEl.className = "saldo-delta";
      deltaEl.setAttribute("aria-live", "polite");
      saldoEl.appendChild(deltaEl);
    }

    const deltaSaldo = primeiraVez ? 0 : saldo - (Number(prevTotals.saldo) || 0);

    // A variação aparece dentro do próprio visor do saldo por 1 segundo.
    // Depois, tanto a cor de entrada/saída quanto o texto desaparecem e o
    // visor volta exatamente ao estado original.
    if (saldoEl._deltaTimer) {
      clearTimeout(saldoEl._deltaTimer);
      saldoEl._deltaTimer = null;
    }

    saldoEl.classList.remove("saldo-subiu", "saldo-caiu");
    deltaEl.className = "saldo-delta";
    deltaEl.textContent = "";

    if (deltaSaldo > 0) {
      deltaEl.textContent = `+ ${fmt(deltaSaldo)}`;
      deltaEl.className = "saldo-delta positivo is-visible";
      saldoEl.classList.add("saldo-subiu");
    } else if (deltaSaldo < 0) {
      deltaEl.textContent = `− ${fmt(Math.abs(deltaSaldo))}`;
      deltaEl.className = "saldo-delta negativo is-visible";
      saldoEl.classList.add("saldo-caiu");
    }

    if (deltaSaldo !== 0) {
      saldoEl._deltaTimer = setTimeout(() => {
        deltaEl.classList.remove("is-visible");
        saldoEl.classList.remove("saldo-subiu", "saldo-caiu");
        setTimeout(() => {
          if (!deltaEl.classList.contains("is-visible")) {
            deltaEl.textContent = "";
            deltaEl.className = "saldo-delta";
          }
        }, 180);
      }, 1000);
    }
  }

  saldoEl.classList.toggle("negative", saldo < 0);

  // A composição abaixo do saldo é contextual: não mostramos uma origem
  // zerada e nunca deixamos o separador sozinho. Assim, se só houver
  // Benefício ou só houver Ganhos, aparece apenas o que existe; se ambos
  // forem zero, toda a linha desaparece.
  if (beneficiosEl) beneficiosEl.textContent = fmt(ganhosPorOrigem.beneficios);
  if (ganhosSaldoEl) ganhosSaldoEl.textContent = fmt(ganhosPorOrigem.ganhos);

  const saldoOrigensEl = document.getElementById("saldoOrigens");
  const beneficioOrigemEl = beneficiosEl ? beneficiosEl.closest(".saldo-origem") : null;
  const ganhoOrigemEl = ganhosSaldoEl ? ganhosSaldoEl.closest(".saldo-origem") : null;
  const separadorOrigensEl = saldoOrigensEl ? saldoOrigensEl.querySelector(".saldo-origens-separador") : null;
  const temBeneficio = Math.abs(Number(ganhosPorOrigem.beneficios) || 0) > 0.000001;
  const temGanhos = Math.abs(Number(ganhosPorOrigem.ganhos) || 0) > 0.000001;

  beneficioOrigemEl?.classList.toggle("is-zero", !temBeneficio);
  ganhoOrigemEl?.classList.toggle("is-zero", !temGanhos);
  separadorOrigensEl?.classList.toggle("is-hidden", !(temBeneficio && temGanhos));
  saldoOrigensEl?.classList.toggle("is-vazio", !(temBeneficio || temGanhos));

  const ganhosPendenteEl = document.getElementById("statGanhosPendente");
  if (ganhosPendenteEl) ganhosPendenteEl.textContent = totalGanhosAReceber > 0 ? `+ ${fmt(totalGanhosAReceber)}` : "";
  const fixosPendenteEl = document.getElementById("statFixosPendente");
  if (fixosPendenteEl) fixosPendenteEl.textContent = totalFixosAPagar > 0 ? `− ${fmt(totalFixosAPagar)}` : "";
  const variaveisPendenteEl = document.getElementById("statVariaveisPendente");
  if (variaveisPendenteEl) variaveisPendenteEl.textContent = totalVariaveisAPagar > 0 ? `− ${fmt(totalVariaveisAPagar)}` : "";

  prevTotals.ganhos = totalGanhosRecebidos;
  prevTotals.fixos = totalFixosPagos;
  prevTotals.variaveis = totalVariaveisPagos;
  prevTotals.guardado = totalGuardadoAtual;
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

// Verdadeiro se a DATA do item cair no mês seguinte ao mês atual do app
// (state.mesAtual/anoAtual) — só pra dar um destaque visual (ex: uma conta
// fixa que já foi lançada agora mas só vence mês que vem). Não muda em nada
// o cálculo do saldo nem o comportamento de Fechar Mês, é só um aviso.
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

// Verdadeiro se a DATA do item cair antes do mês atual do app (ficou pra
// trás — ex: um gasto variável do mês passado que não foi pago e por isso
// repetiu/rolou pro mês atual).
function ehDoMesAnterior(item) {
  if (!state.mesAtual || !state.anoAtual) return false;
  const m = /^(\d{4})-(\d{2})/.exec(String(item.data || ""));
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (ano < state.anoAtual) return true;
  return ano === state.anoAtual && mes < state.mesAtual;
}

// Verdadeiro se o item ainda estiver pendente (não pago/recebido),
// funciona tanto pra ganhos (campo "recebido") quanto pra fixos/variáveis
// (campo "pago").
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
  const dataCurta = formatarDataCurta(item.data);
  if (dataCurta) partes.push(`<span class="item-tag item-tag-data">${dataCurta}</span>`);
  return partes.length ? `<div class="item-meta">${partes.join("")}</div>` : "";
}

function nomeComParcela(item) {
  // A parcela fica como tag visual ao lado/antes do nome no card.
  // Mantemos esta função apenas para centralizar o escape do nome.
  return escapeHtml(item.nome);
}

function parcelaInlineHtml(item, tipo) {
  if (tipo !== "expense" || !item.parcela) return "";
  const parcela = String(item.parcela).trim();
  if (!/^\d+\s*\/\s*\d+$/.test(parcela)) return "";
  return `<span class="item-tag item-tag-parcela item-tag-parcela-inline">${escapeHtml(parcela)}</span>`;
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

// Lógica de "Arrastar" reformulada para suportar Touch (Celular) e Mouse (PC)
function habilitarSwipe(ul) {
  if (!ul || ul._swipeAtivado) return;
  ul._swipeAtivado = true;
  let ativo = null;

  const iniciar = (e) => {
    const li = e.target.closest(".item-list-row");
    // Ignora se estiver clicando nos botões ou checkboxes
    if (!li || e.target.closest(".swipe-actions") || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    
    // Captura a posição seja pelo Mouse ou Dedo
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
      // Pequena margem pra evitar ativar o arrasto atoa
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      clearTimeout(ativo.longPressTimer); 
      if (Math.abs(dy) > Math.abs(dx)) {
        ativo = null; // Scrollando para baixo, cancela o swipe
        return;
      }
      ativo.dragging = true;
    }
    
    // Evita selecionar o texto da página ao arrastar com o mouse
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

  // Eventos de Touch (Celular)
  ul.addEventListener("touchstart", iniciar, { passive: true });
  ul.addEventListener("touchmove", mover, { passive: false });
  ul.addEventListener("touchend", finalizar);
  ul.addEventListener("touchcancel", finalizar);

  // Eventos de Mouse (PC)
  ul.addEventListener("mousedown", iniciar);
  ul.addEventListener("mousemove", mover);
  window.addEventListener("mouseup", finalizar); // No window para não bugar se soltar fora
}

document.addEventListener("touchstart", (e) => {
    document.querySelectorAll(".item-list").forEach((ul) => {
      if (!e.target.closest(`#${ul.id}`)) fecharTodosSwipes(ul);
    });
  }, { passive: true }
);

// Adicione este bloco para fazer o mesmo com o clique no PC:
document.addEventListener("mousedown", (e) => {
  document.querySelectorAll(".item-list").forEach((ul) => {
    if (!e.target.closest(`#${ul.id}`)) fecharTodosSwipes(ul);
  });
});

// Compara duas datas "AAAA-MM-DD" (string) da mais antiga pra mais nova.
// Item sem data (string vazia) vai sempre pro final da lista, já que não dá
// pra saber onde ele entraria na ordem cronológica.
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
  // Guarda o índice original (idx) de cada item antes de ordenar — é esse
  // índice que precisa continuar batendo com state.ganhos/gastosFixos/
  // gastosVariaveis pra editar, excluir e marcar como pago funcionarem certo;
  // só a ORDEM DE EXIBIÇÃO muda, os dados por trás continuam nos mesmos
  // índices de sempre.
  const ordenados = lista
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => compararDataAscendente(a.item.data, b.item.data));
  ordenados.forEach(({ item, idx }, posicao) => {
    const on = item[statusKey] === true;
    const li = document.createElement("li");
    li.className = "item-list-row" + (on ? "" : " is-pendente") + (tipo === "income" ? (ganhoEhBeneficio(item) ? " ganho-beneficio" : " ganho-saldo") : "");
    li.dataset.tipo = tipo;
    li.style.animationDelay = Math.min(posicao * 35, 250) + "ms";
    li.innerHTML = `
      ${ambos ? "" : `<div class="swipe-actions">
              <button class="swipe-btn swipe-edit" aria-label="Editar" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_LAPIS}</span><span>Editar</span></button>
              <button class="swipe-btn swipe-delete" aria-label="Excluir" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_X}</span><span>Excluir</span></button>
            </div>`}
      <div class="swipe-content">
        <span class="item-nome">${parcelaInlineHtml(item, tipo)}${nomeComParcela(item)} ${tagPessoa(item)}</span>
        <span class="item-valor ${tipo}${tipo === "income" && ganhoEhBeneficio(item) ? " income-beneficio" : ""}">${fmt(item.valor)}</span>
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

// Ícone de alvo (usado no cabeçalho das caixinhas COM meta)
const ICONE_ALVO = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.7" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>`;
// Troféu — usado no selo da caixinha e no chip quando a meta é batida.
const ICONE_TROFEU = `<svg viewBox="0 0 24 24" fill="none"><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5v.5a3 3 0 0 0 3 3h1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 5h2.5A1.5 1.5 0 0 1 20 6.5v.5a3 3 0 0 1-3 3h-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 19h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 15.2c0 1.6.9 2.6 2 2.6s2-1 2-2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Texto de progresso ("Começando" → "Quase lá!") mostrado nas caixinhas
// com meta, dando um retorno tipo jogo de quanto falta pra próxima etapa.
function statusCaixinha(pct) {
  if (pct >= 90) return "Quase lá!";
  if (pct >= 50) return "Na metade";
  if (pct >= 25) return "Em ritmo";
  return "Começando";
}

// Cabeçalho de agrupamento da lista de caixinhas ("Com meta" / "Sem meta")
// Ações reais de editar/excluir uma caixinha — chamadas tanto pelo botão
// revelado no swipe quanto por um arrasto "completo" (que já executa
// direto, sem precisar soltar em cima do botão).
function acionarEditarCaixinha(idx) {
  const cx = state.caixinhas[idx];
  if (!cx) return;
  abrirModalEditar("caixinhas", idx, { nome: cx.nome, valor: cx.valorObjetivo, icone: cx.icone || "", data: cx.data || "" });
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

function formatarPrazoCaixinha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function diasAtePrazoCaixinha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - hojeLocal) / 86400000);
}

function montarInfoPrazoCaixinha(data, completa) {
  const prazo = formatarPrazoCaixinha(data);
  if (!prazo) return "";
  const dias = diasAtePrazoCaixinha(data);
  let classe = "";
  if (!completa && dias !== null) {
    if (dias < 0) classe = "atrasada";
    else if (dias === 0) classe = "hoje";
    else if (dias <= 30) classe = "proxima";
  }
  const calendario = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M7 3.5v3M17 3.5v3M3.5 9h17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 13h2M14 13h2M8 17h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  return `<span class="caixinha-prazo ${classe}" title="Prazo da caixinha">${calendario}<span>${prazo}</span></span>`;
}

function montarCardCaixinha(cx, idx, ambos) {
  const valorBase = Number(cx.valorGuardado) || 0;
  const rendimentoTotal = Number(cx.rendimentoTotal) || 0;
  const guardadoMes = Number(cx.valorGuardadoMes) || 0;

  // O valor total considerado é a soma do que está na caixinha + rendimentos + o que
  // foi guardado neste mês (que só entra na base quando o mês fechar)
  const guardado = valorBase + rendimentoTotal + guardadoMes;

  const objetivo = Number(cx.valorObjetivo) || 0;
  const temObjetivo = objetivo > 0;
  const falta = Math.max(objetivo - guardado, 0);
  const pct = temObjetivo ? Math.min((guardado / objetivo) * 100, 100) : 0;
  const completo = temObjetivo && falta <= 0;
  const vazia = guardado <= 0;
  const prazoHtml = montarInfoPrazoCaixinha(cx.data || "", completo);

  // IMPORTANTE: uma meta já concluída ao carregar a planilha NÃO dispara
  // comemoração. A comemoração só é marcada pelas ações que realmente fazem
  // uma caixinha passar de incompleta para completa (guardar, rendimento ou
  // edição). Assim abrir/recarregar o app nunca solta confete novamente.

  // Ícone de rendimento em SVG: seta pra cima (ganho) ou pra baixo (perda),
  // decidido na hora de montar o card abaixo.
  const iconeRendimentoUp = `<svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none"><path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6h6v6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const iconeRendimentoDown = `<svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none"><path d="M23 18l-9.5-9.5-5 5L1 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 18h6v-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const temRendimento = rendimentoTotal !== 0;
  const rendimentoEhGanho = rendimentoTotal > 0;

  const valoresHtml = `<span class="caixinha-guardado"><strong>${fmt(guardado)}</strong>${temObjetivo ? ` <span class="caixinha-de">/ ${fmt(objetivo)}</span>` : " guardados"}</span>
       ${temRendimento ? `<span class="item-tag ${rendimentoEhGanho ? "item-tag-rendimento" : "item-tag-perda"}" style="display:inline-flex;align-items:center;gap:4px;" title="${rendimentoEhGanho ? "Rendimento" : "Perda"}">${rendimentoEhGanho ? iconeRendimentoUp : iconeRendimentoDown}${fmt(Math.abs(rendimentoTotal))}</span>` : ""}`;

  // Ícone: caixinha com meta vira um selo circular cujo anel se preenche
  // com o progresso (tipo anel de nível/XP); sem meta mantém o cofrinho.
  const iconePersonalizado = normalizarNomeIcone(cx.icone || "");
  const iconePersonalizadoHtml = iconePersonalizado
    ? (temObjetivo
      ? `<span class="goal-icon-ring goal-icon-ring-custom ${completo ? "completo" : ""}" style="--pct:${pct}%"><span class="goal-icon-ring-inner"><img src="${escapeHtml(urlIconeCaixinha(iconePersonalizado))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML=ICONE_COFRINHO"></span></span>`
      : `<span class="goal-icon goal-icon-custom sem-meta"><img src="${escapeHtml(urlIconeCaixinha(iconePersonalizado))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML=ICONE_COFRINHO"></span>`)
    : "";
  const iconeHtml = iconePersonalizadoHtml || (temObjetivo
    ? `<span class="goal-icon-ring ${completo ? "completo" : ""}" style="--pct:${pct}%"><span class="goal-icon-ring-inner">${completo ? ICONE_TROFEU : ICONE_ALVO}</span></span>`
    : `<span class="goal-icon sem-meta">${ICONE_COFRINHO}</span>`);

  const quase = temObjetivo && !completo && pct >= 90;

  // Chip "faltam R$X" (ou "Conquistada" quando bate a meta) — sempre
  // alinhado à direita via margin-left:auto no CSS.
  const chipFalta = temObjetivo
    ? `<span class="goal-falta ${completo ? "completo" : ""}">${completo ? ICONE_TROFEU + " Conquistada" : "faltam " + fmt(falta)}</span>`
    : "";

  // Caixinha com meta mas ainda sem nada guardado: nada de barra vazia
  // nem linha solta — cabeçalho e "faltam X" numa única linha compacta.
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
    ${temObjetivo ? `<div class="goal-meta-linha">${prazoHtml}${chipFalta}</div>` : (prazoHtml ? `<div class="goal-prazo-linha">${prazoHtml}</div>` : "")}
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

  // Fora do modo "Ambos": card fica dentro de um wrapper de swipe — arrastar
  // pra esquerda revela "Editar", pra direita revela "Excluir"; tocar no
  // card (sem arrastar) abre o menu de ações (guardar/retirar/% rendeu).
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
      const data = String(item.data || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
      const d = new Date(`${data}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d >= inicio7 && d <= hoje;
   })
   .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || b._ordem - a._ordem);

  const exibidos = mostrarTodosRecentes ? base : base.slice(0, 2);
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
    row.className = `ledger-item ${item.tipo === "income" ? (benefit ? "income-beneficio" : "income-saldo") : "expense"}`;
    row.innerHTML = `
      <span class="ledger-icon ${item.tipo}${benefit ? " income-beneficio" : ""}">${item.tipo === "income" ? ICONE_GANHO : ICONE_GASTO}</span>
      <div class="ledger-info">
        <span class="ledger-nome">${escapeHtml(item.nome)} ${tagPessoa(item)}</span>
        <span class="ledger-tag">${escapeHtml(item.tag)}</span>
      </div>
      <span class="ledger-valor ${item.tipo}${benefit ? " income-beneficio" : ""}">${item.tipo === "income" ? "+" : "−"} ${fmt(item.valor)}</span>
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

let suprimirEntradaNoProximoRenderAll = false;

function colecaoMudou(antes, depois) {
  try { return JSON.stringify(antes || []) !== JSON.stringify(depois || []); }
  catch { return true; }
}
function renderIncremental(mudancas) {
  const financeiroMudou = mudancas.ganhos || mudancas.gastosFixos || mudancas.gastosVariaveis || mudancas.caixinhas;
  if (mudancas.ganhos) renderListaComStatus("listaGanhos", state.ganhos, "income", opGanhos, "ganhos", "recebido", toggleRecebidoGanho, "Recebido", "Pendente");
  if (mudancas.gastosFixos) renderListaComStatus("listaFixos", state.gastosFixos, "expense", opFixos, "fixos", "pago", togglePagoFixo, "Pago", "Pendente");
  if (mudancas.gastosVariaveis) renderListaComStatus("listaVariaveis", state.gastosVariaveis, "expense", opVariaveis, "variaveis", "pago", togglePagoVariavel, "Pago", "Pendente");
  if (mudancas.caixinhas) renderCaixinhas();
  if (financeiroMudou) {
    renderTotais(); renderVisaoGeral(); renderCategorias(); renderRecentes(); renderSplit(); renderJuntosView(); atualizarCarrosselGraficos();
  }
  if (mudancas.categoriasConfig || mudancas.iconCategorias) {
    popularSelectsDeCategoria();
    renderListaComStatus("listaFixos", state.gastosFixos, "expense", opFixos, "fixos", "pago", togglePagoFixo, "Pago", "Pendente");
    renderListaComStatus("listaVariaveis", state.gastosVariaveis, "expense", opVariaveis, "variaveis", "pago", togglePagoVariavel, "Pago", "Pendente");
  }
}

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

  // Altura do carrossel acompanha só a página ativa (ver comentário no
  // CSS, .graficos-carousel) — sem isso, uma página com bem mais conteúdo
  // (categoria com muitos tipos de gasto) esticava as outras junto.
  // offsetHeight (não scrollHeight): scrollHeight não conta a borda de 1px
  // do card (.historico-grafico-wrap tem border: 1px solid), só conteúdo +
  // padding. Com a altura do wrap fixada 2px menor que o card de verdade e
  // "overflow-y: hidden" no carrossel, a borda de baixo ficava cortada.
  const alturaAlvo = cards[ativo].offsetHeight;
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

const PALETA_CATEGORIAS = [
  "#b9862f", "#3c6e4f", "#a8482e", "#5c8aa6", "#8a6bb5",
  "#c99a3f", "#4d9e8a", "#c46a8f", "#7a9e4d", "#a67a4d",
  "#d96a53", "#6c8c77", "#b59b52", "#5b778c", "#9678a3", 
  "#80705a", "#a15a4b", "#4a7866", "#c2a36b", "#6a5c78", 
  "#8b7e66", "#588f82", "#b5725c", "#7d8c85", "#6e7580",
  "#4f5d8a", "#9e5a3f", "#5a8a5e", "#8a4f7a", "#c9885c",
  "#d35400", "#34495e", "#4b6584", "#eb3b5a", "#20bf6b"
];

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

// ---------------------------------------------------------------------
// INSIGHT — frase curta gerada com IA (Gemini, via Code.gs — ver
// gerarInsightComGemini), atualizada sozinha sempre que os dados
// terminam de sincronizar com a planilha (não tem mais botão manual).
// ---------------------------------------------------------------------

// Categorias pagas do mês em aberto (mesma regra do card "Visão por categoria")
function categoriasMesAtual() {
  const mapa = {};
  [...state.gastosFixos.filter(fixoEhPago), ...state.gastosVariaveis.filter(variavelContaNoSaldo)].forEach((item) => {
    const cat = (item.tipo && String(item.tipo).trim()) || "Outros";
    mapa[cat] = (mapa[cat] || 0) + (Number(item.valor) || 0);
  });
  return mapa;
}

// Todos os meses já fechados no HISTORICO, em ordem cronológica
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

// Todos os meses fechados de um ano específico (histórico), em ordem.
function mesesDoAnoHistorico(ano) {
  return mesesHistoricoOrdenados().filter((m) => m.ano === ano);
}

// O mesmo número de mês do ano anterior (ex: Agosto/2026 -> Agosto/2025),
// se já existir fechado no histórico — pra comparação "mesmo mês, ano
// passado" (diferente de mesAnteriorHistorico, que é só o mês imediatamente
// anterior). Usa state.mesAtual/anoAtual, então já muda sozinho quando o
// ano vira — nunca tem um ano fixo escrito no código.
function mesmoMesAnoAnteriorHistorico() {
  if (!state.mesAtual || !state.anoAtual) return null;
  return mesesHistoricoOrdenados().find((m) => m.mes === state.mesAtual && m.ano === state.anoAtual - 1) || null;
}

// Soma de todos os meses FECHADOS de um ano (ganhos/gastos/guardado) — usada
// tanto pro ano em andamento (soma com o mês atual à parte, ver
// montarResumoParaInsight) quanto pro ano anterior completo.
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

// As três funções abaixo já resolvem sozinhas Davi/Gabriel/Ambos, olhando
// pra state.pessoaAtual — assim quem chama não precisa se preocupar com isso.
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
// Diferente da função acima (que lê só o DEPÓSITO daquele mês): esta lê o
// TOTAL acumulado nas caixinhas no momento em que aquele mês foi fechado
// (guardadoDavi/guardadoGabriel no HISTORICO — o mesmo "saldo real", não um
// delta). É a partir dessas fotografias que dá pra calcular quanto as
// caixinhas realmente cresceram num período, descontando qualquer saque no
// meio do caminho (ver totalGuardadoLiquidoNoPeriodo).
function totalGuardadoAcumuladoDeUmMesHistorico(mesObj) {
  if (!mesObj) return 0;
  if (state.pessoaAtual === "davi") return mesObj.guardadoDavi || 0;
  if (state.pessoaAtual === "gabriel") return mesObj.guardadoGabriel || 0;
  return (mesObj.guardadoDavi || 0) + (mesObj.guardadoGabriel || 0);
}
// Total acumulado no fechamento do ÚLTIMO mês fechado de um ano — serve de
// "linha de base" pra saber quanto tinha guardado no fim daquele ano. Null
// quando não existe nenhum mês fechado daquele ano no histórico (ex: antes
// do usuário começar a usar o app).
function totalGuardadoNoFimDoAno(ano) {
  const meses = mesesDoAnoHistorico(ano);
  if (!meses.length) return null;
  return totalGuardadoAcumuladoDeUmMesHistorico(meses[meses.length - 1]);
}
// Crescimento LÍQUIDO das caixinhas entre o fim de um ano e um total de
// referência (o de hoje, ou o fim de outro ano) — total final menos total
// inicial. Diferente de somar os "guardado no mês" de cada mês do período
// (o que a gente fazia antes): aquilo soma só os DEPÓSITOS e ignora
// qualquer saque no meio do caminho, então dava um número maior do que a
// pessoa realmente tem hoje se ela guardou num mês e tirou no mês seguinte.
// Se não existir linha de base (nenhum mês fechado ainda naquele ano
// anterior), assume que começou do zero.
function totalGuardadoLiquidoNoPeriodo(totalFinal, ano) {
  const base = totalGuardadoNoFimDoAno(ano);
  return totalFinal - (base === null ? 0 : base);
}


// ---- Insight com IA (gerado sozinho a cada sincronização) --------------

// No modo "Juntos" (ambos), as transferências entre as duas pessoas viram
// um gasto (na saída) e um ganho (na chegada) com nome "Transferência p/
// NOME: ..." / "Transferência de NOME: ...". Detecta essas linhas pra
// contar pra IA — assim ela pode comentar quando alguém ajudou o outro.
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

// Detalhe de cada caixinha (meta e/ou investimento) — dá pra IA falar de
// progresso de meta e rendimento de forma específica, não só um total.
// valorGuardado aqui já é o total "de verdade" (mesma conta de totalCaixinha,
// usada em todo o resto do app pra exibir "quanto tem guardado"): base +
// rendimentoTotal + valorGuardadoMes. Antes mandava só a base pra IA, que
// ficava sem saber quanto realmente tinha guardado e calculava errado
// quanto faltava pra bater a meta.
function calcularPlanejamentoPrazoCaixinha(iso, falta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((alvo - hojeLocal) / 86400000);
  if (dias < 0) return { diasAtePrazo: dias, mesesAtePrazo: 0, necessarioPorMes: null };
  const meses = Math.max(1, Math.ceil(dias / 30.4375));
  return {
    diasAtePrazo: dias,
    mesesAtePrazo: meses,
    necessarioPorMes: falta > 0 ? falta / meses : 0,
  };
}

function caixinhasDetalhadasParaInsight() {
  return (state.caixinhas || []).map((cx) => {
    const temMeta = Number(cx.valorObjetivo) > 0;
    const totalGuardadoDeVerdade = totalCaixinha(cx);
    const falta = temMeta ? Math.max(Number(cx.valorObjetivo) - totalGuardadoDeVerdade, 0) : 0;
    const planejamento = cx.data ? calcularPlanejamentoPrazoCaixinha(cx.data, falta) : null;
    const guardadoNesseMes = Number(cx.valorGuardadoMes) || 0;
    return {
      nome: cx.nome,
      valorGuardado: totalGuardadoDeVerdade,
      valorObjetivo: temMeta ? Number(cx.valorObjetivo) : null,
      faltaParaMeta: temMeta ? falta : null,
      percentualDaMeta: temMeta ? Math.round((totalGuardadoDeVerdade / Number(cx.valorObjetivo)) * 100) : null,
      rendimentoTotal: Number(cx.rendimentoTotal) || 0,
      guardadoNesseMes,
      prazo: cx.data || null,
      diasAtePrazo: planejamento ? planejamento.diasAtePrazo : null,
      mesesAtePrazo: planejamento ? planejamento.mesesAtePrazo : null,
      necessarioGuardarPorMes: planejamento ? planejamento.necessarioPorMes : null,
      diferencaParaMediaMensalNesteMes: planejamento && planejamento.necessarioPorMes !== null
        ? Math.max(planejamento.necessarioPorMes - guardadoNesseMes, 0)
        : null,
    };
  });
}

// Em que situação está um lançamento agora, pro mês em andamento — usado
// pra IA distinguir "já pago", "ainda vai vencer esse mês", "atrasado desde
// o mês passado" e "lançado adiantado pro mês que vem", em vez de só ver um
// total agregado sem saber qual pedaço é o quê.
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
    tipoLancamento, // "fixo" (mensalidade/parcela) ou "variavel" (avulso)
    status: statusDoLancamento(item), // pago | pendente | atrasado | mes_que_vem | pago_adiantado
  };
  if (tipoLancamento === "variavel") det.origem = variavelEhBeneficio(item) ? "beneficio" : "saldo";
  // Só existe no modo "Juntos" (ver isAmbos()) — de qual das duas pessoas é
  // esse lançamento. ESSENCIAL: sem isso a IA não tem como saber de quem é
  // cada coisa e acaba chutando/misturando (foi assim que ela atribuiu um
  // gasto que era só do Davi como se fosse do casal genericamente).
  if (item.pessoa) det.pessoa = PESSOA_LABEL[item.pessoa] || item.pessoa;
  // Só fixos têm parcela nessa planilha. Ex: "1/5" = essa é a 1ª de 5 parcelas.
  if (item.parcela && /^\d+\s*\/\s*\d+$/.test(String(item.parcela).trim())) {
    det.parcela = String(item.parcela).trim();
  }
  return det;
}

// Nome de verdade (não só categoria/total) de cada ganho recebido e de TODO
// gasto do mês em andamento — fixo ou variável, pago ou pendente — pra IA
// poder citar um lançamento específico (ex: "Almoço - Tia Marina"), cruzar
// categoria entre um gasto fixo parcelado e um variável à vista da mesma
// categoria, saber quando algo é parcelado, apontar uma conta atrasada pelo
// nome, e (no modo Juntos) saber de qual das duas pessoas é cada lançamento
// — em vez de só falar em totais e categorias agregadas (que é tudo que ela
// recebia até agora). Fica de fora o que já é lançamento automático de
// caixinha (guardar/retirar), porque isso já aparece detalhado em
// caixinhasDetalhadasParaInsight.
function lancamentosComNomeDoMes() {
  const ganhos = (state.ganhos || [])
    .filter((g) => g.recebido === true)
    .map((g) => {
      const det = {
        nome: g.nome,
        valor: Number(g.valor) || 0,
        beneficio: ganhoEhBeneficio(g),
      };
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

// Só faz sentido no modo "Juntos" (ver isAmbos()): o mesmo recorte do mês
// atual, mas separado por pessoa — pra IA poder comparar quem gastou mais
// em quê, calcular o % da renda combinada que foi pra uma categoria, etc,
// em vez de só ver um número combinado dos dois sem saber a fatia de cada um.
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
    const ganhosPorOrigemP = separarGanhosPorOrigem(ganhosP);
    porPessoa[p] = {
      nome: PESSOA_LABEL[p],
      ganhosRecebidos: ganhosPorOrigemP.beneficios + ganhosPorOrigemP.ganhos,
      beneficiosRecebidos: ganhosPorOrigemP.beneficios,
      ganhosRecebidosSemBeneficio: ganhosPorOrigemP.ganhos,
      gastoFixoPago: soma(fixosPagosP),
      gastoVariavelPago: soma(variaveisPagosP),
      categorias,
    };
  });
  return porPessoa;
}
// Mesma ideia acima, mas pra um mês já fechado do HISTORICO (que já guarda
// ganhos/débitos/categorias separados por Davi e por Gabriel).
function porPessoaDeUmMesHistorico(mesObj) {
  if (!mesObj) return null;
  return {
    davi: { nome: PESSOA_LABEL.davi, ganhos: mesObj.ganhosDavi || 0, gastos: mesObj.debitosDavi || 0, categorias: mesObj.categoriasDavi || {} },
    gabriel: { nome: PESSOA_LABEL.gabriel, ganhos: mesObj.ganhosGabriel || 0, gastos: mesObj.debitosGabriel || 0, categorias: mesObj.categoriasGabriel || {} },
  };
}

// Resumo enviado pro backend: mês atual (em andamento) vs mês passado (já
// fechado no histórico), com o detalhe de fixos/variáveis/caixinhas por
// inteiro — pra IA entender a "vida financeira" completa, não só totais.
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
  // Total de VERDADE guardado agora, hoje — a mesma soma que aparece na aba
  // Caixinhas. É a partir DELE (e não de nenhuma soma de meses diferentes)
  // que a IA deve falar "quanto você tem guardado" — ver o campo
  // totalGuardadoAtualDeVerdade logo abaixo e a explicação no prompt do Gemini.
  const totalGuardadoAgora = somaTotalCaixinhas(state.caixinhas);

  // Pendências do mês em andamento — quanto ainda falta receber/pagar, pra
  // IA poder comentar sobre isso (ex: "ainda tem R$X a receber esse mês").
  // Importante: um lançamento pendente com data do MÊS QUE VEM (ver
  // ehDoProximoMes — ex: uma parcela de fixo que só vence no próximo mês,
  // mas já foi cadastrada agora) ainda não é uma pendência DESTE mês, então
  // fica de fora dessa soma — senão a IA falava "ainda falta pagar" um valor
  // que só vence mês que vem.
  function somaPendenteDoMesAtual(lista) {
    return (lista || []).reduce((acc, item) => {
      if (estaPendente(item) && !ehDoProximoMes(item)) return acc + (Number(item.valor) || 0);
      return acc;
    }, 0);
  }
  const ganhosAReceber = somaPendenteDoMesAtual(state.ganhos);
  const gastosFixosAPagar = somaPendenteDoMesAtual(state.gastosFixos);
  const gastosVariaveisAPagar = somaPendenteDoMesAtual(state.gastosVariaveis);

  // Totais do ano corrente "até agora" = todo mês já fechado nesse ano
  // (histórico) + o mês em andamento. E o ano anterior completo, pra dar
  // pano de fundo de "esse ano tá indo melhor/pior que o ano passado".
  // Tudo calculado a partir de state.anoAtual, então quando o ano vira (o
  // usuário fecha Dezembro e o app avança pra Janeiro do ano seguinte) isso
  // passa a apontar sozinho pro ano novo, sem precisar mexer em nada aqui.
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
      beneficiosRecebidos: separarGanhosPorOrigem(state.ganhos).beneficios,
      ganhosRecebidosSemBeneficio: separarGanhosPorOrigem(state.ganhos).ganhos,
      gastosFixosPagos,
      gastosVariaveisPagos,
      // Mesma fórmula do saldo mostrado na tela (renderTotais/#saldoValor):
      // ganhos recebidos menos fixos e variáveis pagos, SEM subtrair o
      // guardado nas caixinhas — guardar não é um gasto, o dinheiro ainda é
      // seu. Antes subtraía guardadoNoMes aqui, o que fazia a IA falar um
      // saldo diferente do que aparece na tela.
      saldoDisponivelAgora: ganhosRecebidos - gastosFixosPagos - gastosVariaveisPagos,
      guardadoNoMes,
      categorias: categoriasMesAtual(),
      // "Ainda falta entrar/sair" — não é gasto/ganho perdido, é só o que já
      // está lançado mas ainda não foi marcado como recebido/pago.
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
    // Mesmo mês, um ano antes (ex: Agosto/2026 vs Agosto/2025) — diferente
    // do mesPassado acima (que é sempre o mês imediatamente anterior). Só
    // existe quando já tem pelo menos um ano de histórico fechado.
    mesmoMesAnoPassado: mesmoMesAnoPassadoObj ? {
      nome: nomeMesAtual,
      ano: anoAtualNum - 1,
      ganhos: totalGanhosDeUmMesHistorico(mesmoMesAnoPassadoObj),
      gastos: totalDebitosDeUmMesHistorico(mesmoMesAnoPassadoObj),
      guardadoNoMes: totalGuardadoNoMesDeUmMesHistorico(mesmoMesAnoPassadoObj),
      categorias: categoriasDeUmMesHistorico(mesmoMesAnoPassadoObj),
    } : `Ainda não há dados de ${nomeMesAtual}/${anoAtualNum - 1} no histórico`,
    // Visão do ano inteiro — soma de todo mês já fechado nesse ano mais o
    // mês em andamento, e o ano anterior completo (quando existir), pra IA
    // poder falar de tendência ao longo do ano ("você já guardou X esse
    // ano", "esse ano tá X% acima do ano passado até aqui" etc).
    anoAtualAteAgora: {
      ano: anoAtualNum,
      mesesFechadosNesteAno: totaisAnoAtualFechados.mesesFechados,
      ganhos: totaisAnoAtualFechados.ganhos + ganhosRecebidos,
      gastos: totaisAnoAtualFechados.gastos + gastosFixosPagos + gastosVariaveisPagos,
      // Crescimento LÍQUIDO das caixinhas neste ano (total de hoje menos o
      // total que já estava guardado no fim do ano anterior) — não é soma
      // de depósito mês a mês, então já desconta qualquer saque que tenha
      // rolado no meio do caminho. Ver totalGuardadoLiquidoNoPeriodo.
      guardado: totalGuardadoLiquidoNoPeriodo(totalGuardadoAgora, anoAtualNum - 1),
      observacao: `Soma dos ${totaisAnoAtualFechados.mesesFechados} meses já fechados de ${anoAtualNum} mais o mês atual (${nomeMesAtual}), que ainda está em andamento`,
    },
    anoAnteriorCompleto: totaisAnoAnterior.mesesFechados > 0 ? {
      ano: anoAtualNum - 1,
      mesesFechados: totaisAnoAnterior.mesesFechados,
      ganhos: totaisAnoAnterior.ganhos,
      gastos: totaisAnoAnterior.gastos,
      // Mesma lógica líquida acima, mas pro ano anterior inteiro: total
      // guardado no fim daquele ano menos o total que já tinha no fim do
      // ano anterior a ele.
      guardado: totalGuardadoLiquidoNoPeriodo(totalGuardadoNoFimDoAno(anoAtualNum - 1), anoAtualNum - 2),
    } : `Ainda não há nenhum mês fechado de ${anoAtualNum - 1} no histórico`,
    // O total REAL guardado agora, hoje, em todas as caixinhas somadas —
    // igual ao que aparece na aba Caixinhas. Use SEMPRE este campo quando
    // for falar "quanto você tem guardado" ou "total guardado atualmente";
    // nunca some valores de meses diferentes pra chegar nesse número, já
    // que pode ter havido saques entre um mês e outro.
    totalGuardadoAtualDeVerdade: totalGuardadoAgora,
    caixinhas: caixinhas.length ? caixinhas : "Nenhuma caixinha cadastrada ainda",
    rendimentoTotalAcumuladoEmTodasAsCaixinhas: totalRendimentoAcumulado,
    lancamentosComNomeDoMesAtual: lancamentosComNomeDoMes(),
  };

  if (state.pessoaAtual === "ambos") {
    const transferencias = transferenciasDoMes();
    resumo.transferenciasEntreOsDoisEsseMes = transferencias.length ? transferencias : "Nenhuma transferência entre os dois esse mês";
    // Recorte por pessoa — só existe no modo Juntos. Sem isso a IA só via
    // números combinados dos dois e não conseguia comparar quem gastou mais
    // em quê, nem calcular a fatia de cada um.
    resumo.mesAtual.porPessoa = resumoPorPessoaMesAtual();
    if (mesPassadoObj) resumo.mesPassado.porPessoa = porPessoaDeUmMesHistorico(mesPassadoObj);
  }

  return resumo;
}

// A IA marca cada valor em dinheiro indicando de que tipo ele é —
// {{ganho:R$ 5,00}}, {{gasto:R$ 5,00}}, {{guardado:R$ 5,00}} ou
// {{rendimento:R$ 5,00}} — e aqui a gente troca isso pela mesma cor usada
// pra cada um no gráfico histórico (Ganhos verde, Gastos vermelho, Guardado
// amarelo, Rendimento azul). {{+}}/{{-}} continuam existindo como fallback
// pra valor genérico (favorável/desfavorável) que não é claramente um dos
// quatro tipos, tipo saldo. Escapa tudo primeiro pra nunca deixar a IA
// injetar HTML de verdade, só esses marcadores viram tag — e qualquer
// {{...}} que sobrar fora do formato esperado só perde as chaves no final,
// pra nunca aparecer cru na tela mesmo se a IA errar o formato.
function renderizarTextoInsight(texto) {
  const seguro = escapeHtml(String(texto || ""));
  return seguro
    .replace(/\{\{beneficio:([^{}]+)\}\}/gi, '<span class="insight-valor-beneficio">$1</span>')
    .replace(/\{\{ganho:([^{}]+)\}\}/gi, '<span class="insight-valor-pos">$1</span>')
    .replace(/\{\{gasto:([^{}]+)\}\}/gi, '<span class="insight-valor-neg">$1</span>')
    .replace(/\{\{guardado:([^{}]+)\}\}/gi, '<span class="insight-valor-guardado">$1</span>')
    .replace(/\{\{rendimento:([^{}]+)\}\}/gi, '<span class="insight-valor-rendimento">$1</span>')
    .replace(/\{\{\+([^{}]+)\}\}/g, '<span class="insight-valor-pos">$1</span>')
    .replace(/\{\{-([^{}]+)\}\}/g, '<span class="insight-valor-neg">$1</span>')
    .replace(/\{\{([^{}]+)\}\}/g, "$1");
}

// Guarda o texto de IA atualmente exibido, pra não refazer o fade quando o
// texto novo é idêntico ao que já está na tela (ver mostrarInsightTexto).
let insightTextoAtualExibido = null;

// Troca o texto/estado visual do card (carregando / ia / erro). No estado
// "carregando" mostra 3 pontinhos animados no lugar do texto, centralizados.
function mostrarInsightTexto(texto, modo) {
  const el = document.getElementById("insightTexto");
  if (!el) return;

  // Fade "fantasma": acontece quando o placeholder inicial (ao abrir a
  // página) já mostra um item da fila só espiando, sem consumir — e
  // segundos depois a sincronização consome esse mesmo item da fila e manda
  // mostrar de novo: mesmo texto, fade à toa. Se já é exatamente o que está
  // na tela, não refaz a troca.
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

  // Se já tem algo visível no card, dá um fade (opacity some, troca o
  // conteúdo por baixo, opacity volta) em vez de trocar seco — a duração do
  // setTimeout bate com a transição de ".insight-texto" no style.css.
  if (el.innerHTML.trim()) {
    el.classList.add("is-trocando");
    setTimeout(aplicarConteudo, 200);
  } else {
    aplicarConteudo();
  }
}

// Guarda o último insight já mostrado de cada pessoa, só pra aparecer na
// hora ao abrir o app de novo (sem precisar esperar a sincronização de
// novo) — e um "estoque" de insights já gerados e ainda não mostrados, pra
// já ter um pronto na próxima sincronização em vez de esperar a IA de novo.
const INSIGHT_CACHE_PREFIX = "caixaInsightTexto:";
const INSIGHT_FILA_PREFIX = "caixaInsightFila:";
const INSIGHT_ESTOQUE_MINIMO = 3; // mantém um pequeno estoque local de insights
const INSIGHT_LOTE_TAMANHO = 10;
let insightGeracaoEmAndamento = false;
let insightAlteracaoTimer = null;
let insightGeracaoPendente = false;

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
  mostrarInsightTexto(cache || "Seu próximo insight será atualizado quando houver uma mudança nas suas finanças.", cache ? "ia" : "carregando");
}

function invalidarFilaDeInsights() {
  // Insights pré-gerados representam um estado financeiro antigo. Quando há
  // uma mudança real, eles não podem ser reaproveitados como se fossem atuais.
  setInsightFila(state.pessoaAtual, []);
}

function agendarInsightPorAlteracaoFinanceira() {
  if (isAmbos() || !navigator.onLine) return;
  insightGeracaoPendente = true;
  clearTimeout(insightAlteracaoTimer);
  insightAlteracaoTimer = setTimeout(() => {
    insightGeracaoPendente = false;
    gerarInsightAposAlteracaoFinanceira();
  }, 1200);
}

async function gerarInsightAposAlteracaoFinanceira() {
  if (insightGeracaoEmAndamento || !navigator.onLine || isAmbos()) return;
  insightGeracaoEmAndamento = true;
  const pessoaDoPedido = state.pessoaAtual;
  invalidarFilaDeInsights();
  try {
    const textos = await pedirLoteDeInsights(pessoaDoPedido);
    if (state.pessoaAtual !== pessoaDoPedido) return;
    const primeiro = textos.shift();
    setInsightCache(pessoaDoPedido, primeiro);
    setInsightFila(pessoaDoPedido, textos);
    mostrarInsightTexto(primeiro, "ia");
  } catch (err) {
    // Nunca apaga o último insight válido por uma falha temporária do Gemini.
    // A próxima alteração financeira tenta novamente.
  } finally {
    insightGeracaoEmAndamento = false;
    if (insightGeracaoPendente) {
      clearTimeout(insightAlteracaoTimer);
      insightAlteracaoTimer = setTimeout(() => {
        insightGeracaoPendente = false;
        gerarInsightAposAlteracaoFinanceira();
      }, 250);
    }
  }
}

// Pede um novo lote de insights pro Gemini e devolve a lista (ou lança erro).
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

// Gera (ou consome do estoque) o insight com IA. Chamado sozinho sempre que
// os dados terminam de sincronizar com a planilha (ver carregarDados) —
// não existe mais botão manual nem seletor de período pra isso.
async function atualizarInsightComIA(opcoes = {}) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) return;
  if (!navigator.onLine) return;

  const pessoaDoPedido = state.pessoaAtual;
  const motivo = opcoes.motivo || "";

  // No carregamento normal da página, não chamamos Gemini. O único carregamento
  // automático é o primeiro deste dispositivo, quando ainda não existe cache
  // financeiro local. Alterações financeiras usam a função específica abaixo.
  if (motivo === "pagina" && !opcoes.semCacheInicial) return;
  if (insightGeracaoEmAndamento) return;

  const fila = getInsightFila(pessoaDoPedido);
  if (fila.length > 0 && motivo !== "financeiro") {
    const proximo = fila.shift();
    setInsightFila(pessoaDoPedido, fila);
    setInsightCache(pessoaDoPedido, proximo);
    mostrarInsightTexto(proximo, "ia");
    if (fila.length >= INSIGHT_ESTOQUE_MINIMO) return;
  }

  insightGeracaoEmAndamento = true;
  mostrarInsightTexto("Analisando os números…", "carregando");
  try {
    const textos = await pedirLoteDeInsights(pessoaDoPedido);
    if (state.pessoaAtual !== pessoaDoPedido) return;
    const primeiro = textos.shift();
    setInsightCache(pessoaDoPedido, primeiro);
    setInsightFila(pessoaDoPedido, textos);
    mostrarInsightTexto(primeiro, "ia");
  } catch (err) {
    const ultimo = getInsightCache(pessoaDoPedido);
    if (ultimo) {
      mostrarInsightTexto(ultimo, "ia");
    }
  } finally {
    insightGeracaoEmAndamento = false;
  }
}

function tentarDeNovoInsightSeErro() {
  // Não dispara IA manualmente: geração só ocorre no primeiro carregamento sem
  // cache ou após uma mudança financeira.
}

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

  if (donut) {
    donut.style.background = `conic-gradient(var(--gold) 0% ${corte1}%, var(--expense) ${corte1}% ${corte2}%, var(--income) ${corte2}% 100%)`;
  }
  if (centro) {
    // Texto alterado para exibir apenas o valor e a palavra "GANHO"
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

// ---------------------------------------------------------------------
// HISTÓRICO — Melhorias Implementadas
// ---------------------------------------------------------------------

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

// Novo Gráfico com Faixas Verticais (Resolve sobreposição de pontos)
function construirGraficoHistoricoMultiSvg(mesesAsc, pessoa) {
  const W = 320, H = 190, padL = 14, padR = 14, padT = 18, padB = 30;

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

  // Largura da área de toque/hover de cada mês
  const larguraFaixa = passoX > 0 ? passoX : W;

  // Cria as faixas verticais e agrupa os 3 pontos de cada mês juntos
  const gruposMes = mesesAsc.map((m, i) => {
    const nomeMes = m.nome.charAt(0).toUpperCase() + m.nome.slice(1).toLowerCase();
    const vGanhos = getVal(m, 'ganhos');
    const vGastos = getVal(m, 'debitos');
    const vGuardado = getVal(m, 'guardadoMes');
    const vRendimento = getVal(m, 'rendimento');
    const cx = x(i).toFixed(1);
    
    // Calcula o início do retângulo invisível para centralizar no ponto
    const rx = (x(i) - larguraFaixa / 2).toFixed(1);

    return `
      <g class="mes-hover-group" data-mes="${nomeMes}" data-ganhos="${fmt(vGanhos)}" data-gastos="${fmt(vGastos)}" data-guardado="${fmt(vGuardado)}" data-rendimento="${fmt(vRendimento)}">
        <!-- Área gigante e invisível para capturar o dedo/mouse -->
        <rect x="${rx}" y="0" width="${larguraFaixa}" height="${H}" fill="transparent" class="hover-area" />
        
        <!-- Linha guia vertical charmosa -->
        <line x1="${cx}" y1="${padT}" x2="${cx}" y2="${H - padB - 4}" stroke="var(--line)" stroke-dasharray="4,4" class="guia-vertical" />
        
        <!-- Os 4 pontos sobrepostos -->
        <circle cx="${cx}" cy="${y(vGanhos).toFixed(1)}" r="4.2" fill="var(--income)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
        <circle cx="${cx}" cy="${y(vGastos).toFixed(1)}" r="4.2" fill="var(--expense)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
        <circle cx="${cx}" cy="${y(vGuardado).toFixed(1)}" r="4.2" fill="var(--gold)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
        <circle cx="${cx}" cy="${y(vRendimento).toFixed(1)}" r="4.2" fill="var(--yield)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
      </g>
    `;
  }).join("");

  // No modo "Todos os anos" cada ponto é um ano (ex: "2025"), não um mês —
  // nesse caso mostra o ano inteiro no eixo, sem truncar pros 3 primeiros
  // caracteres como faz com o nome do mês (senão "2025" virava "202").
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
        
        <!-- Renderiza as áreas de interação POR CIMA das linhas -->
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

  // Novo: Inclusão dos campos de rendimento para calcular "Todos os anos" perfeitamente
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
    const rendimento = getVal(m, 'rendimento'); // Busca o novo rendimento
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

function atualizarVisibilidadeFab() {
  const fab = document.getElementById("fabCriar");
  if (!fab) return;
  const ativa = document.querySelector(".tab-panel:not(.is-hidden)");
  const podeCriar = ["ganhos", "fixos", "variaveis", "caixinhas"].includes(ativa?.dataset.tab || "");
  fab.classList.toggle("is-hidden", !podeCriar);
  fab.setAttribute("aria-hidden", String(!podeCriar));
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
    atualizarVisibilidadeFab();
    if (tab === "historico") renderHistorico();
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
  if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
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

  // "valor" no formulário agora é o valor INTEGRAL da compra — o select de
  // parcelas decide como ele é dividido antes de salvar (cada linha guarda
  // o valor de UMA parcela, igual sempre foi; ver proximoFixo no Code.gs
  // pra como isso avança de mês em mês).
  const numParcelas = f.parcelas ? Number(f.parcelas.value) : 0;
  let valor = valorTotal;
  let parcela = "";
  if (numParcelas > 0) {
    valor = Math.round((valorTotal / numParcelas) * 100) / 100;
    // "1/1" (não vazio) pra 1x à vista: assim ela some depois de paga em vez
    // de virar uma cobrança recorrente todo mês (que é o que "parcela
    // vazia" significa pro fechamento de mês).
    parcela = `1/${numParcelas}`;
  }

  opFixos.add(nome, valor, { pago, tipo, data, parcela });
  f.reset();
  if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
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
  const origem = f.origem && f.origem.value === "beneficio" ? "beneficio" : "saldo";
  opVariaveis.add(nome, valor, { pago, tipo, data, origem });
  f.reset();
  if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
  preencherDatasComHoje();
});

on("formCaixinhas", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valorInicial = f.valorInicial.value ? parseValor(f.valorInicial.value) : 0;
  const valorObjetivo = f.valorObjetivo.value ? parseValor(f.valorObjetivo.value) : 0;
  const icone = f.icone ? normalizarNomeIcone(f.icone.value) : "";
  const data = f.data ? String(f.data.value || "").trim() : "";
  if (!nome || valorInicial < 0) return;
  addCaixinha(nome, valorInicial, valorObjetivo, icone, data);
  f.reset();
  if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
  aplicarPreviewIcone(document.getElementById("caixinhaIconPickerCriar"), "");
});

let onConfirmarValor = null;
// Valor mínimo aceito no modal (usado no rendimento: não pode informar um
// total menor do que a caixinha já tem hoje). null = sem mínimo, só exige > 0.
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
  // semHistorico: usado quando esse modal já está substituindo outro que
  // acabou de fechar (ex.: vindo do menu de ações da caixinha) — nesse
  // caso quem chamou já cuidou do histórico, então não empilha de novo.
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

// Enquanto digita, já avisa visualmente se o valor ficou abaixo do mínimo
// permitido (sem travar a digitação — a trava mesmo é no submit).
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
    void inputValor.offsetWidth; // reinicia a animação se já tremeu antes
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
  rendimento: (nome) => `Rendimento ganho — ${nome}`, // Texto ajustado
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

  // Rendimento pede o TOTAL atualizado da caixinha (não quanto rendeu) — por
  // isso vem PRÉ-PREENCHIDO com o total de hoje (guardado + rendimento já
  // acumulado): a pessoa só edita pro número novo, em vez de ter que
  // calcular/lembrar o total de cabeça. Guardar/retirar continuam em branco,
  // porque ali o número digitado já é o valor da própria ação.
  const totalAtualCaixinha = totalCaixinha(cx);
  const valorInicial = acao === "rendimento" ? totalAtualCaixinha : null;
  const dica = acao === "rendimento"
    ? "Digite o valor TOTAL que a caixinha tem hoje (não só o quanto rendeu) — o app calcula a diferença sozinho."
    : null;
  // Rendimento não pode ser um valor menor do que a caixinha já tem — isso
  // seria uma perda, não um rendimento (pra registrar perda, dá pra editar
  // a caixinha direto).
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
const EDICAO_TEM_DATA = { ganhos: true, fixos: true, variaveis: true, caixinhas: true };
const EDICAO_TEM_ORIGEM = { variaveis: true };
const EDICAO_TEM_PARCELA = { fixos: true };

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
  const origemEl = document.getElementById("editOrigem");
  const temCategoria = !!EDICAO_TEM_CATEGORIA[tipo];
  const temData = !!EDICAO_TEM_DATA[tipo];
  const temParcela = !!EDICAO_TEM_PARCELA[tipo];
  const temOrigem = !!EDICAO_TEM_ORIGEM[tipo];
  const iconPickerEl = document.getElementById("caixinhaIconPickerEditar");

  if (iconPickerEl) {
    const temIcone = tipo === "caixinhas";
    iconPickerEl.classList.toggle("is-hidden", !temIcone);
    if (temIcone) {
      aplicarPreviewIcone(iconPickerEl, item.icone || "");
      renderOpcoesIconesCaixinhas(iconPickerEl);
    } else {
      aplicarPreviewIcone(iconPickerEl, "");
    }
  }

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
  if (origemEl) {
    origemEl.classList.toggle("is-hidden", !temOrigem);
    origemEl.value = temOrigem ? (item.origem === "beneficio" ? "beneficio" : "saldo") : "saldo";
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
on("formEditar", "submit", (e) => {
  e.preventDefault();
  if (!editContext || isAmbos()) return;
  const nome = document.getElementById("editNome").value.trim();
  const valorCampo = document.getElementById("editValor").value.trim();
  // Em caixinhas, objetivo vazio significa exatamente o mesmo que 0 (sem meta).
  const valor = valorCampo ? (parseValor(valorCampo) || 0) : 0;
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
    const origem = document.getElementById("editOrigem").value === "beneficio" ? "beneficio" : "saldo";
    // Editar manualmente tira o item do modo "lembrete" (compra adiantada) —
    // a partir daqui ele volta a contar normalmente no saldo, com a nova
    // data/categoria/origem que a pessoa escolheu.
    opVariaveis.edit(idx, nome, valor, { tipo: categoria, data, origem, lembrete: false });
  } else if (tipo === "caixinhas") {
    const icone = normalizarNomeIcone(document.getElementById("editIcone")?.value || "");
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

    showToast(`${MESES_LABEL[f.mes - 1]}/${f.ano} foi fechado. Os saldos restantes foram levados para o próximo mês e os gastos variáveis foram encerrados. Recarregue a página para atualizar os dados da planilha.`);
    fecharModalFecharMes();
    ["davi", "gabriel", "ambos"].forEach((p) => removerCache(p));
    await removerCache("historico");
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

// ---------------------------------------------------------------------
// INIT E LISTENERS
// ---------------------------------------------------------------------

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
// Leituras da planilha acontecem na abertura da página. Depois disso, a
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
// Usa os próprios formulários existentes: ao abrir, o formulário da aba
// ativa é movido temporariamente para dentro de uma notinha-modal. Assim
// não existem formulários duplicados nem listeners paralelos.
let criacaoOrigem = null;
let criacaoPlaceholder = null;
const criacaoBackdrop = document.getElementById("criacaoBackdrop");
const criacaoHost = document.getElementById("criacaoModalHost");
const fabCriar = document.getElementById("fabCriar");
const criacaoTitulo = document.getElementById("criacaoTitulo");
const criacaoHint = document.getElementById("criacaoHint");

const CONFIG_CRIACAO = {
  ganhos: { alvo: "collapsible-ganhos", titulo: "Novo ganho", hint: "Registre uma entrada de dinheiro e indique se ela já foi recebida." },
  fixos: { alvo: "collapsible-fixos", titulo: "Novo gasto fixo", hint: "Cadastre uma conta recorrente ou parcelada." },
  variaveis: { alvo: "collapsible-variaveis", titulo: "Novo gasto variável", hint: "Registre uma compra ou despesa do dia a dia." },
  guardado: { alvo: "collapsible-guardado", titulo: "Nova caixinha", hint: "Crie uma meta ou um lugar para guardar seu dinheiro." },
};

function fecharCriacaoFlutuante() {
  if (!criacaoBackdrop) return;
  const alvo = criacaoOrigem;
  if (alvo) {
    alvo.classList.add("is-collapsed");
    if (criacaoPlaceholder && criacaoPlaceholder.parentNode) {
      criacaoPlaceholder.parentNode.insertBefore(alvo, criacaoPlaceholder);
      criacaoPlaceholder.remove();
    }
  }
  criacaoOrigem = null;
  criacaoPlaceholder = null;
  if (criacaoHost) criacaoHost.replaceChildren();
  criacaoBackdrop.classList.add("is-hidden");
}

function limparFormularioCriacao(alvo) {
  if (!alvo) return;
  const form = alvo.querySelector("form");
  if (form) form.reset();
  alvo.querySelectorAll(".input-erro").forEach((el) => el.classList.remove("input-erro"));
  if (alvo.id !== "collapsible-guardado") preencherDatasComHoje();
  if (alvo.id === "collapsible-guardado") aplicarPreviewIcone(document.getElementById("caixinhaIconPickerCriar"), "");
}

function restaurarCriacaoAnterior() {
  if (criacaoOrigem) fecharCriacaoFlutuante();
  else if (criacaoHost) criacaoHost.replaceChildren();
}

function abrirCriacaoFlutuante() {
  // Nunca permita que um formulário anterior sobreviva dentro do modal.
  // Cada abertura começa com exatamente um formulário, da aba atual.
  restaurarCriacaoAnterior();
  const ativa = document.querySelector(".tab-panel:not(.is-hidden)");
  const tab = ativa?.dataset.tab;
  const cfg = CONFIG_CRIACAO[tab];
  if (!cfg || !criacaoHost || !criacaoBackdrop) return;
  const alvo = document.getElementById(cfg.alvo);
  if (!alvo) return;

  criacaoOrigem = alvo;
  criacaoPlaceholder = document.createComment("caixa-criacao-placeholder");
  alvo.parentNode.insertBefore(criacaoPlaceholder, alvo);
  criacaoTitulo.textContent = cfg.titulo;
  criacaoHint.textContent = cfg.hint;
  limparFormularioCriacao(alvo);
  criacaoHost.appendChild(alvo);
  alvo.classList.remove("is-collapsed");
  criacaoBackdrop.classList.remove("is-hidden");
  const primeiro = alvo.querySelector("input, select, textarea, button[type=submit]");
  requestAnimationFrame(() => primeiro?.focus({ preventScroll: true }));
}

fabCriar?.addEventListener("click", abrirCriacaoFlutuante);
atualizarVisibilidadeFab();
document.getElementById("criacaoFechar")?.addEventListener("click", fecharCriacaoFlutuante);
criacaoBackdrop?.addEventListener("click", (e) => { if (e.target === criacaoBackdrop) fecharCriacaoFlutuante(); });

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
