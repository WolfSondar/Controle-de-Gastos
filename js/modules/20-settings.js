// =====================================================================
// MÓDULO: 20-settings
// Configurações do usuário
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

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
    faturas: document.getElementById("caixaConfigFaturas"),
    tema: document.getElementById("caixaConfigTema"),
    admin: document.getElementById("caixaConfigAdmin"),
  };
  const titles = {
    home: "Configurações",
    categorias: "Categorias",
    faturas: "Faturas",
    tema: "Aparência",
    admin: "Admin",
  };

  let viewAtual = "home";
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
    overlay.removeAttribute("inert");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("caixa-config-open");
    document.getElementById("caixaConfigAdminCard")?.classList.toggle("is-hidden", !usuarioAtualEhAdmin());
    setTimeout(() => overlay.classList.remove("is-opening"), 30);
    mostrarView("home");
    renderTudo();
  }
  function fechar() {
    // O botão de fechar pode estar focado no instante em que o overlay é ocultado.
    // Primeiro devolvemos o foco ao botão que abriu as configurações.
    const trigger = document.getElementById("btnAbrirConfiguracoes");
    if (overlay.contains(document.activeElement)) {
      if (trigger && !trigger.classList.contains("is-hidden")) {
        trigger.focus({ preventScroll: true });
      } else {
        document.activeElement?.blur?.();
      }
    }
    overlay.classList.add("is-hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");
    document.body.classList.remove("caixa-config-open");
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
    if (nome === "faturas") renderFaturas();
    if (nome === "tema") renderTema();
    if (nome === "admin") {
      if (!usuarioAtualEhAdmin()) { mostrarView("home"); return; }
      renderAdmin();
    }
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
    const antigo = document.getElementById("caixaCategoriaCriacaoBackdrop");
    antigo?.remove();
    const backdrop = document.createElement("div");
    backdrop.id = "caixaCategoriaCriacaoBackdrop";
    backdrop.className = "caixa-categoria-criacao-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "caixaCategoriaCriacaoTitulo");
    backdrop.innerHTML = `
      <div class="caixa-categoria-criacao-card">
        <div class="caixa-categoria-criacao-kicker">Nova categoria</div>
        <h2 class="caixa-categoria-criacao-title" id="caixaCategoriaCriacaoTitulo">Como vamos chamar?</h2>
        <p class="caixa-categoria-criacao-sub">Escolha um nome e uma cor para identificar esta categoria nos seus lançamentos.</p>
        <div class="caixa-categoria-criacao-field">
          <label for="caixaCategoriaCriacaoNome">Nome</label>
          <input id="caixaCategoriaCriacaoNome" class="caixa-categoria-criacao-name" type="text" maxlength="50" autocomplete="off" placeholder="Ex.: Casa, Lazer, Estudos…">
        </div>
        <div class="caixa-categoria-criacao-field">
          <label for="caixaCategoriaCriacaoCor">Cor</label>
          <div class="caixa-categoria-criacao-color-row">
            <input id="caixaCategoriaCriacaoCor" class="caixa-categoria-criacao-color" type="color" value="#4a7866" aria-label="Cor da categoria">
            <div class="caixa-categoria-criacao-preview"><span class="caixa-categoria-criacao-preview-dot"></span><span id="caixaCategoriaCriacaoPreview">Sua categoria</span></div>
          </div>
        </div>
        <div class="caixa-categoria-criacao-actions">
          <button type="button" class="btn btn-secondary" id="caixaCategoriaCriacaoCancelar">Cancelar</button>
          <button type="button" class="btn btn-gold" id="caixaCategoriaCriacaoSalvar">Criar categoria</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
    const nomeInput = backdrop.querySelector("#caixaCategoriaCriacaoNome");
    const corInput = backdrop.querySelector("#caixaCategoriaCriacaoCor");
    const preview = backdrop.querySelector("#caixaCategoriaCriacaoPreview");
    const dot = backdrop.querySelector(".caixa-categoria-criacao-preview-dot");
    const fechar = () => {
      const ativo = document.activeElement;
      if (ativo && backdrop.contains(ativo)) ativo.blur();
      backdrop.remove();
    };
    const atualizarPreview = () => {
      const cor = /^#[0-9a-f]{6}$/i.test(corInput.value) ? corInput.value : "#4a7866";
      dot.style.background = cor;
      dot.style.boxShadow = `0 0 0 4px ${cor}22`;
      preview.textContent = nomeInput.value.trim() || "Sua categoria";
    };
    corInput.addEventListener("input", atualizarPreview);
    nomeInput.addEventListener("input", atualizarPreview);
    backdrop.addEventListener("click", e => { if (e.target === backdrop) fechar(); });
    backdrop.querySelector("#caixaCategoriaCriacaoCancelar").addEventListener("click", fechar);
    backdrop.querySelector("#caixaCategoriaCriacaoSalvar").addEventListener("click", async () => {
      const nomeLimpo = nomeInput.value.trim();
      if (!nomeLimpo) { nomeInput.focus(); showToast("Digite um nome para a categoria."); return; }
      const lista = categoriasLocais();
      if (lista.some(c => c.nome.toLocaleLowerCase("pt-BR") === nomeLimpo.toLocaleLowerCase("pt-BR"))) {
        nomeInput.focus();
        showToast("Essa categoria já existe.");
        return;
      }
      const cor = normalizarCategoria({nome:nomeLimpo, cor:corInput.value}).cor;
      const ok = await salvarCategorias([...lista, {nome:nomeLimpo, cor}]);
      if (ok) { fechar(); renderCategorias(); }
    });
    nomeInput.addEventListener("keydown", e => { if (e.key === "Enter") backdrop.querySelector("#caixaCategoriaCriacaoSalvar").click(); if (e.key === "Escape") fechar(); });
    corInput.addEventListener("keydown", e => { if (e.key === "Escape") fechar(); });
    atualizarPreview();
    requestAnimationFrame(() => nomeInput.focus());
  }

  function faturasPessoa() {
    return garantirFaturas().filter(f => String(f?.pessoa || "davi") === faturaPessoa);
  }
  function renderFaturas() {
    faturaPessoa = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
    document.getElementById("caixaConfigAdminCard")?.classList.toggle("is-hidden", !usuarioAtualEhAdmin());
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
    const calendario = metadadosTemaApp(id).seasonal;
    if (!regra || !calendario) return false;
    if (regra.forcarAgora === true) return true;
    const hoje = new Date();
    if (hoje.getMonth() + 1 !== Number(calendario.month)) return false;
    const dia = hoje.getDate();
    return dia >= Number(calendario.startDay) && dia <= Number(calendario.endDay);
  }
  function temaAtivo() {
    try { return localStorage.getItem("caixa-tema-estilo-v1") || "default"; } catch (_) { return "default"; }
  }
  function garantirCssTema(id) {
    window.CAIXA_TEMA_CORE?.aplicarEstilos?.(id);
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
    window.CAIXA_ATUALIZAR_COR_CHROME_TEMA?.();
    window.CAIXA_ATUALIZAR_ICONE_TEMA?.();
    window.CAIXA_ATUALIZAR_MUSICA_TEMA?.();
    return ativo;
  }
  function garantirEstiloNatalRefinado() {
    // O CSS do cenário natalino pertence a themes/christmas.css.
  }

  function atualizarCamadasTemas(ativo = document.documentElement.dataset.caixaTheme || "default") {
    garantirCssTema(ativo);
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
    renderVisaoGeral();
  }

  window.CAIXA_ATUALIZAR_CAMADAS_TEMAS = atualizarCamadasTemas;

  // API de compatibilidade para módulos e listeners antigos que ainda chamam
  // aplicarTemaCaixa() diretamente. A implementação continua centralizada
  // neste módulo, enquanto a atualização visual é delegada ao motor de temas.
  function aplicarTemaCaixa(id) {
    const ativo = sincronizarTemaSazonal();
    garantirCssTema(ativo);
    window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
    if (typeof renderVisaoGeral === "function") renderVisaoGeral();
    return ativo;
  }
  window.aplicarTemaCaixa = aplicarTemaCaixa;

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
    // O CSS do painel sazonal pertence a themes/admin-seasonal.css.
  }
  function encontrarRaizAdminSazonalidade() {
    return document.getElementById("caixaAdminForcarTemas");
  }

  function garantirCardAdminHalloween() {
    if (!usuarioAtualEhAdmin()) return;
    garantirEstiloAdminSazonalidade();
    const raiz = encontrarRaizAdminSazonalidade();
    if (!raiz) return;

    const temasForcaveis = [
      { id: "default", emoji: "☀️", titulo: "Padrão", subtitulo: "Volta ao visual original do Caixa.", acao: "Usar Padrão" },
      { id: "christmas", emoji: "🎄", titulo: "Natal", subtitulo: "Ativa o visual natalino imediatamente.", acao: "Forçar Natal" },
      { id: "halloween", emoji: "🎃", titulo: "Halloween", subtitulo: "Ativa o visual de Halloween imediatamente.", acao: "Forçar Halloween" }
    ];

    let wrap = document.getElementById("caixaAdminSazonalForcar");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "caixaAdminSazonalForcar";
      wrap.className = "caixa-admin-seasonal-force-wrap";
      raiz.appendChild(wrap);
    }

    const cfg = state.temasConfig || {};
    const ativoForcado = cfg.christmas?.forcarAgora ? "christmas" : (cfg.halloween?.forcarAgora ? "halloween" : "default");
    wrap.innerHTML = temasForcaveis.map(t => `
      <button type="button" class="caixa-admin-seasonal-card${ativoForcado === t.id ? " is-active" : ""}" data-caixa-seasonal-force-card="${t.id}" aria-pressed="${ativoForcado === t.id}">
        <span class="caixa-admin-seasonal-head">
          <span class="caixa-admin-seasonal-emoji" aria-hidden="true">${t.emoji}</span>
          <span class="caixa-admin-seasonal-copy"><span class="caixa-admin-seasonal-title">${t.titulo}</span><span class="caixa-admin-seasonal-sub">${t.subtitulo}</span></span>
          <span class="caixa-admin-seasonal-status" aria-hidden="true">${ativoForcado === t.id ? "✓" : ""}</span>
        </span>
        <span class="caixa-admin-seasonal-action">${ativoForcado === t.id ? "Ativo agora" : t.acao}</span>
      </button>`).join("");

    wrap.querySelectorAll("[data-caixa-seasonal-force-card]").forEach(card => {
      if (card.dataset.forceBound === "1") return;
      card.dataset.forceBound = "1";
      card.addEventListener("click", () => {
        const id = card.dataset.caixaSeasonalForceCard;
        const jaAtivo = card.classList.contains("is-active");
        salvarForcamentoTema(id, !jaAtivo).catch(() => {});
      });
    });
  }

  async function salvarForcamentoTema(id, forcar) {
    const atual = clone(state.temasConfig || {});
    const alvo = forcar ? id : "";
    atual.christmas = {...(atual.christmas || {}), forcarAgora: alvo === "christmas"};
    atual.halloween = {...(atual.halloween || {}), forcarAgora: alvo === "halloween"};
    state.temasConfig = atual;
    await salvarConfig({temasConfig: atual}, forcar ? `Tema ${id === "christmas" ? "Natal" : "Halloween"} forçado para todos.` : "Forçamento do tema removido.");
    const ativo = sincronizarTemaSazonal();
    garantirCssTema(ativo);
    window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
    renderVisaoGeral();
    // O tema forçado também é salvo no cache local imediatamente. Assim,
    // o próximo reload já abre no tema correto enquanto o Firebase responde.
    setCache(state.pessoaAtual, {
      ganhos: state.ganhos,
      gastosFixos: state.gastosFixos,
      gastosVariaveis: state.gastosVariaveis,
      caixinhas: state.caixinhas,
      saldoInicialConta: state.saldoInicialConta,
      saldoInicialBeneficio: state.saldoInicialBeneficio,
      categorias: state.categoriasConfig,
      iconCategorias: state.iconCategorias,
      iconNomes: state.iconNomes,
      temasConfig: state.temasConfig,
      temaAtivo: ativo,
      faturas: state.faturas,
      mesAtual: state.mesAtual,
      anoAtual: state.anoAtual
    }).catch(() => {});
    renderAdmin();
  }

  function renderAdmin() {
    if (!usuarioAtualEhAdmin()) return;
    renderAdminIcones();
    garantirCardAdminHalloween();
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
    btn.addEventListener("click", () => {
      const view = btn.dataset.configView;
      if (view === "admin" && !usuarioAtualEhAdmin()) return;
      mostrarView(view);
    });
  });
  document.getElementById("btnNovaCategoria")?.addEventListener("click", novaCategoria);
  document.getElementById("btnNovaFatura")?.addEventListener("click", novaFatura);
  document.getElementById("btnNovaCategoriaIcone")?.addEventListener("click", novaCategoriaIcone);
  document.querySelectorAll("[data-caixa-theme]").forEach(btn => btn.addEventListener("click", () => aplicarTemaCaixa(btn.dataset.caixaTheme)));
  faturaModal.salvar?.addEventListener("click", salvarFaturaModal);
  faturaModal.cancelar?.addEventListener("click", fecharModalFatura);
  faturaModal.fechar?.addEventListener("click", fecharModalFatura);
  faturaModal.backdrop?.addEventListener("click", e => { if (e.target === faturaModal.backdrop) fecharModalFatura(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && faturaModal.backdrop && !faturaModal.backdrop.classList.contains("is-hidden")) fecharModalFatura(); });
  document.addEventListener("caixa:perfil-trocado", () => {
    faturaPessoa = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
    if (viewAtual === "faturas") renderFaturas();
    document.getElementById("caixaConfigAdminCard")?.classList.toggle("is-hidden", !usuarioAtualEhAdmin());
    if (viewAtual === "admin" && !usuarioAtualEhAdmin()) mostrarView("home");
  });

  // O tema sazonal inicial só é decidido depois de carregar cache/Firebase.
  // Isso evita o efeito de "Padrão -> neve -> tema final" durante a abertura.
  // Verifica a virada de período sem exigir que o usuário recarregue a página.
  window.setInterval(() => {
    const antes = caixaTemaAtivoGlobal();
    const depois = sincronizarTemaSazonal();
    if (antes !== depois) {
      garantirCssTema(depois);
      renderTemas();
    }
    atualizarCamadasTemas();
  }, 60 * 1000);

  // O forçamento é uma configuração global. O Firebase usado pelo projeto
  // expõe GET/POST, não um listener realtime; por isso fazemos uma consulta
  // leve e frequente somente para detectar mudança em temasConfig. Assim um
  // usuário que já está com o app aberto recebe o tema sem precisar recarregar.
  let caixaTemaRemotoBusy = false;
  window.setInterval(async () => {
    if (window.CAIXA_CARREGAMENTO_INICIAL_TEMA) return;
    if (caixaTemaRemotoBusy || document.hidden || !navigator.onLine || !temBackendDados()) return;
    caixaTemaRemotoBusy = true;
    try {
      const res = await fetchApiGet({ pessoa: state.pessoaAtual });
      const data = await res.json();
      if (data?.ok === false || !data) return;
      const remoto = data.temasConfig || null;
      if (JSON.stringify(remoto) === JSON.stringify(state.temasConfig || null)) return;
      state.temasConfig = remoto;
      const antes = caixaTemaAtivoGlobal();
      const depois = sincronizarTemaSazonal();
      garantirCssTema(depois);
      if (antes !== depois) {
        renderTemas();
      }
      // Mesmo que o ID do tema não tenha mudado, a camada pode não existir
      // após um reload. Reaplicar aqui garante cenário + terreno + neve.
      garantirCssTema(depois);
      atualizarCamadasTemas();
      renderVisaoGeral();
    } catch (_) {
      // Uma falha pontual de rede não altera o tema atual.
    } finally {
      caixaTemaRemotoBusy = false;
    }
  }, 3000);
  aplicarNeveProcedural();
  const caixaSnowObserver = new MutationObserver((mutacoes) => {
    const tema = document.documentElement.dataset.caixaTheme;
    if (tema !== "christmas" && tema !== "halloween") return;
    for (const mutacao of mutacoes) {
      mutacao.addedNodes?.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (tema === "christmas") aplicarNeveProcedural(node);
        // Halloween não usa mais slime nos cards; o cenário/terreno é reaplicado pelo
        // controlador do tema quando necessário.
        // Halloween não deve redesenhar a interface a cada mutação do DOM.
        // Esse observer recebe as próprias mutações causadas por renderVisaoGeral(),
        // o que criava um ciclo infinito e travava a aplicação.
      });
    }
  });
  caixaSnowObserver.observe(document.body, { childList: true, subtree: true });

  window.CAIXA_CONFIG = {
    abrir,
    fechar,
    mostrarView,
    renderCategorias,
    renderFaturas,
    renderTemas,
    renderAdmin
  };
})();
