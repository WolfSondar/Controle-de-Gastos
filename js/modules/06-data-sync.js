// =====================================================================
// MÓDULO: 06-data-sync
// Carregamento, cache, salvamento e sincronização
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

async function carregarDados() {
  window.CAIXA_CARREGAMENTO_INICIAL_TEMA = true;
  if (window.CAIXA_FIREBASE_READY) await window.CAIXA_FIREBASE_READY.catch(() => null);
  if (!temBackendDados()) {
    setSyncState("error");
    showToast("Configure o Firebase antes de carregar os dados.");
    renderAll();
    window.CAIXA_CARREGAMENTO_INICIAL_TEMA = false;
    window.CAIXA_REVELAR_TEMA_BOOT?.();
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
    // O último tema visual fica em cache separado das regras sazonais.
    // Assim a abertura nunca precisa passar visualmente por Padrão.
    const temaCache = cache.temaAtivo || caixaTemaAtivoGlobal();
    if (["default", "christmas", "halloween"].includes(temaCache)) {
      try { localStorage.setItem("caixa-tema-estilo-v1", temaCache); } catch (_) {}
      document.documentElement.dataset.caixaTheme = temaCache;
      window.CAIXA_ATUALIZAR_COR_CHROME_TEMA?.();
      window.CAIXA_ATUALIZAR_MUSICA_TEMA?.();
      caixaGarantirCssTemaGlobal(temaCache);
      if (temaCache === "christmas" && typeof garantirEstiloNatalRefinado === "function") garantirEstiloNatalRefinado();
    }
    state.faturas = Array.isArray(cache.faturas) ? cache.faturas : state.faturas;
    // Em modo offline, o cache pode fornecer o último mês conhecido.
    // Online, não usamos esse valor: o mês será definido somente pelo Firebase.
    if (!navigator.onLine) {
      state.mesAtual = Number(cache.mesAtual) || null;
      state.anoAtual = Number(cache.anoAtual) || null;
      renderMesAtual();
    }
    state.loaded = true;
    // O cache é a primeira verdade visual da abertura. NÃO recalculamos a
    // sazonalidade aqui: as regras podem estar desatualizadas e isso causaria
    // justamente o efeito Padrão -> tema correto. Primeiro mostramos o último
    // tema completo conhecido; o Firebase decide silenciosamente o tema atual
    // logo depois.
    const temaDepoisCache = ["default", "christmas", "halloween"].includes(temaCache) ? temaCache : "default";
    document.documentElement.dataset.caixaTheme = temaDepoisCache;
    window.CAIXA_ATUALIZAR_COR_CHROME_TEMA?.();
    window.CAIXA_ATUALIZAR_MUSICA_TEMA?.();
    window.CAIXA_GARANTIR_CSS_TEMA?.(temaDepoisCache);
    popularSelectsDeCategoria();
    renderAll();
    window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
    renderVisaoGeral();
    // Alguns blocos da tela são recriados por renderAll/renderIncremental.
    // Reaplicamos as camadas no próximo frame para garantir que Natal/Halloween
    // já nasçam completos (emojis + neve/terreno), sem esperar navegação,
    // outro intervalo ou interação do usuário.
    requestAnimationFrame(() => {
      window.CAIXA_GARANTIR_CSS_TEMA?.(temaDepoisCache);
      window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
      requestAnimationFrame(() => {
        window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
        window.CAIXA_REVELAR_TEMA_BOOT?.();
      });
    });
  } else {
    renderSkeletons();
  }

  // Sem internet: nem tenta buscar — fica só no ícone de sem internet
  // (sem nenhuma animação de "tentando"), mostrando o que já tem em cache.
  if (!navigator.onLine) {
    setSyncState("offline");
    if (!cache) {
      window.CAIXA_REVELAR_TEMA_BOOT?.();
      showToast("Sem internet. Assim que conectar eu atualizo sozinho.");
    }
    window.CAIXA_CARREGAMENTO_INICIAL_TEMA = false;
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
    state.loaded = true;
    if (pessoaRequisitada === "ambos") {
      state.mesAtualDavi = Number(data.configDavi?.mesAtual) || null;
      state.anoAtualDavi = Number(data.configDavi?.anoAtual) || null;
      state.mesAtualGabriel = Number(data.configGabriel?.mesAtual) || null;
      state.anoAtualGabriel = Number(data.configGabriel?.anoAtual) || null;
      state.mesAtual = state.mesAtualDavi;
      state.anoAtual = state.anoAtualDavi;
    } else {
      state.mesAtual = Number(data.mesAtual) || null;
      state.anoAtual = Number(data.anoAtual) || null;
      if (pessoaRequisitada === "davi") { state.mesAtualDavi = state.mesAtual; state.anoAtualDavi = state.anoAtual; }
      if (pessoaRequisitada === "gabriel") { state.mesAtualGabriel = state.mesAtual; state.anoAtualGabriel = state.anoAtual; }
    }
    renderMesAtual();

    // Agora sim o Firebase é a fonte de verdade. Se o sazonal válido mudou
    // em relação ao cache, trocamos o tema uma única vez e salvamos o novo ID
    // no cache. Se não mudou, preservamos exatamente o que já foi mostrado.
    const temaAntesFirebase = caixaTemaAtivoGlobal();
    const temaDepois = window.CAIXA_SINCRONIZAR_TEMA_SAZONAL?.() || "default";
    window.CAIXA_GARANTIR_CSS_TEMA?.(temaDepois);
    setCache(pessoaRequisitada, {...data, temaAtivo: temaDepois});

    setSyncState("idle");
    if (Object.values(mudancas).some(Boolean) || temaAntesFirebase !== temaDepois) {
      renderIncremental(mudancas);
    } else {
      renderAll();
    }
    window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
    renderVisaoGeral();
    // Garante que, quando o Firebase confirmou o mesmo tema do cache, as
    // decorações não dependam de um segundo evento de UI para aparecer.
    requestAnimationFrame(() => {
      window.CAIXA_GARANTIR_CSS_TEMA?.(temaDepois);
      window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
      requestAnimationFrame(() => {
        window.CAIXA_ATUALIZAR_CAMADAS_TEMAS?.();
    window.CAIXA_ATUALIZAR_DECORACAO_POPUPS?.();
        window.CAIXA_REVELAR_TEMA_BOOT?.();
      });
    });
    window.CAIXA_CARREGAMENTO_INICIAL_TEMA = false;
    prefetchOutrasPessoas(pessoaRequisitada);
  } catch (err) {
    if (state.pessoaAtual !== pessoaRequisitada) return;
    // Caiu a conexão no meio da busca: mesmo tratamento calmo do offline
    // (sem ícone de erro em vermelho, que é pra falha de verdade).
    setSyncState(ehErroDeRede(err) || !navigator.onLine ? "offline" : "error");
    if (!cache) {
      if (String(err?.code || "").includes("permission-denied")) {
        showToast("O Firestore bloqueou o acesso. Publique o firestore.rules atualizado no Firebase.");
      } else if (err?.apiEndpointMissing || Number(err?.status) === 404) {
        showToast("O Firebase recusou a leitura. Confira a configuração do Firebase e tente novamente.");
      } else {
        showToast("Não consegui carregar os dados do Firebase agora. Tente novamente.");
      }
      renderAll();
    } else {
      showToast("Não consegui atualizar agora. Mostrando o último dado salvo.");
    }
    window.CAIXA_CARREGAMENTO_INICIAL_TEMA = false;
    window.CAIXA_REVELAR_TEMA_BOOT?.();
  }
}

function prefetchOutrasPessoas(pessoaJaCarregada) {
  const pessoas = Object.keys(PESSOA_LABEL).filter((p) => p !== pessoaJaCarregada && p !== "ambos");
  return Promise.all(pessoas.map(async (p) => {
    // O prefetch também precisa atualizar o cache. Se apenas reutilizarmos o
    // IndexedDB, a troca de perfil pode mostrar pagamentos antigos até um F5.
    try {
      if (!navigator.onLine) return await getCache(p);
      const res = await fetchApiGet({ pessoa: p });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.ok !== false) {
        await setCache(p, data);
        return data;
      }
    } catch (_) {}
    return await getCache(p);
  }));
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

function ehErroDeRede(err) {
  if (String(err?.code || "").includes("permission-denied")) return false;
  return err instanceof TypeError || String(err?.code || "").startsWith("unavailable");
}

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

