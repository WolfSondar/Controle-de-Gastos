// =====================================================================
// MÓDULO: 12-caixinhas-render
// Renderização das caixinhas e componentes relacionados
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

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
  return nome.replace(/^(?:Fatura|Benef[ií]cio):\s*/i, "").trim();
}

function nomeInternoFatura(nome) {
  const limpo = nomeExibicaoItem(nome);
  return limpo ? `Fatura: ${limpo}` : limpo;
}

function nomeInternoBeneficio(nome) {
  const limpo = nomeExibicaoItem(nome);
  return limpo ? `Benefício: ${limpo}` : limpo;
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
    const cfgFatura = faturaPorId(item.faturaId);
    const nomeFaturaTag = cfgFatura?.nome || "Fatura";
    const diaFaturaTag = Number(cfgFatura?.dia) || 1;
    const nomeBanco = String(nomeFaturaTag).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const classeBanco = nomeBanco.includes("nubank") ? "fatura-nubank" : nomeBanco.includes("itau") ? "fatura-itau" : nomeBanco.includes("mercado pago") || nomeBanco.includes("mercadopago") ? "fatura-mercadopago" : nomeBanco.includes("bradesco") ? "fatura-bradesco" : "fatura-personalizada";
    partes.push(`<span class="item-tag item-tag-fatura ${classeBanco}" title="${escapeHtml(nomeFaturaTag)} · vencimento dia ${diaFaturaTag}">${escapeHtml(nomeFaturaTag)}</span>`);
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

const LARGURA_ACOES_SWIPE = 92;
const LIMIAR_ABRIR_SWIPE = 44;

function fecharTodosSwipes(ul, exceto) {
  ul.querySelectorAll(".item-list-row.is-swiped").forEach((li) => {
    if (li !== exceto) fecharSwipe(li);
  });
}

// Swipe horizontal dos lançamentos: esquerda edita; direita solicita exclusão
// com a confirmação existente. O card retorna ao lugar antes da ação.
function habilitarSwipe(ul) {
  if (!ul || ul._swipeAtivado) return;
  ul._swipeAtivado = true;
  let ativo = null;

  const iniciar = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const li = e.target.closest(".item-list-row");
    if (!li || e.target.closest(".swipe-actions") || e.target.closest("button, input, label")) return;
    fecharTodosSwipes(ul, li);
    ativo = { li, pointerId:e.pointerId, startX:e.clientX, startY:e.clientY, dragging:false, dx:0 };
  };
  const mover = (e) => {
    if (!ativo || e.pointerId !== ativo.pointerId) return;
    const dx=e.clientX-ativo.startX, dy=e.clientY-ativo.startY;
    if (!ativo.dragging) {
      if (Math.abs(dx)<8 && Math.abs(dy)<8) return;
      if (Math.abs(dy)>Math.abs(dx)) { ativo=null; return; }
      ativo.dragging=true;
      try { ativo.li.setPointerCapture(e.pointerId); } catch (_) {}
    }
    if (e.cancelable) e.preventDefault();
    ativo.dx=dx;
    const content=ativo.li.querySelector(".swipe-content");
    if (content) {
      content.style.transition="none";
      content.style.transform=`translateX(${Math.max(-98,Math.min(98,dx))}px)`;
    }
  };
  const finalizar = (e) => {
    if (!ativo || (e?.pointerId !== undefined && e.pointerId !== ativo.pointerId)) return;
    const atual=ativo; ativo=null;
    const content=atual.li.querySelector(".swipe-content");
    if (content) { content.style.transition=""; content.style.transform=""; }
    atual.li.classList.remove("is-swiped");
    if (!atual.dragging || Math.abs(atual.dx)<52) return;
    if (e?.cancelable) e.preventDefault();
    const botao=atual.li.querySelector(atual.dx<0 ? ".swipe-edit" : ".swipe-delete");
    if (botao) botao.click();
  };
  const cancelar = (e) => {
    if (!ativo || (e?.pointerId !== undefined && e.pointerId !== ativo.pointerId)) return;
    fecharSwipe(ativo.li); ativo=null;
  };
  ul.addEventListener("pointerdown", iniciar);
  ul.addEventListener("pointermove", mover, {passive:false});
  ul.addEventListener("pointerup", finalizar);
  ul.addEventListener("pointercancel", cancelar);
}

document.addEventListener("pointerdown", (e) => {
  document.querySelectorAll(".item-list").forEach((ul) => {
    // Alguns .item-list não possuem id. Nunca passe "#" vazio ao closest(),
    // pois isso lança SyntaxError e interrompe o restante do app.
    if (!ul.contains(e.target)) fecharTodosSwipes(ul);
  });
});

// Fecha swipes ao tocar fora da lista:
document.addEventListener("pointerdown", (e) => {
  document.querySelectorAll(".item-list").forEach((ul) => {
    // Alguns .item-list não possuem id. Evita o seletor inválido "#".
    if (!ul.contains(e.target)) fecharTodosSwipes(ul);
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
    .filter(({ item }) => !lancamentoEhOculto(item) && item[statusKey] !== true)
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
          <li class="item-list-row is-pendente pendente-destaque-row ${tipo === "income" ? `lancamento-ganho ${ganhoEhBeneficio(item) ? "ganho-beneficio" : "ganho-saldo"}` : `lancamento-gasto ${variavelEhBeneficio(item) ? "gasto-beneficio" : "gasto-saldo"}`}" data-idx="${idx}" style="animation-delay:${Math.min(posicao * 35, 250)}ms">
            ${ambos ? "" : `<div class="swipe-actions">
              <button class="swipe-btn swipe-edit" aria-label="Editar" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_LAPIS}</span><span>Editar</span></button>
              <button class="swipe-btn swipe-delete" aria-label="Excluir" data-idx="${idx}"><span class="swipe-btn-icon">${ICONE_X}</span><span>Excluir</span></button>
            </div>`}
            <div class="swipe-content">
              <span class="item-nome">${nomeComParcela(item)}${parcelaInlineHtml(item, tipo)} ${tagPessoa(item)}</span>
              <span class="item-valor ${tipo}${tipo === "income" && ganhoEhBeneficio(item) ? " income-beneficio" : tipo === "expense" && variavelEhBeneficio(item) ? " expense-beneficio" : ""}">${fmt(item.valor)}</span>
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
    .filter(({ item }) => !lancamentoEhOculto(item) && item[statusKey] === true)
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
    li.className = "item-list-row" + (on ? "" : " is-pendente") + (tipo === "income" ? ` lancamento-ganho ${ganhoEhBeneficio(item) ? "ganho-beneficio" : "ganho-saldo"}` : ` lancamento-gasto ${variavelEhBeneficio(item) ? "gasto-beneficio" : "gasto-saldo"}`);
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
        <span class="item-valor ${tipo}${tipo === "income" && ganhoEhBeneficio(item) ? " income-beneficio" : tipo === "expense" && variavelEhBeneficio(item) ? " expense-beneficio" : ""}">${fmt(item.valor)}</span>
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
  li.style.setProperty("--delete-card-height", `${li.getBoundingClientRect().height}px`);
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

