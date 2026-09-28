// =====================================================================
// MÓDULO: 01-caixinha-icons
// Ícones, busca, cache e picker das caixinhas
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

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

