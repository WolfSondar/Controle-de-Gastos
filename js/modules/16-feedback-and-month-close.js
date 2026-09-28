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

