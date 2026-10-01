// =====================================================================
// MÓDULO: 16-feedback-and-month-close
// Feedback visual, fechamento de mês e confirmação
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

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
  if (!navigator.onLine) {
    showToast("É preciso estar conectado à internet para fechar o mês.");
    return;
  }
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
  const badgeAntes = document.getElementById("mesAtualBadge")?.textContent || "";
  if (periodo) {
    const valor = mes && ano ? `${MESES_LABEL[mes - 1]}/${ano}` : "Mês atual";
    const valorEl = periodo.querySelector("strong");
    if (valorEl) valorEl.textContent = valor;
    else periodo.textContent = valor;
  }
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
    } catch (_) {}
    await espera(900 + tentativa * 350);
  }
  return null;
}

async function fecharMesRequisicao(mes, ano, pessoa) {
  if (!navigator.onLine) {
    showToast("É preciso estar conectado à internet para fechar o mês.");
    return null;
  }
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
  }

  if (!navigator.onLine) {
    showToast("A conexão caiu. O mês não foi fechado.");
    return null;
  }
  await espera(900);
  if (!navigator.onLine) {
    showToast("A conexão caiu. O mês não foi fechado.");
    return null;
  }
  return await verificarFechamentoMes(mes, ano, pessoa, 10);
}

function animarFechamentoRapido(alvo, sucesso) {
  if (!alvo) return;
  alvo.classList.remove("fechar-mes-sucesso", "fechar-mes-erro");
  void alvo.offsetWidth;
  alvo.classList.add(sucesso ? "fechar-mes-sucesso" : "fechar-mes-erro");
  window.setTimeout(() => alvo.classList.remove("fechar-mes-sucesso", "fechar-mes-erro"), 700);
}


function criarConfetesFechamento() {
  const root = document.createElement("div");
  root.className = "fechamento-confetes";
  root.setAttribute("aria-hidden", "true");
  const cores = ["var(--gold)", "var(--income)", "var(--expense)", "var(--yield)"];
  for (let i = 0; i < 22; i++) {
    const p = document.createElement("i");
    p.style.setProperty("--x", `${(Math.random() * 180 - 90).toFixed(1)}px`);
    p.style.setProperty("--y", `${(-45 - Math.random() * 120).toFixed(1)}px`);
    p.style.setProperty("--r", `${Math.round(Math.random() * 360)}deg`);
    p.style.setProperty("--d", `${(Math.random() * .22).toFixed(2)}s`);
    p.style.background = cores[i % cores.length];
    root.appendChild(p);
  }
  document.body.appendChild(root);
  window.setTimeout(() => root.remove(), 1200);
}

function animarTrocaMesFechamento(anterior, novo) {
  const badge = document.getElementById("mesAtualBadge");
  criarConfetesFechamento();
  if (!badge || !novo) return;
  const antigo = anterior || badge.textContent;
  badge.textContent = antigo;
  badge.animate(
    [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }],
    { duration: 240, easing: "ease-in", fill: "forwards" }
  ).finished.then(() => {
    badge.textContent = novo;
    badge.animate(
      [{ opacity: 0, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
    );
  });
}

function fecharMesTemPassado() {
  if (!navigator.onLine || !state.mesAtual || !state.anoAtual || state.pessoaAtual === "ambos") return false;
  const agora = new Date();
  const cicloAtual = Number(state.anoAtual) * 12 + Number(state.mesAtual);
  const cicloReal = agora.getFullYear() * 12 + (agora.getMonth() + 1);
  return cicloReal > cicloAtual;
}

window.CAIXA_VERIFICAR_FECHAMENTO_AUTOMATICO = function () {
  if (!fecharMesTemPassado()) return;
  const chave = `caixa-fechamento-sugerido-v1:${state.pessoaAtual}:${state.anoAtual}-${state.mesAtual}:${new Date().toISOString().slice(0,10)}`;
  try { if (localStorage.getItem(chave) === "1") return; localStorage.setItem(chave, "1"); } catch (_) {}
  window.setTimeout(() => {
    if (state.pessoaAtual === "ambos" || !navigator.onLine || !fecharMesTemPassado()) return;
    abrirFecharMes();
    const texto = document.querySelector("#fecharMesBackdrop .fechar-mes-cabecalho-texto p");
    if (texto) texto.textContent = "O mês atual do sistema ficou para trás. Deseja fechá-lo agora?";
  }, 450);
};

on("formFecharMes", "submit", async (e) => {
  e.preventDefault();
  const mes = Number(state.mesAtual);
  const ano = Number(state.anoAtual);
  const badgeAntes = document.getElementById("mesAtualBadge")?.textContent || "";
  const pessoaFechamento = state.pessoaAtual;
  if (!navigator.onLine) {
    showToast("É preciso estar conectado à internet para fechar o mês.");
    return;
  }
  if (!mes || !ano || (pessoaFechamento !== "davi" && pessoaFechamento !== "gabriel")) {
    if (pessoaFechamento === "ambos") showToast("Juntos é somente leitura. Selecione Davi ou Gabriel para fechar o mês.");
    return;
  }

  const btnSubmit = document.getElementById("fecharMesSubmit");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Fechando…";
  }

  if (fecharMesBackdrop) fecharMesBackdrop.classList.add("is-hidden");
  const idxModalFecharMes = pilhaModais.lastIndexOf("fecharMesBackdrop");
  if (idxModalFecharMes !== -1) pilhaModais.splice(idxModalFecharMes, 1);
  esconderProcessando("fecharMesOverlay");

  // O fechamento agora tem somente um feedback curto no botão. Não existe
  // cena, narrativa, tela intermediária ou cerimônia.
  const resultado = await fecharMesRequisicao(mes, ano, pessoaFechamento);

  if (resultado) {
    const f = resultado.fechado;
    state.mesAtual = resultado.mesAtual;
    state.anoAtual = resultado.anoAtual;
    if (pessoaFechamento === "davi") { state.mesAtualDavi = state.mesAtual; state.anoAtualDavi = state.anoAtual; }
    if (pessoaFechamento === "gabriel") { state.mesAtualGabriel = state.mesAtual; state.anoAtualGabriel = state.anoAtual; }
    renderMesAtual();
    const badgeDepois = document.getElementById("mesAtualBadge")?.textContent || "";
    animarTrocaMesFechamento(badgeAntes, badgeDepois);

    await removerCache(pessoaFechamento);
    await removerCache("ambos");
    await removerCache("historico");

    animarFechamentoRapido(document.getElementById("mesAtualBadge"), true);
    if (typeof window.animarSyncFechamento === "function") window.animarSyncFechamento();
    showToast(`${MESES_LABEL[f.mes - 1]}/${f.ano} foi fechado para ${PESSOA_LABEL[pessoaFechamento]}.`);
    await carregarDados();
    // O fechamento acabou de criar/atualizar o registro histórico no backend.
    // Recarrega o histórico imediatamente para o novo mês aparecer sem refresh manual.
    if (typeof carregarHistorico === "function") await carregarHistorico();
  } else {
    animarFechamentoRapido(document.getElementById("mesAtualBadge"), false);
    showToast("Não consegui fechar o mês agora. Tenta de novo em instantes.");
  }

  if (btnSubmit) btnSubmit.disabled = false;
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

