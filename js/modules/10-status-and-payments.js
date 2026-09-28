// =====================================================================
// MÓDULO: 10-status-and-payments
// Status de gastos/ganhos e animações de pagamento
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

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

