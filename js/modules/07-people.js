// =====================================================================
// MÓDULO: 07-people
// Troca de pessoa e operações de listas
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

// ---------------------------------------------------------------------
// SELETOR DE PESSOA
// ---------------------------------------------------------------------
async function trocarPessoa(pessoa) {
  if (pessoa === state.pessoaAtual) return;

  const pessoaAnterior = state.pessoaAtual;
  state.pessoaAtual = pessoa;
  localStorage.setItem(PESSOA_STORAGE_KEY, pessoa);

  if (pessoa === "davi") {
    state.mesAtual = Number(state.mesAtualDavi) || null;
    state.anoAtual = Number(state.anoAtualDavi) || null;
  } else if (pessoa === "gabriel") {
    state.mesAtual = Number(state.mesAtualGabriel) || null;
    state.anoAtual = Number(state.anoAtualGabriel) || null;
  }

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
  if (state.pessoaAtual !== pessoa) return;

  // O cache serve apenas para a troca não ficar vazia. Online, o Firebase é
  // sempre consultado novamente para impedir que pagamentos feitos no banco
  // enquanto o sistema estava aberto fiquem presos na tela antiga.
  if (cache) {
    state.ganhos = cache.ganhos || [];
    state.gastosFixos = cache.gastosFixos || [];
    state.gastosVariaveis = cache.gastosVariaveis || [];
    state.caixinhas = cache.caixinhas || [];
    state.saldoInicialConta = Number(cache.saldoInicialConta) || 0;
    state.saldoInicialBeneficio = Number(cache.saldoInicialBeneficio) || 0;
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
    renderMesAtual();
  }

  if (navigator.onLine && temBackendDados()) {
    setSyncState("syncing");
    try {
      const res = await fetchApiGet({ pessoa });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.ok !== false && state.pessoaAtual === pessoa) {
        const mudancas = {
          ganhos: colecaoMudou(state.ganhos, data.ganhos || []),
          gastosFixos: colecaoMudou(state.gastosFixos, data.gastosFixos || []),
          gastosVariaveis: colecaoMudou(state.gastosVariaveis, data.gastosVariaveis || []),
          caixinhas: colecaoMudou(state.caixinhas, data.caixinhas || []),
          categoriasConfig: colecaoMudou(state.categoriasConfig || [], data.categorias || []),
          iconCategorias: colecaoMudou(state.iconCategorias || [], data.iconCategorias || []),
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
        state.faturas = Array.isArray(data.faturas) ? data.faturas : [];
        state.mesAtual = Number(data.mesAtual) || null;
        state.anoAtual = Number(data.anoAtual) || null;
        if (pessoa === "davi") { state.mesAtualDavi = state.mesAtual; state.anoAtualDavi = state.anoAtual; }
        if (pessoa === "gabriel") { state.mesAtualGabriel = state.mesAtual; state.anoAtualGabriel = state.anoAtual; }
        state.loaded = true;
        setCache(pessoa, data);
        popularSelectsDeCategoria();
        renderMesAtual();
        renderIncremental({ ...mudancas, temasConfig: true, faturas: true });
        setSyncState("idle");
      } else {
        setSyncState("error");
      }
    } catch (err) {
      setSyncState(ehErroDeRede(err) || !navigator.onLine ? "offline" : "error");
      if (!cache) showToast("Não consegui atualizar este perfil agora.");
    }
  } else if (!cache) {
    showToast("Este perfil ainda não foi carregado e você está sem internet.");
  }

  if (state.pessoaAtual !== pessoa) return;
  renderHistorico();
  renderAll();
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

