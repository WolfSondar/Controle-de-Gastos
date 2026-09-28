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

