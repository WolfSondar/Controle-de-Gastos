// =====================================================================
// CAIXA — app.js
// Banco e sincronização: Firebase / Firestore
// IA: Firebase AI Logic (Gemini)
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

// Nomes de categoria em ordem (o que os <select> mostram). A aba CONFIGS é
// a única fonte de verdade: coluna A = nome; coluna B = cor.
function categoriasAtuais() {
  return Array.isArray(state.categoriasConfig)
    ? state.categoriasConfig.map((c) => c.nome)
    : [];
}

// Cor de uma categoria: vem da aba CONFIGS. A paleta fixa permanece apenas
// para categorias antigas já gravadas que não existam mais na configuração.
function corDaCategoria(nome, idxFallback) {
  if (state.categoriasConfig) {
    const achado = state.categoriasConfig.find((c) => c.nome === nome);
    if (achado && achado.cor) return achado.cor;
  }
  const tema = document.documentElement?.dataset?.caixaTheme;
  if (tema === "christmas") {
    const paletaNatal = [
      "#d8b45b", "#3f805b", "#b84b4f", "#78a98a", "#c98d4a",
      "#5f9077", "#d06d68", "#a6b99b", "#d9bf76", "#6c8e83"
    ];
    return paletaNatal[idxFallback % paletaNatal.length];
  }
  return PALETA_CATEGORIAS[idxFallback % PALETA_CATEGORIAS.length];
}

// ---------------------------------------------------------------------
// ÍCONES PERSONALIZADOS DAS CAIXINHAS
// Lê automaticamente IMG/ do próprio repositório GitHub e usa apenas
// arquivos PNG/WEBP/JPG/JPEG cujo nome começa com "caixa" (ex.: caixa_zelda.png).
// ---------------------------------------------------------------------
const CAIXINHA_ICON_STORAGE_KEY = "caixaIconesPersonalizados";
const CAIXINHA_ICON_USAGE_KEY = "caixaIconesUso";
const CAIXINHA_ICON_CACHE_NAME = "caixinha-icones-v2";
const CAIXINHA_ICON_DIR = "IMG/";
const CAIXINHA_ICON_GITHUB_FALLBACK = "WolfSondar/Controle-de-Gastos"; // Repositório oficial dos ícones.

function normalizarNomeIcone(nome) {
  return String(nome || "").split("/").pop().trim();
}

function urlIconeCaixinha(nome) {
  const arquivo = normalizarNomeIcone(nome);
  if (!arquivo) return "";
  if (/^https?:\/\//i.test(String(nome || ""))) return String(nome);
  const repo = obterRepositorioGitHub();
  if (repo) return `https://raw.githubusercontent.com/${repo}/main/IMG/${encodeURIComponent(arquivo)}`;
  return `${CAIXINHA_ICON_DIR}${encodeURIComponent(arquivo)}`;
}

function isArquivoIconeCaixinha(nome) {
  const arquivo = normalizarNomeIcone(nome);
  return /^caixa/i.test(arquivo) && /\.(png|webp|jpe?g)$/i.test(arquivo);
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
  const base = arquivo.replace(/\.(png|webp|jpe?g)$/i, "").toLowerCase();
  const regras = Array.isArray(state.iconCategorias) ? state.iconCategorias : [];
  for (const regra of regras) {
    for (const padraoBruto of (regra.padroes || [])) {
      const padrao = normalizarTextoBuscaIcone(padraoBruto).replace(/\.(png|webp|jpe?g)$/i, "");
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
  const arquivo = normalizarNomeIcone(nome);
  const mapa = state?.iconNomes || {};
  return mapa[arquivo] || arquivo.replace(/\.(png|webp|jpe?g)$/i, "");
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

// Data de lançamento: mantém o dia escolhido e, quando o usuário escolhe
// apenas uma data, acrescenta o horário LOCAL do navegador.
// Não usamos toISOString()/UTC aqui, pois isso deslocaria o horário em 3h.
function dataHoraAgoraISO() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  const hora = String(d.getHours()).padStart(2, "0");
  const minuto = String(d.getMinutes()).padStart(2, "0");
  const segundo = String(d.getSeconds()).padStart(2, "0");
  // O offset identifica o fuso do navegador no instante do lançamento.
  // Assim o Firebase não precisa adivinhar o horário local do usuário.
  const offsetEmMinutos = -d.getTimezoneOffset();
  const sinal = offsetEmMinutos >= 0 ? "+" : "-";
  const offsetAbsoluto = Math.abs(offsetEmMinutos);
  const offsetHora = String(Math.floor(offsetAbsoluto / 60)).padStart(2, "0");
  const offsetMinuto = String(offsetAbsoluto % 60).padStart(2, "0");
  return `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}${sinal}${offsetHora}:${offsetMinuto}`;
}

function dataDoLancamento(data) {
  const dataLimpa = String(data || "").trim();
  if (!dataLimpa) return "";

  const isoData = dataLimpa.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoData) return `${isoData[1]}-${isoData[2]}-${isoData[3]}T${dataHoraAgoraISO().slice(11)}`;

  const isoDataHora = dataLimpa.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:?\d{2})?$/);
  if (isoDataHora) {
    const hora = isoDataHora[2].length === 5 ? isoDataHora[2] + ":00" : isoDataHora[2];
    return `${isoDataHora[1]}T${hora}${isoDataHora[3] || ""}`;
  }

  const br = dataLimpa.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/);
  if (br) {
    const hora = br[4] ? (br[4].length === 5 ? br[4] + ":00" : br[4]) : dataHoraAgoraISO().slice(11);
    return `${br[3]}-${br[2]}-${br[1]}T${hora}`;
  }

  return dataLimpa;
}

function dataBrasileira(data) {
  const valor = String(data || "").trim();
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = valor.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  return valor;
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
    const pessoa = localStorage.getItem(PESSOA_STORAGE_KEY) || "davi";
    const raw = localStorage.getItem(MES_ATUAL_STORAGE_KEY + ":" + pessoa)
      || localStorage.getItem(MES_ATUAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}


const RESUMO_GRAFICO_CACHE_KEY = "caixa:resumo:grafico:v2";
function lerPaginaGraficoResumo() {
  try {
    const raw = JSON.parse(localStorage.getItem(RESUMO_GRAFICO_CACHE_KEY) || "{}");
    const chave = localStorage.getItem(PESSOA_STORAGE_KEY) || "davi";
    return typeof raw?.[chave] === "string" ? raw[chave] : "";
  } catch (err) {
    return "";
  }
}
function salvarPaginaGraficoResumo(indiceOuId) {
  try {
    const valor = String(indiceOuId || "");
    if (!valor) return;
    const raw = JSON.parse(localStorage.getItem(RESUMO_GRAFICO_CACHE_KEY) || "{}");
    const chave = localStorage.getItem(PESSOA_STORAGE_KEY) || "davi";
    raw[chave] = valor;
    localStorage.setItem(RESUMO_GRAFICO_CACHE_KEY, JSON.stringify(raw));
  } catch (err) {}
}

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
  iaConfig: null, // tom/imersão compartilhados com a IA
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
    iaConfig: snapshot.iaConfig || null,
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
  const { fonte, historico, iaConfig } = await lerFonteLegadaParaMigracao();
  const resumo = resumoMigracaoFonte(fonte, historico);
  console.info("CAIXA — iniciando migração para o Firestore:", resumo);
  const resultado = await window.CAIXA_FIREBASE.importarDados({ fonte, historico, iaConfig, resumoMigracao: resumo });
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

async function carregarConfigIA() {
  try {
    const salvo = JSON.parse(localStorage.getItem("caixa-ia-config-v1") || "null");
    if (salvo && salvo.expira > Date.now() && salvo.data) { state.iaConfig = salvo.data; return salvo.data; }
  } catch (err) {}
  try {
    if (window.CAIXA_FIREBASE && typeof window.CAIXA_FIREBASE.getIAConfig === "function") {
      const data = await window.CAIXA_FIREBASE.getIAConfig();
      if (data) {
        state.iaConfig = data;
        try { localStorage.setItem("caixa-ia-config-v1", JSON.stringify({ data, expira: Date.now() + 3000 })); } catch (err) {}
        document.dispatchEvent(new CustomEvent("caixa:ia-config-atualizada"));
        return data;
      }
    }
  } catch (err) {}
  return state.iaConfig || null;
}

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
    iaConfig: data.iaConfig || null,
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
  if (!regra) return false;
  if (regra.forcarAgora === true) return true;
  const mes = mesTemaSazonal(id);
  if (!mes) return false;
  const inicioDia = lerDiaTema(regra, "inicioDia", 1);
  const fimDia = lerDiaTema(regra, "fimDia", mes === 2 ? 28 : [4,6,9,11].includes(mes) ? 30 : 31);
  const hoje = new Date();
  if (hoje.getMonth() + 1 !== mes) return false;
  const dia = hoje.getDate();
  return dia >= Math.min(inicioDia, fimDia) && dia <= Math.max(inicioDia, fimDia);
}

function caixaGarantirCssTemaGlobal(id) {
  if (id !== "halloween") return;
  const href = new URL("themes/halloween.css", document.baseURI).href;
  if ([...document.querySelectorAll('link[data-caixa-theme-css="halloween"]')].some(link => link.href === href)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = href; link.dataset.caixaThemeCss = "halloween";
  document.head.appendChild(link);
}

function caixaSincronizarTemaSazonalGlobal() {
  const sazonais = ["christmas", "halloween"];
  const disponiveis = sazonais.filter(id => caixaTemaPodeSerUsadoGlobal(id));
  // A escolha manual dos temas sazonais deixou de existir: o sistema sempre
  // decide sozinho entre um sazonal válido e Padrão.
  const ativo = disponiveis[0] || "default";
  try { localStorage.setItem("caixa-tema-estilo-v1", ativo); } catch (_) {}
  document.documentElement.dataset.caixaTheme = ativo;
  return ativo;
}

window.CAIXA_TEMA_ATIVO = caixaTemaAtivoGlobal;
window.CAIXA_SINCRONIZAR_TEMA_SAZONAL = caixaSincronizarTemaSazonalGlobal;
window.CAIXA_GARANTIR_CSS_TEMA = caixaGarantirCssTemaGlobal;

async function carregarDados() {
  if (window.CAIXA_FIREBASE_READY) await window.CAIXA_FIREBASE_READY.catch(() => null);
  if (!temBackendDados()) {
    setSyncState("error");
    showToast("Configure o Firebase antes de carregar os dados.");
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
    state.saldoInicialConta = Number(cache.saldoInicialConta) || 0;
    state.saldoInicialBeneficio = Number(cache.saldoInicialBeneficio) || 0;
    state.categoriasConfig = cache.categorias || null;
    state.iconCategorias = cache.iconCategorias || [];
    state.iconNomes = cache.iconNomes || {};
    state.temasConfig = cache.temasConfig || null;
    state.iaConfig = cache.iaConfig || state.iaConfig || null;
    state.faturas = Array.isArray(cache.faturas) ? cache.faturas : state.faturas;
    // Em modo offline, o cache pode fornecer o último mês conhecido.
    // Online, não usamos esse valor: o mês será definido somente pelo Firebase.
    if (!navigator.onLine) {
      state.mesAtual = Number(cache.mesAtual) || null;
      state.anoAtual = Number(cache.anoAtual) || null;
      renderMesAtual();
    }
    state.loaded = true;
    const temaAntesCache = window.CAIXA_TEMA_ATIVO?.() || "default";
    const temaDepoisCache = window.CAIXA_SINCRONIZAR_TEMA_SAZONAL?.() || temaAntesCache;
    window.CAIXA_GARANTIR_CSS_TEMA?.(temaDepoisCache);
    popularSelectsDeCategoria();
    renderAll();
    if (temaAntesCache !== temaDepoisCache) {
      atualizarCamadasTemas();
      renderVisaoGeral();
    }
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
    const res = await fetchApiGet({ pessoa: pessoaRequisitada });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.error || "Erro desconhecido");
    if (state.pessoaAtual !== pessoaRequisitada) return;
    // Uma gravação pode ter começado depois que esta busca foi iniciada (ou
    // enquanto ela estava em trânsito). Nesse intervalo o Firebase ainda
    // pode devolver o estado anterior da Firebase. Nunca deixamos esse GET
    // sobrescrever o estado que o usuário acabou de alterar.
    if (state.salvamentosEmAndamento && state.salvamentosEmAndamento.size) return;
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
      temasConfig: JSON.stringify(state.temasConfig || null) !== JSON.stringify(data.temasConfig || null),
      iaConfig: JSON.stringify(state.iaConfig || null) !== JSON.stringify(data.iaConfig || null),
      faturas: JSON.stringify(state.faturas || []) !== JSON.stringify(Array.isArray(data.faturas) ? data.faturas : []),
    };
    state.ganhos = data.ganhos || [];
    state.gastosFixos = data.gastosFixos || [];
    state.gastosVariaveis = data.gastosVariaveis || [];
    state.caixinhas = data.caixinhas || [];
    state.saldoInicialConta = Number(data.saldoInicialConta) || 0;
    state.saldoInicialBeneficio = Number(data.saldoInicialBeneficio) || 0;
    state.categoriasConfig = data.categorias || null;
    state.iconCategorias = data.iconCategorias || [];
    state.temasConfig = data.temasConfig || null;
    state.iaConfig = data.iaConfig || null;
    state.faturas = Array.isArray(data.faturas) ? data.faturas : [];
    state.loaded = true;
    if (pessoaRequisitada === "ambos") {
      state.mesAtualDavi = Number(data.configDavi?.mesAtual) || null;
      state.anoAtualDavi = Number(data.configDavi?.anoAtual) || null;
      state.mesAtualGabriel = Number(data.configGabriel?.mesAtual) || null;
      state.anoAtualGabriel = Number(data.configGabriel?.anoAtual) || null;
      state.mesAtual = state.mesAtualDavi;
      state.anoAtual = state.anoAtualDavi;
    } else {
      if (data.mesAtual) state.mesAtual = data.mesAtual;
      if (data.anoAtual) state.anoAtual = data.anoAtual;
      if (pessoaRequisitada === "davi") { state.mesAtualDavi = Number(data.mesAtual) || null; state.anoAtualDavi = Number(data.anoAtual) || null; }
      if (pessoaRequisitada === "gabriel") { state.mesAtualGabriel = Number(data.mesAtual) || null; state.anoAtualGabriel = Number(data.anoAtual) || null; }
    }
    renderMesAtual();
    setCache(pessoaRequisitada, data);

    // Depois que as regras reais do Firebase chegaram, decide primeiro se há
    // um tema sazonal para aplicar ou remover. Só então atualizamos a interface.
    const temaAntes = window.CAIXA_TEMA_ATIVO?.() || "default";
    const temaDepois = window.CAIXA_SINCRONIZAR_TEMA_SAZONAL?.() || temaAntes;
    window.CAIXA_GARANTIR_CSS_TEMA?.(temaDepois);
    if (temaAntes !== temaDepois) {
      window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
      window.CAIXA_RENDER_TEMAS?.();
      renderVisaoGeral();
    }

    setSyncState("idle");
    if (Object.values(mudancas).some(Boolean)) {
      renderIncremental(mudancas);
    }
    prefetchOutrasPessoas(pessoaRequisitada);
  } catch (err) {
    if (state.pessoaAtual !== pessoaRequisitada) return;
    // Caiu a conexão no meio da busca: mesmo tratamento calmo do offline
    // (sem ícone de erro em vermelho, que é pra falha de verdade).
    setSyncState(ehErroDeRede(err) || !navigator.onLine ? "offline" : "error");
    if (!cache) {
      if (err?.apiEndpointMissing || Number(err?.status) === 404) {
        showToast("O Firebase recusou a leitura. Confira a configuração do Firebase e tente novamente.");
      } else {
        showToast("Não consegui carregar os dados do Firebase agora. Tente novamente.");
      }
      renderAll();
    } else {
      showToast("Não consegui atualizar agora. Mostrando o último dado salvo.");
    }
  }
}

function prefetchOutrasPessoas(pessoaJaCarregada) {
  const pessoas = Object.keys(PESSOA_LABEL).filter((p) => p !== pessoaJaCarregada);
  return Promise.all(pessoas.map((p) =>
    getCache(p).then((cache) => {
      if (cache) return cache;
      return fetchApiGet({ pessoa: p })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.ok !== false) { setCache(p, data); return data; }
          return null;
        })
        .catch(() => null);
    })
  ));
}

const filaSalvar = new Map(); 

async function salvarBloco(action, payload) {
  if (isAmbos()) return; 
  const chave = `${state.pessoaAtual}:${action}`;
  state.salvamentosEmAndamento?.add(chave);
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
      const res = await caixaApiRequest({
        method: "POST",
        body: JSON.stringify({ action, payload: ultimoPayload, pessoa: pessoaDoEnvio }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      showToast("Não consegui salvar no Firebase agora.");
    }
  } finally {
    entrada.emVoo = false;
    state.salvamentosEmAndamento?.delete(chave);
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
  if (!temBackendDados()) return;
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
        const res = await caixaApiRequest({
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

// A leitura da Firebase acontece somente na abertura/recarregamento da página.
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

  // Trocar de perfil não faz mais uma nova leitura na Firebase. A página já
  // carregou os perfis necessários na abertura e cada perfil fica disponível
  // no cache local. Assim a troca é instantânea e não reconstrói a tela por
  // causa de um GET no meio da navegação.
  const pessoaAnterior = state.pessoaAtual;
  state.pessoaAtual = pessoa;
  if (pessoa === "davi" && state.mesAtualDavi && state.anoAtualDavi) { state.mesAtual = state.mesAtualDavi; state.anoAtual = state.anoAtualDavi; }
  if (pessoa === "gabriel" && state.mesAtualGabriel && state.anoAtualGabriel) { state.mesAtual = state.mesAtualGabriel; state.anoAtual = state.anoAtualGabriel; }
  localStorage.setItem(PESSOA_STORAGE_KEY, pessoa);
  atualizarVisibilidadeFab();
  document.dispatchEvent(new CustomEvent("caixa:perfil-trocado", { detail: { pessoa } }));
  prevTotals.ganhos = null;
  prevTotals.fixos = null;
  prevTotals.variaveis = null;
  prevTotals.guardado = null;
  prevTotals.saldo = null;
  renderPessoaSwitch();
  atualizarVisibilidadeEdicao();
  atualizarVisibilidadeSplitCard();
  atualizarVisibilidadeVisaoGeral();
  atualizarVisibilidadeJuntosView();
  renderMesAtual();

  const cache = await getCache(pessoa);
  // Se o usuário trocou de perfil novamente enquanto o cache era lido, não
  // deixa a resposta assíncrona sobrescrever a tela do perfil atual.
  if (state.pessoaAtual !== pessoa) return;

  if (cache) {
    state.ganhos = cache.ganhos || [];
    state.gastosFixos = cache.gastosFixos || [];
    state.gastosVariaveis = cache.gastosVariaveis || [];
    state.caixinhas = cache.caixinhas || [];
    state.saldoInicialConta = Number(cache.saldoInicialConta) || 0;
    state.saldoInicialBeneficio = Number(cache.saldoInicialBeneficio) || 0;
    state.categoriasConfig = cache.categorias || null;
    state.iconCategorias = cache.iconCategorias || [];
    if (!navigator.onLine) {
      state.mesAtual = Number(cache.mesAtual) || null;
      state.anoAtual = Number(cache.anoAtual) || null;
      if (pessoa === "davi") { state.mesAtualDavi = state.mesAtual; state.anoAtualDavi = state.anoAtual; }
      if (pessoa === "gabriel") { state.mesAtualGabriel = state.mesAtual; state.anoAtualGabriel = state.anoAtual; }
    }
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
    renderMesAtual();

    // Cache criado antes do fechamento individual não possui o mês/ano do
    // perfil. Nesse caso, busca somente a configuração atual desse perfil
    // antes de permitir um novo fechamento.
    if (!cache.mesAtual || !cache.anoAtual) {
      try {
        const res = await fetchApiGet({ pessoa });
        const data = await res.json();
        if (data && data.ok !== false && state.pessoaAtual === pessoa) {
          if (data.mesAtual) state.mesAtual = data.mesAtual;
          if (data.anoAtual) state.anoAtual = data.anoAtual;
          if (pessoa === "davi") { state.mesAtualDavi = Number(data.mesAtual) || null; state.anoAtualDavi = Number(data.anoAtual) || null; }
          if (pessoa === "gabriel") { state.mesAtualGabriel = Number(data.mesAtual) || null; state.anoAtualGabriel = Number(data.anoAtual) || null; }
          setCache(pessoa, data);
          renderMesAtual();
        }
      } catch (err) {}
    }
  } else {
    // Não busca a Firebase aqui. Se esse perfil ainda não tiver sido
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
    saldoInicialConta: state.saldoInicialConta,
    saldoInicialBeneficio: state.saldoInicialBeneficio,
  });
}

function criarOperacoesLista(key, action) {
  const mudanca = {
    ganhos: "ganhos",
    gastosFixos: "gastosFixos",
    gastosVariaveis: "gastosVariaveis",
  }[key];
  return {
    add(nome, valor, extra = {}) {
      if (isAmbos()) return;
      state[key].push({ nome, valor, ...extra });
      marcarAlteracaoLocal();
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderIncremental({ [mudanca]: true });
    },
    remove(index) {
      if (isAmbos()) return;
      state[key].splice(index, 1);
      marcarAlteracaoLocal();
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderIncremental({ [mudanca]: true });
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
      renderIncremental({ [mudanca]: true });
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
  cx.data = dataDoLancamento(data);
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
// Firebase (RENDIMENTO). Ver o badge em renderCaixinhas(): mostra em verde
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
  const data = await fetchApiGet({ pessoa }).then((r) => r.json());
  if (data && data.ok === false) throw new Error(data.error || "Erro ao ler dados atuais");
  return (data && data[chave]) || [];
}

// Marcador guardado dentro do PRÓPRIO nome do lançamento (não tem coluna
// extra sobrando na Firebase pra isso) pra lembrar que aquela "metade" é uma
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
  if (!temBackendDados()) return false;
  try {
    const res = await caixaApiRequest({ method: "POST", body: JSON.stringify({
      action: "atualizarGanhoDivisao",
      pessoa: credor,
      devedor,
      nomeOriginal,
      valor,
      tipo,
      data,
      recebido: !!recebido,
      criarSeNaoEncontrar: true,
    }) });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) throw new Error("Erro ao criar ganho a receber");
    if (dataRes.ganhos) {
      const cache = await getCache(credor);
      setCache(credor, { ...(cache || {}), ganhos: dataRes.ganhos });
      if (state.pessoaAtual === credor) state.ganhos = dataRes.ganhos;
      removerCache("ambos");
    }
    return true;
  } catch { return false; }
}

async function atualizarGanhoDivisao(credor, devedor, nomeOriginal, valor, data, recebido) {
  if (!temBackendDados()) return false;
  try {
    const res = await caixaApiRequest({ method: "POST", body: JSON.stringify({
      action: "atualizarGanhoDivisao",
      pessoa: credor,
      devedor,
      nomeOriginal,
      valor,
      data,
      recebido: !!recebido,
      criarSeNaoEncontrar: false,
    }) });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) return false;
    if (dataRes.ganhos) {
      const cache = await getCache(credor);
      setCache(credor, { ...(cache || {}), ganhos: dataRes.ganhos });
      if (state.pessoaAtual === credor) state.ganhos = dataRes.ganhos;
      removerCache("ambos");
    }
    return !!dataRes.atualizado;
  } catch { return false; }
}

// opts: { tipo, data, pago, quemPagouTudo }
// A divisão agora é uma operação atômica no Firestore: os dois perfis e,
// quando necessário, o "A receber" são gravados juntos. Isso elimina a
// dependência do Firebase e evita deixar Davi e Gabriel em estados diferentes.
async function dividirCompra(nome, valorTotal, categoria, opts) {
  if (!temBackendDados()) {
    showToast("Configure o Firebase antes de continuar.");
    return false;
  }
  opts = opts || {};
  const tipo = opts.tipo || "";
  const data = opts.data || "";
  const pago = opts.pago !== false;
  const quemPagouTudo = opts.quemPagouTudo || null;
  try {
    const res = await caixaApiRequest({ method: "POST", body: JSON.stringify({
      action: "dividirCompra",
      nome,
      valorTotal,
      categoria,
      tipo,
      data,
      pago,
      quemPagouTudo,
    }) });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) throw new Error((dataRes && dataRes.error) || "Erro ao dividir compra");

    const chave = categoria === "fixos" ? "gastosFixos" : "gastosVariaveis";
    if (dataRes.davi?.[chave] && dataRes.gabriel?.[chave]) {
      const cacheDavi = await getCache("davi");
      const cacheGabriel = await getCache("gabriel");
      setCache("davi", { ...(cacheDavi || {}), [chave]: dataRes.davi[chave] });
      setCache("gabriel", { ...(cacheGabriel || {}), [chave]: dataRes.gabriel[chave] });
      if (state.pessoaAtual === "davi") state[chave] = dataRes.davi[chave];
      if (state.pessoaAtual === "gabriel") state[chave] = dataRes.gabriel[chave];
    }
    if (dataRes.davi?.ganhos) {
      const cacheDavi = await getCache("davi");
      setCache("davi", { ...(cacheDavi || {}), ganhos: dataRes.davi.ganhos });
      if (state.pessoaAtual === "davi") state.ganhos = dataRes.davi.ganhos;
    }
    if (dataRes.gabriel?.ganhos) {
      const cacheGabriel = await getCache("gabriel");
      setCache("gabriel", { ...(cacheGabriel || {}), ganhos: dataRes.gabriel.ganhos });
      if (state.pessoaAtual === "gabriel") state.ganhos = dataRes.gabriel.ganhos;
    }
    marcarAlteracaoLocal();
    removerCache("ambos");
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

// Espelha a operação de transferência entre perfis: lança um
// gasto variável já pago de quem transfere e um ganho já recebido de quem
// recebe. Atualizando local/cache direto (em vez de invalidar e ter que
// buscar tudo de novo na Firebase com carregarDados()), a tela responde na
// hora — igual já era feito em dividirCompra.
async function transferirEntrePessoas(de, para, nome, valor, tipo) {
  if (!temBackendDados()) {
    showToast("Configure o Firebase antes de continuar.");
    return false;
  }
  try {
    const res = await caixaApiRequest({
      method: "POST",
      body: JSON.stringify({ action: "transferir", de, para, nome, valor, tipo }),
    });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) throw new Error((dataRes && dataRes.error) || "Erro desconhecido");
    const deData = dataRes.de || dataRes.deData;
    const paraData = dataRes.para || dataRes.paraData;
    if (deData?.gastosVariaveis && paraData?.ganhos) {
      const cacheDe = await getCache(de);
      const cachePara = await getCache(para);
      setCache(de, { ...(cacheDe || {}), gastosVariaveis: deData.gastosVariaveis });
      setCache(para, { ...(cachePara || {}), ganhos: paraData.ganhos });
      if (state.pessoaAtual === de) state.gastosVariaveis = deData.gastosVariaveis;
      if (state.pessoaAtual === para) state.ganhos = paraData.ganhos;
    }
    marcarAlteracaoLocal();
    removerCache("ambos");
    return true;
  } catch (err) {
    console.error("Transferência Firebase:", err);
    return false;
  }
}

function fixoEhPago(item) { return item.pago === true; }
function variavelEhPago(item) { return item.pago === true; }
function ganhoEhRecebido(item) { return item.recebido === true; }

/* Benefício é qualquer ganho cujo nome contenha "beneficio", com ou sem
   acento e inclusive dentro de palavras como "Multibeneficio". */
function ganhoEhBeneficio(item) {
  const origem = String(item && item.origem || "").toLowerCase();
  if (origem === "beneficio") return true;
  if (origem === "saldo") return false;
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
    const texto = label.querySelector(".status-label-text");
    if (texto) texto.textContent = ligado ? rotuloOn : rotuloOff;
  }
  if (li && ligado) carimbarLinha(li, rotuloOn);
  return true;
}

function carimbarLinha(li, rotulo, concluido = true) {
  if (!li || !rotulo) return;
  const antigo = li.querySelector(".carimbo");
  if (antigo) antigo.remove();
  const selo = document.createElement("span");
  selo.className = `carimbo ${concluido ? "carimbo-concluido" : "carimbo-pendente"}`;
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
  if (typeof window.renderResumoStatusFinanceiro === "function") window.renderResumoStatusFinanceiro();
  if (typeof window.renderResumoAcontecimentos === "function") window.renderResumoAcontecimentos();
}


// ---------------------------------------------------------------------
// VÍNCULO AUTOMÁTICO: GASTO FIXO <-> GANHO DA OUTRA PESSOA
// Um gasto fixo pago pode liquidar automaticamente o ganho pendente da
// outra pessoa quando nome e valor correspondem. A data é usada para
// escolher o par mais próximo quando existem vários lançamentos iguais.
// ---------------------------------------------------------------------
function normalizarNomeVinculo(nome) {
  return String(nome || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function encontrarGanhoCorrespondenteFixo(lista, nome, valor, data, recebidoAlvo) {
  const nomeN = normalizarNomeVinculo(nome);
  const valorN = Number(valor) || 0;
  const dataN = String(data || "").slice(0, 10);
  const candidatos = (lista || []).map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (normalizarNomeVinculo(item.nome) !== nomeN) return false;
      if (Math.abs((Number(item.valor) || 0) - valorN) > 0.009) return false;
      return ganhoEhRecebido(item) !== recebidoAlvo;
    });
  if (!candidatos.length) return null;

  candidatos.sort((a, b) => {
    const da = String(a.item.data || "").slice(0, 10);
    const db = String(b.item.data || "").slice(0, 10);
    const distA = dataN && /^\d{4}-\d{2}-\d{2}$/.test(da) ? Math.abs(new Date(`${da}T00:00:00`) - new Date(`${dataN}T00:00:00`)) : Number.MAX_SAFE_INTEGER;
    const distB = dataN && /^\d{4}-\d{2}-\d{2}$/.test(db) ? Math.abs(new Date(`${db}T00:00:00`) - new Date(`${dataN}T00:00:00`)) : Number.MAX_SAFE_INTEGER;
    return distA - distB || a.idx - b.idx;
  });
  return candidatos[0];
}

async function sincronizarGanhoCorrespondenteFixo(devedor, item, recebido) {
  if (!item || !devedor || !temBackendDados()) return false;
  const credor = devedor === "davi" ? "gabriel" : "davi";
  try {
    const res = await caixaApiRequest({
      method: "POST",
      body: JSON.stringify({
        action: "sincronizarGanhoCorrespondenteFixo",
        pessoa: credor,
        nome: item.nome,
        valor: item.valor,
        data: item.data,
        recebido: !!recebido,
      })
    });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false || !dataRes.atualizado) return false;
    if (dataRes.ganhos) {
      const cache = await getCache(credor);
      setCache(credor, { ...(cache || {}), ganhos: dataRes.ganhos });
      if (state.pessoaAtual === credor) state.ganhos = dataRes.ganhos;
      removerCache("ambos");
    }
    return true;
  } catch {
    return false;
  }
}

function capturarPosicoesStatus(listaId, pendingId) {
  const mapa = new Map();
  [listaId, pendingId].forEach((containerId) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll(".item-list-row[data-idx]").forEach((row) => {
      const idx = row.dataset.idx;
      mapa.set(`${containerId}:${idx}`, {
        rect: row.getBoundingClientRect(),
        row,
      });
    });
  });
  return mapa;
}

function animarReencaixeStatus(listaId, pendingId, antes, origemKey, destinoKey, origemRect, origemClone) {
  return new Promise((resolve) => {
  const depois = capturarPosicoesStatus(listaId, pendingId);

  // FLIP: os itens que permaneceram no mesmo bloco acompanham o deslocamento
  // natural da lista, sem redesenhar/"pular" visualmente.
  antes.forEach((info, chave) => {
    if (chave === origemKey) return;
    const novo = depois.get(chave);
    if (!novo) return;
    const dx = info.rect.left - novo.rect.left;
    const dy = info.rect.top - novo.rect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    novo.row.style.animation = "none";
    novo.row.style.transition = "none";
    novo.row.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    requestAnimationFrame(() => {
      novo.row.style.transition = "transform 420ms cubic-bezier(.22,.8,.2,1)";
      novo.row.style.transform = "translate3d(0,0,0)";
      window.setTimeout(() => {
        novo.row.style.transition = "";
        // Mantém a animação CSS desativada nesta linha.
        // Limpar animation aqui fazia a animação de entrada da lista
        // disparar novamente no fim do FLIP, causando o "pisca".
        novo.row.style.animation = "none";
      }, 440);
    });
  });

  const [destinoId, idx] = destinoKey.split(":");
  const destino = document.getElementById(destinoId);
  const novaLinha = destino && destino.querySelector(`.item-list-row[data-idx="${idx}"]`);
  if (!novaLinha || !origemRect) { resolve(); return; }

  // A própria linha nova faz o percurso. Não usamos clone/ghost: isso evita
  // duplicação visual, escala estranha e o efeito de "cartão flutuando".
  const destinoRect = novaLinha.getBoundingClientRect();
  const dx = origemRect.left - destinoRect.left;
  const dy = origemRect.top - destinoRect.top;

  // Quanto mais distante o destino, mais tempo o cartão precisa para
  // percorrer o caminho. Isso evita o efeito de "teleporte" quando ele
  // vai para o final de uma lista longa.
  const distancia = Math.hypot(dx, dy);
  const duracaoMovimento = Math.min(1400, Math.max(800, 800 + distancia * 0.35));

  novaLinha.style.animation = "none";
  novaLinha.style.transition = "none";
  novaLinha.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  novaLinha.style.opacity = "0.72";
  novaLinha.style.pointerEvents = "none";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      novaLinha.style.transition = `transform ${duracaoMovimento}ms cubic-bezier(.22,.78,.2,1), opacity 260ms ease-out`;
      novaLinha.style.transform = "translate3d(0,0,0)";
      novaLinha.style.opacity = "1";
    });
  });

  window.setTimeout(() => {
    novaLinha.style.transition = "";
    novaLinha.style.transform = "";
    novaLinha.style.opacity = "";
    // Não limpar animation: isso faria a animação CSS da lista tocar
    // novamente exatamente quando o cartão termina de se encaixar.
    novaLinha.style.animation = "none";
    novaLinha.style.pointerEvents = "";
    resolve();
  }, duracaoMovimento + 40);
  });
}

function atualizarVisualStatusNaHora(linha, ligado, rotuloOn, rotuloOff) {
  if (!linha) return;
  const ativo = !!ligado;
  linha.classList.toggle("is-pendente", !ativo);
  const checkbox = linha.querySelector('input[type="checkbox"]');
  const label = linha.querySelector(".pago-toggle");
  if (checkbox) {
    checkbox.checked = ativo;
    checkbox.disabled = true;
  }
  if (label) {
    label.classList.toggle("is-pago", ativo);
    label.setAttribute("data-status", ativo ? rotuloOn : rotuloOff);
    const texto = label.querySelector(".status-label-text");
    if (texto) {
      texto.textContent = ativo ? rotuloOn : rotuloOff;
    } else {
      // Fallback para qualquer markup antigo que ainda não tenha o span.
      const novoTexto = document.createElement("span");
      novoTexto.className = "status-label-text";
      novoTexto.textContent = ativo ? rotuloOn : rotuloOff;
      label.appendChild(novoTexto);
    }
  }
}

const statusCliquesEmProcessamento = new Set();

// Fila global das mudanças de status: uma animação só começa quando a anterior
// terminou por completo. Assim, cliques rápidos não fazem dois cards viajarem juntos.
let filaAnimacoesStatus = Promise.resolve();
function enfileirarAnimacaoStatus(fn) {
  const proxima = filaAnimacoesStatus.then(() => fn());
  filaAnimacoesStatus = proxima.catch(() => {});
  return proxima;
}

function animarMudancaStatusFluida(listaId, pendingId, index, ligado, tipo, statusKey, toggleFn, ops, tipoModal, rotuloOn, rotuloOff) {
  return new Promise((resolve) => {
    const chaveStatus = `${listaId}:${index}`;
    if (statusCliquesEmProcessamento.has(chaveStatus)) { resolve(); return; }
    statusCliquesEmProcessamento.add(chaveStatus);
  const ul = document.getElementById(listaId);
  const pend = document.getElementById(pendingId);
  const seletor = `.item-list-row[data-idx="${index}"]`;
  const linhaAtual = (ul && ul.querySelector(seletor)) || (pend && pend.querySelector(seletor));
    if (!linhaAtual) {
      statusCliquesEmProcessamento.delete(chaveStatus);
      resolve();
      return;
    }

  const origemContainer = linhaAtual.closest(`#${listaId}`) ? listaId : pendingId;
  const destinoContainer = ligado ? listaId : pendingId;
  const origemKey = `${origemContainer}:${index}`;
  const destinoKey = `${destinoContainer}:${index}`;
  const antes = capturarPosicoesStatus(listaId, pendingId);
  const origemRect = linhaAtual.getBoundingClientRect();
  const origemClone = linhaAtual.cloneNode(true);

  atualizarVisualStatusNaHora(linhaAtual, ligado, rotuloOn, rotuloOff);
  linhaAtual.classList.add("is-status-confirmando");
  carimbarLinha(linhaAtual, ligado ? rotuloOn : rotuloOff, ligado);
  vibrar();

  const finalizar = () => {
    const lista = statusKey === "recebido"
      ? state.ganhos
      : (tipo === "expense" && listaId === "listaFixos" ? state.gastosFixos : state.gastosVariaveis);

    // A tela passa a refletir o estado do objeto local imediatamente.
    // Não fazemos nenhum GET aqui: a Firebase é persistida em paralelo e
    // nunca deve ser necessária uma atualização da página para enxergar a
    // mudança que o próprio usuário acabou de fazer.
    renderPendentesDestaque(pendingId, lista, tipo, statusKey, toggleFn, rotuloOff, ops, tipoModal);
    renderListaComStatus(listaId, lista, tipo, ops, tipoModal, statusKey, toggleFn, rotuloOn, rotuloOff);

    // O render acima cria as posições finais. O FLIP/ghost usa as posições
    // capturadas antes dele para fazer o lançamento atravessar a tela e os
    // demais cards se encaixarem suavemente.
    requestAnimationFrame(() => {
      animarReencaixeStatus(listaId, pendingId, antes, origemKey, destinoKey, origemRect, origemClone)
        .then(resolve);
    });
  };

  // Pendente -> pago/recebido: confirma visualmente, aguarda só 0,2 s e
  // então faz a travessia. Pago/recebido -> pendente: processa imediatamente.
  if (ligado) {
    window.setTimeout(() => {
      try { finalizar(); } finally { statusCliquesEmProcessamento.delete(chaveStatus); resolve(); }
    }, 200);
  } else {
    try { finalizar(); } finally { statusCliquesEmProcessamento.delete(chaveStatus); resolve(); }
  }
  });
}

function togglePagoFixo(index) {
  return enfileirarAnimacaoStatus(() => togglePagoFixoInterno(index));
}
function togglePagoFixoInterno(index) {
  if (isAmbos()) return;
  const item = state.gastosFixos[index];
  if (!item) return;
  const vaiFicarPago = !fixoEhPago(item);
  item.pago = vaiFicarPago;
  // Atualiza imediatamente os totais para disparar o efeito visual de entrada/saída no topo.
  renderTotais();

  // Essa parcela é a "metade" de uma compra dividida (ver dividirCompra) e
  // acabou de ser marcada como paga: credita quem pagou a conta na hora e
  // tira a marcação do nome, que volta a ficar limpo.
  const credor = extrairCredorDivisao(item.nome);
  const nomeOriginal = removerSufixoDivisao(item.nome);
  if (credor) {
    if (vaiFicarPago) item.nome = nomeOriginal;
    atualizarGanhoDivisao(credor, state.pessoaAtual, nomeOriginal, item.valor, item.data, vaiFicarPago);
  } else {
    // Gasto fixo normal: o ganho correspondente da outra pessoa acompanha
    // o status nos dois sentidos (pagar -> recebido / desfazer -> pendente).
    sincronizarGanhoCorrespondenteFixo(state.pessoaAtual, item, vaiFicarPago);
  }

  vibrar();
  marcarAlteracaoLocal();
  sincronizarCacheAtual();
  salvarBloco("saveGastosFixos", state.gastosFixos);
  if (!credor) {
    return animarMudancaStatusFluida("listaFixos", "pendentesFixos", index, item.pago, "expense", "pago", togglePagoFixo, opFixos, "fixos", "Pago", "Pendente");
  }
  renderAll();
}
function togglePagoVariavel(index) {
  return enfileirarAnimacaoStatus(() => togglePagoVariavelInterno(index));
}
function togglePagoVariavelInterno(index) {
  if (isAmbos()) return;
  const item = state.gastosVariaveis[index];
  if (!item) return;
  const vaiFicarPago = !variavelEhPago(item);
  item.pago = vaiFicarPago;
  // Atualiza imediatamente os totais para disparar o efeito visual de entrada/saída no topo.
  renderTotais();
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
  marcarAlteracaoLocal();
  sincronizarCacheAtual();
  salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  if (!credor) {
    return animarMudancaStatusFluida("listaVariaveis", "pendentesVariaveis", index, item.pago, "expense", "pago", togglePagoVariavel, opVariaveis, "variaveis", "Pago", "Pendente");
  }
  renderAll();
}
function toggleRecebidoGanho(index) {
  return enfileirarAnimacaoStatus(() => toggleRecebidoGanhoInterno(index));
}
function toggleRecebidoGanhoInterno(index) {
  if (isAmbos()) return;
  const item = state.ganhos[index];
  if (!item) return;
  item.recebido = !ganhoEhRecebido(item);
  // Atualiza imediatamente os totais para disparar o efeito visual de entrada/saída no topo.
  renderTotais();
  vibrar();
  marcarAlteracaoLocal();
  sincronizarCacheAtual();
  salvarBloco("saveGanhos", state.ganhos);
  return animarMudancaStatusFluida("listaGanhos", "pendentesGanhos", index, item.recebido, "income", "recebido", toggleRecebidoGanho, opGanhos, "ganhos", "Recebido", "Pendente");
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
// A regra também é aplicada localmente pela função variavelContaNoSaldo().
function gastoVariavelEhReal(item) {
  return !ehLancamentoDeCaixinha(item?.nome);
}
function somaVariaveisPagas(lista) {
  return lista.reduce((acc, i) => acc + (gastoVariavelEhReal(i) && i.pago === true && i.lembrete !== true ? Number(i.valor) || 0 : 0), 0);
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

  const gastosVariaveisReais = state.gastosVariaveis.filter(gastoVariavelEhReal);
  const totalVariaveisGeral = soma(gastosVariaveisReais);
  const totalVariaveisPagos = somaVariaveisPagas(gastosVariaveisReais);
  const totalVariaveisAPagar = Math.max(0, totalVariaveisGeral - totalVariaveisPagos);

  // "Guardado" aqui é o quanto entrou nas caixinhas ESSE mês — igual aos
  // outros 3 cards do topo (Ganhos/Fixos/Variáveis), que também são do mês
  // atual, não um acumulado. O total "de verdade" guardado em cada caixinha
  // (base + rendimento + o que entrou esse mês) já aparece no card de cada
  // caixinha individualmente — aqui é só a movimentação do mês.
  const totalGuardadoAtual = somaTotalCaixinhas(state.caixinhas);
  const totalGuardadoNoMes = somaCampo(state.caixinhas, "valorGuardadoMes");
  // Saldo disponível e benefício usam a mesma fonte de cálculo do fechamento.
  // Assim, o valor que aparece na tela é exatamente o valor que o mês leva
  // para o fechamento, sem uma segunda fórmula escondida no backend.
  const saldosDisponiveis = window.CAIXA_FIREBASE?.calcularSaldosDisponiveis
    ? window.CAIXA_FIREBASE.calcularSaldosDisponiveis({
        ganhos: state.ganhos,
        gastosFixos: state.gastosFixos,
        gastosVariaveis: state.gastosVariaveis,
        caixinhas: state.caixinhas,
      })
    : null;
  const saldo = saldosDisponiveis ? saldosDisponiveis.total : (ganhosPorOrigem.beneficios + ganhosPorOrigem.ganhos - totalFixosPagos - totalVariaveisPagos - totalGuardadoNoMes);

  const ganhosEl = document.getElementById("statGanhos");
  const fixosEl = document.getElementById("statFixos");
  const variaveisEl = document.getElementById("statVariaveis");
  const guardadoEl = document.getElementById("statGuardado");
  const saldoEl = document.getElementById("saldoValor");
  const beneficiosEl = document.getElementById("saldoBeneficios");
  const ganhosSaldoEl = document.getElementById("saldoGanhos");
  const beneficioRestanteEl = document.getElementById("saldoBeneficioRestante");
  const saldoRestanteEl = document.getElementById("saldoRestante");

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

  // Mostra o que ainda resta de cada origem. O HTML atual do saldo usa
  // saldoBeneficioRestante e saldoRestante; os IDs saldoBeneficios/saldoGanhos
  // continuam sendo usados no card Ganhos.
  const gastosVariaveisBeneficio = saldosDisponiveis ? saldosDisponiveis.gastosVariaveisBeneficio : (state.gastosVariaveis || []).reduce((acc, item) => {
    return acc + (gastoVariavelEhReal(item) && variavelContaNoSaldo(item) && variavelEhBeneficio(item) ? (Number(item.valor) || 0) : 0);
  }, 0);
  const gastosVariaveisSaldo = saldosDisponiveis ? saldosDisponiveis.gastosVariaveisSaldo : (state.gastosVariaveis || []).reduce((acc, item) => {
    return acc + (gastoVariavelEhReal(item) && variavelContaNoSaldo(item) && !variavelEhBeneficio(item) ? (Number(item.valor) || 0) : 0);
  }, 0);
  const beneficioRestante = saldosDisponiveis ? saldosDisponiveis.beneficio : (ganhosPorOrigem.beneficios - gastosVariaveisBeneficio);
  // Deve representar exatamente o mesmo "saldo em conta" usado pelo
  // assistente: gastos reais + dinheiro guardado neste mês.
  const saldoRestante = saldosDisponiveis ? saldosDisponiveis.saldoConta : (ganhosPorOrigem.ganhos - totalFixosPagos - gastosVariaveisSaldo - totalGuardadoNoMes);

  if (beneficiosEl) {
    beneficiosEl.textContent = fmt(beneficioRestante);
    beneficiosEl.classList.toggle("negative", beneficioRestante < 0);
  }
  if (ganhosSaldoEl) {
    ganhosSaldoEl.textContent = fmt(saldoRestante);
    ganhosSaldoEl.classList.toggle("negative", saldoRestante < 0);
  }
  if (beneficioRestanteEl) {
    beneficioRestanteEl.textContent = fmt(beneficioRestante);
    beneficioRestanteEl.classList.toggle("negative", beneficioRestante < 0);
  }
  if (saldoRestanteEl) {
    saldoRestanteEl.textContent = fmt(saldoRestante);
    saldoRestanteEl.classList.toggle("negative", saldoRestante < 0);
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

// Verdadeiro para qualquer lançamento datado depois do mês que está aberto
// no app. Isso é diferente de ehDoProximoMes(): a IA e os cálculos de
// pendências precisam saber que um item de daqui a dois meses (ou mais)
// também NÃO é uma conta que vence neste mês.
function ehFuturoDoMesAtual(item) {
  if (!state.mesAtual || !state.anoAtual) return false;
  const m = /^(\d{4})-(\d{2})/.exec(String(item.data || ""));
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  return ano > state.anoAtual || (ano === state.anoAtual && mes > state.mesAtual);
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

const VENCIMENTOS_FATURA_PADRAO = { davi: 9, gabriel: 20 };

function faturasConfiguradas(pessoa = state.pessoaAtual) {
  const lista = Array.isArray(state.faturas) ? state.faturas : [];
  const p = String(pessoa || "davi").toLowerCase();
  const filtradas = lista.filter(f => {
    const dono = String(f?.pessoa || "davi").toLowerCase();
    return p === "ambos" ? true : dono === p;
  });
  if (filtradas.length) return filtradas;
  if (p === "ambos") return [];
  return [{
    id: `nubank-${p}`,
    nome: "Nubank",
    dia: VENCIMENTOS_FATURA_PADRAO[p] || 9,
    pessoa: p,
    padrao: true
  }];
}

function faturaPadraoPessoa(pessoa = state.pessoaAtual) {
  return faturasConfiguradas(pessoa)[0] || null;
}

function faturaPorId(id, pessoa = state.pessoaAtual) {
  const lista = faturasConfiguradas(pessoa);
  return lista.find(f => String(f?.id || "") === String(id || "")) || lista[0] || null;
}

function itemEhFatura(item) {
  return item?.fatura === true || /^Fatura:\s*/i.test(String(item?.nome || ""));
}

function nomeExibicaoItem(itemOuNome) {
  const nome = typeof itemOuNome === "object"
    ? String(itemOuNome?.nome || "")
    : String(itemOuNome || "");
  return nome.replace(/^Fatura:\s*/i, "").trim();
}

function nomeInternoFatura(nome) {
  const limpo = nomeExibicaoItem(nome);
  return limpo ? `Fatura: ${limpo}` : limpo;
}

function proximaDataVencimentoFatura(pessoa, base = new Date(), faturaId = "") {
  const fatura = faturaId ? faturaPorId(faturaId, pessoa) : faturaPadraoPessoa(pessoa);
  const diaVencimento = Math.max(1, Math.min(31, Number(fatura?.dia) || VENCIMENTOS_FATURA_PADRAO[pessoa] || 9));
  const data = new Date(base);
  data.setHours(12, 0, 0, 0);
  let ano = data.getFullYear();
  let mes = data.getMonth();

  // Se o vencimento deste mês já passou, a compra entra na próxima fatura.
  if (data.getDate() > diaVencimento) mes += 1;
  if (mes > 11) { mes = 0; ano += 1; }
  // Faturas com vencimento no dia 29/30/31 usam o último dia disponível
  // quando o mês não possui aquele dia.
  const ultimoDiaDoMes = new Date(ano, mes + 1, 0).getDate();
  const diaReal = Math.min(diaVencimento, ultimoDiaDoMes);

  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(diaReal).padStart(2, "0")}`;
}

function pessoaDaFaturaAtual() {
  return state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
}

function nomePessoaFatura(pessoa) {
  return pessoa === "gabriel" ? "Gabriel" : "Davi";
}

function dataVencimentoFaturaAtual(faturaId = "") {
  return proximaDataVencimentoFatura(pessoaDaFaturaAtual(), new Date(), faturaId);
}

function metaInfoHtml(item) {
  const partes = [];
  if (itemEhFatura(item)) {
    partes.push(`<span class="item-tag item-tag-fatura" title="Lançamento incluído em uma fatura">Fatura</span>`);
  } else if (item.lembrete) {
    partes.push(`<span class="item-tag item-tag-lembrete" title="Pago no mês anterior, adiantado — não conta no saldo deste mês">Pago adiantado</span>`);
  } else if (ehDoProximoMes(item)) {
    partes.push(`<span class="item-tag item-tag-proximo" title="A data desse lançamento é do mês que vem">Mês que vem</span>`);
  } else if (estaPendente(item) && ehDoMesAnterior(item)) {
    partes.push(`<span class="item-tag item-tag-atrasado" title="Venceu no mês passado e ainda não foi pago">Atrasado</span>`);
  }
  if (item.tipo) {
    if (item.tipo === "saldo_anterior") {
      partes.push(`<span class="item-tag item-tag-saldo-anterior" title="Saldo que veio do mês anterior" style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;border:1px solid rgba(99,102,241,.18);background:rgba(99,102,241,.10);color:inherit;font-size:.78em;font-weight:650;line-height:1;letter-spacing:.01em;box-shadow:0 1px 2px rgba(15,23,42,.04)"><span aria-hidden="true" style="font-size:.9em;opacity:.78">↩</span>Saldo anterior</span>`);
    } else {
      partes.push(`<span class="item-tag item-tag-cat">${escapeHtml(item.tipo)}</span>`);
    }
  }
  const dataCurta = formatarDataCurta(item.data);
  if (dataCurta) partes.push(`<span class="item-tag item-tag-data">${dataCurta}</span>`);
  return partes.length ? `<div class="item-meta">${partes.join("")}</div>` : "";
}

function nomeComParcela(item) {
  // O prefixo "Fatura:" é um dado interno; visualmente mostramos só o nome do gasto.
  return escapeHtml(nomeExibicaoItem(item));
}

function parcelaInlineHtml(item, tipo) {
  if (tipo !== "expense" || !item.parcela) return "";
  const parcela = String(item.parcela).trim();
  if (!/^\d+\s*\/\s*\d+$/.test(parcela)) return "";
  // A parcela acompanha o nome, sempre depois dele: Ajuda Amor (1/2).
  return ` <span class="item-tag item-tag-parcela item-tag-parcela-inline">(${escapeHtml(parcela)})</span>`;
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
    // Alguns .item-list não possuem id. Nunca passe "#" vazio ao closest(),
    // pois isso lança SyntaxError e interrompe o restante do app.
    if (!ul.id || !e.target.closest(`#${CSS.escape(ul.id)}`)) fecharTodosSwipes(ul);
  });
}, { passive: true });

// Adicione este bloco para fazer o mesmo com o clique no PC:
document.addEventListener("mousedown", (e) => {
  document.querySelectorAll(".item-list").forEach((ul) => {
    // Alguns .item-list não possuem id. Evita o seletor inválido "#".
    if (!ul.id || !e.target.closest(`#${CSS.escape(ul.id)}`)) fecharTodosSwipes(ul);
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


function renderPendentesDestaque(containerId, lista, tipo, statusKey, toggleFn, rotuloOff, ops, tipoModal) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const pendentes = (lista || []).map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item[statusKey] !== true)
    .sort((a, b) => compararDataAscendente(a.item.data, b.item.data));

  if (!pendentes.length) {
    el.classList.add("is-hidden");
    el.innerHTML = "";
    return;
  }

  const ambos = isAmbos();
  el.classList.remove("is-hidden");
  el.innerHTML = `
    <div class="status-list-title">Pendentes</div>
    <ul class="item-list pendentes-item-list" aria-label="Lançamentos pendentes">
      ${pendentes.map(({ item, idx }, posicao) => {
        const li = `
          <li class="item-list-row is-pendente pendente-destaque-row" data-idx="${idx}" style="animation-delay:${Math.min(posicao * 35, 250)}ms">
            ${ambos ? "" : `<div class="swipe-actions">
              <button class="swipe-btn swipe-edit" aria-label="Editar" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_LAPIS}</span><span>Editar</span></button>
              <button class="swipe-btn swipe-delete" aria-label="Excluir" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_X}</span><span>Excluir</span></button>
            </div>`}
            <div class="swipe-content">
              <span class="item-nome">${nomeComParcela(item)}${parcelaInlineHtml(item, tipo)} ${tagPessoa(item)}</span>
              <span class="item-valor ${tipo}${tipo === "income" && ganhoEhBeneficio(item) ? " income-beneficio" : ""}">${fmt(item.valor)}</span>
              ${metaInfoHtml(item) || `<div class="item-meta"></div>`}
              ${ambos
                ? `<span class="pago-toggle" aria-disabled="true"><span class="dot"></span>${escapeHtml(rotuloOff)}</span>`
                : `<label class="pago-toggle">
                    <input type="checkbox" data-idx="${idx}" />
                    <span class="dot"></span><span class="status-label-text">${escapeHtml(rotuloOff)}</span>
                  </label>`}
            </div>
          </li>`;
        return li;
      }).join("")}
    </ul>
  `;

  if (!ambos) {
    el.querySelectorAll('.pendente-destaque-row .pago-toggle').forEach((label) => {
      label.addEventListener("click", (event) => {
        // O status só muda pela própria tag. O card inteiro nunca altera o
        // lançamento. Tratamos o clique da tag manualmente para que a mudança
        // visual aconteça no MESMO instante, sem depender do evento change.
        event.preventDefault();
        event.stopPropagation();
        if (label.dataset.statusBusy === "1") return;
        const input = label.querySelector('input[type="checkbox"]');
        if (!input) return;
        const idx = Number(input.dataset.idx);
        // O clique entra na fila; não antecipamos visualmente a mudança.
        // Assim, se vários lançamentos forem marcados em sequência, cada um
        // só recebe tag/carimbo quando chegar a sua vez, evitando que um
        // render do item anterior apague/recrie o visual do próximo.
        label.dataset.statusBusy = "1";
        toggleFn(idx);
      });
      label.querySelector('input[type="checkbox"]')?.addEventListener("change", (event) => {
        // Alterações por teclado/acessibilidade também entram pelo mesmo fluxo.
        if (label.dataset.statusBusy === "1") return;
        const input = event.currentTarget;
        label.dataset.statusBusy = "1";
        // A alteração por teclado também entra na mesma fila, sem aplicar
        // carimbo/status antes da vez desse lançamento.
        toggleFn(Number(input.dataset.idx));
      });
    });
    el.querySelectorAll('.pendente-destaque-row .swipe-edit').forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const item = (lista || [])[idx];
        const li = btn.closest(".item-list-row");
        fecharSwipe(li);
        if (item) abrirModalEditar(tipoModal || (tipo === "income" ? "ganhos" : containerId === "pendentesFixos" ? "fixos" : "variaveis"), idx, item);
      });
    });
    el.querySelectorAll('.pendente-destaque-row .swipe-delete').forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const item = (lista || [])[idx];
        const li = btn.closest(".item-list-row");
        fecharSwipe(li);
        if (item) abrirConfirmacao(`Remover "${item.nome}"?`, () => excluirComRisco(li, ops || (tipo === "income" ? opGanhos : containerId === "pendentesFixos" ? opFixos : opVariaveis), idx, item));
      });
    });
    const listaEl = el.querySelector(".pendentes-item-list");
    if (listaEl) habilitarSwipe(listaEl);
  }
}

function renderListaComStatus(ulId, lista, tipo, ops, tipoModal, statusKey, toggleFn, rotuloOn, rotuloOff) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = "";
  const ambos = isAmbos();
  // A lista inferior mostra somente o que já foi concluído. As pendências
  // ficam visualmente separadas no bloco acima, sem repetir os mesmos itens.
  const ordenados = lista
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item[statusKey] === true)
    .sort((a, b) => compararDataAscendente(a.item.data, b.item.data));

  const tituloPago = document.createElement("li");
  tituloPago.className = "status-list-title-row";
  // Mantém o título visualmente acima dos cards durante o FLIP, evitando
  // que um card em movimento interfira no texto "Recebidos"/"Pagos".
  tituloPago.style.position = "relative";
  tituloPago.style.zIndex = "20";
  tituloPago.innerHTML = `<span class="status-list-title">${tipo === "income" ? "Recebidos" : "Pagos"}</span>`;
  ul.appendChild(tituloPago);

  if (ordenados.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "status-list-empty";
    vazio.textContent = tipo === "income" ? "Nenhum recebimento ainda." : "Nenhum pagamento ainda.";
    ul.appendChild(vazio);
    return;
  }
  ordenados.forEach(({ item, idx }, posicao) => {
    const on = item[statusKey] === true;
    const li = document.createElement("li");
    li.className = "item-list-row" + (on ? "" : " is-pendente") + (tipo === "income" ? (ganhoEhBeneficio(item) ? " ganho-beneficio" : " ganho-saldo") : "");
    // O índice também precisa existir nas linhas já concluídas.
    // A animação de Recebidos/Pagos -> Pendentes localiza a linha pelo data-idx;
    // sem ele a transição encontrava a tag, mas não conseguia mover a linha.
    li.dataset.idx = idx;
    li.dataset.tipo = tipo;
    li.style.animationDelay = Math.min(posicao * 35, 250) + "ms";
    li.innerHTML = `
      ${ambos ? "" : `<div class="swipe-actions">
              <button class="swipe-btn swipe-edit" aria-label="Editar" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_LAPIS}</span><span>Editar</span></button>
              <button class="swipe-btn swipe-delete" aria-label="Excluir" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_X}</span><span>Excluir</span></button>
            </div>`}
      <div class="swipe-content">
        <span class="item-nome">${nomeComParcela(item)}${parcelaInlineHtml(item, tipo)} ${tagPessoa(item)}</span>
        <span class="item-valor ${tipo}${tipo === "income" && ganhoEhBeneficio(item) ? " income-beneficio" : ""}">${fmt(item.valor)}</span>
        ${metaInfoHtml(item) || `<div class="item-meta"></div>`}
        ${ambos ? `<span class="pago-toggle ${on ? "is-pago" : ""}" aria-disabled="true"><span class="dot"></span><span class="status-label-text">${on ? rotuloOn : rotuloOff}</span></span>`
                : `<label class="pago-toggle ${on ? "is-pago" : ""}">
                    <input type="checkbox" data-idx="${idx}" ${on ? "checked" : ""} />
                    <span class="dot"></span><span class="status-label-text">${on ? rotuloOn : rotuloOff}</span>
                  </label>`
        }
      </div>
    `;
    if (!ambos) {
      // Apenas a tag de status alterna Pago/Recebido <-> Pendente.
      // O restante do card não dispara a mudança de status.
      const status = li.querySelector(".pago-toggle");
      if (status) {
        status.addEventListener("click", (event) => {
          // Somente a tag alterna o status. Fazemos o toggle manualmente para
          // que a interface reflita a decisão antes de qualquer renderização.
          event.preventDefault();
          event.stopPropagation();
          if (status.dataset.statusBusy === "1") return;
          const input = status.querySelector('input[type="checkbox"]');
          if (!input) return;
          // O clique entra na fila e a atualização visual acontece somente
          // quando este lançamento começar a ser processado.
          status.dataset.statusBusy = "1";
          toggleFn(idx);
        });
        status.querySelector('input[type="checkbox"]')?.addEventListener("change", (event) => {
          if (status.dataset.statusBusy === "1") return;
          const input = event.currentTarget;
          status.dataset.statusBusy = "1";
          // Alterações por teclado também respeitam a fila visual.
          toggleFn(idx);
        });
      }
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

  // IMPORTANTE: uma meta já concluída ao carregar a Firebase NÃO dispara
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

let suprimirEntradaNoProximoRenderAll = false;

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
    if (typeof window.renderResumoStatusFinanceiro === "function") window.renderResumoStatusFinanceiro();
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

  const temaEspecial = ["christmas", "halloween"].includes(document.documentElement.dataset.caixaTheme);
  const corGuardado = temaEspecial ? "var(--theme-summary-saved)" : "var(--gold)";
  const corGastos = temaEspecial ? "var(--theme-summary-expense)" : "var(--expense)";
  const corLivre = temaEspecial ? "var(--theme-summary-free)" : "var(--income)";
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
    const cor1 = resolverCor(temaEspecial ? "--theme-summary-saved" : "--gold", corGuardado);
    const cor2 = resolverCor(temaEspecial ? "--theme-summary-expense" : "--expense", corGastos);
    const cor3 = resolverCor(temaEspecial ? "--theme-summary-free" : "--income", corLivre);
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
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;overflow:visible";
    donut.style.setProperty("background", "transparent", "important");
    donut.style.setProperty("background-image", "none", "important");
    donut.style.setProperty("box-shadow", temaAtual === "halloween"
      ? "0 0 0 1px rgba(85,223,255,.24), 0 8px 24px rgba(61,31,78,.14)"
      : "0 8px 24px rgba(35,52,78,.12)", "important");
    if (centro) centro.style.zIndex = "2";
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

// ---------------------------------------------------------------------
// HISTÓRICO — Melhorias Implementadas
// ---------------------------------------------------------------------

async function getCacheHistorico() { return idbGet(IDB_LOJA_CACHE, CACHE_PREFIX + "historico"); }
async function setCacheHistorico(data) { return idbSet(IDB_LOJA_CACHE, CACHE_PREFIX + "historico", { anos: data.anos || [] }); }

async function carregarHistorico() {
  if (window.CAIXA_FIREBASE_READY) await window.CAIXA_FIREBASE_READY.catch(() => null);
  const cache = await getCacheHistorico();
  if (cache) {
    state.historico = cache;
    renderHistorico();
  } else {
    renderHistoricoSkeleton();
  }
  if (!temBackendDados()) return;
  try {
    const res = await fetchApiGet({ pessoa: "historico" });
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.error || "Erro desconhecido");
    state.historico = data;
    // O histórico agora também carrega os dois meses atuais, mas não deve
    // sobrescrever o mês do perfil que está aberto na tela.
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
  const chatFab = document.getElementById("caixaChatFab");
  const chatAberto = document.getElementById("caixaChat")?.classList.contains("is-open");
  const abaHistorico = document.querySelector('.tab-btn[data-tab="historico"]')?.classList.contains("is-active");
  const ocultarTudo = !!chatAberto || !!abaHistorico;

  if (fab) {
    const ocultar = isAmbos() || ocultarTudo;
    fab.classList.toggle("is-hidden", ocultar);
    fab.setAttribute("aria-hidden", String(ocultar));
    fab.setAttribute("tabindex", ocultar ? "-1" : "0");
  }
  if (chatFab) {
    const ocultar = isAmbos() || ocultarTudo;
    chatFab.classList.toggle("is-hidden", ocultar);
    chatFab.setAttribute("aria-hidden", String(ocultar));
    chatFab.setAttribute("tabindex", ocultar ? "-1" : "0");
  }
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
    if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
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
  const data = dataDoLancamento(f.data ? f.data.value : "");
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
  const data = dataDoLancamento(f.data ? f.data.value : "");

  // "valor" no formulário agora é o valor INTEGRAL da compra — o select de
  // parcelas decide como ele é dividido antes de salvar (cada linha guarda
  // o valor de UMA parcela, mantendo o comportamento do fechamento mensal.
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

  const novoFixo = { nome, valor, pago, tipo, data, parcela };
  opFixos.add(nome, valor, { pago, tipo, data, parcela });
  if (pago) sincronizarGanhoCorrespondenteFixo(state.pessoaAtual, novoFixo, true);
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
  const data = dataDoLancamento(f.data ? f.data.value : "");
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
  const data = dataDoLancamento(f.data ? f.data.value : "");
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
  document.getElementById("editNome").value = nomeExibicaoItem(item);
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
    // input[type=date] aceita somente AAAA-MM-DD. Alguns lançamentos guardam
    // também horário (ex.: AAAA-MM-DDTHH:mm:ss), então usamos apenas a parte
    // da data ao abrir a edição. Se o lançamento não tiver data, permanece vazio.
    const dataEdicao = dataDoLancamento(item.data);
    dataEl.value = temData && /^\d{4}-\d{2}-\d{2}/.test(dataEdicao)
      ? dataEdicao.slice(0, 10)
      : "";
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
    const itemAtual = state.gastosFixos[idx];
    const nomeSalvo = itemEhFatura(itemAtual) ? nomeInternoFatura(nome) : nome;
    opFixos.edit(idx, nomeSalvo, valor, { tipo: categoria, data, parcela, fatura: itemEhFatura(itemAtual), faturaId: itemAtual?.faturaId || "" });
  } else if (tipo === "variaveis") {
    const categoria = document.getElementById("editCategoria").value;
    const data = document.getElementById("editData").value;
    const origem = document.getElementById("editOrigem").value === "beneficio" ? "beneficio" : "saldo";
    const itemAtual = state.gastosVariaveis[idx];
    const nomeSalvo = itemEhFatura(itemAtual) ? nomeInternoFatura(nome) : nome;
    // Editar manualmente tira o item do modo "lembrete" (compra adiantada) —
    // a partir daqui ele volta a contar normalmente no saldo, com a nova
    // data/categoria/origem que a pessoa escolheu.
    opVariaveis.edit(idx, nomeSalvo, valor, { tipo: categoria, data, origem, lembrete: false, fatura: itemEhFatura(itemAtual), faturaId: itemAtual?.faturaId || "" });
  } else if (tipo === "caixinhas") {
    const icone = normalizarNomeIcone(document.getElementById("editIcone")?.value || "");
    const data = document.getElementById("editData").value;
    editCaixinha(idx, nome, valor, icone, data);
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
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = "Preparando…"; }
  const feedback = mostrarAnimacaoDivisao({ nome, valor, quemPagouTudo });
  // A operação começa imediatamente. A animação é só feedback visual — não
  // deve criar uma espera artificial antes de salvar a divisão.
  const operacao = dividirCompra(nome, valor, categoriaDividir, { tipo, data, pago, quemPagouTudo });
  setEstadoDivisaoFeedback(feedback, "dividindo");
  if (btnSubmit) btnSubmit.textContent = "Dividindo…";
  const duracaoVisual = new Promise((resolve) => window.setTimeout(resolve, 650));
  const [ok] = await Promise.all([operacao, duracaoVisual]);
  if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Dividir"; }
  if (ok) {
    setEstadoDivisaoFeedback(feedback, "sucesso");
    showToast(quemPagouTudo && !pago ? `"${nome}" lançado — ${PESSOA_LABEL[quemPagouTudo === "davi" ? "gabriel" : "davi"]} fica devendo a metade` : `"${nome}" dividido — metade pra cada um`);
    fecharFeedbackDepois(feedback, 1550);
    window.setTimeout(() => { fecharAcoesConjunto(); renderAll(); }, 1150);
  } else {
    setEstadoDivisaoFeedback(feedback, "erro");
    fecharFeedbackDepois(feedback, 1500);
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

/* ============================================================
   FEEDBACK VISUAL — AÇÕES EM CONJUNTO
   Divisão: duas partes se separam e "encaixam" em cada pessoa.
   Transferência: usa o overlay da moeda, com direção explícita.
   Tudo é apenas feedback visual; a lógica financeira continua igual.
   ============================================================ */
function criarAcaoFeedbackBase(id, tipo) {
  const existente = document.getElementById(id);
  if (existente) existente.remove();

  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.className = `acao-feedback-overlay ${tipo}-feedback-overlay`;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("is-visible"));
  return overlay;
}

function perfilFeedback(pessoa, lado = "") {
  const nome = PESSOA_LABEL[pessoa] || pessoa;
  const inicial = nome.charAt(0).toUpperCase();
  return `
    <div class="feedback-person ${lado}">
      <div class="feedback-avatar" aria-hidden="true">${inicial}</div>
      <span class="feedback-person-name">${escapeHtml(nome)}</span>
    </div>
  `;
}

function montarDivisaoFeedback({ nome = "", valor = 0, quemPagouTudo = null } = {}) {
  const overlay = criarAcaoFeedbackBase("divisaoFeedbackOverlay", "divisao");
  const metade = Math.round((Number(valor) / 2) * 100) / 100;
  const rotulo = quemPagouTudo
    ? `${PESSOA_LABEL[quemPagouTudo]} pagou a compra`
    : "50% para cada um";

  overlay.innerHTML = `
    <div class="acao-feedback-card v34-feedback-card v34-divisao-card">
      <div class="cozy-badge">✦ MOMENTO DO CAIXA</div>
      <div class="v34-divisao-scene" aria-hidden="true">
        <div class="v34-scene-glow"></div>
        <div class="v34-divisao-link v34-link-left"></div>
        <div class="v34-divisao-link v34-link-right"></div>
        <div class="v34-split-person v34-person-left">
          <div class="feedback-avatar">${(PESSOA_LABEL.davi || "D").charAt(0).toUpperCase()}</div>
          <span>${escapeHtml(PESSOA_LABEL.davi)}</span>
        </div>
        <div class="v34-split-core">
          <div class="v34-purchase-card">
            <div class="v34-bag" aria-hidden="true">
              <span class="v34-bag-handle"></span>
              <span class="v34-bag-body"></span>
              <span class="v34-bag-line"></span>
            </div>
            <span class="v34-purchase-value">${fmt(Number(valor))}</span>
            <span class="v34-success-check">✓</span>
          </div>
          <span class="v34-share v34-share-left">50%</span>
          <span class="v34-share v34-share-right">50%</span>
        </div>
        <div class="v34-split-person v34-person-right">
          <div class="feedback-avatar">${(PESSOA_LABEL.gabriel || "G").charAt(0).toUpperCase()}</div>
          <span>${escapeHtml(PESSOA_LABEL.gabriel)}</span>
        </div>
        <div class="v34-split-sparkles" aria-hidden="true">
          <i>✦</i><i>✧</i><i>✦</i><i>·</i><i>✦</i>
        </div>
      </div>
      <span class="acao-feedback-kicker v34-feedback-kicker" data-divisao-kicker>PREPARANDO A DIVISÃO</span>
      <span class="acao-feedback-detail v34-feedback-detail" data-divisao-detail>${escapeHtml(nome || "Compra")} · ${fmt(metade)} para cada</span>
      <span class="acao-feedback-stamp v34-feedback-stamp" data-divisao-stamp>${escapeHtml(rotulo)}</span>
    </div>
  `;
  return overlay;
}

function animarPartilhaV34(overlay) {
  const scene = overlay?.querySelector(".v34-divisao-scene");
  const core = overlay?.querySelector(".v34-split-core");
  const leftPiece = overlay?.querySelector(".v34-share-left");
  const rightPiece = overlay?.querySelector(".v34-share-right");
  const leftPerson = overlay?.querySelector(".v34-person-left .feedback-avatar");
  const rightPerson = overlay?.querySelector(".v34-person-right .feedback-avatar");
  if (!scene || !core || !leftPiece || !rightPiece) return Promise.resolve();

  // As partes são filhas do .v34-split-core. Portanto, as coordenadas precisam
  // ser calculadas no sistema de coordenadas do próprio core — usar a largura
  // da cena aqui fazia a parte nascer/terminar em posições erradas (inclusive
  // perto do Gabriel) e dava a impressão de teleporte.
  const coreRect = core.getBoundingClientRect();
  const coreCenterX = coreRect.width / 2;
  const coreCenterY = coreRect.height / 2;

  const targets = [
    { el: leftPiece, person: leftPerson },
    { el: rightPiece, person: rightPerson }
  ];

  const animations = targets.map(({ el, person }) => {
    const personRect = person?.getBoundingClientRect();
    if (!personRect) return Promise.resolve();

    const targetX = personRect.left + personRect.width / 2 - coreRect.left;
    const targetY = personRect.top + personRect.height / 2 - coreRect.top;
    const dx = targetX - coreCenterX;
    const dy = targetY - coreCenterY;
    const side = dx < 0 ? -1 : 1;

    // Começa exatamente no centro da compra. O pequeno arco é aplicado de
    // forma progressiva, sem saltos de posição, e a chegada desacelera antes
    // de tocar o avatar.
    el.style.left = `${coreCenterX}px`;
    el.style.top = `${coreCenterY}px`;
    el.style.opacity = "1";

    const arc = Math.min(22, Math.max(10, Math.abs(dx) * 0.10));
    const keyframes = [
      { transform: "translate(-50%, -50%) scale(.55)", opacity: 0, offset: 0 },
      { transform: `translate(calc(-50% + ${dx * .08}px), calc(-50% - ${arc}px)) scale(1.03)`, opacity: 1, offset: .08 },
      { transform: `translate(calc(-50% + ${dx * .22}px), calc(-50% - ${arc * .72}px)) scale(1)`, opacity: 1, offset: .22 },
      { transform: `translate(calc(-50% + ${dx * .42}px), calc(-50% - ${arc * .34}px)) scale(.99)`, opacity: 1, offset: .42 },
      { transform: `translate(calc(-50% + ${dx * .66}px), calc(${dy * .66}px - 50% + ${arc * .20}px)) scale(.97)`, opacity: 1, offset: .66 },
      { transform: `translate(calc(-50% + ${dx * .84}px), calc(${dy * .84}px - 50%)) scale(.95)`, opacity: 1, offset: .84 },
      { transform: `translate(calc(-50% + ${dx}px), calc(${dy}px - 50%)) scale(.9)`, opacity: 1, offset: 1 }
    ];

    const animation = el.animate(keyframes, {
      duration: 2100,
      easing: "cubic-bezier(.22,.72,.20,1)",
      fill: "forwards"
    });

    animation.finished.then(() => {
      el.style.opacity = "0";
      person.classList.add("v34-recebeu");
      person.style.setProperty("--recebe-side", side < 0 ? "-1" : "1");
    });

    return animation.finished;
  });

  return Promise.all(animations);
}

function setEstadoDivisaoFeedback(overlay, estado) {
  if (!overlay) return;
  overlay.dataset.estado = estado;
  const kicker = overlay.querySelector("[data-divisao-kicker]");
  const stage = overlay.querySelector(".v34-divisao-scene");
  const detail = overlay.querySelector("[data-divisao-detail]");
  if (estado === "idle") {
    if (kicker) kicker.textContent = "PREPARANDO A DIVISÃO";
    stage?.classList.remove("is-dividindo", "is-sucesso", "is-erro");
  } else if (estado === "dividindo") {
    if (kicker) kicker.textContent = "DIVIDINDO A COMPRA";
    stage?.classList.add("is-dividindo");
    stage?.classList.remove("is-sucesso", "is-erro");
    if (detail) detail.textContent = "Cada parte encontra seu destino";
    requestAnimationFrame(() => animarPartilhaV34(overlay));
  } else if (estado === "sucesso") {
    if (kicker) kicker.textContent = "DIVISÃO CONCLUÍDA";
    stage?.classList.remove("is-dividindo", "is-erro");
    stage?.classList.add("is-sucesso");
  } else if (estado === "erro") {
    if (kicker) kicker.textContent = "NÃO FOI POSSÍVEL DIVIDIR";
    stage?.classList.remove("is-dividindo", "is-sucesso");
    stage?.classList.add("is-erro");
  }
}

function fecharFeedbackDepois(overlay, ms = 900) {
  window.setTimeout(() => {
    if (!overlay) return;
    overlay.classList.add("is-closing");
    window.setTimeout(() => overlay.remove(), 360);
  }, ms);
}

function mostrarAnimacaoDivisao({ nome = "", valor = 0, quemPagouTudo = null } = {}) {
  const overlay = montarDivisaoFeedback({ nome, valor, quemPagouTudo });
  setEstadoDivisaoFeedback(overlay, "idle");
  return overlay;
}

function montarTransferenciaFeedback(de, para, valor) {
  const overlay = criarAcaoFeedbackBase("transferirFeedbackOverlay", "transferencia");
  overlay.dataset.de = de;
  overlay.dataset.para = para;
  const deNome = PESSOA_LABEL[de] || de;
  const paraNome = PESSOA_LABEL[para] || para;
  overlay.innerHTML = `
    <div class="acao-feedback-card v34-feedback-card v34-transfer-card">
      <div class="cozy-badge">✦ FLUXO DO CAIXA</div>
      <div class="v34-transfer-scene" aria-hidden="true">
        <div class="v34-transfer-aura"></div>
        <div class="v34-transfer-person v34-transfer-left">
          <div class="feedback-avatar">${escapeHtml((deNome || "D").charAt(0).toUpperCase())}</div>
          <span>${escapeHtml(deNome)}</span>
        </div>
        <div class="v34-transfer-route">
          <svg viewBox="0 0 600 120" preserveAspectRatio="none">
            <path class="v34-route-shadow" d="M 28 60 C 155 25, 205 95, 300 60 S 445 25, 572 60"></path>
            <path class="v34-route-flow" d="M 28 60 C 155 25, 205 95, 300 60 S 445 25, 572 60"></path>
          </svg>
          <span class="v34-transfer-coin">R$</span>
          <span class="v34-arrival-ring"></span>
          <span class="v34-arrival-check">✓</span>
        </div>
        <div class="v34-transfer-person v34-transfer-right">
          <div class="feedback-avatar">${escapeHtml((paraNome || "G").charAt(0).toUpperCase())}</div>
          <span>${escapeHtml(paraNome)}</span>
        </div>
      </div>
      <span class="acao-feedback-kicker v34-feedback-kicker" data-transfer-kicker>PREPARANDO A TRANSFERÊNCIA</span>
      <span class="acao-feedback-detail v34-feedback-detail" data-transfer-detail>${escapeHtml(deNome)} → ${escapeHtml(paraNome)} · ${fmt(Number(valor))}</span>
    </div>
  `;
  return overlay;
}

function animarTransferenciaV34(overlay) {
  const route = overlay?.querySelector(".v34-transfer-route");
  const path = route?.querySelector(".v34-route-flow");
  const coin = route?.querySelector(".v34-transfer-coin");
  if (!route || !path || !coin) return Promise.resolve();
  const total = path.getTotalLength();
  const duration = 3400;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 1.75);
  return new Promise((resolve) => {
    const frame = (now) => {
      const raw = Math.min(1, (now - start) / duration);
      const t = ease(raw);
      const point = path.getPointAtLength(total * t);
      coin.style.left = `${(point.x / 600) * 100}%`;
      coin.style.top = `${(point.y / 120) * 100}%`;
      coin.style.transform = "translate(-50%, -50%)";
      if (raw < 1) requestAnimationFrame(frame);
      else { route.classList.add("is-arrived"); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}

function setEstadoTransferenciaFeedback(overlay, estado) {
  if (!overlay) return;
  overlay.dataset.estado = estado;
  const kicker = overlay.querySelector("[data-transfer-kicker]");
  const scene = overlay.querySelector(".v34-transfer-scene");
  if (estado === "idle") {
    if (kicker) kicker.textContent = "PREPARANDO A TRANSFERÊNCIA";
    scene?.classList.remove("is-transferindo", "is-sucesso", "is-erro");
  } else if (estado === "transferindo") {
    if (kicker) kicker.textContent = "TRANSFERINDO";
    scene?.classList.add("is-transferindo");
    scene?.classList.remove("is-sucesso", "is-erro");
    requestAnimationFrame(() => animarTransferenciaV34(overlay));
  } else if (estado === "sucesso") {
    if (kicker) kicker.textContent = "TRANSFERÊNCIA CONCLUÍDA";
    scene?.classList.remove("is-transferindo", "is-erro");
    scene?.classList.add("is-sucesso");
  } else if (estado === "erro") {
    if (kicker) kicker.textContent = "TRANSFERÊNCIA NÃO CONCLUÍDA";
    scene?.classList.remove("is-transferindo", "is-sucesso");
    scene?.classList.add("is-erro");
  }
}

on("formTransferir", "submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("transferirNome").value.trim() || "Transferência";
  const valor = parseValor(document.getElementById("transferirValor").value);
  if (!(valor > 0)) return;
  const categoriaEl = document.getElementById("transferirCategoria");
  const tipo = categoriaEl ? categoriaEl.value : "";
  const btnSubmit = document.getElementById("transferirSubmit");
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = "Preparando…"; }
  const { de, para } = direcaoTransferir;
  const feedback = montarTransferenciaFeedback(de, para, valor);
  setEstadoTransferenciaFeedback(feedback, "transferindo");
  if (btnSubmit) btnSubmit.textContent = "Transferindo…";
  // Começa a transferência na hora; a animação acompanha a operação em vez
  // de bloquear o envio por vários segundos.
  const operacao = transferirEntrePessoas(de, para, nome, valor, tipo);
  const duracaoVisual = new Promise((resolve) => window.setTimeout(resolve, 700));
  const [ok] = await Promise.all([operacao, duracaoVisual]);
  if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Transferir"; }
  if (ok) {
    setEstadoTransferenciaFeedback(feedback, "sucesso");
    showToast(`${fmt(valor)} transferido de ${PESSOA_LABEL[de]} pra ${PESSOA_LABEL[para]}`);
    fecharFeedbackDepois(feedback, 1700);
    window.setTimeout(() => { fecharAcoesConjunto(); renderAll(); }, 1250);
  } else {
    setEstadoTransferenciaFeedback(feedback, "erro");
    fecharFeedbackDepois(feedback, 1500);
    showToast("Não consegui transferir agora. Tenta de novo em instantes.");
  }
});

const fecharMesBackdrop = document.getElementById("fecharMesBackdrop");

function abrirFecharMes() {
  if (state.pessoaAtual === "ambos") {
    showToast("Juntos é somente leitura. Feche o mês pelo perfil Davi ou Gabriel.");
    return;
  }
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
  const periodo = document.getElementById("fecharMesPeriodo");
  const mes = Number(state.mesAtual);
  const ano = Number(state.anoAtual);
  if (periodo) {
    const valor = mes && ano ? `${MESES_LABEL[mes - 1]}/${ano}` : "Mês atual";
    const valorEl = periodo.querySelector("strong");
    if (valorEl) valorEl.textContent = valor;
    else periodo.textContent = valor;
  }
}


const FECHAMENTO_MES_CACHE_PREFIX = "caixa:fechamento-mes:v2:";
let fechamentoMesTimer = null;

function criarCenaFechamentoMes() {
  let cena = document.getElementById("fechamentoMesCena");
  if (cena) return cena;

  cena = document.createElement("div");
  cena.id = "fechamentoMesCena";
  cena.className = "fechamento-mes-cena is-hidden";
  cena.setAttribute("role", "dialog");
  cena.setAttribute("aria-modal", "true");
  cena.setAttribute("aria-label", "Fechamento do mês");
  cena.innerHTML = `
    <div class="fechamento-mes-linhas" aria-hidden="true"></div>
    <div class="fechamento-mes-brilhos" aria-hidden="true"></div>
    <div class="fechamento-mes-card">
      <div class="fechamento-mes-orb" aria-hidden="true"><span></span></div>
      <div class="fechamento-mes-etapa" id="fechamentoMesEtapa">
        <div class="fechamento-mes-kicker">Fechando o mês</div>
        <h2 id="fechamentoMesTitulo">Só um instante</h2>
        <p id="fechamentoMesTexto">Fechando com cuidado.</p>
      </div>
      <div class="fechamento-mes-resumo" id="fechamentoMesResumo"></div>
      <div class="fechamento-mes-progresso" aria-hidden="true"><span id="fechamentoMesProgresso"></span></div>
    </div>
  `;
  document.body.appendChild(cena);

  const linhas = cena.querySelector(".fechamento-mes-linhas");
  for (let i = 0; i < 12; i++) {
    const linha = document.createElement("span");
    linha.style.setProperty("--x", `${2 + Math.random() * 96}%`);
    linha.style.setProperty("--dur", `${3.2 + Math.random() * 3.8}s`);
    linha.style.setProperty("--delay", `${-Math.random() * 6}s`);
    linha.style.setProperty("--altura", `${70 + Math.random() * 35}vh`);
    linha.style.setProperty("--op", `${0.08 + Math.random() * 0.14}`);
    linhas.appendChild(linha);
  }

  const brilhos = cena.querySelector(".fechamento-mes-brilhos");
  for (let i = 0; i < 16; i++) {
    const brilho = document.createElement("i");
    brilho.style.setProperty("--x", `${4 + Math.random() * 92}%`);
    brilho.style.setProperty("--y", `${18 + Math.random() * 72}%`);
    brilho.style.setProperty("--delay", `${-Math.random() * 4}s`);
    brilho.style.setProperty("--dur", `${2.4 + Math.random() * 2.8}s`);
    brilhos.appendChild(brilho);
  }
  return cena;
}

// O fechamento real não depende mais deste cache. O cache antigo fazia a
// cerimônia desaparecer depois do primeiro fechamento no mesmo navegador e
// dava a impressão de que era necessário limpar cookies/localStorage.
function fechamentoMesJaExibido() {
  return false;
}

function marcarFechamentoMesExibido() {
  // Mantida por compatibilidade com versões anteriores. A cerimônia agora é
  // controlada pelo resultado real do fechamento, não pelo navegador.
}

function formatarFechamentoValor(valor, sinal = "") {
  const n = Number(valor) || 0;
  return `${sinal}${fmt(Math.abs(n))}`;
}

function animarFechamentoNumero(el, valor, duracao = 1200) {
  if (!el) return;
  const alvo = Number(valor) || 0;
  const inicio = performance.now();
  function passo(agora) {
    const p = Math.min((agora - inicio) / duracao, 1);
    const suavizado = 1 - Math.pow(1 - p, 4);
    el.textContent = fmt(alvo * suavizado);
    if (p < 1) requestAnimationFrame(passo);
    else el.textContent = fmt(alvo);
  }
  requestAnimationFrame(passo);
}

function prepararDadosFechamentoMes(mes, ano) {
  const ganhosLista = Array.isArray(state.ganhos) ? state.ganhos : [];
  const fixosLista = Array.isArray(state.gastosFixos) ? state.gastosFixos : [];
  const variaveisLista = Array.isArray(state.gastosVariaveis) ? state.gastosVariaveis : [];
  const caixinhas = Array.isArray(state.caixinhas) ? state.caixinhas : [];

  const ganhos = somaComStatus(ganhosLista, "recebido");
  const gastosFixos = somaFixosPagos(fixosLista);
  const gastosVariaveis = somaVariaveisPagas(variaveisLista);
  const gastos = gastosFixos + gastosVariaveis;
  const guardado = somaCampo(caixinhas, "valorGuardadoMes");
  const saldo = ganhos - gastos;

  // Dados da cerimônia são capturados ANTES do fechamento, porque é aqui que
  // ainda temos acesso às parcelas que acabaram, aos aportes do mês e aos
  // lançamentos que contam para a história daquele mês.
  const parcelasEncerradas = fixosLista
    .filter(g => g && g.pago === true && /^\d+\s*\/\s*\d+$/.test(String(g.parcela || "").trim()))
    .filter(g => {
      const m = String(g.parcela).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
      return m && Number(m[1]) === Number(m[2]) && Number(m[2]) > 1;
    })
    .map(g => ({ nome: String(g.nome || "Compromisso"), valor: Number(g.valor) || 0, parcela: String(g.parcela).replace(/\s+/g, "") }));

  const valorMensalEncerrado = parcelasEncerradas.reduce((a, g) => a + g.valor, 0);

  const metasBatidas = caixinhas
    .map(cx => {
      const objetivo = Number(cx.valorObjetivo) || 0;
      const total = totalCaixinha(cx);
      return { nome: String(cx.nome || "Caixinha"), valor: total, objetivo, icone: String(cx.icone || "") };
    })
    .filter(cx => cx.objetivo > 0 && cx.valor >= cx.objetivo);

  const maiorCaixinha = caixinhas.reduce((maior, cx) => {
    const valor = Number(cx.valorGuardadoMes) || 0;
    if (!maior || valor > maior.valor) return { nome: String(cx.nome || "Caixinha"), valor, icone: String(cx.icone || "") };
    return maior;
  }, null);

  // Pendências da cerimônia pertencem ao mês que está sendo fechado.
  // Lançamentos futuros (mês seguinte ou além) já estão preparados para o
  // próximo período e não devem aparecer como pendência deste fechamento.
  const ehFuturoDoMesFechamento = (item) => {
    const m = /^(\d{4})-(\d{2})/.exec(String(item?.data || ""));
    if (!m) return false;
    const anoItem = Number(m[1]);
    const mesItem = Number(m[2]);
    return anoItem > Number(ano) || (anoItem === Number(ano) && mesItem > Number(mes));
  };

  const pendencias = [
    ...fixosLista.filter(g => g && g.pago !== true && !ehFuturoDoMesFechamento(g)),
    ...variaveisLista.filter(g => g && g.pago !== true && !ehLancamentoDeCaixinha(g.nome) && !ehFuturoDoMesFechamento(g))
  ];

  const categorias = {};
  [...fixosLista.filter(g => g && g.pago === true), ...variaveisLista.filter(g => g && g.pago === true && !ehLancamentoDeCaixinha(g.nome))]
    .forEach(g => {
      const cat = String(g.tipo || "Outros").trim() || "Outros";
      categorias[cat] = (categorias[cat] || 0) + (Number(g.valor) || 0);
    });
  const categoriaPrincipal = Object.entries(categorias).sort((a,b) => b[1] - a[1])[0];

  // Não usamos mais o "maior movimento" geral: salário/benefício quase sempre
  // venceria a disputa e isso não conta uma história interessante do mês.
  // A cerimônia destaca o maior gasto efetivamente pago, excluindo lançamentos
  // de caixinha, para revelar um movimento que o usuário realmente pode analisar.
  const maiorGasto = [
    ...fixosLista.filter(g => g && g.pago === true).map(g => ({ nome: String(g.nome || "Gasto"), valor: Number(g.valor)||0, tipo: "fixo" })),
    ...variaveisLista.filter(g => g && g.pago === true && !ehLancamentoDeCaixinha(g.nome)).map(g => ({ nome: String(g.nome || "Gasto"), valor: Number(g.valor)||0, tipo: "variavel" }))
  ].filter(g => g.valor > 0).sort((a,b) => b.valor-a.valor)[0] || null;

  const comparacao = (() => {
    const anos = Array.isArray(state.historico?.anos) ? state.historico.anos : [];
    let pm = mes - 1, pa = ano;
    if (pm === 0) { pm = 12; pa--; }
    const bloco = anos.find(a => Number(a.ano) === pa);
    const anterior = bloco?.meses?.find(m => Number(m.mes) === pm);
    if (!anterior) return null;
    const suf = state.pessoaAtual === "gabriel" ? "Gabriel" : "Davi";
    const gastosAnterior = Math.abs(Number(anterior[`debitos${suf}`]) || 0);
    if (gastosAnterior <= 0 && gastos <= 0) return null;
    return { nome: String(anterior.nome || MESES_LABEL[pm - 1] || "mês anterior"), gastos: gastosAnterior, diferenca: gastos - gastosAnterior };
  })();

  const crescimentoCaixinha = caixinhas.map(cx => {
    const base = Number(cx.valorGuardado) || 0;
    const atual = totalCaixinha(cx);
    const crescimento = base > 0 ? ((atual - base) / base) * 100 : 0;
    return { nome: String(cx.nome || "Caixinha"), base, atual, crescimento };
  }).filter(x => x.base > 0 && x.crescimento >= 10).sort((a,b) => b.crescimento-a.crescimento)[0] || null;

  const rendimento = somaCampo(caixinhas, "rendimentoTotal");
  const quantidadeLancamentos = ganhosLista.length + fixosLista.length + variaveisLista.length;

  return {
    mes, ano, ganhos, gastos, guardado, saldo,
    ganhosLista, fixosLista, variaveisLista,
    pendencias: pendencias.length,
    quantidadeLancamentos,
    parcelasEncerradas,
    valorMensalEncerrado,
    metasBatidas,
    maiorCaixinha,
    categoriaPrincipal: categoriaPrincipal ? { nome: categoriaPrincipal[0], valor: categoriaPrincipal[1] } : null,
    comparacao,
    maiorGasto,
    crescimentoCaixinha,
    rendimento,
    caixinhas,
    // Uma conquista simples e verificável: primeiro mês do histórico com aporte.
    primeiraConstrucao: (() => {
      const anos = Array.isArray(state.historico?.anos) ? state.historico.anos : [];
      let pm = mes - 1, pa = ano;
      if (pm === 0) { pm = 12; pa--; }
      const bloco = anos.find(a => Number(a.ano) === pa);
      const ant = bloco?.meses?.find(m => Number(m.mes) === pm);
      const campoGuardadoAnterior = state.pessoaAtual === "gabriel" ? "guardadoMesGabriel" : "guardadoMesDavi";
      return !!(guardado > 0 && (!ant || Number(ant[campoGuardadoAnterior]) <= 0));
    })()
  };
}

function mostrarFechamentoMes(dados, { resultadoPromessa = null } = {}) {
  const cena = criarCenaFechamentoMes();
  const titulo = cena.querySelector("#fechamentoMesTitulo");
  const texto = cena.querySelector("#fechamentoMesTexto");
  const etapa = cena.querySelector("#fechamentoMesEtapa");
  const resumo = cena.querySelector("#fechamentoMesResumo");
  const progresso = cena.querySelector("#fechamentoMesProgresso");
  const kicker = cena.querySelector("#fechamentoMesEtapa .fechamento-mes-kicker");
  if (!titulo || !texto || !etapa || !resumo) return null;

  if (cena._cerimoniaAtiva) return cena;
  cena._cerimoniaAtiva = true;
  cena.classList.remove("is-hidden", "fechamento-mes-finalizando");
  document.body.classList.add("fechamento-mes-ativo");
  requestAnimationFrame(() => cena.classList.add("is-visible"));

  const mesNome = MESES_LABEL[dados.mes - 1] || "Mês";
  const proximoMes = dados.mes === 12 ? 1 : dados.mes + 1;
  const proximoAno = dados.mes === 12 ? dados.ano + 1 : dados.ano;
  if (kicker) kicker.textContent = "Fechamento";
  if (progresso) progresso.style.width = "5%";

  // A cerimônia é apenas visual. O salvamento roda em paralelo e não bloqueia
  // a narrativa. O resultado dele só é necessário para a última tela.
  titulo.textContent = "Só um instante";
  texto.textContent = "";
  resumo.innerHTML = `<div class="fechamento-mes-preparando"><span>✦</span><p>${escapeHtml(mesNome)}.</p></div>`;

  const esperar = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const trocarTela = async (config) => {
    etapa.classList.add("is-trocando");
    await esperar(320);
    titulo.textContent = config.titulo || "";
    texto.textContent = config.texto || "";
    resumo.innerHTML = config.html || "";
    etapa.classList.remove("is-trocando");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };

  const etapas = [];

  // Abertura curta. Não espera o Firebase.
  etapas.push(async () => {
    await esperar(1100);
    await trocarTela({
      titulo: "Olha o que você construiu",
      texto: "Os números do mês, do jeitinho que aconteceram.",
      html: `<div class="fechamento-mes-metricas">
        <div class="fechamento-mes-metrica"><span>Recebido</span><strong data-fechamento-num="ganhos">R$ 0,00</strong></div>
        <div class="fechamento-mes-metrica"><span>Gasto</span><strong data-fechamento-num="gastos">R$ 0,00</strong></div>
        <div class="fechamento-mes-metrica destaque"><span>Guardado</span><strong data-fechamento-num="guardado">R$ 0,00</strong></div>
      </div><div class="fechamento-mes-saldo"><span>Resultado do mês</span><strong class="${dados.saldo >= 0 ? "positivo" : "negativo"}">${formatarFechamentoValor(dados.saldo)}</strong></div>`
    });
    animarFechamentoNumero(resumo.querySelector('[data-fechamento-num="ganhos"]'), dados.ganhos, 1900);
    animarFechamentoNumero(resumo.querySelector('[data-fechamento-num="gastos"]'), dados.gastos, 2100);
    animarFechamentoNumero(resumo.querySelector('[data-fechamento-num="guardado"]'), dados.guardado, 2300);
    if (progresso) progresso.style.width = "22%";
    await esperar(5600);
  });

  dados.parcelasEncerradas.forEach(parcela => {
    etapas.push(async () => {
      await trocarTela({
        titulo: `${escapeHtml(parcela.nome)} chegou ao fim.`,
        texto: `Parcela ${escapeHtml(parcela.parcela)} concluída.`,
        html: `<div class="fechamento-mes-meta"><span>✓</span><p>Mais um compromisso encerrado.</p>${parcela.valor > 0 ? `<strong class="fechamento-mes-destaque-valor">${fmt(parcela.valor)}/mês</strong><small>deixam de ocupar seu orçamento.</small>` : ""}</div>`
      });
      await esperar(4500);
    });
  });

  if (dados.valorMensalEncerrado > 0) {
    etapas.push(async () => {
      const qtd = dados.parcelasEncerradas.length;
      await trocarTela({
        titulo: "O próximo mês começa mais leve.",
        texto: qtd === 1 ? "Um compromisso terminou." : `${qtd} parcelas chegaram ao fim.`,
        html: `<div class="fechamento-mes-proximo"><span>− ${fmt(dados.valorMensalEncerrado)}/mês</span><strong>de compromisso mensal</strong></div>`
      });
      await esperar(4500);
    });
  }

  dados.metasBatidas.forEach(meta => {
    etapas.push(async () => {
      const passou = meta.valor > meta.objetivo;
      await trocarTela({
        titulo: passou ? "E ainda passou da meta." : "Uma promessa cumprida.",
        texto: `${meta.icone ? meta.icone + " " : ""}${meta.nome} atingiu sua meta de ${fmt(meta.objetivo)}.`,
        html: `<div class="fechamento-mes-meta"><span>🎯</span><p><strong>${escapeHtml(meta.nome)}</strong></p><strong class="fechamento-mes-destaque-valor">${fmt(meta.valor)} guardados</strong>${passou ? `<small>Meta: ${fmt(meta.objetivo)}</small>` : ""}</div>`
      });
      await esperar(4800);
    });
  });

  if (dados.categoriaPrincipal) {
    etapas.push(async () => {
      await trocarTela({
        titulo: "E agora…",
        texto: "Onde foi parar boa parte do seu dinheiro?",
        html: `<div class="fechamento-mes-suspense-card">
          <div class="fechamento-mes-suspense-orbita" aria-hidden="true"><span>?</span></div>
          <div class="fechamento-mes-suspense-linha"><i></i><span>uma pequena descoberta do mês</span><i></i></div>
          <strong>Vamos descobrir.</strong>
        </div>`
      });
      await esperar(2400);
      await trocarTela({ titulo: "A categoria que mais recebeu seus gastos foi…", texto: "", html: `<div class="fechamento-mes-categoria fechamento-mes-categoria-revelacao">
          <div class="fechamento-mes-categoria-icone"><span>▣</span></div>
          <small class="fechamento-mes-categoria-label">MAIOR CATEGORIA DE GASTOS</small>
          <strong>${escapeHtml(dados.categoriaPrincipal.nome)}</strong>
          <b>${fmt(dados.categoriaPrincipal.valor)}</b>
          <em>Foi onde você mais gastou neste mês.</em>
        </div>` });
      await esperar(5200);
    });
  }

  if (dados.comparacao) {
    etapas.push(async () => {
      const d = dados.comparacao.diferenca;
      const abs = Math.abs(d);
      const frase = d < 0 ? `Você gastou ${fmt(abs)} a menos.` : d > 0 ? `Seus gastos foram ${fmt(abs)} maiores.` : "Seus gastos ficaram no mesmo nível.";
      const comparacaoClasse = d > 0 ? "gastos-maiores" : d < 0 ? "gastos-menores" : "gastos-iguais";
      const comparacaoIcone = d > 0 ? "↓" : d < 0 ? "↑" : "=";
      const comparacaoLabel = d > 0 ? "Você gastou mais" : d < 0 ? "Você gastou menos" : "Seus gastos ficaram iguais";
      await trocarTela({ titulo: `Em relação a ${escapeHtml(dados.comparacao.nome)}…`, texto: frase, html: `<div class="fechamento-mes-comparacao fechamento-mes-comparacao-simples ${comparacaoClasse}"><span>${comparacaoIcone}</span><strong>${comparacaoLabel}</strong></div>` });
      await esperar(6000);
    });
  }

  if (dados.maiorCaixinha && dados.maiorCaixinha.valor > 0) {
    etapas.push(async () => {
      await trocarTela({ titulo: "Qual caixinha recebeu mais este mês?", texto: "Seu maior aporte foi para esta caixinha.", html: `<div class="fechamento-mes-meta"><span class="fechamento-mes-caixinha-icone">${dados.maiorCaixinha.icone ? `<img src="${escapeHtml(urlIconeCaixinha(normalizarNomeIcone(dados.maiorCaixinha.icone)))}" alt="" loading="lazy" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='inline-flex';"><span class="fechamento-mes-caixinha-icone-fallback">↓</span>` : "↓"}</span><p><strong>${escapeHtml(dados.maiorCaixinha.nome)}</strong></p><strong class="fechamento-mes-destaque-valor">${fmt(dados.maiorCaixinha.valor)} guardados</strong></div>` });
      await esperar(4500);
    });
  }

  if (dados.guardado > 0) {
    etapas.push(async () => {
      await trocarTela({ titulo: "E quanto você guardou este mês?", texto: "Esse valor foi separado para suas caixinhas.", html: `<div class="fechamento-mes-proximo"><span>${fmt(dados.guardado)}</span><strong>destinados às suas caixinhas</strong></div>` });
      await esperar(6000);
    });
  }

  if (dados.rendimento > 0) {
    etapas.push(async () => {
      await trocarTela({ titulo: "Seu dinheiro também trabalhou.", texto: "As caixinhas renderam neste mês.", html: `<div class="fechamento-mes-proximo"><span>+ ${fmt(dados.rendimento)}</span><strong>de rendimento</strong></div>` });
      await esperar(6000);
    });
  }

  if (dados.crescimentoCaixinha) {
    etapas.push(async () => {
      await trocarTela({ titulo: "Uma caixinha ganhou espaço.", texto: "", html: `<div class="fechamento-mes-meta"><span>🌱</span><p><strong>${escapeHtml(dados.crescimentoCaixinha.nome)}</strong></p><strong class="fechamento-mes-destaque-valor">${dados.crescimentoCaixinha.crescimento.toFixed(0)}%</strong><small>de crescimento neste mês</small></div>` });
      await esperar(6000);
    });
  }

  if (dados.primeiraConstrucao) {
    etapas.push(async () => {
      await trocarTela({ titulo: "Uma pequena conquista.", texto: "", html: `<div class="fechamento-mes-meta"><span>✦</span><p>Este foi um mês em que você começou a construir dinheiro nas suas caixinhas.</p></div>` });
      await esperar(6000);
    });
  }

  if (dados.maiorGasto && dados.maiorGasto.valor > 0) {
    etapas.push(async () => {
      await trocarTela({
        titulo: "E qual foi o maior gasto do mês?",
        texto: "Entre os gastos pagos, este foi o movimento que mais pesou no mês.",
        html: `<div class="fechamento-mes-categoria fechamento-mes-gasto-destaque"><span>−</span><strong>${escapeHtml(dados.maiorGasto.nome)}</strong><b>${fmt(dados.maiorGasto.valor)}</b><small>${dados.maiorGasto.tipo === "fixo" ? "Gasto fixo" : "Gasto variável"}</small></div>`
      });
      await esperar(4800);
    });
  }

  if (dados.quantidadeLancamentos > 0) {
    etapas.push(async () => {
      await trocarTela({ titulo: `${mesNome} está oficialmente fechado.`, texto: "", html: `<div class="fechamento-mes-proximo"><span>${dados.quantidadeLancamentos}</span><strong>lançamentos registrados ao longo do mês</strong></div>` });
      await esperar(4000);
    });
  }

  if (dados.pendencias === 0) {
    etapas.push(async () => {
      await trocarTela({ titulo: "Tudo em ordem.", texto: "", html: `<div class="fechamento-mes-meta"><span>✓</span><p>Nenhuma conta ficou pendente para o próximo mês.</p></div>` });
      await esperar(5200);
    });
  } else {
    etapas.push(async () => {
      await trocarTela({ titulo: "Antes de fechar o livro…", texto: "Ainda há compromissos deste mês em aberto.", html: `<div class="fechamento-mes-meta"><span>!</span><p><strong>${dados.pendencias}</strong> compromisso${dados.pendencias === 1 ? "" : "s"} deste mês ainda está${dados.pendencias === 1 ? "" : "ão"} pendente${dados.pendencias === 1 ? "" : "s"}.</p></div>` });
      await esperar(5200);
    });
  }

  if (dados.mes === 12) {
    etapas.push(async () => {
      const anos = Array.isArray(state.historico?.anos) ? state.historico.anos : [];
      const bloco = anos.find(a => Number(a.ano) === Number(dados.ano));
      const meses = bloco?.meses || [];
      const campoGuardadoAno = state.pessoaAtual === "gabriel" ? "guardadoMesGabriel" : "guardadoMesDavi";
      const totalGuardadoAno = meses.reduce((a,m) => a + Math.max(0, Number(m[campoGuardadoAno]) || 0), 0) + Math.max(0, dados.guardado);
      await trocarTela({ titulo: `O livro de ${dados.ano} foi encerrado.`, texto: `Agora começa ${proximoAno}.`, html: `<div class="fechamento-mes-ano"><strong>${fmt(totalGuardadoAno)}</strong><span>guardados ao longo do ano</span><em>Uma nova página está aberta.</em></div>` });
      await esperar(6000);
    });
  }

  const finais = [
    "E assim termina {mes}. O que precisava ser registrado, foi registrado. O que foi conquistado, ficou guardado.",
    "{mes} chega ao fim. Mais uma página foi preenchida — e a próxima já está esperando.",
    "O livro de {mes} foi fechado. O que você construiu neste mês segue com você.",
    "Fim de {mes}. Uma página a menos, uma história financeira a mais.",
    "{mes} termina por aqui. Agora, uma nova página pode começar."
  ];

  const mostrarFinal = async (resultado) => {
    if (!resultado) {
      await trocarTela({ titulo: "Não foi possível fechar o mês agora.", texto: "Nada foi alterado. Você pode tentar novamente quando quiser.", html: `<div class="fechamento-mes-meta"><span>↻</span><p>Seu mês continua aberto e seguro.</p></div>` });
      if (progresso) progresso.style.width = "100%";
      await esperar(5200);
      return;
    }
    const fraseFinal = finais[(Number(dados.mes) - 1) % finais.length].replace("{mes}", mesNome);
    await trocarTela({ titulo: `Até aqui, ${mesNome}.`, texto: "", html: `<div class="fechamento-mes-final"><p>${escapeHtml(fraseFinal)}</p></div>` });
    if (progresso) progresso.style.width = "100%";
    await esperar(5600);
  };

  cena._cerimoniaPromise = (async () => {
    try {
      for (let i = 0; i < etapas.length; i++) {
        await etapas[i]();
        if (progresso && i < etapas.length - 1) {
          progresso.style.width = `${Math.min(96, 22 + ((i + 1) / etapas.length) * 70)}%`;
        }
      }

      // O salvamento já aconteceu em paralelo. Só aqui precisamos saber o
      // resultado para escolher a última tela da cerimônia.
      let resultado = null;
      try {
        const promessa = resultadoPromessa || cena._resultadoPromessa;
        if (promessa) {
          // O Firebase pode demorar ou perder a resposta mesmo depois de
          // concluir a gravação. A cerimônia nunca deve ficar presa na última
          // etapa esperando indefinidamente.
          resultado = await Promise.race([
            promessa,
            new Promise(resolve => window.setTimeout(() => resolve(null), 8000))
          ]);
        }
      } catch (_) {
        resultado = null;
      }
      await mostrarFinal(resultado);

      cena.classList.add("fechamento-mes-finalizando");
      document.body.classList.remove("fechamento-mes-ativo");
      await esperar(900);
      cena.classList.add("is-hidden");
      cena._cerimoniaAtiva = false;
    } catch (err) {
      console.error("Cerimônia de fechamento:", err);
      await trocarTela({ titulo: "Não foi possível concluir a cerimônia.", texto: "O mês permanece seguro e aberto.", html: `<div class="fechamento-mes-meta"><span>!</span><p>Você pode tentar fechar novamente.</p></div>` }).catch(() => {});
      document.body.classList.remove("fechamento-mes-ativo");
      await esperar(2500);
      cena.classList.add("fechamento-mes-finalizando");
      await esperar(800);
      cena.classList.add("is-hidden");
      cena._cerimoniaAtiva = false;
    }
  })();

  return cena;
}

async function verificarFechamentoMes(mes, ano, pessoa, tentativas = 8) {
  const proximoMes = Number(mes) === 12 ? 1 : Number(mes) + 1;
  const proximoAno = Number(mes) === 12 ? Number(ano) + 1 : Number(ano);
  const espera = (ms) => new Promise(resolve => window.setTimeout(resolve, ms));

  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    try {
      const res = await fetchApiGet({ pessoa });
      const data = await res.json().catch(() => null);
      if (data && data.ok !== false) {
        const atualMes = Number(data.mesAtual);
        const atualAno = Number(data.anoAtual);
        if (atualMes === proximoMes && atualAno === proximoAno) {
          return {
            ok: true,
            confirmadoPorVerificacao: true,
            fechado: { mes: Number(mes), ano: Number(ano), pessoa },
            mesAtual: atualMes,
            anoAtual: atualAno,
            configDavi: data.configDavi,
            configGabriel: data.configGabriel,
          };
        }
      }
    } catch (err) {
      // 404/redirect temporário do Firebase não significa que o fechamento
      // falhou. O Firebase pode ainda estar concluindo a gravação.
    }
    await espera(1800 + tentativa * 500);
  }
  return null;
}

async function fecharMesRequisicao(mes, ano, pessoa) {
  if (!temBackendDados()) {
    showToast("Configure o Firebase antes de fechar o mês.");
    return null;
  }

  const corpo = JSON.stringify({ action: "fecharMes", mes, ano, pessoa });
  const espera = (ms) => new Promise(resolve => window.setTimeout(resolve, ms));

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    let res;
    try {
      res = await caixaApiRequest({
        method: "POST",
        body: corpo,
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.ok !== false) return data;
    }
  } catch (err) {
    console.error("Fechamento Firebase:", err);
    // Ainda confirmamos pelo estado persistido, pois a gravação pode ter
    // concluído mesmo que a resposta tenha sido interrompida.
  }

  // Confirma pelo estado persistido. Se o servidor concluiu o fechamento,
  // P/Q já apontarão para o mês seguinte mesmo que a resposta do POST tenha
  // sido perdida pelo navegador.
  await espera(1200);
  return await verificarFechamentoMes(mes, ano, pessoa, 10);
}

on("formFecharMes", "submit", async (e) => {
  e.preventDefault();
  const mes = Number(state.mesAtual);
  const ano = Number(state.anoAtual);
  const pessoaFechamento = state.pessoaAtual;
  if (!mes || !ano || (pessoaFechamento !== "davi" && pessoaFechamento !== "gabriel")) {
    if (pessoaFechamento === "ambos") showToast("Juntos é somente leitura. Selecione Davi ou Gabriel para fechar o mês.");
    return;
  }

  const btnSubmit = document.getElementById("fecharMesSubmit");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Preparando…";
  }

  const dadosFechamentoAntes = prepararDadosFechamentoMes(mes, ano);
  // Não usamos mais localStorage para decidir se a cerimônia aparece.
  // Cada fechamento confirmado recebe sua própria cerimônia.
  const cenaFechamento = mostrarFechamentoMes(dadosFechamentoAntes, { resultadoPromessa: null });
  if (cenaFechamento) {
    cenaFechamento.style.zIndex = "99999";
    cenaFechamento.classList.remove("is-hidden");
    cenaFechamento.classList.add("is-visible");
    void cenaFechamento.offsetWidth;
  }

  if (fecharMesBackdrop) fecharMesBackdrop.classList.add("is-hidden");
  const idxModalFecharMes = pilhaModais.lastIndexOf("fecharMesBackdrop");
  if (idxModalFecharMes !== -1) pilhaModais.splice(idxModalFecharMes, 1);
  esconderProcessando("fecharMesOverlay");

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // As duas partes começam juntas: o Firebase salva em segundo plano e a
  // cerimônia segue sua narrativa visual. A promessa é compartilhada com a
  // cerimônia para que somente a última tela dependa do resultado real.
  const resultadoPromessa = fecharMesRequisicao(mes, ano, pessoaFechamento);
  const cenaAtiva = document.getElementById("fechamentoMesCena");
  if (cenaAtiva) {
    // mostrarFechamentoMes já foi iniciado acima. Entregamos a promessa para
    // a instância ativa sem reiniciar a cerimônia.
    cenaAtiva._resultadoPromessa = resultadoPromessa;
  }

  const resultado = await resultadoPromessa;
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Fechar mês";
  }

  if (resultado) {
    const f = resultado.fechado;
    state.mesAtual = resultado.mesAtual;
    state.anoAtual = resultado.anoAtual;
    if (pessoaFechamento === "davi") { state.mesAtualDavi = state.mesAtual; state.anoAtualDavi = state.anoAtual; }
    if (pessoaFechamento === "gabriel") { state.mesAtualGabriel = state.mesAtual; state.anoAtualGabriel = state.anoAtual; }
    renderMesAtual();

    await removerCache(pessoaFechamento);
    await removerCache("ambos");
    await removerCache("historico");

    showToast(`${MESES_LABEL[f.mes - 1]}/${f.ano} foi fechado para ${PESSOA_LABEL[pessoaFechamento]}. O próximo mês já está preparado.`);
    await carregarDados();
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
// Leituras da Firebase acontecem na abertura da página. Depois disso, a
// navegação e a troca de perfil usam os dados em memória/cache; alterações
// feitas pelo usuário continuam sendo enviadas normalmente via POST.
carregarDados();
carregarHistorico();
void carregarConfigIA().catch(() => null);
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
   "IA" de respostas rápidas:
   - prompts/intenções ficam pré-carregados no navegador;
   - os números são calculados do state atual;
   - não chama Gemini/API para cada clique;
   - o pequeno atraso é propositalmente visual, para parecer "pensando".
   ============================================================ */

(function inicializarAssistenteCaixa() {
  const fab = document.getElementById("caixaChatFab");
  const chat = document.getElementById("caixaChat");
  const close = document.getElementById("caixaChatClose");
  const body = document.getElementById("caixaChatBody");
  const quick = document.getElementById("caixaChatQuick");
  const thinking = document.getElementById("caixaChatThinking");
  if (!fab || !chat || !close || !body || !quick || !thinking) return;

  const CHAT_PROMPTS = {
    gastar: "Você é o assistente financeiro do Caixa. Descubra de qual origem o usuário quer gastar (benefício ou saldo em conta) e, para o saldo normal, informe quanto realmente pode gastar depois de considerar as entradas que ainda vão cair e todas as contas abertas que precisam ser reservadas. O saldo atual exibido no cartão é apenas o saldo de hoje; não o confunda com o limite de gasto projetado. Use somente os números calculados pelo aplicativo.",
    gastos: "Você é o assistente financeiro do Caixa. Mostre quanto já foi gasto no mês, separando gastos fixos, variáveis e o total.",
    categorias: "Você é o assistente financeiro do Caixa. Identifique as categorias que mais consumiram dinheiro no mês atual e apresente as três maiores, sem inventar dados.",
    guardado: "Você é o assistente financeiro do Caixa. Informe quanto existe atualmente nas caixinhas e destaque metas, se houver.",
    pendencias: "Você é o assistente financeiro do Caixa. Mostre o que ainda falta pagar e o que ainda falta receber neste mês, distinguindo claramente contas deste mês de lançamentos com vencimento no mês que vem ou depois. Nunca trate uma conta futura como se vencesse agora.",
    economia: "Você é o assistente financeiro do Caixa. Dê uma dica financeira de verdade: identifique algo concreto nos números e transforme isso em uma ação simples e útil que a pessoa pode tomar agora ou no planejamento. Não faça apenas um comentário aleatório sobre os dados. Seja específico, prático e personalizado; não invente informações. Distinga saldo de hoje, entradas futuras, contas deste mês e contas futuras. Se calcular quanto sobra, use o fluxo projetado correto."
  };

  const IC = {
    wallet: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" stroke-width="1.7"/><path d="M4 8h16M16 12h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="16.5" cy="12" r=".8" fill="currentColor"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none"><path d="m6 3 2 1.2L10 3l2 1.2L14 3l2 1.2L18 3v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 21V3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m7 15 3-4 3 2 5-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pig: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 11.5c0-3.3 3-5.5 7-5.5h2c3.2 0 5.5 1.8 6 4.5l1.5 1v3l-2 .4c-.5 1.5-1.6 2.5-3 3.1V20h-2v-1.4c-.8.2-1.7.3-2.6.3s-1.8-.1-2.6-.3V20h-2v-2.2C5.8 16.9 5 14.5 5 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="15.5" cy="10" r=".9" fill="currentColor"/><path d="M4 12H2.5M18 8.5V6.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3.2 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3ZM19 16l.7 2.3L22 19l-.7-2.3L16 19l2.3-.7L19 16Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    calculator: '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="3.5" width="14" height="17" rx="2.2" stroke="currentColor" stroke-width="1.6"/><path d="M8 7.5h8M8 11.5h2M14 11.5h2M8 15.5h2M14 15.5h2M11 11.5h1M11 15.5h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none"><path d="M20.8 8.9c0 5.3-8.8 10.2-8.8 10.2S3.2 14.2 3.2 8.9C3.2 6.4 5 4.5 7.4 4.5c1.7 0 3.1.9 4.6 2.5 1.5-1.6 2.9-2.5 4.6-2.5 2.4 0 4.2 1.9 4.2 4.4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  };

  const ACOES = [
    { id: "gastar", icon: "wallet", titulo: "Quanto ainda posso gastar?", subtitulo: "Separar benefício e saldo em conta" },
    { id: "categorias", icon: "chart", titulo: "Onde estou gastando mais?", subtitulo: "As categorias que mais pesaram" },
    { id: "guardado", icon: "pig", titulo: "Progresso das caixinhas", subtitulo: "Metas, prazos e quanto falta guardar" },
    { id: "mudou", icon: "chart", titulo: "O que mais mudou este mês?", subtitulo: "Compare com o mês anterior" },
    { id: "aconteceu", icon: "sparkle", titulo: "O que aconteceu este mês?", subtitulo: "Um resumo do que mudou por aqui" },
    { id: "pendencias", icon: "clock", titulo: "Ainda falta pagar", subtitulo: "Veja contas, parcelas e valores pendentes" },
    { id: "economia", icon: "sparkle", titulo: "Me dê uma dica", subtitulo: "Uma orientação baseada nos seus números" }
  ];

  let pensamentoTimer = null;
  let dicaOutraTimer = null;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function chatFmt(n) { return typeof fmt === "function" ? fmt(Number(n) || 0) : Number(n || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
  function naoNegativo(n) { return Math.max(0, Number(n) || 0); }
  function listaFinita(lista) { return Array.isArray(lista) ? lista : []; }

  function totaisChat() {
    const ganhosRecebidos = somaComStatus(state.ganhos || [], "recebido");
    const ganhosOrigem = separarGanhosPorOrigem(state.ganhos || []);
    const fixosPagos = somaFixosPagos(state.gastosFixos || []);
    const fixosTotais = listaFinita(state.gastosFixos).reduce((a, i) => a + (Number(i.valor) || 0), 0);
    const variaveisPagos = somaVariaveisPagas(state.gastosVariaveis || []);
    const beneficioGasto = listaFinita(state.gastosVariaveis).reduce((a, i) =>
      a + (gastoVariavelEhReal(i) && variavelContaNoSaldo(i) && variavelEhBeneficio(i) ? Number(i.valor) || 0 : 0), 0);
    const saldoGasto = listaFinita(state.gastosVariaveis).reduce((a, i) =>
      a + (gastoVariavelEhReal(i) && variavelContaNoSaldo(i) && !variavelEhBeneficio(i) ? Number(i.valor) || 0 : 0), 0);
    const beneficio = ganhosOrigem.beneficios - beneficioGasto;
    const guardadoNoMes = somaCampo(state.caixinhas || [], "valorGuardadoMes");
    // Para decidir "quanto ainda posso gastar" pelo saldo em conta,
    // partimos do saldo que já existe hoje, descontamos o que foi reservado
    // nas caixinhas neste mês, somamos o que ainda vai entrar (somente ganhos
    // sem benefício) e reservamos os gastos fixos ainda não pagos.
    const saldoAtualConta = ganhosOrigem.ganhos - fixosPagos - saldoGasto - guardadoNoMes;
    // Para perguntas e indicadores DO MÊS ATUAL, considerar somente ganhos
    // que pertencem ao mês aberto. Ganhos lançados para meses futuros ficam
    // disponíveis separadamente para projeções de longo prazo.
    const aReceberEsseMes = listaFinita(state.ganhos).reduce((a, i) =>
      a + (i.recebido !== true && !ganhoEhBeneficio(i) && !ehFuturoDoMesAtual(i) ? Number(i.valor) || 0 : 0), 0);
    const aReceberFuturos = Math.max(0, listaFinita(state.ganhos).reduce((a, i) =>
      a + (i.recebido !== true && !ganhoEhBeneficio(i) ? Number(i.valor) || 0 : 0), 0) - aReceberEsseMes);
    const aReceber = aReceberEsseMes;
    const aPagarFixos = listaFinita(state.gastosFixos).reduce((a, i) =>
      a + (i.pago !== true ? Number(i.valor) || 0 : 0), 0);
    const aPagarVariaveis = listaFinita(state.gastosVariaveis).reduce((a, i) =>
      a + (gastoVariavelEhReal(i) && i.pago !== true && !i.lembrete && !variavelEhBeneficio(i) ? Number(i.valor) || 0 : 0), 0);
    // Para "quanto posso gastar ESTE MÊS", reservamos somente as contas
    // pendentes que vencem no mês aberto. Contas de meses futuros não reduzem
    // a margem deste mês; elas ficam separadas para a projeção futura.
    const aPagarFixosEsseMes = listaFinita(state.gastosFixos).reduce((a, i) =>
      a + (i.pago !== true && !ehFuturoDoMesAtual(i) ? Number(i.valor) || 0 : 0), 0);
    const aPagarVariaveisEsseMes = listaFinita(state.gastosVariaveis).reduce((a, i) =>
      a + (gastoVariavelEhReal(i) && i.pago !== true && !i.lembrete && !variavelEhBeneficio(i) && !ehFuturoDoMesAtual(i) ? Number(i.valor) || 0 : 0), 0);
    const aPagarFixosFuturos = Math.max(0, aPagarFixos - aPagarFixosEsseMes);
    const aPagarVariaveisFuturos = Math.max(0, aPagarVariaveis - aPagarVariaveisEsseMes);
    // Margem de gasto do mês atual: saldo disponível hoje + ganhos ainda a
    // receber neste mês - compromissos pendentes deste mês.
    const conta = saldoAtualConta + aReceberEsseMes - aPagarFixosEsseMes - aPagarVariaveisEsseMes;
    // Projeção de todos os lançamentos abertos, incluindo meses futuros.
    const contaProjetadaTodosOsMeses = saldoAtualConta + (aReceberEsseMes + aReceberFuturos) - aPagarFixos - aPagarVariaveis;
    const saldoGeral = ganhosRecebidos - fixosPagos - variaveisPagos;
    return { ganhosRecebidos, ganhosOrigem, fixosPagos, fixosTotais, variaveisPagos, beneficio, saldoAtualConta, conta, contaProjetadaTodosOsMeses, saldoGeral, aReceber, aReceberEsseMes, aReceberFuturos, aPagarFixos, aPagarVariaveis, aPagarFixosEsseMes, aPagarVariaveisEsseMes, aPagarFixosFuturos, aPagarVariaveisFuturos };
  }

  function categoriasChat() {
    const porCat = {};
    listaFinita(state.gastosFixos).forEach(i => {
      if (i.pago !== true) return;
      const cat = String(i.tipo || "Outros").trim() || "Outros";
      porCat[cat] = (porCat[cat] || 0) + (Number(i.valor) || 0);
    });
    listaFinita(state.gastosVariaveis).forEach(i => {
      if (!gastoVariavelEhReal(i) || !variavelContaNoSaldo(i) || i.pago !== true) return;
      const cat = String(i.tipo || "Outros").trim() || "Outros";
      porCat[cat] = (porCat[cat] || 0) + (Number(i.valor) || 0);
    });
    return Object.entries(porCat).sort((a,b) => b[1] - a[1]);
  }

  function metasChat() {
    return listaFinita(state.caixinhas)
      .map(cx => {
        const atual = typeof totalCaixinha === "function" ? totalCaixinha(cx) : ((Number(cx.valorGuardado)||0)+(Number(cx.rendimentoTotal)||0)+(Number(cx.valorGuardadoMes)||0));
        const objetivo = Number(cx.valorObjetivo) || 0;
        return { nome: cx.nome || "Caixinha", atual, objetivo, falta: Math.max(objetivo - atual, 0), prazo: cx.data || "" };
      })
      .filter(x => x.objetivo > 0)
      .sort((a,b) => (b.atual / b.objetivo) - (a.atual / a.objetivo));
  }

  function appendMensagem(html, quem = "bot") {
    const wrap = document.createElement("div");
    wrap.className = `caixa-chat-message ${quem}`;
    const bubble = document.createElement("div");
    bubble.className = "caixa-chat-bubble";
    bubble.innerHTML = html;
    wrap.appendChild(bubble);
    // Remove the quick actions only from the welcome area; subsequent answers
    // get their own compact "voltar" action.
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function mostrarAcoesRapidas() {
    quick.innerHTML = "";
    ACOES.forEach(acao => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "caixa-chat-action";
      btn.dataset.chatAcao = acao.id;
      btn.innerHTML = `
        <span class="caixa-chat-action-icon">${IC[acao.icon]}</span>
        <span class="caixa-chat-action-text"><strong>${esc(acao.titulo)}</strong><small>${esc(acao.subtitulo)}</small></span>
        <span class="caixa-chat-action-arrow">›</span>`;
      quick.appendChild(btn);
    });
  }

  function mostrarMenuCompacto() {
    const anterior = document.getElementById("caixaChatBack");
    if (anterior) anterior.remove();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "caixaChatBack";
    btn.className = "caixa-chat-action";
    btn.style.marginTop = "4px";
    btn.innerHTML = `
      <span class="caixa-chat-action-icon">${IC.sparkle}</span>
      <span class="caixa-chat-action-text"><strong>Escolher outra coisa</strong><small>Voltar para as ações rápidas</small></span>
      <span class="caixa-chat-action-arrow">↩</span>`;
    btn.addEventListener("click", () => {
      // Voltar ao menu encerra completamente o contexto da resposta anterior.
      // Isso também invalida o timer de "Outra dica", para que ele nunca
      // apareça sozinho no menu depois que o usuário já mudou de assunto.
      window._caixaChatSessao = (Number(window._caixaChatSessao) || 0) + 1;
      clearTimeout(pensamentoTimer);
      clearTimeout(dicaOutraTimer);
      pensamentoTimer = null;
      dicaOutraTimer = null;
      window._caixaDicasIAEstoque = [];
      window._caixaDicaIAIndice = 0;
      thinking.classList.add("is-hidden");
      body.querySelectorAll(".caixa-chat-message, .caixa-chat-choices, .caixa-chat-select-wrap, .caixa-chat-simulador-form, #caixaChatBack, .caixa-chat-outra-dica").forEach(x => x.remove());
      quick.classList.remove("is-hidden");
      const quickTitle = quick.previousElementSibling;
      if (quickTitle && quickTitle.classList.contains("caixa-chat-quick-title")) quickTitle.classList.remove("is-hidden");
      const welcome = body.querySelector(".caixa-chat-welcome");
      if (welcome) welcome.classList.remove("is-hidden");
      body.scrollTop = 0;
      quick.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    body.appendChild(btn);
  }

  function tomChat() {
    const cfg = state.iaConfig || {};
    if (state.pessoaAtual === "ambos") return { tom: "", imersao: [...(cfg.ambos || [])] };
    const pessoa = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
    return { tom: pessoa === "gabriel" ? (cfg.tomGabriel || "") : (cfg.tomDavi || ""), imersao: [...(cfg[pessoa] || []), ...(cfg.ambos || [])] };
  }
  function aplicarTomChat(texto) {
    // A personalidade vem exclusivamente da TOM IA da Firebase e, nas
    // respostas geradas pela IA, já é aplicada no backend. O navegador não
    // deve inventar bordões como "Ora, ora" ou "Boa, Davi".
    return String(texto || "").trim();
  }
  function compararMesAnteriorChat() {
    const anos = listaFinita(state.historico?.anos);
    if (!state.mesAtual || !state.anoAtual || !anos.length) return null;
    let pm = state.mesAtual - 1, pa = state.anoAtual;
    if (pm === 0) { pm = 12; pa--; }
    const bloco = anos.find(a => Number(a.ano) === pa);
    const mes = bloco?.meses?.find(m => Number(m.mes) === pm);
    if (!mes) return null;
    const get = (campo) => {
      if (state.pessoaAtual === "ambos") return (Number(mes[`${campo}Davi`]) || 0) + (Number(mes[`${campo}Gabriel`]) || 0);
      const suf = state.pessoaAtual === "gabriel" ? "Gabriel" : "Davi";
      return Number(mes[`${campo}${suf}`]) || 0;
    };
    // DEBITOS no HISTORICO são gravados negativos. Para comparar com os
    // gastos atuais (que são positivos), normalizamos aqui uma única vez.
    return { ganhos: get("ganhos"), gastos: Math.abs(get("debitos")), guardado: Math.max(0, get("guardadoMes")), nome: mes.nome || "mês anterior" };
  }

  function resumoParaIAChat(t) {
    const totalGastos = (Number(t.fixosPagos) || 0) + (Number(t.variaveisPagos) || 0);
    const categorias = Object.fromEntries(categoriasChat().map(([nome, valor]) => [nome, Number(valor) || 0]));
    const caixinhas = listaFinita(state.caixinhas).map(cx => {
      const atual = typeof totalCaixinha === "function" ? totalCaixinha(cx) : ((Number(cx.valorGuardado)||0)+(Number(cx.rendimentoTotal)||0)+(Number(cx.valorGuardadoMes)||0));
      const objetivo = Number(cx.valorObjetivo) || 0;
      const prazo = String(cx.data || "");
      let diasAtePrazo = null;
      if (prazo) {
        const alvo = new Date(`${prazo}T23:59:59`);
        if (!Number.isNaN(alvo.getTime())) diasAtePrazo = Math.ceil((alvo - new Date()) / 86400000);
      }
      const falta = Math.max(objetivo - atual, 0);
      const meses = diasAtePrazo === null ? null : Math.max(1, Math.ceil(Math.max(diasAtePrazo, 0) / 30.4375));
      return { nome: cx.nome || "Caixinha", valorGuardado: atual, valorObjetivo: objetivo, prazo, diasAtePrazo, faltaParaMeta: falta, necessarioGuardarPorMes: meses && falta > 0 ? falta / meses : 0, guardadoNesseMes: Number(cx.valorGuardadoMes) || 0 };
    });
    const anterior = compararMesAnteriorChat();
    const ganhosAtuais = listaFinita(state.ganhos).filter(i => ganhoEhRecebido(i));
    const gastosAtuais = listaFinita(state.gastosFixos).filter(i => fixoEhPago(i)).concat(listaFinita(state.gastosVariaveis).filter(i => gastoVariavelEhReal(i) && variavelContaNoSaldo(i)));
    return {
      mesAtual: {
        mes: state.mesAtual, ano: state.anoAtual,
        ganhosRecebidos: Number(t.ganhosRecebidos) || 0,
        beneficiosRecebidos: Number(t.ganhosOrigem?.beneficios) || 0,
        beneficioDisponivel: Number(t.beneficio) || 0,
        ganhosRecebidosSemBeneficio: Number(t.ganhosOrigem?.ganhos) || 0,
        gastoFixoPago: Number(t.fixosPagos) || 0,
        gastoVariavelPago: Number(t.variaveisPagos) || 0,
        gastos: totalGastos,
        saldoAtualEmConta: Number(t.saldoAtualConta) || 0,
        saldoProjetadoComEntradas: (Number(t.saldoAtualConta) || 0) + (Number(t.aReceberEsseMes) || 0),
        contasAbertasTotal: (Number(t.aPagarFixosEsseMes) || 0) + (Number(t.aPagarVariaveisEsseMes) || 0),
        limiteDeGastoProjetado: Number(t.conta) || 0,
        // Projeção de longo prazo, separada da margem que a pessoa pode gastar
        // no mês atual. Aqui entram ganhos e gastos futuros.
        saldoProjetadoTodosOsMeses: Number(t.saldoAtualConta) || 0,
        ganhosFuturos: Number(t.aReceberFuturos) || 0,
        gastosFuturos: (Number(t.aPagarFixosFuturos) || 0) + (Number(t.aPagarVariaveisFuturos) || 0),
        limiteProjetadoTodosOsMeses: Number(t.contaProjetadaTodosOsMeses) || 0,
        statusFinanceiro: statusFinanceiroAtual(t),
        aindaAReceberEsseMes: Number(t.aReceberEsseMes) || 0,
        aindaAReceberFuturos: Number(t.aReceberFuturos) || 0,
        aindaAPagarFixosEsseMes: Number(t.aPagarFixosEsseMes) || 0,
        aindaAPagarVariaveisEsseMes: Number(t.aPagarVariaveisEsseMes) || 0,
        gastosFuturos: (Number(t.aPagarFixosFuturos) || 0) + (Number(t.aPagarVariaveisFuturos) || 0),
        guardadoNoMes: somaCampo(state.caixinhas, "valorGuardadoMes"),
        totalGuardadoAtualDeVerdade: somaTotalCaixinhas(state.caixinhas),
        rendimentoNoMes: somaCampo(state.caixinhas, "rendimentoTotal"),
        categorias,
        caixinhas,
        lancamentosPagos: gastosAtuais.slice(0, 80).map(i => ({ nome: i.nome || "", valor: Number(i.valor)||0, categoria: i.tipo || "", data: i.data || "" })),
        ganhosDoMes: ganhosAtuais.slice(0, 40).map(i => ({ nome: i.nome || "", valor: Number(i.valor)||0, data: i.data || "" }))
      },
      mesPassado: anterior ? { ganhosRecebidos: anterior.ganhos, gastos: anterior.gastos, guardadoNoMes: anterior.guardado, nome: anterior.nome } : null
    };
  }

  function formatarTextoIAChat(texto) {
    const bruto = String(texto || "").trim();
    if (!bruto) return "";

    // A IA pode devolver marcação para destacar valores. Não escapamos essa
    // marcação inteira, pois isso fazia o usuário enxergar literalmente
    // "<span class=...>" na conversa. Em vez disso, preservamos apenas um
    // conjunto pequeno de tags que o chat conhece e escapamos todo o restante.
    const marcadores = [];
    const guardar = (html) => {
      const id = `___CAIXA_TAG_${marcadores.length}___`;
      marcadores.push(html);
      return id;
    };

    let base = bruto
      .replace(/\{\{\s*(?:(ganho|gasto|guardado|rendimento)\s*:\s*)?([+-])?\s*(R\$\s*[0-9.]+,[0-9]{2})\s*\}\}/gi, (_, tipo, sinal, valor) => {
        const chave = String(tipo || sinal || "").toLowerCase();
        const mapa = { ganho: "chat-valor-pos", gasto: "chat-valor-neg", guardado: "chat-valor-gold", rendimento: "chat-valor-yield", "+": "chat-valor-pos", "-": "chat-valor-neg" };
        return guardar(`<span class="chat-valor ${mapa[chave] || ""}">${esc(valor)}</span>`);
      })
      .replace(/<span\s+class=["']chat-valor\s+(chat-valor-pos|chat-valor-neg|chat-valor-gold|chat-valor-yield)["']\s*>([\s\S]*?)<\/span>/gi,
        (_, classe, conteudo) => guardar(`<span class="chat-valor ${classe}">${esc(String(conteudo).replace(/<[^>]*>/g, ""))}</span>`))
      .replace(/<strong>([\s\S]*?)<\/strong>/gi, (_, conteudo) => guardar(`<strong>${esc(String(conteudo).replace(/<[^>]*>/g, ""))}</strong>`))
      .replace(/<br\s*\/?>/gi, () => guardar("<br>"));

    base = esc(base);
    marcadores.forEach((html, i) => {
      base = base.replace(`___CAIXA_TAG_${i}___`, html);
    });
    base = base.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    return base.replace(/\n+/g, "<br>");
  }

  function hashDicasChat(valor) {
    const texto = String(valor || "");
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function chaveCacheDicasChat(t, modo = "") {
    const cfg = state.iaConfig || {};
    const { tom, imersao } = tomChat();
    return `caixa:dicas:v4:${hashDicasChat(JSON.stringify({
      pessoa: state.pessoaAtual || "davi",
      mes: state.mesAtual,
      ano: state.anoAtual,
      resumo: resumoParaIAChat(t),
      tom,
      imersao,
      modo
    }))}`;
  }

  function lerCacheDicasChat(chave) {
    try {
      const raw = localStorage.getItem(chave);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.textos) || !data.textos.length) return null;
      return data.textos;
    } catch (e) { return null; }
  }

  function salvarCacheDicasChat(chave, textos) {
    try {
      localStorage.setItem(chave, JSON.stringify({ salvoEm: Date.now(), textos }));
    } catch (e) {}
  }

  function chaveCacheGastarIA(t) {
    const { tom, imersao } = tomChat();
    return `caixa:gastar-ia:v3:${hashDicasChat(JSON.stringify({
      pessoa: state.pessoaAtual || "davi",
      mes: state.mesAtual,
      ano: state.anoAtual,
      resumo: resumoParaIAChat(t),
      tom,
      imersao
    }))}`;
  }

  function lerCacheGastarIA(chave) {
    try {
      const raw = localStorage.getItem(chave);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      if (!data.saldo && !data.beneficio) return null;
      return data;
    } catch (e) { return null; }
  }

  function salvarCacheGastarIA(chave, respostas) {
    try { localStorage.setItem(chave, JSON.stringify({ salvoEm: Date.now(), ...respostas })); } catch (e) {}
  }

  async function buscarRespostasGastarIA(t, opcoes = {}) {
    if (!window.CAIXA_FIREBASE || typeof window.CAIXA_FIREBASE.gerarRespostaGastarIA !== "function") return null;
    const chave = opcoes.chave || chaveCacheGastarIA(t);
    if (!opcoes.forcar) {
      const cache = lerCacheGastarIA(chave);
      if (cache) return cache;
    }

    try {
      const data = await window.CAIXA_FIREBASE.gerarRespostaGastarIA({
        pessoa: state.pessoaAtual || "davi",
        periodo: { mes: state.mesAtual, ano: state.anoAtual },
        resumo: resumoParaIAChat(t),
      });
      if (!data || data.ok === false || !data.respostas) return null;
      const respostas = {
        beneficio: String(data.respostas.beneficio || "").trim(),
        saldo: String(data.respostas.saldo || "").trim()
      };
      if (!respostas.beneficio && !respostas.saldo) return null;
      salvarCacheGastarIA(chave, respostas);
      return respostas;
    } catch (err) {
      console.warn("CAIXA — IA de gasto indisponível:", err);
      return null;
    }
  }

  async function buscarDicasIA(t, opcoes = {}) {
    if (!window.CAIXA_FIREBASE || typeof window.CAIXA_FIREBASE.gerarInsightIA !== "function") return [];
    const chave = opcoes.chave || chaveCacheDicasChat(t, opcoes.modo || "");
    if (!opcoes.forcar) {
      const cache = lerCacheDicasChat(chave);
      if (cache) return cache;
    }

    try {
      const data = await window.CAIXA_FIREBASE.gerarInsightIA({
        pessoa: state.pessoaAtual || "davi",
        periodo: { mes: state.mesAtual, ano: state.anoAtual },
        resumo: resumoParaIAChat(t),
        modo: opcoes.modo || "",
      });
      if (!data || data.ok === false || !Array.isArray(data.textos)) return [];
      const textos = data.textos.map(x => {
        if (typeof x === "string") return { texto: x };
        return { texto: x?.texto || "", tipo: x?.tipo || "geral", titulo: x?.titulo || "" };
      }).filter(x => x.texto);
      if (textos.length) salvarCacheDicasChat(chave, textos);
      return textos;
    } catch (err) {
      console.warn("CAIXA — IA de insights indisponível:", err);
      return [];
    }
  }

  function montarDicasFinanceiras(t) {
    const dicas = [];
    const cats = categoriasChat();
    const maior = cats[0];
    const totalGastos = (Number(t.fixosPagos) || 0) + (Number(t.variaveisPagos) || 0);
    const totalEntradas = Number(t.ganhosRecebidos) || 0;
    const totalContasAbertas = (Number(t.aPagarFixos) || 0) + (Number(t.aPagarVariaveis) || 0);
    const contasDesteMes = (Number(t.aPagarFixosEsseMes) || 0) + (Number(t.aPagarVariaveisEsseMes) || 0);
    const contasFuturas = (Number(t.aPagarFixosFuturos) || 0) + (Number(t.aPagarVariaveisFuturos) || 0);
    const ganhosFuturos = Number(t.aReceberFuturos) || 0;
    const saldoProjetado = (Number(t.saldoAtualConta) || 0) + (Number(t.aReceberEsseMes) || 0);
    const folgaProjetada = saldoProjetado - contasDesteMes;
    const saldoProjetadoFuturo = (Number(t.contaProjetadaTodosOsMeses) || 0);

    if (t.aReceberEsseMes > 0 && contasDesteMes > 0) {
      dicas.push({ dica: `Quando entrarem os <span class="chat-valor chat-valor-pos">${chatFmt(t.aReceberEsseMes)}</span> deste mês, a folga após os compromissos fica em <span class="chat-valor chat-valor-pos">${chatFmt(Math.max(folgaProjetada, 0))}</span>. <strong>Dica:</strong> use esse valor como referência antes de assumir um novo gasto.` });
    }
    if (contasFuturas > 0) {
      if (ganhosFuturos > 0) {
        dicas.push({ dica: `Para os próximos meses, há <span class="chat-valor chat-valor-neg">${chatFmt(contasFuturas)}</span> em gastos futuros e <span class="chat-valor chat-valor-pos">${chatFmt(ganhosFuturos)}</span> em ganhos futuros já lançados. <strong>Dica:</strong> acompanhe os dois lados juntos ao planejar os próximos meses.` });
      } else {
        dicas.push({ dica: `Há <span class="chat-valor chat-valor-neg">${chatFmt(contasFuturas)}</span> em gastos futuros já lançados para os próximos meses. Eles não reduzem sua margem deste mês.` });
      }
    }
    if (contasDesteMes > 0) {
      dicas.push({ dica: `Neste mês, ainda existem <span class="chat-valor chat-valor-neg">${chatFmt(contasDesteMes)}</span> em compromissos com vencimento agora. <strong>Dica:</strong> priorize confirmar essas contas antes de considerar esse dinheiro livre para novos gastos.` });
    }
    if (t.aPagarVariaveisEsseMes > 0) {
      dicas.push({ dica: `Ainda estão pendentes <span class="chat-valor chat-valor-neg">${chatFmt(t.aPagarVariaveisEsseMes)}</span> em gastos variáveis deste mês. <strong>Dica:</strong> confira esses lançamentos antes de registrar novos gastos na mesma categoria.` });
    }
    if (maior && maior[1] > 0 && totalGastos > 0) {
      const percentual = Math.round((maior[1] / totalGastos) * 100);
      dicas.push({ dica: `A categoria <strong>${esc(maior[0])}</strong> lidera os gastos pagos do mês com <span class="chat-valor chat-valor-neg">${chatFmt(maior[1])}</span>, cerca de ${percentual}% do total. <strong>Dica:</strong> use essa categoria como a primeira referência para definir um limite no próximo mês.` });
    }
    if (cats.length >= 2 && cats[0][1] > 0 && cats[1][1] > 0) {
      const diferenca = cats[0][1] - cats[1][1];
      if (diferenca > 0) dicas.push({ dica: `<strong>${esc(cats[0][0])}</strong> ficou <span class="chat-valor chat-valor-neg">${chatFmt(diferenca)}</span> acima de <strong>${esc(cats[1][0])}</strong> nos gastos pagos.` });
    }
    if (t.beneficio > 0) dicas.push({ dica: `Ainda há <span class="chat-valor chat-valor-gold">${chatFmt(t.beneficio)}</span> disponíveis no benefício.` });
    if (t.aReceber > 0) dicas.push({ dica: `Você ainda espera receber <span class="chat-valor chat-valor-pos">${chatFmt(t.aReceber)}</span>. Esse valor ainda não entrou no saldo de hoje.` });
    if (totalEntradas > 0 && totalGastos > totalEntradas) dicas.push({ dica: `Os gastos pagos já somam <span class="chat-valor chat-valor-neg">${chatFmt(totalGastos)}</span>, enquanto as entradas recebidas somam <span class="chat-valor chat-valor-pos">${chatFmt(totalEntradas)}</span>.` });
    const metas = metasChat();
    if (metas.length) {
      const meta = metas[0];
      const pct = meta.objetivo > 0 ? Math.min(100, Math.round(meta.atual / meta.objetivo * 100)) : 0;
      dicas.push({ dica: `A caixinha <strong>${escapeHtml(meta.nome)}</strong> está em ${pct}% da meta, com <span class="chat-valor chat-valor-gold">${chatFmt(meta.atual)}</span> de <span class="chat-valor chat-valor-gold">${chatFmt(meta.objetivo)}</span>.` });
    }
    if (t.saldoAtualConta > 0 && contasDesteMes > 0) {
      const comprometido = Math.min(100, Math.round(contasDesteMes / Math.max(t.saldoAtualConta + t.aReceberEsseMes, 1) * 100));
      dicas.push({ dica: `Os compromissos deste mês representam cerca de ${comprometido}% do dinheiro disponível hoje somado ao que ainda entra neste mês. <strong>Dica:</strong> use essa proporção para avaliar novas compras.` });
    }
    if (dicas.length === 0) {
      dicas.push(
        { dica: "Não apareceu um alerta forte nos dados atuais. <strong>Dica:</strong> escolha uma categoria recorrente e acompanhe sua evolução no próximo mês para encontrar uma oportunidade de melhoria." },
        { dica: "<strong>Dica:</strong> antes de assumir um novo gasto, use a margem projetada do mês depois dos compromissos conhecidos como sua referência, em vez de olhar só o saldo de hoje." },
        { dica: "<strong>Dica:</strong> se você já tem uma meta nas caixinhas, use o planejamento do mês para decidir quanto consegue direcionar a ela sem comprometer os compromissos atuais." }
      );
    }
    return dicas.map(d => ({ ...d, dica: aplicarTomChat(d.dica) }));
  }

  function mostrarDicaNoChat(item) {
    clearTimeout(dicaOutraTimer);
    body.querySelectorAll("#caixaChatOutraDica").forEach((x) => x.remove());
    const texto = formatarTextoIAChat(item?.texto || item?.dica || "");
    appendMensagem(`<span class="chat-dica-titulo">Dica</span><div class="chat-dica-texto">${texto}</div>`);
    const tokenAtual = window._caixaChatSessao || 0;
    dicaOutraTimer = setTimeout(() => {
      if (!chat.classList.contains("is-open")) return;
      if (tokenAtual !== (window._caixaChatSessao || 0)) return;
      if (document.getElementById("caixaChatOutraDica")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "caixaChatOutraDica";
      btn.className = "caixa-chat-outra-dica";
      btn.innerHTML = `${IC.sparkle}<span>Outra dica</span><span aria-hidden="true">↗</span>`;
      btn.addEventListener("click", async () => {
        btn.remove();
        clearTimeout(dicaOutraTimer);
        dicaOutraTimer = null;
        const back = document.getElementById("caixaChatBack");
        if (back) back.remove();
        const meuToken = window._caixaChatSessao || 0;
        appendMensagem("Outra dica", "user");

        // Mesmo com a dica já pré-carregada, mantemos uma pequena pausa
        // intencional para a resposta parecer uma conversa natural, sem
        // comprometer a sensação de rapidez. Se o usuário mudar de assunto
        // durante a pausa, a resposta é descartada.
        const textoPensamentoAnterior = thinking.querySelector("em");
        if (textoPensamentoAnterior) textoPensamentoAnterior.textContent = "Deixe-me pensar em outra dica para você…";
        thinking.classList.remove("is-hidden");
        body.scrollTop = body.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, 900));
        if (meuToken !== (window._caixaChatSessao || 0) || !chat.classList.contains("is-open")) {
          thinking.classList.add("is-hidden");
          return;
        }
        thinking.classList.add("is-hidden");

        const estoque = Array.isArray(window._caixaDicasIAEstoque) ? window._caixaDicasIAEstoque : [];
        const idx = Number(window._caixaDicaIAIndice || 0);
        const proxima = estoque[idx];
        if (proxima) {
          window._caixaDicaIAIndice = idx + 1;
          mostrarDicaNoChat(proxima);
          mostrarMenuCompacto();
          return;
        }
        // O estoque acabou. Não faz outra chamada para a mesma chave: se os
        // números não mudaram, a resposta em cache é a mesma. Aqui usamos a
        // reserva local e só uma nova chave volta a pedir um novo conjunto à IA.
        if (meuToken !== (window._caixaChatSessao || 0) || !chat.classList.contains("is-open")) return;
        const t = totaisChat();
        const fallback = montarDicasFinanceiras(t);
        const fi = Number(window._caixaDicaIndice || 0) % Math.max(fallback.length, 1);
        window._caixaDicaIndice = fi + 1;
        mostrarDicaNoChat({ texto: fallback[fi]?.dica || "Não apareceu nenhuma informação nova relevante nos dados atuais." });
        mostrarMenuCompacto();
      });
      if (tokenAtual !== (window._caixaChatSessao || 0)) return;
      const back = document.getElementById("caixaChatBack");
      if (back) body.insertBefore(btn, back); else body.appendChild(btn);
      body.scrollTop = body.scrollHeight;
    }, 5000);
  }

  function calcularRespostaGastar(origem) {
    const t = totaisChat();
    const valor = origem === "beneficio" ? t.beneficio : t.conta;
    const nome = origem === "beneficio" ? "benefício" : "saldo em conta";
    const classe = origem === "beneficio" ? "chat-valor-gold" : "chat-valor-pos";
    let texto;
    if (origem === "beneficio") {
      if (valor > 0) texto = `Você ainda pode gastar <span class="${classe} chat-valor">${chatFmt(valor)}</span> usando o <strong>${nome}</strong> neste mês.`;
      else texto = `Neste momento, o <strong>${nome}</strong> está sem margem para novos gastos.`;
    } else if (valor > 0) {
      texto = `Depois de pagar tudo que falta, sobram <span class="${classe} chat-valor">${chatFmt(valor)}</span> para você gastar.`;
    } else if (valor === 0) {
      texto = `Você não tem margem para novos gastos agora.`;
    } else {
      texto = `Você não pode gastar mais nada agora — ainda faltam <span class="chat-valor chat-valor-neg">${chatFmt(Math.abs(valor))}</span> para fechar as obrigações.`;
    }
    return aplicarTomChat(texto);
  }

  function mostrarRespostaGastarIA(texto, origem) {
    const bruto = String(texto || "").trim();
    if (!bruto) {
      appendMensagem(calcularRespostaGastar(origem));
      return;
    }
    appendMensagem(formatarTextoIAChat(bruto));
  }

  function respostaCaixinha(cx) {
    const atual = typeof totalCaixinha === "function" ? totalCaixinha(cx) : ((Number(cx.valorGuardado)||0)+(Number(cx.rendimentoTotal)||0)+(Number(cx.valorGuardadoMes)||0));
    const objetivo = Number(cx.valorObjetivo) || 0;
    const falta = Math.max(objetivo - atual, 0);
    const prazo = String(cx.data || "");
    const pct = objetivo > 0 ? Math.min((atual / objetivo) * 100, 100) : 0;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(prazo);
    let meses = null;
    let dias = null;
    if (m) {
      const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const hoje = new Date();
      const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      dias = Math.ceil((alvo - hojeLocal) / 86400000);
      if (dias > 0) meses = Math.max(1, Math.ceil(dias / 30.4375));
    }
    let plano;
    if (!objetivo) plano = `Essa caixinha tem data, mas ainda está sem <strong>objetivo financeiro</strong> definido.`;
    else if (!falta) plano = `<strong>Meta concluída!</strong> Você já chegou ao objetivo de ${chatFmt(objetivo)}.`;
    else if (dias !== null && dias <= 0) plano = `O prazo de <strong>${formatarDataCurta(prazo)}</strong> já passou e ainda faltam <strong class="chat-valor chat-valor-neg">${chatFmt(falta)}</strong> para a meta.`;
    else {
      const mensal = falta / meses;
      plano = `Para chegar em <strong>${chatFmt(objetivo)}</strong> até <strong>${formatarDataCurta(prazo)}</strong>, você precisa guardar cerca de <strong class="chat-valor chat-valor-gold">${chatFmt(mensal)}</strong> por mês.`;
    }
    const icone = normalizarNomeIcone(cx.icone || "");
    const iconeHtml = icone ? `<img src="${esc(urlIconeCaixinha(icone))}" alt="" class="chat-goal-icon-img" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML=ICONE_COFRINHO;">` : ICONE_COFRINHO;
    return `<div class="chat-goal-result"><div class="chat-goal-result-top"><span class="chat-goal-result-icon" style="--pct:${pct}%"><span>${iconeHtml}</span></span><div><strong>${esc(cx.nome || "Caixinha")}</strong><small>Meta em ${formatarDataCurta(prazo)}</small></div><b>${Math.round(pct)}%</b></div><div class="chat-goal-result-track"><i style="width:${pct}%"></i></div><div class="chat-goal-result-numbers"><span>Guardado <strong>${chatFmt(atual)}</strong></span><span>Falta <strong>${chatFmt(falta)}</strong></span></div><div class="chat-goal-result-plan">${plano}</div></div>`;
  }

  function executarAcao(id) {
    window._caixaChatSessao = (Number(window._caixaChatSessao) || 0) + 1;
    clearTimeout(dicaOutraTimer);
    dicaOutraTimer = null;
    window._caixaDicasIAEstoque = [];
    window._caixaDicaIAIndice = 0;
    body.querySelectorAll("#caixaChatOutraDica").forEach(x => x.remove());
    quick.classList.add("is-hidden");
    const quickTitle = quick.previousElementSibling;
    if (quickTitle && quickTitle.classList.contains("caixa-chat-quick-title")) quickTitle.classList.add("is-hidden");
    const welcome = body.querySelector(".caixa-chat-welcome");
    if (welcome) welcome.classList.add("is-hidden");
    const oldBack = document.getElementById("caixaChatBack");
    if (oldBack) oldBack.remove();
    if (id === "gastar") {
      appendMensagem("Claro. <strong>De onde sairia esse próximo gasto?</strong>");
      const escolhas = document.createElement("div");
      escolhas.className = "caixa-chat-choices";
      [
        ["beneficio", "Benefício", "Usar o valor disponível do benefício", totaisChat().beneficio],
        ["saldo", "Saldo em conta", "Usar o dinheiro do saldo normal", totaisChat().saldoAtualConta]
      ].forEach(([valor, titulo, sub, quantia]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "caixa-chat-choice";
        btn.innerHTML = `<span><strong>${titulo}</strong><small>${sub}</small></span><span class="choice-value">${chatFmt(quantia)}</span>`;
        btn.addEventListener("click", () => {
          escolhas.remove();
          appendMensagem(titulo, "user");
          iniciarPensamento(async () => {
            const tAtual = totaisChat();
            const chave = chaveCacheGastarIA(tAtual);
            const cache = lerCacheGastarIA(chave);
            if (cache?.[valor]) {
              mostrarRespostaGastarIA(cache[valor], valor);
              return;
            }
            const respostas = await buscarRespostasGastarIA(tAtual, { chave });
            if (respostas?.[valor]) mostrarRespostaGastarIA(respostas[valor], valor);
            else appendMensagem(calcularRespostaGastar(valor));
          });
        });
        escolhas.appendChild(btn);
      });
      body.appendChild(escolhas);
      body.scrollTop = body.scrollHeight;
      return;
    }

    iniciarPensamento(() => {
      const t = totaisChat();

      if (id === "categorias") {
        const cats = categoriasChat();
        if (!cats.length) return appendMensagem("Ainda não encontrei gastos pagos suficientes para montar esse ranking.");
        const top = cats.slice(0,3).map((x,i) => `${i+1}. <strong>${esc(x[0])}</strong> — <span class="chat-valor chat-valor-neg">${chatFmt(x[1])}</span>`).join("<br>");
        appendMensagem(`<strong>Onde mais saiu dinheiro:</strong><br>${top}<span class="caixa-chat-note">Considerei os gastos que efetivamente contam no mês atual.</span>`);
      }

      if (id === "guardado") {
        const comData = listaFinita(state.caixinhas).filter(cx => String(cx.data || "").trim());
        if (!comData.length) {
          appendMensagem(`Não encontrei nenhuma caixinha com <strong>data de objetivo</strong> cadastrada ainda.<span class="caixa-chat-note">Cadastre uma data na caixinha para eu calcular quanto você precisa guardar por mês.</span>`);
          return;
        }
        appendMensagem(`<strong>Qual caixinha você quer planejar?</strong><span class="caixa-chat-note">Mostrando apenas caixinhas que têm uma data definida.</span>`);
        const escolhas = document.createElement("div");
        escolhas.className = "caixa-chat-choices caixa-chat-caixinhas-choices";
        comData.forEach((cx, idx) => {
          const atual = typeof totalCaixinha === "function" ? totalCaixinha(cx) : ((Number(cx.valorGuardado)||0)+(Number(cx.rendimentoTotal)||0)+(Number(cx.valorGuardadoMes)||0));
          const objetivo = Number(cx.valorObjetivo) || 0;
          const pct = objetivo > 0 ? Math.min((atual / objetivo) * 100, 100) : 0;
          const falta = Math.max(objetivo - atual, 0);
          const icone = normalizarNomeIcone(cx.icone || "");
          const iconeHtml = icone
            ? `<img src="${esc(urlIconeCaixinha(icone))}" alt="" class="chat-goal-icon-img" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML=ICONE_COFRINHO;">`
            : ICONE_COFRINHO;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "caixa-chat-goal-choice";
          btn.innerHTML = `<span class="chat-goal-choice-icon ${objetivo > 0 ? "has-goal" : ""}" style="--pct:${pct}%"><span>${iconeHtml}</span></span><span class="chat-goal-choice-main"><strong>${esc(cx.nome || "Caixinha")}</strong><small>${formatarDataCurta(cx.data)} · ${objetivo > 0 ? `${chatFmt(atual)} de ${chatFmt(objetivo)}` : "sem objetivo definido"}</small>${objetivo > 0 ? `<span class="chat-goal-mini-track"><i style="width:${pct}%"></i></span>` : ""}</span><span class="chat-goal-choice-arrow">›</span>`;
          btn.addEventListener("click", () => {
            iniciarPensamento(() => appendMensagem(respostaCaixinha(cx)));
            escolhas.remove();
          });
          escolhas.appendChild(btn);
        });
        body.appendChild(escolhas);

        body.scrollTop = body.scrollHeight;
      }

      if (id === "mudou") {
        const ant = compararMesAnteriorChat();
        if (!ant) {
          appendMensagem(`<strong>Ainda não tenho dados históricos suficientes para comparar.</strong><span class="caixa-chat-note">Assim que existir um mês anterior fechado com dados comparáveis, eu mostro as mudanças sem inventar informações.</span>`);
        } else {
          const atual={gastos:(Number(t.fixosPagos)||0)+(Number(t.variaveisPagos)||0),ganhos:Number(t.ganhosRecebidos)||0,guardado:somaCampo(state.caixinhas,"valorGuardadoMes")},ca=Object.fromEntries(categoriasChat()),cp=categoriasHistoricoAnteriorChat(),pend=categoriasPendentesChat(),linhas=[];
          if(cp) Array.from(new Set([...Object.keys(ca),...Object.keys(cp),...Object.keys(pend)])).map(cat=>({cat,atualPago:Number(ca[cat])||0,anteriorPago:Number(cp[cat])||0,pendente:Number(pend[cat])||0})).filter(x=>{
            // Pendente não é gasto realizado. Se a categoria tem valor neste
            // mês apenas porque está pendente, ela NÃO pode ser comparada
            // como queda (ex.: mês passado R$400 pagos, este mês R$800 pendentes).
            if (x.atualPago === 0 && x.pendente > 0) {
              return false;
            }
            return Math.abs(x.atualPago - x.anteriorPago) >= .01;
          }).map(x=>({cat:x.cat,delta:x.atualPago-x.anteriorPago})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,5).forEach(x=>linhas.push(`<li><strong>${esc(x.cat)}</strong>: <span class="comparacao-seta ${x.delta>0?"neg":"pos"}">${x.delta>0?"↑":"↓"}</span> <span class="chat-valor ${x.delta>0?"chat-valor-neg":"chat-valor-pos"}">${chatFmt(Math.abs(x.delta))}</span></li>`));
          const dg=atual.gastos-ant.gastos,dr=atual.ganhos-ant.ganhos,ds=atual.guardado-ant.guardado;
          appendMensagem(`<strong>Este mês x ${esc(ant.nome||"mês anterior")}</strong><div class="chat-comparacao-bloco"><div class="chat-comparacao-titulo">Gastos</div>${linhas.length?`<ul>${linhas.join("")}</ul>`:`<p>Não houve mudança de categoria relevante.</p>`}<div class="chat-comparacao-resultado">Resultado: ${dg===0?"seus gastos ficaram iguais":`você gastou <span class="chat-valor ${dg>0?"chat-valor-neg":"chat-valor-pos"}">${chatFmt(Math.abs(dg))}</span> ${dg>0?"a mais":"a menos"}`}.</div><div class="chat-comparacao-titulo">Ganhos</div><div class="chat-comparacao-resultado">${dr===0?"seus ganhos ficaram iguais":`você recebeu <span class="chat-valor chat-valor-pos">${chatFmt(Math.abs(dr))}</span> ${dr>0?"a mais":"a menos"}`}.</div>${ant.guardado||atual.guardado?`<div class="chat-comparacao-resultado">Guardado: ${ds===0?"mesmo valor":`<span class="chat-valor chat-valor-gold">${chatFmt(Math.abs(ds))}</span> ${ds>0?"a mais":"a menos"}`}.</div>`:""}</div>`);
        }
      }

      if (id === "aconteceu") {
        const eventos=[],t=totaisChat(),totalGastos=(Number(t.fixosPagos)||0)+(Number(t.variaveisPagos)||0),totalGanhos=Number(t.ganhosRecebidos)||0,guardadoMes=somaCampo(state.caixinhas,"valorGuardadoMes");
        if(totalGanhos>0)eventos.push(`Você recebeu <span class="chat-valor chat-valor-pos">${chatFmt(totalGanhos)}</span> neste mês.`);
        if(totalGastos>0)eventos.push(`Você gastou <span class="chat-valor chat-valor-neg">${chatFmt(totalGastos)}</span> até agora neste mês.`);
        if(guardadoMes>0)eventos.push(`Você guardou <span class="chat-valor chat-valor-gold">${chatFmt(guardadoMes)}</span> nas caixinhas neste mês.`);
        const compromissosFixos=listaFinita(state.gastosFixos).filter(i=>!ehFuturoDoMesAtual(i)).length;const compromissosVariaveis=listaFinita(state.gastosVariaveis).filter(i=>gastoVariavelEhReal(i)&&!i.lembrete&&!ehFuturoDoMesAtual(i)).length;const totalCompromissos=compromissosFixos+compromissosVariaveis;const quitados=listaFinita(state.gastosFixos).filter(i=>i.pago===true&&!ehFuturoDoMesAtual(i)).length+listaFinita(state.gastosVariaveis).filter(i=>gastoVariavelEhReal(i)&&i.pago===true&&!i.lembrete&&!ehFuturoDoMesAtual(i)).length;if(quitados>0&&totalCompromissos>0)eventos.push(`Você já quitou <strong>${quitados} de ${totalCompromissos}</strong> compromisso${totalCompromissos===1?"":"s"} neste mês.`);
        listaFinita(state.caixinhas).filter(cx=>{const o=Number(cx.valorObjetivo)||0,a=typeof totalCaixinha==="function"?totalCaixinha(cx):Number(cx.valorGuardado)||0;return o>0&&a>=o&&(Number(cx.valorGuardadoMes)||0)>0;}).slice(0,2).forEach(cx=>eventos.push(`A caixinha <strong>${esc(cx.nome||"Caixinha")}</strong> alcançou a meta de <span class="chat-valor chat-valor-gold">${chatFmt(cx.valorObjetivo)}</span>.`));
        const resultado=totalGanhos-totalGastos-guardadoMes;if(Math.abs(resultado)>=.01)eventos.push(`O resultado líquido do mês até agora é <span class="chat-valor ${resultado>=0?"chat-valor-pos":"chat-valor-neg"}">${chatFmt(Math.abs(resultado))}</span> ${resultado>=0?"positivo":"negativo"}.`);
        appendMensagem(eventos.length?`<strong>O que aconteceu este mês: (Até agora)</strong><ul class="caixa-chat-acontecimentos-lista">${eventos.slice(0,7).map(e=>`<li>${e}</li>`).join("")}</ul>`:`<strong>O que aconteceu este mês: (Até agora)</strong><span class="caixa-chat-note">Ainda não encontrei informações relevantes para destacar sem inventar contexto.</span>`);
      }

  if (id === "pendencias") {
        const fixosPendentes = listaFinita(state.gastosFixos).filter(i => i.pago !== true && (Number(i.valor) || 0) > 0);
        const variaveisPendentes = listaFinita(state.gastosVariaveis).filter(i => gastoVariavelEhReal(i) && i.pago !== true && !i.lembrete && (Number(i.valor) || 0) > 0);
        const totalPend = t.aPagarFixos + t.aPagarVariaveis;
        const linhaPendente = (i, tipo) => {
          const parcelaRaw = tipo === "fixo" && /^\d+\s*\/\s*\d+$/.test(String(i.parcela || "").trim())
            ? String(i.parcela).trim().replace(/\s+/g, "") : "";
          const parcela = parcelaRaw ? `<span class="chat-pendente-parcela">(${esc(parcelaRaw)})</span>` : "";
          const proximoMes = ehDoProximoMes(i)
            ? `<span class="chat-pendente-proximo">Mês que vem</span>` : "";
          const data = formatarDataCurta(i.data);
          const nome = i.nome || (tipo === "fixo" ? "Gasto fixo" : "Gasto variável");
          return `<li><span class="chat-pendente-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h12M13 7l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="chat-pendente-main"><strong>${esc(nome)}${parcela}</strong><small>${[proximoMes, data ? `<span>${data}</span>` : ""].filter(Boolean).join(" · ")}</small></span><strong class="chat-valor chat-valor-neg">${chatFmt(i.valor)}</strong></li>`;
        };
        const pendenciasOrdenadas = [
          ...fixosPendentes.map(i => ({ item: i, tipo: "fixo" })),
          ...variaveisPendentes.map(i => ({ item: i, tipo: "variavel" }))
        ].sort((a, b) => compararDataAscendente(a.item.data, b.item.data));
        const linhasPendencias = pendenciasOrdenadas.map(({ item, tipo }) => linhaPendente(item, tipo)).join("");
        const detalhes = pendenciasOrdenadas.length
          ? `<ul class="caixa-chat-pendencias-lista lista-simples">${linhasPendencias}</ul>`
          : "";
        const vazio = !detalhes ? `<div class="caixa-chat-empty">Nenhum gasto pendente encontrado.</div>` : detalhes;
        const totalDesteMes = t.aPagarFixosEsseMes + t.aPagarVariaveisEsseMes;
        const totalFuturo = t.aPagarFixosFuturos + t.aPagarVariaveisFuturos;
        const notaPendencias = totalFuturo > 0
          ? `Deste total, ${chatFmt(totalDesteMes)} vencem neste mês e ${chatFmt(totalFuturo)} são contas futuras já lançadas.`
          : `Todas as contas pendentes de ${chatFmt(totalDesteMes)} vencem neste mês.`;
        appendMensagem(`<strong>Ainda falta pagar ${chatFmt(totalPend)} no total.</strong>${vazio}<span class="caixa-chat-note">${notaPendencias} Também há ${chatFmt(t.aReceber)} para receber.</span>`);
      }


      if (id === "economia") {
        // Primeiro tenta o cache. O mesmo conjunto de números + perfil usa
        // exatamente as mesmas dicas e não espera a IA novamente.
        window._caixaDicasIAEstoque = [];
        window._caixaDicaIAIndice = 0;
        const chave = chaveCacheDicasChat(t, "economia");
        const cache = lerCacheDicasChat(chave);
        if (cache?.length) {
          window._caixaDicasIAEstoque = cache;
          window._caixaDicaIAIndice = 1;
          mostrarDicaNoChat(cache[0]);
          return;
        }
        const sessaoEconomia = window._caixaChatSessao || 0;
        const textoPensamento = thinking.querySelector("em");
        if (textoPensamento) textoPensamento.textContent = "Só um instante… estou organizando os números para você…";
        return buscarDicasIA(t, { chave, modo: "economia" }).then((dicasIA) => {
          // Se o usuário já mudou de assunto/perfil, a resposta atrasada não
          // pode invadir a nova conversa.
          if (sessaoEconomia !== (window._caixaChatSessao || 0) || !chat.classList.contains("is-open")) return;
          if (dicasIA.length) {
            window._caixaDicasIAEstoque = dicasIA;
            window._caixaDicaIAIndice = 1;
            mostrarDicaNoChat(dicasIA[0]);
          } else {
            const dicas = montarDicasFinanceiras(t);
            const indice = Number(window._caixaDicaIndice || 0) % Math.max(dicas.length, 1);
            window._caixaDicaIndice = indice + 1;
            mostrarDicaNoChat({ texto: aplicarTomChat(dicas[indice]?.dica || "Não apareceu nenhuma informação nova relevante nos dados atuais.") });
          }
        });
      }
    });
  }


  // -------------------------------------------------------------------
  // CADASTRO CONVERSACIONAL
  // O botão + usa este fluxo para TODOS os tipos de lançamento. Cada
  // pergunta aparece como uma mensagem do assistente, com cards e/ou
  // campo de resposta. O salvamento usa as mesmas operações dos formulários
  // antigos, portanto a Firebase e as regras existentes continuam iguais.
  // -------------------------------------------------------------------
  let cadastroAtivo = null;

  function escolhaChat(opcoes, callback, opts = {}) {
    const wrap = document.createElement("div");
    wrap.className = `caixa-chat-choices ${opts.className || ""}`;
    opcoes.forEach(op => {
      const [valor, titulo, sub = "", extraClass = ""] = op;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `caixa-chat-choice ${extraClass}`;
      btn.innerHTML = `<span><strong>${esc(titulo)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${opts.showArrow === false ? "" : `<span class="caixa-chat-choice-arrow">›</span>`}`;
      btn.addEventListener("click", () => {
        wrap.remove();
        appendMensagem(esc(titulo), "user");
        callback(valor, titulo);
      });
      wrap.appendChild(btn);
    });
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function selectChat(label, opcoes, callback, opts = {}) {
    appendMensagem(`<strong>${esc(label)}</strong>`);
    const wrap = document.createElement("div");
    wrap.className = `caixa-chat-select-wrap ${opts.className || ""}`;
    const select = document.createElement("select");
    select.className = "caixa-chat-select";
    select.setAttribute("aria-label", label);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = opts.placeholder || "Selecione uma opção…";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    opcoes.forEach(op => {
      const [valor, titulo] = op;
      const option = document.createElement("option");
      option.value = String(valor);
      option.textContent = titulo;
      select.appendChild(option);
    });
    if (opts.defaultValue !== undefined && opts.defaultValue !== null) {
      const valorPadrao = String(opts.defaultValue);
      const existe = Array.from(select.options).some((option) => option.value === valorPadrao);
      if (existe) {
        select.value = valorPadrao;
        placeholder.selected = false;
      }
    }
    const enviar = document.createElement("button");
    enviar.type = "button";
    enviar.className = "caixa-chat-select-btn";
    enviar.textContent = "Continuar";
    const concluir = () => {
      if (select.value === "") { select.focus(); return; }
      const titulo = select.options[select.selectedIndex]?.textContent || select.value;
      wrap.remove();
      appendMensagem(titulo, "user");
      callback(select.value, titulo);
    };
    select.addEventListener("change", () => { if (opts.autoSubmit) concluir(); });
    select.addEventListener("keydown", e => { if (e.key === "Enter") concluir(); });
    enviar.addEventListener("click", concluir);
    wrap.append(select, enviar);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    setTimeout(() => select.focus(), 40);
    return wrap;
  }

  function formatarNomeCadastro(texto) {
    return String(texto || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("pt-BR")
      .replace(/(^|[\s\-\u2013\u2014'])[\p{L}\p{M}]/gu, m => m.toLocaleUpperCase("pt-BR"));
  }

  function campoChat(label, placeholder, callback, opts = {}) {
    if (!opts.skipQuestion) appendMensagem(`<strong>${esc(label)}</strong>`);
    const wrap = document.createElement("div");
    wrap.className = `caixa-chat-simulador-form caixa-chat-cadastro-form ${opts.className || ""}`;
    const inputType = opts.type || "text";
    const valorInicial = opts.value != null ? `value="${esc(opts.value)}"` : "";
    wrap.innerHTML = `
      <label class="caixa-chat-simulador-input">
        <span>${esc(label)}</span>
        <input type="${inputType}" ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""} autocomplete="${opts.autocomplete || "off"}" placeholder="${esc(placeholder || "")}" aria-label="${esc(label)}" ${valorInicial}>
      </label>
      <button type="button" class="caixa-chat-simulador-btn">Enviar</button>`;
    body.appendChild(wrap);
    const input = wrap.querySelector("input");
    const enviar = () => {
      let valor = String(input.value || "").trim();
      if (opts.formatarNome && valor) {
        valor = formatarNomeCadastro(valor);
        input.value = valor;
      }
      if (!valor && !opts.allowEmpty) { input.focus(); return; }
      wrap.remove();
      if (!opts.skipResponse) appendMensagem(valor || "Pular", "user");
      callback(valor);
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") enviar(); });
    wrap.querySelector("button").addEventListener("click", enviar);
    setTimeout(() => input.focus(), 40);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function campoValorCadastro(label, callback, opts = {}) {
    if (!opts.skipQuestion) appendMensagem(`<strong>${esc(label)}</strong>`);
    const wrap = document.createElement("div");
    wrap.className = "caixa-chat-simulador-form caixa-chat-cadastro-form caixa-chat-valor-form";
    wrap.innerHTML = `
      <label class="caixa-chat-simulador-input">
        <span>${esc(label)}</span>
        <input type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(opts.placeholder || "Ex.: 300,00")}" aria-label="${esc(label)}">
      </label>
      <button type="button" class="caixa-chat-simulador-btn">Enviar</button>`;
    body.appendChild(wrap);

    const input = wrap.querySelector("input");
    const enviar = wrap.querySelector("button");
    const permitirVazio = !!opts.allowEmpty;

    const formatar = () => {
      let digitos = String(input.value || "").replace(/\D/g, "");
      if (!digitos) {
        input.value = "";
        return;
      }
      digitos = digitos.replace(/^0+(?=\d)/, "");
      while (digitos.length < 3) digitos = "0" + digitos;
      const centavos = digitos.slice(-2);
      const inteiros = digitos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      input.value = `R$ ${inteiros},${centavos}`;
    };

    const atualizarBotao = () => {
      const texto = String(input.value || "").trim();
      const numero = parseValor(texto.replace(/^R\$\s*/i, ""));
      enviar.disabled = !((numero > 0) || (permitirVazio && texto === ""));
      enviar.classList.toggle("is-disabled", enviar.disabled);
    };

    input.addEventListener("input", () => {
      formatar();
      atualizarBotao();
    });

    const concluir = () => {
      const texto = String(input.value || "").trim();
      const numero = texto ? parseValor(texto.replace(/^R\$\s*/i, "")) : 0;
      if (!texto && permitirVazio) {
        wrap.remove();
        appendMensagem("Pular", "user");
        callback(0);
        return;
      }
      if (!(numero > 0)) {
        input.focus();
        input.classList.add("input-erro");
        setTimeout(() => input.classList.remove("input-erro"), 500);
        return;
      }
      wrap.remove();
      appendMensagem(input.value, "user");
      callback(numero);
    };

    input.addEventListener("keydown", e => { if (e.key === "Enter") concluir(); });
    enviar.addEventListener("click", concluir);
    atualizarBotao();
    setTimeout(() => input.focus(), 40);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function categoriasEscolhiveis(callback) {
    const cats = typeof categoriasAtuais === "function" ? categoriasAtuais() : [];
    const op = cats.map(c => [c, c]);
    op.push(["__sem_categoria", "Sem categoria"]);
    selectChat("E em qual categoria ele entra?", op, (valor, titulo) => {
      callback(valor === "__sem_categoria" ? "" : valor, titulo);
    }, { placeholder: "Selecione uma categoria…", defaultValue: "__sem_categoria" });
  }

  function escolhaIconeChat(callback) {
    const menu = document.createElement("div");
    menu.className = "caixa-chat-icon-picker";
    menu.innerHTML = `
      <div class="caixa-chat-icon-search-wrap">
        <span class="caixa-chat-icon-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"></circle><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>
        </span>
        <input type="search" class="caixa-chat-icon-search" placeholder="Pesquisar ícone…" autocomplete="off" spellcheck="false" aria-label="Pesquisar ícone">
        <button type="button" class="caixa-chat-icon-search-clear is-hidden" aria-label="Limpar pesquisa">×</button>
      </div>
      <div class="caixa-chat-icon-grid" role="listbox" aria-label="Escolha um ícone"></div>
      <div class="caixa-chat-icon-empty is-hidden">Nenhum ícone encontrado.</div>
    `;
    body.appendChild(menu);

    const search = menu.querySelector(".caixa-chat-icon-search");
    const clear = menu.querySelector(".caixa-chat-icon-search-clear");
    const grid = menu.querySelector(".caixa-chat-icon-grid");
    const empty = menu.querySelector(".caixa-chat-icon-empty");
    const opcoes = [{ nome: "", label: "Sem ícone" }, ...(Array.isArray(iconesCaixinhas) ? ordenarIconesPorUso(iconesCaixinhas) : []).map(nome => ({ nome, label: nomeIconeBonito(nome) }))];

    const desenhar = (termo = "") => {
      const busca = normalizarTextoBuscaIcone(termo);
      grid.innerHTML = "";
      const filtradas = opcoes.filter(x => !busca || normalizarTextoBuscaIcone(`${x.nome} ${x.label}`).includes(busca));
      empty.classList.toggle("is-hidden", filtradas.length > 0);
      clear.classList.toggle("is-hidden", !busca);

      filtradas.forEach(({ nome, label }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "caixa-chat-icon-choice";
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-label", label);
        btn.title = label;
        if (!nome) {
          btn.innerHTML = '<span class="caixa-chat-icon-none">×</span>';
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
          menu.remove();
          if (nome) registrarUsoIconeCaixinha(nome);
          if (nome) {
            appendMensagem(`<span class="caixa-chat-icon-selected" title="${esc(label)}"><img src="${esc(urlIconeCaixinha(nome))}" alt="${esc(label)}"></span>`, "user");
          } else {
            appendMensagem("Sem ícone", "user");
          }
          callback(nome, label);
        });
        grid.appendChild(btn);
      });
    };

    search.addEventListener("input", () => desenhar(search.value));
    clear.addEventListener("click", () => { search.value = ""; desenhar(""); search.focus(); });
    search.addEventListener("keydown", e => { if (e.key === "Escape") { menu.remove(); body.scrollTop = body.scrollHeight; } });
    desenhar("");
    setTimeout(() => search.focus(), 40);
    body.scrollTop = body.scrollHeight;
    return menu;
  }

  function formatarDataParaChat(valor) {
    const s = String(valor || "").trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function perguntaDataCadastro(callback, label = "Qual é a data?") {
    appendMensagem(`<strong>${esc(label)}</strong>`);
    const hoje = dataHojeISO();
    campoChat(label, "", valor => {
      const data = valor || hoje;
      appendMensagem(esc(formatarDataParaChat(data)), "user");
      callback(data);
    }, { type: "date", autocomplete: "off", value: hoje, skipResponse: true, skipQuestion: true });
  }

  function perguntaStatusCadastro(label, positivo, negativo, callback) {
    appendMensagem(`<strong>${esc(label)}</strong>`);
    escolhaChat([[true, positivo, ""], [false, negativo, ""]], callback);
  }

  function mostrarFeedbackCadastro(titulo, mensagem) {
    // Feedback visual fora do balão: a confirmação aparece imediatamente e
    // transforma o cadastro em uma pequena recompensa visual, sem depender
    // apenas da última mensagem do chat.
    const anterior = document.getElementById("caixaCadastroFeedback");
    if (anterior) anterior.remove();

    const isGanho = /ganho/i.test(titulo);
    const isCaixinha = /caixinha/i.test(titulo);
    const tipo = isGanho ? "ganho" : isCaixinha ? "caixinha" : "gasto";
    const icone = isGanho ? "↑" : isCaixinha ? "◇" : "✓";
    const etiqueta = isGanho ? "GANHO" : isCaixinha ? "CAIXINHA" : "GASTO";

    const overlay = document.createElement("div");
    overlay.id = "caixaCadastroFeedback";
    overlay.className = `caixa-cadastro-feedback caixa-cadastro-feedback-${tipo}`;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div class="caixa-cadastro-feedback-confetti" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
      <div class="caixa-cadastro-feedback-card">
        <div class="caixa-cadastro-feedback-orb" aria-hidden="true"><span>${icone}</span></div>
        <div class="caixa-cadastro-feedback-kicker"><span class="caixa-cadastro-feedback-dot"></span>${etiqueta}</div>
        <strong class="caixa-cadastro-feedback-title">${esc(titulo.replace(/^(Gasto|Ganho|Caixinha) (adicionado|criada)$/i, "$1"))}</strong>
        <div class="caixa-cadastro-feedback-detail">${mensagem}</div>
        <div class="caixa-cadastro-feedback-stamp"><span>✓</span> Registrado com sucesso</div>
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-visible"));

    const remover = () => {
      overlay.classList.remove("is-visible");
      overlay.classList.add("is-closing");
      setTimeout(() => overlay.remove(), 260);
    };
    setTimeout(remover, 2100);
    overlay.addEventListener("click", remover, { once: true });
  }

  function finalizarCadastro(titulo, mensagem) {
    appendMensagem(`<strong>${esc(titulo)}</strong><br>${mensagem}`);
    mostrarFeedbackCadastro(titulo, mensagem);
    cadastroAtivo = null;
    appendMensagem("Quer adicionar outro lançamento?");
    escolhaChat([
      ["sim", "Sim, adicionar outro", "Voltar para o início do cadastro"]
    ], escolha => {
      if (escolha === "sim") iniciarCadastroConversacional();
    });
  }

  function iniciarCadastroConversacional() {
    if (isAmbos()) {
      appendMensagem("No modo <strong>Juntos</strong>, o cadastro individual fica indisponível. Escolha Davi ou Gabriel para adicionar um lançamento.");
      return;
    }
    window._caixaChatSessao = (Number(window._caixaChatSessao) || 0) + 1;
    clearTimeout(dicaOutraTimer);
    dicaOutraTimer = null;
    body.querySelectorAll("#caixaChatOutraDica").forEach(x => x.remove());
    quick.classList.add("is-hidden");
    const quickTitle = quick.previousElementSibling;
    if (quickTitle && quickTitle.classList.contains("caixa-chat-quick-title")) quickTitle.classList.add("is-hidden");
    const welcome = body.querySelector(".caixa-chat-welcome");
    if (welcome) welcome.classList.add("is-hidden");
    body.querySelectorAll("#caixaChatBack").forEach(x => x.remove());
    cadastroAtivo = { etapa: "tipo" };

    appendMensagem("Claro! Vamos registrar isso juntos. <strong>O que você quer adicionar?</strong>");
    escolhaChat([
      ["gasto", "Gasto", "Algo que você comprou, pagou ou parcelou"],
      ["ganho", "Ganho", "Dinheiro que entrou ou vai entrar"],
      ["caixinha", "Caixinha", "Reserva, meta ou dinheiro guardado"]
    ], tipo => {
      cadastroAtivo.tipo = tipo;
      if (tipo === "gasto") fluxoGasto();
      if (tipo === "ganho") fluxoGanho();
      if (tipo === "caixinha") fluxoCaixinha();
    });

    function fluxoGasto() {
      appendMensagem("Vamos ao <strong>gasto</strong>.");
      campoChat("O que foi?", "Ex.: Mercado, Amazon, aluguel…", nome => {
        cadastroAtivo.nome = nome;
        campoValorCadastro("Qual foi o valor?", valor => {
          cadastroAtivo.valor = valor;
          appendMensagem("Esse gasto acontece <strong>só este mês</strong> ou vai <strong>se repetir nos próximos meses</strong>?");
          escolhaChat([
            ["fixo", "Vai se repetir", "Entra como gasto fixo"],
            ["variavel", "Só este mês", "Entra como gasto variável"]
          ], tipoGasto => {
            cadastroAtivo.tipoGasto = tipoGasto;
            if (tipoGasto === "fixo") fluxoGastoFixo();
            else fluxoGastoVariavel();
          });
        });
      }, { formatarNome: true });
    }

    function perguntarFaturaAntesDaData(callback) {
      appendMensagem("Esse gasto vai entrar em uma <strong>fatura</strong>?");
      escolhaChat([
        ["sim", "Sim"],
        ["nao", "Não"]
      ], escolha => {
        if (escolha === "sim") {
          cadastroAtivo.fatura = true;
          const faturas = faturasConfiguradas(state.pessoaAtual);
          const concluirFatura = (faturaId) => {
            const fatura = faturaPorId(faturaId, state.pessoaAtual);
            const vencimento = dataVencimentoFaturaAtual(fatura?.id || "");
            cadastroAtivo.faturaId = fatura?.id || "";
            cadastroAtivo.faturaNome = fatura?.nome || "Fatura";
            cadastroAtivo.data = vencimento;
            appendMensagem(`Vencimento em: ${esc(formatarDataParaChat(vencimento))}`);
            callback(vencimento, true);
          };
          if (faturas.length > 1) {
            selectChat(
              "Em qual fatura?",
              faturas.map(f => [String(f.id), String(f.nome || "Fatura")]),
              concluirFatura,
              { placeholder: "Escolha a fatura…" }
            );
          } else {
            concluirFatura(faturas[0]?.id || "");
          }
        } else {
          cadastroAtivo.fatura = false;
          cadastroAtivo.faturaId = "";
          cadastroAtivo.faturaNome = "";
          perguntaDataCadastro(data => callback(data, false));
        }
      });
    }

    function fluxoGastoFixo() {
      categoriasEscolhiveis(cat => {
        cadastroAtivo.categoria = cat;
        appendMensagem("Esse gasto será <strong>à vista</strong> ou <strong>parcelado</strong>?");
        escolhaChat([
          ["avista", "À vista"],
          ["parcelado", "Parcelado", "Dividido em parcelas"]
        ], modalidade => {
          cadastroAtivo.modalidade = modalidade;
          if (modalidade === "parcelado") {
            selectChat("Em quantas parcelas?", Array.from({length:23}, (_,i)=>[String(i+2), `${i+2}x`]), qtd => {
              cadastroAtivo.parcelas = Number(qtd);
              perguntarFaturaAntesDaData(data => { cadastroAtivo.data = data; statusFixo(); });
            }, { placeholder: "Escolha o número de parcelas…" });
          } else {
            // Gasto fixo à vista continua recorrente; sem número de parcelas,
            // o backend cria o mesmo gasto no mês seguinte.
            cadastroAtivo.parcelas = 0;
            perguntarFaturaAntesDaData(data => { cadastroAtivo.data = data; statusFixo(); });
          }
        });
      });
    }

    function statusFixo() {
      perguntaStatusCadastro("Essa conta já foi paga?", "Sim, já paguei", "Não, está pendente", pago => {
        const n = cadastroAtivo.parcelas || 0;
        const valor = n > 0 ? Math.round((cadastroAtivo.valor / n) * 100) / 100 : cadastroAtivo.valor;
        const parcela = n > 0 ? `1/${n}` : "";
        const nomeSalvo = cadastroAtivo.fatura ? nomeInternoFatura(cadastroAtivo.nome) : cadastroAtivo.nome;
        opFixos.add(nomeSalvo, valor, { pago, tipo: cadastroAtivo.categoria, data: dataDoLancamento(cadastroAtivo.data), parcela, fatura: cadastroAtivo.fatura === true, faturaId: cadastroAtivo.faturaId || "" });
        finalizarCadastro("Gasto adicionado", `${esc(cadastroAtivo.nome)} · <span class="chat-valor chat-valor-neg">${chatFmt(valor)}</span>${n > 1 ? ` · parcela 1/${n}` : ""}.`);
      });
    }

    function fluxoGastoVariavel() {
      categoriasEscolhiveis(cat => {
        cadastroAtivo.categoria = cat;
        appendMensagem("De onde saiu esse dinheiro?");
        escolhaChat([
          ["saldo", "Saldo em conta", "Sai do saldo normal"],
          ["beneficio", "Benefício", "Sai do saldo do benefício"]
        ], origem => {
          cadastroAtivo.origem = origem;
          perguntarFaturaAntesDaData(data => {
            cadastroAtivo.data = data;
            perguntaStatusCadastro("Essa compra já foi paga?", "Sim, já paguei", "Não, está pendente", pago => {
              const nomeSalvo = cadastroAtivo.fatura ? nomeInternoFatura(cadastroAtivo.nome) : cadastroAtivo.nome;
              opVariaveis.add(nomeSalvo, cadastroAtivo.valor, { pago, tipo: cadastroAtivo.categoria, data: dataDoLancamento(cadastroAtivo.data), origem: cadastroAtivo.origem, fatura: cadastroAtivo.fatura === true, faturaId: cadastroAtivo.faturaId || "" });
              finalizarCadastro("Gasto adicionado", `${esc(cadastroAtivo.nome)} · <span class="chat-valor chat-valor-neg">${chatFmt(cadastroAtivo.valor)}</span>.`);
            });
          });
        });
      });
    }

    function fluxoGanho() {
      appendMensagem("Vamos registrar o <strong>ganho</strong>.");
      campoChat("Nome do ganho", "Ex.: Salário, vale, benefício…", nome => {
        cadastroAtivo.nome = nome;
        campoValorCadastro("Qual é o valor?", valor => {
          cadastroAtivo.valor = valor;
          appendMensagem("Esse ganho pertence ao <strong>saldo em conta</strong> ou ao <strong>benefício</strong>?");
          escolhaChat([
            ["saldo", "Saldo em conta", "Entra no saldo normal"],
            ["beneficio", "Benefício", "Entra no saldo do benefício"]
          ], origem => {
            cadastroAtivo.origem = origem;
            perguntaDataCadastro(data => {
              cadastroAtivo.data = data;
              perguntaStatusCadastro("Esse dinheiro já foi recebido?", "Sim, já recebi", "Ainda vou receber", recebido => {
                opGanhos.add(cadastroAtivo.nome, cadastroAtivo.valor, { recebido, data: dataDoLancamento(cadastroAtivo.data), origem: cadastroAtivo.origem });
                finalizarCadastro("Ganho adicionado", `${esc(cadastroAtivo.nome)} · <span class="chat-valor chat-valor-pos">${chatFmt(cadastroAtivo.valor)}</span>.`);
              });
            });
          });
        });
      }, { formatarNome: true });
    }

    function fluxoCaixinha() {
      appendMensagem("Vamos criar a <strong>caixinha</strong>.");
      campoChat("Nome da caixinha", "Ex.: Reserva de emergência, viagem…", nome => {
        cadastroAtivo.nome = nome;
        campoValorCadastro("Quanto já quer guardar nela?", valor => {
          cadastroAtivo.valorInicial = valor;
          appendMensagem("Vamos definir a meta da caixinha.");
          campoValorCadastro("Objetivo", valorObjetivo => {
            cadastroAtivo.valorObjetivo = valorObjetivo || 0;
            appendMensagem("Vamos definir o prazo da meta.");
            campoChat("Prazo", "Escolha uma data ou deixe em branco", data => {
              cadastroAtivo.data = dataDoLancamento(data);
              appendMensagem("Agora escolha um ícone, se quiser.");
              escolhaIconeChat(icone => {
                cadastroAtivo.icone = icone;
                addCaixinha(cadastroAtivo.nome, cadastroAtivo.valorInicial, cadastroAtivo.valorObjetivo, cadastroAtivo.icone, cadastroAtivo.data);
                finalizarCadastro("Caixinha criada", cadastroAtivo.valorInicial > 0
                  ? `${esc(cadastroAtivo.nome)} · guardado inicial de <span class="chat-valor chat-valor-gold">${chatFmt(cadastroAtivo.valorInicial)}</span>.`
                  : `${esc(cadastroAtivo.nome)} · sem valor inicial guardado.`);
              });
            }, { type: "date", allowEmpty: true });
          }, { allowEmpty: true, placeholder: "Ex.: 5.000,00 — ou deixe em branco" });
        }, { allowZero: true, allowEmpty: true, placeholder: "Ex.: 500,00 — ou deixe em branco" });
      }, { formatarNome: true });
    }
  }

  function iniciarPensamento(cb, mensagem = "Só um instante… estou organizando os números para você…") {
    clearTimeout(pensamentoTimer);
    const textoPensamento = thinking.querySelector("em");
    if (textoPensamento) textoPensamento.textContent = mensagem;
    thinking.classList.remove("is-hidden");
    body.scrollTop = body.scrollHeight;
    pensamentoTimer = setTimeout(async () => {
      try {
        const resultado = cb();
        if (resultado && typeof resultado.then === "function") await resultado;
      } finally {
        thinking.classList.add("is-hidden");
        mostrarMenuCompacto();
      }
    }, 620);
  }

  // STATUS FINANCEIRO — cálculo local + descrição IA persistente por estado dos dados.
  function statusFinanceiroAtual(t) {
    const saldo = Number(t.saldoAtualConta) || 0;
    const limite = Number(t.conta) || 0;
    const contasMes = (Number(t.aPagarFixosEsseMes)||0) + (Number(t.aPagarVariaveisEsseMes)||0);
    const atrasados = listaFinita(state.gastosFixos).filter(i=>i.pago!==true && ehDoMesAnterior(i)).length + listaFinita(state.gastosVariaveis).filter(i=>gastoVariavelEhReal(i)&&i.pago!==true&&!i.lembrete&&ehDoMesAnterior(i)).length;
    if (limite < 0 || saldo < 0) return {codigo:"apertado",titulo:"Apertado",classe:"status-financeiro-apertado"};
    const base = Math.max(Math.abs(Number(t.ganhosOrigem?.ganhos)||0)+(Number(t.aReceber)||0),1);
    if (atrasados > 0 || limite < Math.max(100, contasMes*.35) || contasMes/base >= .55) return {codigo:"atencao",titulo:"Atenção",classe:"status-financeiro-atencao"};
    return {codigo:"tranquilo",titulo:"Tranquilo",classe:"status-financeiro-tranquilo"};
  }
  function chaveCacheStatusFinanceiro(t,status){ const {tom,imersao}=tomChat(); return `caixa:status-financeiro:v2:${hashDicasChat(JSON.stringify({pessoa:state.pessoaAtual||"davi",mes:state.mesAtual,ano:state.anoAtual,status:status.codigo,resumo:resumoParaIAChat(t),tom,imersao}))}`; }
  function lerCacheStatusFinanceiro(chave){try{const raw=JSON.parse(localStorage.getItem(chave)||"null");return raw?.texto?String(raw.texto).trim():"";}catch(e){return "";}}
  function salvarCacheStatusFinanceiro(chave,texto){try{localStorage.setItem(chave,JSON.stringify({salvoEm:Date.now(),texto:String(texto||"").trim()}));}catch(e){}}
  function descricaoStatusFallback(t,status){ const limite=Number(t.conta)||0; if(status.codigo==="apertado") return limite<0?"Os compromissos que ainda precisam ser reservados ultrapassam o dinheiro projetado para o mês.":"Há compromissos que pedem atenção antes de considerar o dinheiro restante como folga."; return "Seu dinheiro projetado cobre os compromissos atuais e ainda deixa uma folga para o restante do mês."; }
  async function atualizarDescricaoStatusIA(t,status,chave){
    if (lerCacheStatusFinanceiro(chave)) return;
    const token=(window._statusFinanceiroToken||0)+1; window._statusFinanceiroToken=token;
    try{const respostas=await buscarDicasIA(t,{chave,modo:"statusFinanceiro"}); if(token!==window._statusFinanceiroToken)return; const texto=respostas?.[0]?.texto?String(respostas[0].texto).trim():""; if(!texto)return; salvarCacheStatusFinanceiro(chave,texto); const el=document.getElementById("statusFinanceiroDescricao"); if(el)el.innerHTML=formatarTextoIAChat(texto);}catch(e){}
  }
  function renderResumoStatusFinanceiro(){
    const badge=document.getElementById("statusFinanceiroBadge"),titulo=document.getElementById("statusFinanceiroTitulo"),descricao=document.getElementById("statusFinanceiroDescricao");
    if(!badge||!titulo||!descricao||!state.loaded)return; const t=totaisChat(),status=statusFinanceiroAtual(t); badge.classList.remove("status-financeiro-tranquilo","status-financeiro-atencao","status-financeiro-apertado","status-financeiro-neutro"); badge.classList.add(status.classe); titulo.textContent=status.titulo; const chave=chaveCacheStatusFinanceiro(t,status),cache=lerCacheStatusFinanceiro(chave); descricao.innerHTML=formatarTextoIAChat(cache||descricaoStatusFallback(t,status)); atualizarDescricaoStatusIA(t,status,chave);
  }
  function categoriasPendentesChat() {
    const mapa = {};
    const adicionar = (item, tipo) => {
      if (!item || item.pago === true || ehFuturoDoMesAtual(item)) return;
      if (tipo === "variavel" && (!gastoVariavelEhReal(item) || item.lembrete || !variavelContaNoSaldo(item))) return;
      if (tipo === "fixo" && (Number(item.valor) || 0) <= 0) return;
      const cat = String(item.tipo || "Outros").trim() || "Outros";
      mapa[cat] = (mapa[cat] || 0) + (Number(item.valor) || 0);
    };
    listaFinita(state.gastosFixos).forEach(i => adicionar(i, "fixo"));
    listaFinita(state.gastosVariaveis).forEach(i => adicionar(i, "variavel"));
    return mapa;
  }

  function categoriasHistoricoAnteriorChat(){
    const ant=compararMesAnteriorChat(); if(!ant)return null; const anos=listaFinita(state.historico?.anos); let pm=state.mesAtual-1,pa=state.anoAtual; if(pm===0){pm=12;pa--;} const bloco=anos.find(a=>Number(a.ano)===pa),mes=bloco?.meses?.find(m=>Number(m.mes)===pm); if(!mes)return null;
    const fontes=state.pessoaAtual==="ambos"?[mes.categoriasDavi||{},mes.categoriasGabriel||{}]:[state.pessoaAtual==="gabriel"?(mes.categoriasGabriel||{}):(mes.categoriasDavi||{})]; const mapa={}; fontes.forEach(obj=>Object.entries(obj).forEach(([cat,valor])=>{if(String(cat).trim().toLowerCase()!=="metas")mapa[cat]=(mapa[cat]||0)+Math.abs(Number(valor)||0);})); return mapa;
  }
  function renderResumoAcontecimentos(){}
  window.renderResumoStatusFinanceiro=renderResumoStatusFinanceiro;
  window.renderResumoAcontecimentos=renderResumoAcontecimentos;

  let fechamentoChatTimer = null;
  function abrirChat() {
    if (fechamentoChatTimer) { clearTimeout(fechamentoChatTimer); fechamentoChatTimer = null; }
    // O + usa o mesmo painel do chat. Limpamos a altura temporária do fechamento
    // antes de abrir para que o painel possa medir o conteúdo normalmente.
    chat.style.height = "";
    chat.classList.remove("is-closing");
    chat.classList.add("is-open");
    chat.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-expanded", "true");
    atualizarVisibilidadeFab();
    const first = quick.querySelector("button");
    if (first) setTimeout(() => first.focus(), 80);
  }
  function fecharChat() {
    if (!chat.classList.contains("is-open")) return;
    // Congela a altura por alguns frames. Sem isso, resetar o conteúdo enquanto
    // a transição de saída roda faz o painel encolher de forma visível e parece
    // que ele cresce/"estoura" antes de fechar — especialmente no fluxo do +.
    const alturaAtual = chat.offsetHeight;
    if (alturaAtual > 0) chat.style.height = alturaAtual + "px";
    chat.classList.add("is-closing");
    chat.classList.remove("is-open");
    chat.setAttribute("aria-hidden", "true");
    fab.setAttribute("aria-expanded", "false");
    atualizarVisibilidadeFab();
    cadastroAtivo = null;
    if (fechamentoChatTimer) clearTimeout(fechamentoChatTimer);
    fechamentoChatTimer = setTimeout(() => {
      fechamentoChatTimer = null;
      resetarChatParaSelecao();
      chat.classList.remove("is-closing");
      chat.style.height = "";
    }, 280);
  }

  fab.addEventListener("click", () => chat.classList.contains("is-open") ? fecharChat() : abrirChat());
  close.addEventListener("click", fecharChat);

  document.addEventListener("caixa:abrirCadastroChat", () => {
    abrirChat();
    resetarChatParaSelecao();
    iniciarCadastroConversacional();
  });

  quick.addEventListener("click", e => {
    const btn = e.target.closest("[data-chat-acao]");
    if (!btn) return;
    executarAcao(btn.dataset.chatAcao);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && chat.classList.contains("is-open")) fecharChat();
  });

  // Recalcula tudo de novo quando a pessoa trocar Davi/Gabriel/Juntos ou os
  // dados forem sincronizados. A interface fica sempre ligada ao state atual.
  function resetarChatParaSelecao() {
    window._caixaChatSessao = (Number(window._caixaChatSessao) || 0) + 1;
    clearTimeout(pensamentoTimer);
    clearTimeout(dicaOutraTimer);
    pensamentoTimer = null;
    dicaOutraTimer = null;
    window._caixaDicasIAEstoque = [];
    window._caixaDicaIAIndice = 0;
    thinking.classList.add("is-hidden");
    body.querySelectorAll(".caixa-chat-message, .caixa-chat-choices, .caixa-chat-select-wrap, .caixa-chat-simulador-form, #caixaChatBack").forEach(x => x.remove());
    quick.classList.remove("is-hidden");
    const quickTitle = quick.previousElementSibling;
    if (quickTitle && quickTitle.classList.contains("caixa-chat-quick-title")) quickTitle.classList.remove("is-hidden");
    const welcome = body.querySelector(".caixa-chat-welcome");
    if (welcome) welcome.classList.remove("is-hidden");
    body.scrollTop = 0;
    atualizarVisibilidadeFab();
  }

  document.addEventListener("click", e => {
    if (e.target.closest(".person-btn")) {
      resetarChatParaSelecao();
      fecharChat();
    }
  });
  document.addEventListener("caixa:perfil-trocado", () => {
    resetarChatParaSelecao();
    fecharChat();
    carregarConfigIA();
  });
  document.addEventListener("caixa:ia-config-atualizada", () => { window._caixaDicaIndice = 0; });

  async function preaquecerDicasIA() {
    if (!state.mesAtual || !state.anoAtual) return;
    try {
      const t = totaisChat();
      const chaveDicas = chaveCacheDicasChat(t);
      const chaveGastar = chaveCacheGastarIA(t);
      const status = statusFinanceiroAtual(t);
      const chaveStatus = chaveCacheStatusFinanceiro(t, status);
      await Promise.all([
        lerCacheDicasChat(chaveDicas) ? Promise.resolve() : buscarDicasIA(t, { chave: chaveDicas }),
        lerCacheGastarIA(chaveGastar) ? Promise.resolve() : buscarRespostasGastarIA(t, { chave: chaveGastar }),
        lerCacheStatusFinanceiro(chaveStatus) ? Promise.resolve() : buscarDicasIA(t, { chave: chaveStatus, modo: "statusFinanceiro" })
      ]);
      if (typeof window.renderResumoStatusFinanceiro === "function") window.renderResumoStatusFinanceiro();
    } catch (e) {}
  }

  mostrarAcoesRapidas();
  setTimeout(() => preaquecerDicasIA(), 900);

  // Expor os prompts para diagnóstico/uso futuro sem chamar a IA.
  window.CAIXA_CHAT_PROMPTS = CHAT_PROMPTS;
})();


/* ============================================================
   TEMA — preferência local do dispositivo
   Não é salva no Firebase.
   ============================================================ */
(function inicializarTemaLocal() {
  const KEY = "caixa-tema-v1";
  const preferencias = new Set(["light", "dark", "device"]);
  const root = document.documentElement;
  const metaTheme = document.querySelectorAll('meta[name="theme-color"]');

  function lerPreferencia() {
    try {
      const valor = localStorage.getItem(KEY);
      return preferencias.has(valor) ? valor : "device";
    } catch (_) { return "device"; }
  }
  function ehEscuroDoDispositivo() {
    return !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function aplicar(preferencia) {
    const escuro = preferencia === "dark" || (preferencia === "device" && ehEscuroDoDispositivo());
    root.setAttribute("data-theme", escuro ? "dark" : "light");
    root.dataset.themePreference = preferencia;
    metaTheme.forEach(meta => {
      meta.media = "";
      meta.setAttribute("content", escuro ? "#0d1e19" : "#16332c");
    });
    document.querySelectorAll("[data-theme-choice]").forEach(btn => {
      const ativo = btn.dataset.themeChoice === preferencia;
      btn.classList.toggle("is-active", ativo);
      btn.setAttribute("aria-pressed", ativo ? "true" : "false");
    });
  }
  function salvar(preferencia) {
    if (!preferencias.has(preferencia)) preferencia = "device";
    try { localStorage.setItem(KEY, preferencia); } catch (_) {}
    aplicar(preferencia);
  }

  aplicar(lerPreferencia());
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-theme-choice]");
    if (btn) salvar(btn.dataset.themeChoice);
  });
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  media?.addEventListener?.("change", () => {
    if (lerPreferencia() === "device") aplicar("device");
  });
  window.CAIXA_TEMA = { aplicar, salvar, lerPreferencia };
})();

/* ============================================================
   CONFIGURAÇÕES DO USUÁRIO
   Painel único para categorias, IA e faturas.
   ============================================================ */
(function inicializarConfiguracoesUsuario() {
  const overlay = document.getElementById("caixaConfiguracoesOverlay");
  const drawer = document.getElementById("caixaConfiguracoes");
  const home = document.getElementById("caixaConfigHome");
  const title = document.getElementById("caixaConfigTitle");
  const back = document.getElementById("caixaConfigBack");
  const close = document.getElementById("caixaConfigClose");
  if (!overlay || !drawer || !home) return;

  const views = {
    categorias: document.getElementById("caixaConfigCategorias"),
    ia: document.getElementById("caixaConfigIA"),
    faturas: document.getElementById("caixaConfigFaturas"),
    tema: document.getElementById("caixaConfigTema"),
    admin: document.getElementById("caixaConfigAdmin"),
  };
  const titles = {
    home: "Configurações",
    categorias: "Categorias",
    ia: "Assistente IA",
    faturas: "Faturas",
    tema: "Aparência",
    admin: "Admin",
  };

  let viewAtual = "home";
  let iaPessoa = state.pessoaAtual === "ambos" ? "ambos" : (state.pessoaAtual === "gabriel" ? "gabriel" : "davi");
  let faturaPessoa = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";

  const clone = value => {
    try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value ?? null)); }
  };
  const configFaturasPadrao = () => [
    { id: "nubank-davi", nome: "Nubank", dia: 9, pessoa: "davi" },
    { id: "nubank-gabriel", nome: "Nubank", dia: 20, pessoa: "gabriel" },
  ];
  const garantirFaturas = () => {
    if (!Array.isArray(state.faturas) || !state.faturas.length) state.faturas = configFaturasPadrao();
    return state.faturas;
  };
  const salvarConfig = async (patch, mensagem = "Alterações salvas.") => {
    if (!window.CAIXA_FIREBASE || typeof window.CAIXA_FIREBASE.request !== "function") {
      showToast("Firebase ainda não terminou de carregar.");
      throw new Error("Firebase indisponível.");
    }
    try {
      const res = await caixaApiRequest({
        method: "POST",
        body: JSON.stringify({ action: "saveConfig", payload: patch }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      if (data?.ok === false) throw new Error(data.error || "Não foi possível salvar.");
      showToast(mensagem);
      return data;
    } catch (err) {
      showToast("Não consegui salvar no Firebase agora.");
      throw err;
    }
  };
  const normalizarCategoria = c => ({
    nome: String(c?.nome || "").trim(),
    cor: /^#[0-9a-f]{6}$/i.test(String(c?.cor || "")) ? String(c.cor) : "#4a7866",
  });
  const categoriasLocais = () => (Array.isArray(state.categoriasConfig) ? state.categoriasConfig : []).map(normalizarCategoria).filter(c => c.nome);

  function abrir() {
    overlay.classList.remove("is-hidden");
    overlay.classList.add("is-opening");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("caixa-config-open");
    document.getElementById("caixaConfigAdminCard")?.classList.toggle("is-hidden", state.pessoaAtual !== "davi");
    setTimeout(() => overlay.classList.remove("is-opening"), 30);
    mostrarView("home");
    renderTudo();
  }
  function fechar() {
    overlay.classList.add("is-hidden");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("caixa-config-open");
    const trigger = document.getElementById("btnAbrirConfiguracoes");
    trigger?.setAttribute("aria-expanded", "false");
  }
  function mostrarView(nome) {
    viewAtual = nome;
    home.classList.toggle("is-hidden", nome !== "home");
    Object.entries(views).forEach(([key, el]) => el?.classList.toggle("is-hidden", key !== nome));
    const tituloView = titles[nome] || titles.home;
    const cabecalho = drawer.querySelector(".caixa-config-head");
    const interna = nome !== "home";
    back.classList.toggle("is-hidden", !interna);
    title.textContent = tituloView;
    cabecalho?.classList.toggle("caixa-config-inner", interna);
    cabecalho?.setAttribute("data-view-title", tituloView);
    if (nome === "categorias") renderCategorias();
    if (nome === "ia") renderIA();
    if (nome === "faturas") renderFaturas();
    if (nome === "tema") renderTema();
    if (nome === "admin") renderAdmin();
  }

  function renderCategorias() {
    const wrap = document.getElementById("listaConfigCategorias");
    if (!wrap) return;
    const lista = categoriasLocais();
    if (!lista.length) {
      wrap.innerHTML = `<div class="caixa-config-empty">Nenhuma categoria cadastrada.</div>`;
      return;
    }
    wrap.innerHTML = lista.map((cat, idx) => `
      <div class="caixa-config-row" data-cat-index="${idx}">
        <span class="caixa-config-color caixa-config-color-static" style="--cat-color:${cat.cor}" aria-hidden="true" title="Edite a categoria para alterar a cor"></span>
        <div class="caixa-config-row-main">
          <div class="caixa-config-row-title">${escapeHtml(cat.nome)}</div>
          <div class="caixa-config-row-sub">Edite a categoria para alterar a cor.</div>
        </div>
        <div class="caixa-config-row-actions">
          <button type="button" class="caixa-config-mini-btn" data-cat-edit="${idx}" aria-label="Editar ${escapeHtml(cat.nome)}">
            <svg viewBox="0 0 24 24" fill="none"><path d="m4 16.5-.7 3.2 3.2-.7L18.8 6.7a2 2 0 0 0 0-2.8l-.7-.7a2 2 0 0 0-2.8 0L4 16.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m14 5 5 5" stroke="currentColor" stroke-width="1.7"/></svg>
          </button>
          <button type="button" class="caixa-config-mini-btn danger" data-cat-delete="${idx}" aria-label="Excluir ${escapeHtml(cat.nome)}">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V4h6v3m-8 0 .8 13h8.4L17 7M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `).join("");

    wrap.querySelectorAll("[data-cat-edit]").forEach(btn => {
      btn.addEventListener("click", () => editarCategoria(Number(btn.dataset.catEdit)));
    });
    wrap.querySelectorAll("[data-cat-delete]").forEach(btn => {
      btn.addEventListener("click", () => excluirCategoria(Number(btn.dataset.catDelete)));
    });
  }

  async function salvarCategorias(listaNova, operacao = {}) {
    const lista = listaNova.map(normalizarCategoria).filter(c => c.nome);
    if (!lista.length) { showToast("Mantenha pelo menos uma categoria."); return false; }
    const nomes = lista.map(c => c.nome.toLocaleLowerCase("pt-BR"));
    if (new Set(nomes).size !== nomes.length) { showToast("Não pode haver categorias com o mesmo nome."); return false; }
    try {
      const res = await caixaApiRequest({
        method: "POST",
        body: JSON.stringify({
          action: "saveCategorias",
          payload: {
            categorias: lista,
            renomearDe: operacao.renomearDe || "",
            renomearPara: operacao.renomearPara || "",
            excluirNome: operacao.excluirNome || "",
          }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.ok === false) throw new Error(data.error || "Não foi possível salvar.");
      state.categoriasConfig = lista;
      marcarAlteracaoLocal();
      popularSelectsDeCategoria();
      renderAll();
      showToast("Categorias atualizadas.");
      return true;
    } catch (err) {
      showToast("Não consegui salvar as categorias agora.");
      return false;
    }
  }

  async function editarCategoria(idx) {
    const lista = categoriasLocais();
    const atual = lista[idx];
    if (!atual) return;
    const row = document.querySelector(`[data-cat-index="${idx}"]`);
    if (!row) return;
    row.innerHTML = `
      <div class="caixa-config-edit">
        <input type="text" value="${escapeHtml(atual.nome)}" maxlength="50" aria-label="Nome da categoria">
        <input type="color" value="${atual.cor}" aria-label="Cor da categoria">
        <button type="button" class="btn btn-gold btn-config-small">Salvar</button>
      </div>`;
    const [nomeInput, corInput] = row.querySelectorAll("input");
    row.querySelector("button").addEventListener("click", async () => {
      const novoNome = nomeInput.value.trim();
      if (!novoNome) { showToast("Digite um nome para a categoria."); return; }
      const duplicada = lista.some((c, i) => i !== idx && c.nome.toLocaleLowerCase("pt-BR") === novoNome.toLocaleLowerCase("pt-BR"));
      if (duplicada) { showToast("Já existe uma categoria com esse nome."); return; }
      const antiga = atual.nome;
      lista[idx] = { nome: novoNome, cor: corInput.value };
      await salvarCategorias(lista, { renomearDe: antiga, renomearPara: novoNome });
      renderCategorias();
    });
    nomeInput.focus();
    nomeInput.select();
  }

  async function excluirCategoria(idx) {
    const lista = categoriasLocais();
    const atual = lista[idx];
    if (!atual) return;
    if (!confirm(`Excluir a categoria "${atual.nome}"? Lançamentos antigos dessa categoria serão movidos para "Outro" quando essa categoria existir.`)) return;
    if (lista.length === 1) { showToast("Você precisa manter pelo menos uma categoria."); return; }
    lista.splice(idx, 1);
    const ok = await salvarCategorias(lista, { excluirNome: atual.nome });
    if (ok) renderCategorias();
  }

  async function novaCategoria() {
    const nome = prompt("Nome da nova categoria:");
    if (!nome) return;
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return;
    const lista = categoriasLocais();
    if (lista.some(c => c.nome.toLocaleLowerCase("pt-BR") === nomeLimpo.toLocaleLowerCase("pt-BR"))) {
      showToast("Essa categoria já existe.");
      return;
    }
    const cor = prompt("Cor da categoria (hex, ex.: #4a7866):", "#4a7866") || "#4a7866";
    lista.push(normalizarCategoria({ nome: nomeLimpo, cor }));
    const ok = await salvarCategorias(lista);
    if (ok) renderCategorias();
  }

  function iaConfigAtual() {
    const cfg = clone(state.iaConfig || {});
    cfg.davi = Array.isArray(cfg.davi) ? cfg.davi : [];
    cfg.gabriel = Array.isArray(cfg.gabriel) ? cfg.gabriel : [];
    cfg.ambos = Array.isArray(cfg.ambos) ? cfg.ambos : [];
    cfg.tomDavi = String(cfg.tomDavi || "");
    cfg.tomGabriel = String(cfg.tomGabriel || "");
    cfg.tomAmbos = String(cfg.tomAmbos || "natural, equilibrado e conversado, falando com vocês dois");
    return cfg;
  }
  function renderIA() {
    if (state.pessoaAtual === "ambos") iaPessoa = "ambos";
    else if (state.pessoaAtual === "gabriel") iaPessoa = "gabriel";
    else iaPessoa = "davi";
    const cfg = iaConfigAtual();
    const tom = iaPessoa === "gabriel" ? cfg.tomGabriel : iaPessoa === "ambos" ? cfg.tomAmbos : cfg.tomDavi;
    const pessoaLabel = document.getElementById("configIAPessoaLabel");
    if (pessoaLabel) pessoaLabel.textContent = iaPessoa === "ambos" ? "Juntos" : (iaPessoa === "gabriel" ? "Gabriel" : "Davi");
    const textarea = document.getElementById("configIATom");
    textarea.value = tom;
    textarea.disabled = false;
    textarea.placeholder = "Descreva como a IA deve falar…";
    const lista = document.getElementById("listaConfigImersao");
    const imersoes = Array.isArray(cfg[iaPessoa]) ? cfg[iaPessoa] : [];
    if (!imersoes.length) {
      lista.innerHTML = `<div class="caixa-config-empty">Nenhuma informação cadastrada para esta pessoa.</div>`;
    } else {
      lista.innerHTML = imersoes.map((item, idx) => `
        <div class="caixa-config-immersion-row" data-immersion-index="${idx}">
          <textarea rows="2" aria-label="Informação de imersão">${escapeHtml(String(item))}</textarea>
          <button type="button" class="caixa-config-mini-btn danger" data-immersion-delete="${idx}" aria-label="Excluir informação">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V4h6v3m-8 0 .8 13h8.4L17 7M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>`).join("");
      lista.querySelectorAll("textarea").forEach((el, idx) => {
        el.addEventListener("input", () => { cfg[iaPessoa][idx] = el.value; state._iaConfigEdicao = cfg; });
      });
      lista.querySelectorAll("[data-immersion-delete]").forEach(btn => {
        btn.addEventListener("click", () => {
          const index = Number(btn.dataset.immersionDelete);
          cfg[iaPessoa].splice(index, 1);
          state._iaConfigEdicao = cfg;
          renderIA();
        });
      });
    }
    state._iaConfigEdicao = cfg;
  }

  async function salvarIA() {
    const cfg = state._iaConfigEdicao ? clone(state._iaConfigEdicao) : iaConfigAtual();
    const textarea = document.getElementById("configIATom");
    if (iaPessoa === "davi") cfg.tomDavi = textarea.value.trim();
    if (iaPessoa === "gabriel") cfg.tomGabriel = textarea.value.trim();
    if (iaPessoa === "ambos") cfg.tomAmbos = textarea.value.trim();
    try {
      await salvarConfig({ iaConfig: cfg }, "Configuração da IA salva.");
      state.iaConfig = cfg;
      try { localStorage.setItem("caixa-ia-config-v1", JSON.stringify({ data: cfg, expira: Date.now() + 86400000 })); } catch (_) {}
      document.dispatchEvent(new CustomEvent("caixa:ia-config-atualizada"));
      renderIA();
    } catch (_) {}
  }

  function novaImersao() {
    const texto = prompt("O que a IA deve saber sobre você? Ex.: Gosto muito de RPG.");
    if (!texto?.trim()) return;
    const cfg = iaConfigAtual();
    cfg[iaPessoa].push(texto.trim());
    state._iaConfigEdicao = cfg;
    renderIA();
  }

  function faturasPessoa() {
    return garantirFaturas().filter(f => String(f?.pessoa || "davi") === faturaPessoa);
  }
  function renderFaturas() {
    faturaPessoa = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
    document.getElementById("caixaConfigAdminCard")?.classList.toggle("is-hidden", state.pessoaAtual !== "davi");
    garantirFaturas();
    const wrap = document.getElementById("listaConfigFaturas");
    const lista = faturasPessoa();
    if (!lista.length) {
      wrap.innerHTML = `<div class="caixa-config-empty">Nenhuma fatura cadastrada para ${faturaPessoa === "davi" ? "Davi" : "Gabriel"}.</div>`;
      return;
    }
    wrap.innerHTML = lista.map(f => `
      <div class="caixa-config-row" data-fatura-id="${escapeHtml(String(f.id))}">
        <div class="caixa-config-row-main">
          <div class="caixa-config-row-title">${escapeHtml(String(f.nome || "Fatura"))}</div>
          <div class="caixa-config-fatura-meta"><span class="caixa-config-fatura-owner">${faturaPessoa === "davi" ? "Davi" : "Gabriel"}</span><span>•</span><span>vence todo dia ${Number(f.dia) || 1}</span></div>
        </div>
        <div class="caixa-config-row-actions">
          <button type="button" class="caixa-config-mini-btn" data-fatura-edit="${escapeHtml(String(f.id))}" aria-label="Editar fatura">
            <svg viewBox="0 0 24 24" fill="none"><path d="m4 16.5-.7 3.2 3.2-.7L18.8 6.7a2 2 0 0 0 0-2.8l-.7-.7a2 2 0 0 0-2.8 0L4 16.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m14 5 5 5" stroke="currentColor" stroke-width="1.7"/></svg>
          </button>
          <button type="button" class="caixa-config-mini-btn danger" data-fatura-delete="${escapeHtml(String(f.id))}" aria-label="Excluir fatura">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V4h6v3m-8 0 .8 13h8.4L17 7M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>`).join("");
    wrap.querySelectorAll("[data-fatura-edit]").forEach(btn => btn.addEventListener("click", () => editarFatura(String(btn.dataset.faturaEdit))));
    wrap.querySelectorAll("[data-fatura-delete]").forEach(btn => btn.addEventListener("click", () => excluirFatura(String(btn.dataset.faturaDelete))));
  }

  async function salvarFaturas(lista) {
    const normalizada = lista.map(f => ({
      id: String(f.id || "").trim(),
      nome: String(f.nome || "").trim(),
      dia: Math.max(1, Math.min(31, Number(f.dia) || 1)),
      pessoa: String(f.pessoa || "davi") === "gabriel" ? "gabriel" : "davi",
    })).filter(f => f.id && f.nome);
    if (!normalizada.length) { showToast("Mantenha pelo menos uma fatura."); return false; }
    const ids = normalizada.map(f => f.id);
    if (new Set(ids).size !== ids.length) { showToast("As faturas precisam ter identificadores diferentes."); return false; }
    try {
      await salvarConfig({ faturas: normalizada }, "Faturas atualizadas.");
      state.faturas = normalizada;
      marcarAlteracaoLocal();
      return true;
    } catch (_) { return false; }
  }

  const faturaModal = {
    backdrop: document.getElementById("configFaturaBackdrop"),
    title: document.getElementById("configFaturaTitle"),
    hint: document.getElementById("configFaturaHint"),
    nome: document.getElementById("configFaturaNome"),
    dia: document.getElementById("configFaturaDia"),
    salvar: document.getElementById("configFaturaSalvar"),
    cancelar: document.getElementById("configFaturaCancelar"),
    fechar: document.getElementById("configFaturaClose"),
  };
  let faturaEditandoId = null;

  function preencherDiasFatura() {
    if (!faturaModal.dia) return;
    faturaModal.dia.innerHTML = Array.from({length:31}, (_,i) => `<option value="${i+1}">Dia ${i+1}</option>`).join("");
  }
  function fecharModalFatura() {
    faturaModal.backdrop?.classList.add("is-hidden");
    faturaEditandoId = null;
  }
  function abrirModalFatura(fatura = null) {
    preencherDiasFatura();
    faturaEditandoId = fatura ? String(fatura.id) : null;
    const pessoaAtual = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
    faturaPessoa = pessoaAtual;
    faturaModal.title.textContent = fatura ? "Editar fatura" : "Nova fatura";
    faturaModal.hint.textContent = fatura ? "Altere o nome ou o dia em que esta fatura vence." : "Cadastre o cartão e o dia em que a fatura vence.";
    faturaModal.nome.value = fatura?.nome || "";
    faturaModal.dia.value = String(Number(fatura?.dia) || 10);
    faturaModal.salvar.textContent = fatura ? "Salvar alterações" : "Salvar fatura";
    faturaModal.backdrop.classList.remove("is-hidden");
    setTimeout(() => { faturaModal.nome.focus(); faturaModal.nome.select(); }, 30);
  }
  async function salvarFaturaModal() {
    const nome = String(faturaModal.nome.value || "").trim();
    const pessoa = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
    const dia = Number(faturaModal.dia.value);
    if (!nome) { showToast("Digite o nome da fatura."); faturaModal.nome.focus(); return; }
    if (!(dia >= 1 && dia <= 31)) { showToast("Escolha um dia entre 1 e 31."); faturaModal.dia.focus(); return; }
    const lista = garantirFaturas().slice();
    if (faturaEditandoId) {
      const idx = lista.findIndex(f => String(f.id) === faturaEditandoId);
      if (idx < 0) { fecharModalFatura(); return; }
      lista[idx] = {...lista[idx], nome, dia, pessoa};
    } else {
      lista.push({ id: `${pessoa}-${Date.now().toString(36)}`, nome, dia, pessoa });
    }
    const ok = await salvarFaturas(lista);
    if (ok) {
      faturaPessoa = pessoa;
      fecharModalFatura();
      renderFaturas();
    }
  }
  function novaFatura() { abrirModalFatura(null); }
  function editarFatura(id) {
    const atual = garantirFaturas().find(f => String(f.id) === String(id));
    if (atual) abrirModalFatura(atual);
  }

  async function excluirFatura(id) {
    const lista = garantirFaturas().slice();
    const idx = lista.findIndex(f => String(f.id) === id);
    if (idx < 0) return;
    if (lista.filter(f => f.pessoa === faturaPessoa).length <= 1) {
      showToast("Mantenha pelo menos uma fatura para essa pessoa.");
      return;
    }
    const nomeFatura = lista[idx].nome;
    const tituloEl = document.getElementById("confirmTitle");
    if (tituloEl) tituloEl.textContent = "Excluir fatura?";
    abrirConfirmacao(`A fatura "${nomeFatura}" será removida. Essa ação não pode ser desfeita.`, async () => {
      const listaAtualizada = garantirFaturas().slice();
      const idxAtual = listaAtualizada.findIndex(f => String(f.id) === String(id));
      if (idxAtual < 0) return;
      if (listaAtualizada.filter(f => String(f.pessoa || "davi") === faturaPessoa).length <= 1) {
        showToast("Mantenha pelo menos uma fatura para essa pessoa.");
        return;
      }
      listaAtualizada.splice(idxAtual, 1);
      if (await salvarFaturas(listaAtualizada)) renderFaturas();
    });
  }

  function renderTema() {
    const preferencia = window.CAIXA_TEMA?.lerPreferencia?.() || document.documentElement.dataset.themePreference || "device";
    document.querySelectorAll("[data-theme-choice]").forEach(btn => {
      const ativo = btn.dataset.themeChoice === preferencia;
      btn.classList.toggle("is-active", ativo);
      btn.setAttribute("aria-pressed", ativo ? "true" : "false");
    });
  }

  function temaPodeSerUsado(id) {
    if (id === "default") return true;
    const regra = (state.temasConfig || {})[id];
    if (!regra) return false;
    if (regra.forcarAgora === true) return true;
    const mes = mesTemaSazonal(id);
    if (!mes) return false;
    const inicioDia = lerDiaTema(regra, "inicioDia", 1);
    const fimDia = lerDiaTema(regra, "fimDia", [4,6,9,11].includes(mes) ? 30 : 31);
    const hoje = new Date();
    if (hoje.getMonth() + 1 !== mes) return false;
    const dia = hoje.getDate();
    return dia >= Math.min(inicioDia, fimDia) && dia <= Math.max(inicioDia, fimDia);
  }
  function temaAtivo() {
    try { return localStorage.getItem("caixa-tema-estilo-v1") || "default"; } catch (_) { return "default"; }
  }
  function garantirCssTema(id) {
    if (id !== "halloween") return;
    const href = new URL("themes/halloween.css", document.baseURI).href;
    if ([...document.querySelectorAll('link[data-caixa-theme-css="halloween"]')].some(link => link.href === href)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = href; link.dataset.caixaThemeCss = "halloween";
    document.head.appendChild(link);
  }

  // Temas sazonais entram e saem automaticamente de acordo com o período
  // configurado no Admin. O Padrão continua sendo o fallback permanente.
  // O tema sazonal é sempre automático. Se nenhum evento estiver dentro do
  // período configurado pelo Admin, o Caixa volta simplesmente para Padrão.
  function sincronizarTemaSazonal() {
    const sazonais = ["christmas", "halloween"];
    const disponiveis = sazonais.filter(id => temaPodeSerUsado(id));
    const ativo = disponiveis[0] || "default";
    try { localStorage.setItem("caixa-tema-estilo-v1", ativo); } catch (_) {}
    document.documentElement.dataset.caixaTheme = ativo;
    return ativo;
  }
  function garantirEstiloNatalRefinado() {

    const id = "caixaChristmasRefinamentoV2";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .split-donut{overflow:visible}
      .split-donut > .caixa-visao-geral-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
      html[data-caixa-theme="christmas"] .caixa-christmas-scenery{
        position:absolute;left:0;right:0;bottom:0;height:86px;z-index:70;
        pointer-events:none;overflow:visible;
      }
      html[data-caixa-theme="christmas"] .christmas-scenery-item{
        position:absolute;display:block;line-height:1;
        transform:translate(-50%,2px) scale(var(--scene-scale,1));
        transform-origin:50% 100%;
        font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif;
        user-select:none;filter:drop-shadow(0 3px 5px rgba(42,52,68,.18));
        z-index:71;
      }
      html[data-caixa-theme="christmas"] .christmas-scenery-item.tree{font-size:52px}
      html[data-caixa-theme="christmas"] .christmas-scenery-item.pine{font-size:45px;opacity:.90}
      html[data-caixa-theme="christmas"] .christmas-scenery-item.snowman{font-size:36px;z-index:72}
      html[data-caixa-theme="christmas"] .hero-stats-toggle,
      html[data-caixa-theme="christmas"] .hero .collapse-toggle,
      html[data-caixa-theme="christmas"] .hero .btn-expandir,
      html[data-caixa-theme="christmas"] .hero .btn-recolher{
        position:relative !important;z-index:90 !important;
      }
      html[data-caixa-theme="christmas"] .caixa-christmas-snow-cap{
        position:absolute;left:-1px;right:-1px;top:-1px;height:20px;
        display:block;pointer-events:none;z-index:8;
        background-repeat:no-repeat;background-size:100% 100%;background-position:center top;
        filter:drop-shadow(0 2px 2px rgba(75,94,111,.12));
      }
      html[data-caixa-theme="christmas"] .goal-card.caixinha-card > *:not(.caixa-christmas-snow-cap){position:relative;z-index:3}
      html[data-theme="dark"][data-caixa-theme="christmas"] .caixa-christmas-snow-cap{filter:drop-shadow(0 2px 3px rgba(0,0,0,.30)) brightness(.96)}
      @media(max-width:640px){
        html[data-caixa-theme="christmas"] .caixa-christmas-scenery{height:72px}
        html[data-caixa-theme="christmas"] .christmas-scenery-item.tree{font-size:44px}
        html[data-caixa-theme="christmas"] .christmas-scenery-item.pine{font-size:37px}
        html[data-caixa-theme="christmas"] .christmas-scenery-item.snowman{font-size:30px}
        html[data-caixa-theme="christmas"] .caixa-christmas-snow-cap{height:17px}
      }
    `;
    document.head.appendChild(style);
  }

  function prepararCenarioNatal() {
    const hero = document.querySelector(".hero");
    if (!hero) return;
    let wrap = hero.querySelector(".caixa-christmas-scenery");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "caixa-christmas-scenery";
      wrap.setAttribute("aria-hidden", "true");
      hero.appendChild(wrap);
    }

    // Composição fixa para manter o centro livre para o botão de recolher.
    // Exatamente: 1 🎄, 3 🌲 e 1 ⛄.
    const itens = [
      { cls: "tree", x: 9,  s: .94, emoji: "🎄" },
      { cls: "pine pine-one", x: 24, s: .56, emoji: "🌲" },
      { cls: "snowman", x: 62, s: .70, emoji: "⛄" },
      { cls: "pine pine-two", x: 76, s: .78, emoji: "🌲" },
      { cls: "pine pine-three", x: 91, s: .50, emoji: "🌲" }
    ];

    wrap.innerHTML = "";
    itens.forEach((item, idx) => {
      const el = document.createElement("span");
      el.className = `christmas-scenery-item ${item.cls}`;
      el.textContent = item.emoji;
      el.style.left = `${item.x}%`;
      el.style.bottom = item.cls === "snowman" ? "2px" : `${2 + (idx % 3) * 3}px`;
      el.style.setProperty("--scene-scale", String(item.s));
      el.style.setProperty("--scene-delay", `${idx * -1.1}s`);
      wrap.appendChild(el);
    });
  }

  function prepararNeveNatal() {
    const layer = document.getElementById("caixaChristmasSnow");
    if (!layer || layer.childElementCount) return;
    const fragment = document.createDocumentFragment();
    const simbolos = ["•", "❄", "✦", "·"];
    for (let i = 0; i < 22; i++) {
      const floco = document.createElement("span");
      floco.className = "caixa-snowflake";
      floco.textContent = simbolos[i % simbolos.length];
      floco.style.left = `${Math.random() * 100}%`;
      floco.style.setProperty("--s", `${3 + Math.random() * 3}px`);
      floco.style.setProperty("--o", `${0.14 + Math.random() * 0.20}`);
      floco.style.setProperty("--d", `${16 + Math.random() * 12}s`);
      floco.style.setProperty("--delay", `${-Math.random() * 14}s`);
      floco.style.setProperty("--x", `${-30 + Math.random() * 60}px`);
      fragment.appendChild(floco);
    }
    layer.appendChild(fragment);
  }
  function prepararCenarioHalloween() {
    const hero = document.querySelector(".hero");
    if (!hero || hero.querySelector(".caixa-halloween-scenery")) return;
    const wrap = document.createElement("div"); wrap.className = "caixa-halloween-scenery"; wrap.setAttribute("aria-hidden", "true");
    const itens = [
      { cls:"dead-tree", x:12, s:1.0 },
      { cls:"pumpkin-static", x:25, s:.86 },
      { cls:"bat", x:45, y:8, s:.66 },
      { cls:"bat bat-two", x:63, y:17, s:.48 },
      { cls:"bat bat-three", x:82, y:7, s:.42 },
      { cls:"black-cat", x:91, s:.72 }
    ];
    itens.sort(() => Math.random() - .5);
    itens.forEach((item, idx) => {
      const el=document.createElement("span"); el.className=`halloween-scenery-item ${item.cls}`;
      el.style.left=`${item.x + (Math.random()*6-3)}%`;
      if(item.y!=null) el.style.top=`${item.y + Math.random()*7}px`; else el.style.bottom=`${2+Math.random()*2}px`;
      el.style.setProperty("--scene-scale", String(item.s+(Math.random()*.1-.05))); el.style.setProperty("--scene-delay", `${idx*-1.7}s`);
      if(item.cls === "dead-tree") el.innerHTML=`🪾`;
      else if(item.cls === "pumpkin-static") el.innerHTML=`🎃`;
      else if(item.cls.includes("bat")) el.innerHTML=`🦇`;
      else el.innerHTML=`🐈‍⬛`;
      wrap.appendChild(el);
    });
    hero.appendChild(wrap);
  }
  function gerarPerfilTerrenoHalloween(){
    const largura=1000, altura=58, qtd=18, pontos=[];
    for(let i=0;i<=qtd;i++){
      const x=i/qtd*largura;
      const onda=Math.sin((i/qtd)*Math.PI*2.7+.35)*4.8;
      const onda2=Math.sin((i/qtd)*Math.PI*6.1+1.2)*1.7;
      const variacao=(Math.random()-.5)*5.2;
      const montinho=Math.random()<.22 ? 2+Math.random()*4 : 0;
      pontos.push({x,y:Math.max(9,17+onda+onda2+variacao+montinho)});
    }
    const curva=(p0,p1,p2,p3)=>{const c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6,c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;return `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`};
    let path=`M 0 ${pontos[0].y.toFixed(1)}`;
    for(let i=0;i<pontos.length-1;i++){const p0=pontos[Math.max(0,i-1)],p1=pontos[i],p2=pontos[i+1],p3=pontos[Math.min(pontos.length-1,i+2)];path+=` ${curva(p0,p1,p2,p3)}`}
    path+=` L ${largura} ${altura} L 0 ${altura} Z`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none"><defs><linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#684b48"/><stop offset=".34" stop-color="#4a3340"/><stop offset="1" stop-color="#21152b"/></linearGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8c5a43"/><stop offset=".5" stop-color="#73514f"/><stop offset="1" stop-color="#53366a"/></linearGradient></defs><path d="${path}" fill="url(#ground)"/><path d="${pontos.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${(p.y+.5).toFixed(1)}`).join(' ')}" fill="none" stroke="url(#rim)" stroke-width="2.2" stroke-linecap="round" opacity=".72"/></svg>`;
    return `url("data:image/svg+xml;base64,${btoa(svg)}")`;
  }

  function aplicarTerrenoHalloween(){
    if(document.documentElement.dataset.caixaTheme!=="halloween") return;
    const hero=document.querySelector(".hero");
    if(!hero) return;
    let terreno=hero.querySelector(".caixa-halloween-terrain");
    if(!terreno){
      terreno=document.createElement("div");
      terreno.className="caixa-halloween-terrain";
      terreno.setAttribute("aria-hidden","true");
      hero.appendChild(terreno);
    }
    terreno.style.backgroundImage=gerarPerfilTerrenoHalloween();
    hero.dataset.halloweenTerrain="1";
  }
  function atualizarCamadaTemaHalloween(){
    const ativo=document.documentElement.dataset.caixaTheme==="halloween"; garantirCssTema("halloween");
    if(ativo){prepararCenarioHalloween();aplicarTerrenoHalloween()}
    document.querySelectorAll(".caixa-halloween-scenery").forEach(el=>el.setAttribute("aria-hidden",ativo?"false":"true"));
    if(!ativo){document.querySelectorAll(".caixa-halloween-scenery").forEach(el=>el.remove());document.querySelectorAll("[data-slime-profile]").forEach(el=>{el.style.removeProperty("--slime-image");delete el.dataset.slimeProfile}); document.querySelectorAll(".caixa-halloween-terrain").forEach(el=>el.remove()); document.querySelectorAll("[data-halloween-terrain]").forEach(el=>{el.style.removeProperty("--halloween-terrain-image");delete el.dataset.halloweenTerrain})}
  }
  function atualizarCamadasTemas(){atualizarCamadaTemaNatal();atualizarCamadaTemaHalloween()}
  window.CAIXA_ATUALIZAR_CAMADAS_TEMAS = atualizarCamadasTemas;
  window.CAIXA_RENDER_TEMAS = () => renderTemas();
  function atualizarCamadaTemaNatal() {
    const natal = document.documentElement.dataset.caixaTheme === "christmas";
    const layer = document.getElementById("caixaChristmasSnow");
    const lights = document.getElementById("caixaChristmasLights");
    if (natal) {
      garantirEstiloNatalRefinado();
      prepararNeveNatal();
      prepararCenarioNatal();
      aplicarNeveProcedural();
    } else {
      // Toda a decoração criada exclusivamente pelo tema Natal deve ser
      // removida ao trocar para outro tema. Isso evita que árvores/pinheiros
      // permaneçam espalhados pela tela inicial.
      document.querySelectorAll(".caixa-christmas-scenery").forEach(el => el.remove());
      document.querySelectorAll("[data-snow-profile]").forEach(el => {
        el.style.removeProperty("--snow-image");
        delete el.dataset.snowProfile;
      });
      document.querySelectorAll(".caixa-christmas-snow-cap").forEach(el => el.remove());
    }
    if (layer) layer.setAttribute("aria-hidden", natal ? "false" : "true");
    if (lights) lights.setAttribute("aria-hidden", natal ? "false" : "true");
  }
  function aplicarTemaCaixa(id) {
    // Temas sazonais não são escolhidos pelo usuário. Esta função permanece
    // apenas como compatibilidade com versões anteriores.
    const ativo = sincronizarTemaSazonal();
    garantirCssTema(ativo);
    atualizarCamadasTemas();
    renderVisaoGeral();
  }
  function renderTemas() {
    const ativo = sincronizarTemaSazonal();
    garantirCssTema(ativo);
    atualizarCamadasTemas();
    // Remove qualquer seletor sazonal legado que exista no HTML de uma versão
    // anterior. Claro/Escuro/Dispositivo continuam pertencendo à Aparência.
    document.querySelectorAll('.caixa-theme-option[data-caixa-theme]').forEach(btn => btn.remove());
    return ativo;
  }
  function garantirEstiloAdminSazonalidade() {
    if (document.getElementById("caixaAdminSazonalidadeStyle")) return;
    const style = document.createElement("style");
    style.id = "caixaAdminSazonalidadeStyle";
    style.textContent = `
      /* Sazonalidade: Natal e Halloween pertencem ao mesmo bloco visual. */
      .caixa-admin-seasonal-root{
        width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;
      }
      .caixa-admin-seasonal-root > .caixa-admin-seasonal-card{
        width:100%;box-sizing:border-box;margin:0;padding:18px 16px;
        border:1px solid rgba(60,110,79,.18);border-radius:18px;
        background:rgba(255,255,255,.42);box-shadow:0 8px 22px rgba(22,51,44,.06);
      }
      html[data-theme="dark"] .caixa-admin-seasonal-root > .caixa-admin-seasonal-card{
        border-color:rgba(111,187,140,.18);background:rgba(255,255,255,.035);
      }
      .caixa-admin-seasonal-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
      .caixa-admin-seasonal-emoji{font-size:28px;line-height:1;flex:0 0 auto}
      .caixa-admin-seasonal-title{font-size:15px;font-weight:800;line-height:1.2}
      .caixa-admin-seasonal-sub{font-size:11px;line-height:1.45;opacity:.58;margin-top:4px}
      .caixa-admin-seasonal-fields{
        display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;width:100%;
      }
      .caixa-admin-seasonal-field{min-width:0;display:flex;flex-direction:column;gap:7px}
      .caixa-admin-seasonal-field > span{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.62}
      .caixa-admin-seasonal-field input{
        width:100% !important;min-width:0 !important;max-width:100% !important;box-sizing:border-box !important;
        height:42px;padding:0 12px;border-radius:12px;font:inherit;
      }
      .caixa-admin-seasonal-force{
        display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:13px;
        border-top:1px solid rgba(60,110,79,.10);cursor:pointer;
      }
      html[data-theme="dark"] .caixa-admin-seasonal-force{border-top-color:rgba(111,187,140,.12)}
      .caixa-admin-seasonal-force input{
        width:18px !important;height:18px !important;min-width:18px !important;
        margin:0;accent-color:#3f9c72;cursor:pointer;
      }
      .caixa-admin-seasonal-force-text{display:flex;flex-direction:column;gap:2px}
      .caixa-admin-seasonal-force-title{font-size:12px;font-weight:800}
      .caixa-admin-seasonal-force-sub{font-size:10px;line-height:1.35;opacity:.56}
      /* A opção antiga não existe mais. Esconde qualquer resto vindo do HTML legado. */
      .caixa-config-row:has(#temaNatalPermanente),
      .caixa-config-row:has(#temaHalloweenPermanente),
      #temaNatalPermanente,#temaHalloweenPermanente{display:none !important}
      #caixaAdminHalloweenTema{width:100%;box-sizing:border-box}
      #caixaAdminHalloweenTema + .caixa-config-primary{margin-top:0}
      #btnSalvarAdminTemas{width:100%;box-sizing:border-box;margin:0}
      @media(max-width:560px){
        .caixa-admin-seasonal-fields{grid-template-columns:1fr 1fr;gap:10px}
      }
    `;
    document.head.appendChild(style);
  }

  function encontrarRaizAdminSazonalidade() {
    const natalInput = document.getElementById("temaNatalInicio");
    if (!natalInput) return null;

    const candidatos = [...document.querySelectorAll(".caixa-config-card, .caixa-settings-card, .settings-card, .config-card, section, fieldset")];
    const raizPorTitulo = candidatos.find(el => {
      if (!el.contains(natalInput)) return false;
      return /Sazonalidade\s+dos\s+temas/i.test(String(el.textContent || "")) &&
        el.querySelector("#temaNatalInicio") && el !== natalInput.parentElement;
    });
    if (raizPorTitulo) return raizPorTitulo;

    return natalInput.closest(".caixa-config-card-body, .caixa-config-card, .caixa-settings-card, .settings-card, .config-card, section") || natalInput.parentElement;
  }

  function prepararCampoDiaTema(id, diaPadrao, rotulo) {
    const input = document.getElementById(id);
    if (!input) return;
    let dia = Number(input.dataset.temaDia);
    if (!Number.isFinite(dia)) {
      const raw = String(input.value || "");
      const match = raw.match(/(?:^|-)\d{2}-(\d{2})(?:T|$)/);
      dia = match ? Number(match[1]) : diaPadrao;
    }
    input.type = "number";
    input.min = "1";
    input.max = "31";
    input.step = "1";
    input.inputMode = "numeric";
    input.value = String(Math.min(31, Math.max(1, dia)));
    input.dataset.temaDia = String(dia);
    const field = input.closest("label") || input.parentElement;
    const span = field?.querySelector("span");
    if (span) span.textContent = rotulo;
  }

  function prepararCardAdminNatal() {
    const input = document.getElementById("temaNatalInicio");
    if (!input) return null;
    document.getElementById("temaNatalPermanente")?.closest(".caixa-config-row")?.remove();
    prepararCampoDiaTema("temaNatalInicio", 1, "Disponível a partir do dia");
    prepararCampoDiaTema("temaNatalFim", 31, "Disponível até o dia");
    const card = input.closest(".caixa-config-card, .caixa-settings-card, .settings-card, .config-card, section");
    if (card) card.classList.add("caixa-admin-seasonal-card");
    return card;
  }

  function garantirCardAdminHalloween() {
    if (state.pessoaAtual !== "davi") return;
    garantirEstiloAdminSazonalidade();
    const natalInput = document.getElementById("temaNatalInicio");
    if (!natalInput) return;

    const natalCard = prepararCardAdminNatal();
    const raiz = encontrarRaizAdminSazonalidade();
    if (!raiz) return;
    raiz.classList.add("caixa-admin-seasonal-root");

    // Se alguma versão anterior deixou o Halloween fora da seção, trazemos
    // o card de volta para dentro da mesma raiz do Natal.
    let bloco = document.getElementById("caixaAdminHalloweenTema");
    if (!bloco) {
      bloco = document.createElement("div");
      bloco.id = "caixaAdminHalloweenTema";
      bloco.className = "caixa-admin-seasonal-card";
      bloco.innerHTML = `
        <div class="caixa-admin-seasonal-head">
          <span class="caixa-admin-seasonal-emoji" aria-hidden="true">🎃</span>
          <div><div class="caixa-admin-seasonal-title">Halloween</div><div class="caixa-admin-seasonal-sub">O tema será aplicado automaticamente durante o período configurado.</div></div>
        </div>
        <div class="caixa-admin-seasonal-fields">
          <label class="caixa-admin-seasonal-field"><span>Disponível a partir do dia</span><input type="number" id="temaHalloweenInicio" min="1" max="31" step="1" inputmode="numeric"></label>
          <label class="caixa-admin-seasonal-field"><span>Disponível até o dia</span><input type="number" id="temaHalloweenFim" min="1" max="31" step="1" inputmode="numeric"></label>
        </div>
        <label class="caixa-admin-seasonal-force">
          <input type="checkbox" id="temaHalloweenForcar">
          <span class="caixa-admin-seasonal-force-text"><span class="caixa-admin-seasonal-force-title">Forçar Halloween agora</span><span class="caixa-admin-seasonal-force-sub">Aplica este tema imediatamente para todos os usuários, apenas para teste.</span></span>
        </label>`;
    }

    // Remove o card da posição antiga e coloca-o sempre junto do Natal.
    bloco.remove();
    raiz.appendChild(bloco);

    let salvar = document.getElementById("btnSalvarAdminTemas");
    if (!salvar) {
      salvar = document.createElement("button");
      salvar.type = "button";
      salvar.id = "btnSalvarAdminTemas";
      salvar.className = "caixa-config-primary";
      salvar.textContent = "Salvar regras";
      salvar.addEventListener("click", salvarAdminTemas);
    }
    salvar.remove();
    raiz.appendChild(salvar);

    // Se ainda existir o botão antigo do Halloween, ele deixa de participar.
    document.getElementById("btnSalvarAdminHalloween")?.remove();

    const natalForcar = document.getElementById("temaNatalForcar");
    if (natalForcar) natalForcar.closest(".caixa-admin-seasonal-force")?.remove();
    if (natalCard && !natalCard.querySelector("#temaNatalForcar")) {
      const force = document.createElement("label");
      force.className = "caixa-admin-seasonal-force";
      force.innerHTML = `<input type="checkbox" id="temaNatalForcar"><span class="caixa-admin-seasonal-force-text"><span class="caixa-admin-seasonal-force-title">Forçar Natal agora</span><span class="caixa-admin-seasonal-force-sub">Aplica este tema imediatamente para todos os usuários, apenas para teste.</span></span>`;
      natalCard.appendChild(force);
    }

    ["temaNatalForcar", "temaHalloweenForcar"].forEach(id => {
      const cb = document.getElementById(id);
      if (!cb || cb.dataset.forceBound === "1") return;
      cb.dataset.forceBound = "1";
      cb.addEventListener("change", () => {
        const outro = id === "temaNatalForcar" ? "temaHalloweenForcar" : "temaNatalForcar";
        const outroCb = document.getElementById(outro);
        if (cb.checked && outroCb) outroCb.checked = false;
        salvarForcamentoTema(id === "temaNatalForcar" ? "christmas" : "halloween", cb.checked).catch(() => {});
      });
    });
  }

  async function salvarForcamentoTema(id, forcar) {
    const atual = clone(state.temasConfig || {});
    atual.christmas = {...(atual.christmas || {}), forcarAgora: id === "christmas" ? !!forcar : false};
    atual.halloween = {...(atual.halloween || {}), forcarAgora: id === "halloween" ? !!forcar : false};
    state.temasConfig = atual;
    await salvarConfig({temasConfig: atual}, forcar ? `Tema ${id === "christmas" ? "Natal" : "Halloween"} forçado para todos.` : "Forçamento do tema removido.");
    const ativo = sincronizarTemaSazonal();
    garantirCssTema(ativo);
    atualizarCamadasTemas();
    renderVisaoGeral();
    renderAdmin();
  }

  function renderAdmin() {
    if (state.pessoaAtual !== "davi") return;
    renderAdminIcones();
    garantirCardAdminHalloween();
    const cfg = state.temasConfig || {};
    const natal = cfg.christmas || {};
    const halloween = cfg.halloween || {};
    prepararCampoDiaTema("temaNatalInicio", lerDiaTema(natal, "inicioDia", 1), "Disponível a partir do dia");
    prepararCampoDiaTema("temaNatalFim", lerDiaTema(natal, "fimDia", 31), "Disponível até o dia");
    prepararCampoDiaTema("temaHalloweenInicio", lerDiaTema(halloween, "inicioDia", 1), "Disponível a partir do dia");
    prepararCampoDiaTema("temaHalloweenFim", lerDiaTema(halloween, "fimDia", 31), "Disponível até o dia");
    document.getElementById("temaNatalPermanente")?.closest(".caixa-config-row")?.remove();
    document.getElementById("temaHalloweenPermanente")?.closest(".caixa-config-row")?.remove();
    const natalForcar = document.getElementById("temaNatalForcar");
    const halloweenForcar = document.getElementById("temaHalloweenForcar");
    if (natalForcar) natalForcar.checked = natal.forcarAgora === true;
    if (halloweenForcar) halloweenForcar.checked = halloween.forcarAgora === true;
  }

  function renderAdminIcones() {
    const catsWrap = document.getElementById("listaCategoriasIcones");
    const nomesWrap = document.getElementById("listaNomesIcones");
    const regras = Array.isArray(state.iconCategorias) ? clone(state.iconCategorias) : [];
    const nomes = state.iconNomes || {};
    const categorias = [...new Set(regras.map(r => String(r.categoria || "Outros")).concat(iconesCaixinhas.map(obterCategoriaIcone)))].filter(Boolean).sort((a,b)=>a.localeCompare(b,"pt-BR"));
    if (catsWrap) catsWrap.innerHTML = categorias.map((cat, idx) => {
      const regra = regras.find(r => r.categoria === cat) || {categoria:cat,padroes:[]};
      return `<div class="caixa-config-row"><div class="caixa-config-row-main"><div class="caixa-config-row-title">${escapeHtml(cat)}</div><div class="caixa-config-row-sub">${escapeHtml((regra.padroes||[]).join(", ") || "Nenhum ícone associado")}</div></div><div class="caixa-config-row-actions"><button type="button" class="caixa-config-mini-btn" data-admin-cat-edit="${idx}" data-admin-cat="${escapeHtml(cat)}">✎</button></div></div>`;
    }).join("") || `<div class="caixa-config-empty">Nenhuma categoria de ícone cadastrada.</div>`;
    if (nomesWrap) nomesWrap.innerHTML = iconesCaixinhas.map(nome => {
      const atual = obterCategoriaIcone(nome);
      const opcoes = categorias.map(cat => `<option value="${escapeHtml(cat)}" ${cat === atual ? "selected" : ""}>${escapeHtml(cat)}</option>`).join("");
      return `<div class="caixa-config-row"><div class="caixa-config-row-main"><div class="caixa-config-row-title">${escapeHtml(nomeIconeBonito(nome))}</div><div class="caixa-config-row-sub">${escapeHtml(nome)}</div></div><div class="caixa-config-row-actions"><select class="caixa-config-icon-category-select" data-admin-icon-category="${escapeHtml(nome)}">${opcoes}</select><button type="button" class="caixa-config-mini-btn" data-admin-icon-edit="${escapeHtml(nome)}">✎</button></div></div>`;
    }).join("") || `<div class="caixa-config-empty">Nenhum ícone encontrado.</div>`;
    catsWrap?.querySelectorAll("[data-admin-cat-edit]").forEach(btn => btn.addEventListener("click", async () => {
      const atual = btn.dataset.adminCat;
      const novo = prompt("Nome da categoria do ícone:", atual); if (!novo?.trim()) return;
      const regra = regras.find(r=>r.categoria===atual) || {categoria:atual,padroes:[]};
      regra.categoria = novo.trim();
      state.iconCategorias = regras.filter(r=>r.categoria!==atual).concat(regra);
      await salvarConfig({iconCategorias:state.iconCategorias}, "Categoria de ícone atualizada."); renderAdminIcones();
    }));
    nomesWrap?.querySelectorAll("[data-admin-icon-category]").forEach(select => select.addEventListener("change", async () => {
      const arquivo = select.dataset.adminIconCategory; const categoria = select.value;
      const regrasNovas = (Array.isArray(state.iconCategorias) ? clone(state.iconCategorias) : []).map(r => ({...r, padroes:Array.isArray(r.padroes) ? r.padroes.filter(p => normalizarNomeIcone(p) !== normalizarNomeIcone(arquivo)) : []})).filter(r => r.padroes.length || r.categoria === categoria);
      let regra = regrasNovas.find(r => r.categoria === categoria);
      if (!regra) { regra = {categoria, padroes:[]}; regrasNovas.push(regra); }
      if (!regra.padroes.includes(arquivo)) regra.padroes.push(arquivo);
      state.iconCategorias = regrasNovas;
      await salvarConfig({iconCategorias:state.iconCategorias}, "Categoria do ícone atualizada.");
      renderAdminIcones();
      carregarIconesCaixinhas(true);
    }));
    nomesWrap?.querySelectorAll("[data-admin-icon-edit]").forEach(btn => btn.addEventListener("click", async () => {
      const arquivo = btn.dataset.adminIconEdit; const atual = nomes[arquivo] || nomeIconeBonito(arquivo);
      const novo = prompt("Nome exibido para este ícone:", atual); if (!novo?.trim()) return;
      state.iconNomes = {...(state.iconNomes||{}), [arquivo]: novo.trim()};
      await salvarConfig({iconNomes:state.iconNomes}, "Nome do ícone atualizado."); renderAdminIcones();
    }));
  }
  async function novaCategoriaIcone() {
    const nome = prompt("Nome da nova categoria:"); if (!nome?.trim()) return;
    const lista = Array.isArray(state.iconCategorias) ? clone(state.iconCategorias) : [];
    if (lista.some(r => String(r.categoria).toLowerCase() === nome.trim().toLowerCase())) { showToast("Essa categoria já existe."); return; }
    lista.push({categoria:nome.trim(),padroes:[]}); state.iconCategorias = lista; await salvarConfig({iconCategorias:lista}, "Categoria de ícone criada."); renderAdminIcones();
  }
  async function salvarAdminTemas() {
    const diaNatalInicio = Math.min(31, Math.max(1, Number(document.getElementById("temaNatalInicio")?.value) || 1));
    const diaNatalFim = Math.min(31, Math.max(1, Number(document.getElementById("temaNatalFim")?.value) || 31));
    const diaHalloweenInicio = Math.min(31, Math.max(1, Number(document.getElementById("temaHalloweenInicio")?.value) || 1));
    const diaHalloweenFim = Math.min(31, Math.max(1, Number(document.getElementById("temaHalloweenFim")?.value) || 31));
    const forcarNatal = document.getElementById("temaNatalForcar")?.checked === true;
    const forcarHalloween = document.getElementById("temaHalloweenForcar")?.checked === true;
    state.temasConfig = {
      ...(state.temasConfig || {}),
      christmas: { mes:12, inicioDia:Math.min(diaNatalInicio,diaNatalFim), fimDia:Math.max(diaNatalInicio,diaNatalFim), forcarAgora:forcarNatal && !forcarHalloween },
      halloween: { mes:10, inicioDia:Math.min(diaHalloweenInicio,diaHalloweenFim), fimDia:Math.max(diaHalloweenInicio,diaHalloweenFim), forcarAgora:forcarHalloween && !forcarNatal }
    };
    await salvarConfig({temasConfig:state.temasConfig}, "Regras de temas sazonais salvas.");
    const ativo = sincronizarTemaSazonal();
    garantirCssTema(ativo);
    atualizarCamadasTemas();
    renderVisaoGeral();
    renderAdmin();
  }

  // Neve decorativa procedural: cada card recebe um perfil diferente para que
  // o acabamento não pareça uma imagem repetida. O perfil é mantido até o card
  // ser recriado pelo próprio render da lista.
  function gerarPerfilNeve(tipo = "card") {
    // Neve suave e arredondada: uma camada fina, com pequenas ondulações,
    // sempre fechada até a base do elemento para não parecer uma faixa solta.
    const largura = 1000;
    const altura = tipo === "hero" ? 34 : tipo === "caixinha" ? 28 : 24;
    const quantidade = tipo === "hero" ? 12 : tipo === "caixinha" ? 16 : 10;
    const pontos = [];
    for (let i = 0; i <= quantidade; i++) {
      const x = (i / quantidade) * largura;
      const onda = Math.sin((i / quantidade) * Math.PI * (tipo === "caixinha" ? 3.2 : 2.15) + .7) * (tipo === "caixinha" ? 3.0 : 2.2);
      const variacao = (Math.random() - .5) * (tipo === "hero" ? 3.2 : tipo === "caixinha" ? 3.4 : 2.4);
      const montinho = Math.random() < (tipo === "caixinha" ? .30 : .20) ? 2 + Math.random() * (tipo === "caixinha" ? 4.5 : 3.5) : 0;
      const y = (tipo === "caixinha" ? 7.0 : 5.5) + onda + variacao + montinho;
      pontos.push({x, y: Math.max(3.5, y)});
    }

    function curvaCatmull(p0, p1, p2, p3) {
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      return `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    let path;
    if (tipo === "caixinha") {
      // Para as caixinhas a neve fica pendurada para baixo: a parte lisa fica
      // apoiada no topo do cartão e o recorte orgânico aparece na borda inferior.
      path = `M 0 0 L ${largura} 0 L ${largura} ${pontos[pontos.length - 1].y.toFixed(1)}`;
      for (let i = pontos.length - 1; i > 0; i--) {
        const p0 = pontos[Math.min(pontos.length - 1, i + 1)];
        const p1 = pontos[i];
        const p2 = pontos[i - 1];
        const p3 = pontos[Math.max(0, i - 2)];
        path += ` ${curvaCatmull(p0, p1, p2, p3)}`;
      }
      path += ` L 0 ${pontos[0].y.toFixed(1)} Z`;
    } else {
      path = `M 0 ${pontos[0].y.toFixed(1)}`;
      for (let i = 0; i < pontos.length - 1; i++) {
        const p0 = pontos[Math.max(0, i - 1)];
        const p1 = pontos[i];
        const p2 = pontos[i + 1];
        const p3 = pontos[Math.min(pontos.length - 1, i + 2)];
        path += ` ${curvaCatmull(p0, p1, p2, p3)}`;
      }
      path += ` L ${largura} ${altura} L 0 ${altura} Z`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.62" stop-color="#fbfeff"/><stop offset="1" stop-color="#e9f3f7"/></linearGradient></defs><path d="${path}" fill="url(#g)"/></svg>`;
    return `url("data:image/svg+xml;base64,${btoa(svg)}")`;
  }

  function aplicarNeveProcedural(root = document) {
    if (document.documentElement.dataset.caixaTheme !== "christmas") return;
    root.querySelectorAll(".item-list-row, .caixa-christmas-lights, .goal-card.caixinha-card").forEach((el) => {
      if (!el.dataset.snowProfile) {
        const tipo = el.matches(".goal-card.caixinha-card") ? "caixinha" : "card";
        el.style.setProperty("--snow-image", gerarPerfilNeve(tipo));
        el.dataset.snowProfile = "1";
      }

      // As caixinhas ganham uma camada própria de neve espessa e irregular,
      // sem depender do pseudo-elemento usado pelos demais cartões.
      if (el.matches(".goal-card.caixinha-card") && !el.querySelector(":scope > .caixa-christmas-snow-cap")) {
        const cap = document.createElement("span");
        cap.className = "caixa-christmas-snow-cap";
        cap.setAttribute("aria-hidden", "true");
        cap.style.backgroundImage = gerarPerfilNeve("caixinha");
        el.appendChild(cap);
      }
    });

    const hero = document.querySelector(".hero");
    if (hero && !hero.dataset.snowProfile) {
      hero.style.setProperty("--snow-image", gerarPerfilNeve("hero"));
      hero.dataset.snowProfile = "1";
    }
  }

  function renderTudo() {
    if (viewAtual === "categorias") renderCategorias();
    if (viewAtual === "ia") renderIA();
    if (viewAtual === "faturas") renderFaturas();
    if (viewAtual === "tema") renderTema();
    if (viewAtual === "admin") renderAdmin();
    if (viewAtual === "tema") renderTemas();
  }

  document.getElementById("btnAbrirConfiguracoes")?.addEventListener("click", abrir);
  close.addEventListener("click", () => {
    if (viewAtual !== "home") mostrarView("home");
    else fechar();
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });
  back.addEventListener("click", () => mostrarView("home"));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.classList.contains("is-hidden")) fechar(); });

  document.querySelectorAll("[data-config-view]").forEach(btn => {
    btn.addEventListener("click", () => mostrarView(btn.dataset.configView));
  });
  document.getElementById("btnNovaCategoria")?.addEventListener("click", novaCategoria);
  document.getElementById("btnNovaImersao")?.addEventListener("click", novaImersao);
  document.getElementById("btnSalvarConfigIA")?.addEventListener("click", salvarIA);
  document.getElementById("btnNovaFatura")?.addEventListener("click", novaFatura);
  document.getElementById("btnNovaCategoriaIcone")?.addEventListener("click", novaCategoriaIcone);
  document.getElementById("btnSalvarAdminTemas")?.addEventListener("click", salvarAdminTemas);
  document.querySelectorAll("[data-caixa-theme]").forEach(btn => btn.addEventListener("click", () => aplicarTemaCaixa(btn.dataset.caixaTheme)));
  faturaModal.salvar?.addEventListener("click", salvarFaturaModal);
  faturaModal.cancelar?.addEventListener("click", fecharModalFatura);
  faturaModal.fechar?.addEventListener("click", fecharModalFatura);
  faturaModal.backdrop?.addEventListener("click", e => { if (e.target === faturaModal.backdrop) fecharModalFatura(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && faturaModal.backdrop && !faturaModal.backdrop.classList.contains("is-hidden")) fecharModalFatura(); });
  document.addEventListener("caixa:perfil-trocado", () => {
    iaPessoa = state.pessoaAtual === "ambos" ? "ambos" : (state.pessoaAtual === "gabriel" ? "gabriel" : "davi");
    faturaPessoa = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
    if (viewAtual === "ia") renderIA();
    if (viewAtual === "faturas") renderFaturas();
    document.getElementById("caixaConfigAdminCard")?.classList.toggle("is-hidden", state.pessoaAtual !== "davi");
    if (viewAtual === "admin" && state.pessoaAtual !== "davi") mostrarView("home");
  });

  renderTemas();
  // Verifica a virada de período sem exigir que o usuário recarregue a página.
  window.setInterval(() => {
    const antes = temaAtivo();
    const depois = sincronizarTemaSazonal();
    if (antes !== depois) {
      atualizarCamadasTemas();
      renderTemas();
    }
  }, 60 * 1000);
  aplicarNeveProcedural();
  const caixaSnowObserver = new MutationObserver((mutacoes) => {
    const tema = document.documentElement.dataset.caixaTheme;
    if (tema !== "christmas" && tema !== "halloween") return;
    for (const mutacao of mutacoes) {
      mutacao.addedNodes?.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (tema === "christmas") aplicarNeveProcedural(node);
        if (tema === "halloween") aplicarSlimeHalloween(node);
      });
    }
  });
  caixaSnowObserver.observe(document.body, { childList: true, subtree: true });

  window.CAIXA_CONFIG = {
    abrir,
    fechar,
    mostrarView,
    renderCategorias,
    renderIA,
    renderFaturas,
    renderTemas,
    renderAdmin
  };
})();
