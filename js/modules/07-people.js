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

  // Cada perfil possui seu próprio ciclo mensal. Ao trocar de pessoa,
  // primeiro trocamos o ponteiro visual para o mês já carregado daquele
  // perfil e só depois renderizamos os dados. Assim o cabeçalho nunca
  // mostra, por um instante, o mês do usuário anterior.
  if (pessoa === "davi") {
    state.mesAtual = Number(state.mesAtualDavi) || null;
    state.anoAtual = Number(state.anoAtualDavi) || null;
  } else if (pessoa === "gabriel") {
    state.mesAtual = Number(state.mesAtualGabriel) || null;
    state.anoAtual = Number(state.anoAtualGabriel) || null;
  }
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

  // Juntos precisa ter os dois perfis prontos desde a primeira abertura.
  // Pré-carrega ambos os caches em paralelo, sem exibir aviso de recarga.
  if (pessoa === "ambos") {
    const [cacheDavi, cacheGabriel] = await Promise.all([getCache("davi"), getCache("gabriel")]);
    if (state.pessoaAtual !== "ambos") return;
    if (cacheDavi && cacheGabriel) {
      state.dadosJuntos = { davi: cacheDavi, gabriel: cacheGabriel };
      state.ganhos = [...(cacheDavi.ganhos || []).map(i => ({ ...i, pessoa: "davi" })), ...(cacheGabriel.ganhos || []).map(i => ({ ...i, pessoa: "gabriel" }))];
      state.gastosFixos = [...(cacheDavi.gastosFixos || []).map(i => ({ ...i, pessoa: "davi" })), ...(cacheGabriel.gastosFixos || []).map(i => ({ ...i, pessoa: "gabriel" }))];
      state.gastosVariaveis = [...(cacheDavi.gastosVariaveis || []).map(i => ({ ...i, pessoa: "davi" })), ...(cacheGabriel.gastosVariaveis || []).map(i => ({ ...i, pessoa: "gabriel" }))];
      state.caixinhas = [...(cacheDavi.caixinhas || []).map(i => ({ ...i, pessoa: "davi" })), ...(cacheGabriel.caixinhas || []).map(i => ({ ...i, pessoa: "gabriel" }))];
      state.faturas = [...(cacheDavi.faturas || []).map(i => ({ ...i, pessoa: "davi" })), ...(cacheGabriel.faturas || []).map(i => ({ ...i, pessoa: "gabriel" }))];
      state.loaded = true;
      renderIncremental({ ganhos: true, gastosFixos: true, gastosVariaveis: true, caixinhas: true });
      renderJuntosView();
      renderHistorico();
      return;
    }
    if (navigator.onLine) {
      try {
        const [resDavi, resGabriel] = await Promise.all([fetchApiGet({ pessoa: "davi" }), fetchApiGet({ pessoa: "gabriel" })]);
        const [dataDavi, dataGabriel] = await Promise.all([resDavi.json(), resGabriel.json()]);
        if (state.pessoaAtual !== "ambos") return;
        if (dataDavi?.ok !== false && dataGabriel?.ok !== false) {
          state.dadosJuntos = { davi: dataDavi, gabriel: dataGabriel };
          state.ganhos = [...(dataDavi.ganhos || []).map(i => ({ ...i, pessoa: "davi" })), ...(dataGabriel.ganhos || []).map(i => ({ ...i, pessoa: "gabriel" }))];
          state.gastosFixos = [...(dataDavi.gastosFixos || []).map(i => ({ ...i, pessoa: "davi" })), ...(dataGabriel.gastosFixos || []).map(i => ({ ...i, pessoa: "gabriel" }))];
          state.gastosVariaveis = [...(dataDavi.gastosVariaveis || []).map(i => ({ ...i, pessoa: "davi" })), ...(dataGabriel.gastosVariaveis || []).map(i => ({ ...i, pessoa: "gabriel" }))];
          state.caixinhas = [...(dataDavi.caixinhas || []).map(i => ({ ...i, pessoa: "davi" })), ...(dataGabriel.caixinhas || []).map(i => ({ ...i, pessoa: "gabriel" }))];
          state.faturas = [...(dataDavi.faturas || []).map(i => ({ ...i, pessoa: "davi" })), ...(dataGabriel.faturas || []).map(i => ({ ...i, pessoa: "gabriel" }))];
          await Promise.all([setCache("davi", dataDavi), setCache("gabriel", dataGabriel)]);
          state.loaded = true;
          renderJuntosView();
          renderHistorico();
          return;
        }
      } catch (err) { /* mantém a tela disponível para nova tentativa de rede */ }
    }
    showToast("Não foi possível carregar os dois perfis sem conexão. Tente novamente quando estiver online.");
    return;
  }

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
    state.faturas = Array.isArray(cache.faturas) ? cache.faturas : state.faturas;
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

    // O mês é uma propriedade individual do perfil no Firebase. Mesmo com
    // cache de lançamentos, se ainda não temos o mês/ano desse perfil em
    // memória, buscamos a configuração do próprio perfil. Isso impede que
    // Gabriel herde visualmente o mês do Davi (e vice-versa).
    const mesPerfilCarregado = pessoa === "davi"
      ? Number(state.mesAtualDavi) > 0 && Number(state.anoAtualDavi) > 0
      : Number(state.mesAtualGabriel) > 0 && Number(state.anoAtualGabriel) > 0;
    if (!mesPerfilCarregado && navigator.onLine) {
      try {
        const res = await fetchApiGet({ pessoa });
        const data = await res.json();
        if (data && data.ok !== false && state.pessoaAtual === pessoa) {
          state.mesAtual = Number(data.mesAtual) || null;
          state.anoAtual = Number(data.anoAtual) || null;
          if (pessoa === "davi") { state.mesAtualDavi = state.mesAtual; state.anoAtualDavi = state.anoAtual; }
          if (pessoa === "gabriel") { state.mesAtualGabriel = state.mesAtual; state.anoAtualGabriel = state.anoAtual; }
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
    faturas: state.faturas,
    faturaCreditos: state.faturaCreditos,
    temasConfig: state.temasConfig,
  });
}

// Créditos de fatura ficam na configuração global do usuário, não em um perfil.
// Mantemos também o cache do outro perfil atualizado para que uma abertura
// posterior sem internet não recupere uma lista antiga de reembolsos.
async function sincronizarCacheCreditosFatura() {
  if (isAmbos()) return;
  const outraPessoa = state.pessoaAtual === "gabriel" ? "davi" : "gabriel";
  try {
    const cache = await getCache(outraPessoa);
    if (cache) await setCache(outraPessoa, { ...cache, faturaCreditos: state.faturaCreditos || [] });
  } catch (_) {}
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

