// =====================================================================
// MÓDULO: 15-history
// Histórico e visualizações históricas
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

// ---------------------------------------------------------------------
// HISTÓRICO — Melhorias Implementadas
// ---------------------------------------------------------------------

async function getCacheHistorico() { return idbGet(IDB_LOJA_CACHE, CACHE_PREFIX + "historico"); }
async function setCacheHistorico(data) { return idbSet(IDB_LOJA_CACHE, CACHE_PREFIX + "historico", { anos: data.anos || [] }); }

async function carregarHistorico() {
  if (window.CAIXA_FIREBASE_READY) await window.CAIXA_FIREBASE_READY.catch(() => null);
  const cache = await getCacheHistorico();
  if (cache) {
    state.historico = cache;
    renderHistorico();
  } else {
    renderHistoricoSkeleton();
  }
  if (!temBackendDados()) return;
  try {
    const res = await fetchApiGet({ pessoa: "historico" });
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.error || "Erro desconhecido");
    state.historico = data;
    // O histórico agora também carrega os dois meses atuais, mas não deve
    // sobrescrever o mês do perfil que está aberto na tela.
    setCacheHistorico(data);
    renderHistorico();
  } catch (err) {
    if (!cache) {
      const wrap = document.getElementById("historicoLista");
      if (wrap) wrap.innerHTML = `<p class="empty-state">Não consegui carregar o histórico agora.</p>`;
    }
  }
}

function renderHistoricoSkeleton() {
  const wrap = document.getElementById("historicoLista");
  if (!wrap) return;
  wrap.innerHTML = Array.from({ length: 2 }).map(() => `
      <div class="historico-mes-card">
        <div class="skeleton" style="width:40%;height:16px;margin-bottom:12px;">.</div>
        <div class="skeleton" style="width:100%;height:13px;margin-bottom:8px;">.</div>
        <div class="skeleton" style="width:100%;height:13px;">.</div>
      </div>`).join("");
}

// Novo Gráfico com Faixas Verticais (Resolve sobreposição de pontos)
function construirGraficoHistoricoMultiSvg(mesesAsc, pessoa) {
  const W = 320, H = 190, padL = 14, padR = 14, padT = 18, padB = 30;

  const getVal = (m, campo) => {
    const valorPessoa = (sufixo) => {
      if (campo === "guardadoMes") {
        // O histórico já teve duas grafias para o mesmo campo mensal.
        // Alguns registros podem conter uma delas como 0 e a outra com o valor real.
        // Use o maior valor mensal disponível entre as grafias conhecidas.
        const candidatos = [
          m[`guardadoMes${sufixo}`],
          m[`guardado${sufixo}Mes`]
        ].map(Number).filter(Number.isFinite).map(v => Math.max(0, v));
        return candidatos.length ? Math.max(...candidatos) : 0;
      }
      const atual = Number(m[`${campo}${sufixo}`]);
      return Number.isFinite(atual) ? atual : 0;
    };
    if (pessoa === 'ambos') return valorPessoa("Davi") + valorPessoa("Gabriel");
    const sufixo = pessoa.charAt(0).toUpperCase() + pessoa.slice(1);
    return valorPessoa(sufixo);
  };

  const ptsGanhos = mesesAsc.map(m => getVal(m, 'ganhos'));
  const ptsDebitos = mesesAsc.map(m => getVal(m, 'debitos'));
  const ptsGuardado = mesesAsc.map(m => getVal(m, 'guardadoMes'));
  const ptsRendimento = mesesAsc.map(m => getVal(m, 'rendimento'));

  const todos = [...ptsGanhos, ...ptsDebitos, ...ptsGuardado, ...ptsRendimento];
  let min = Math.min(0, ...todos);
  let max = Math.max(0, ...todos);
  if (min === max) max = min + 1;

  const amplitude = max - min;
  min -= amplitude * 0.05;
  max += amplitude * 0.15; 

  const n = mesesAsc.length;
  const passoX = n > 1 ? (W - padL - padR) / (n - 1) : 0;
  const x = (i) => n === 1 ? W / 2 : padL + i * passoX;
  const y = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));

  const caminhoSuave = (pts) => {
    if (pts.length === 0) return "";
    let d = `M${x(0).toFixed(1)},${y(pts[0]).toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cpX = (x(i) + x(i + 1)) / 2;
      d += ` C${cpX.toFixed(1)},${y(pts[i]).toFixed(1)} ${cpX.toFixed(1)},${y(pts[i + 1]).toFixed(1)} ${x(i + 1).toFixed(1)},${y(pts[i + 1]).toFixed(1)}`;
    }
    return d;
  };

  // Largura da área de toque/hover de cada mês
  const larguraFaixa = passoX > 0 ? passoX : W;

  // Cria as faixas verticais e agrupa os 3 pontos de cada mês juntos
  const gruposMes = mesesAsc.map((m, i) => {
    const nomeMes = m.nome.charAt(0).toUpperCase() + m.nome.slice(1).toLowerCase();
    const vGanhos = getVal(m, 'ganhos');
    const vGastos = getVal(m, 'debitos');
    const vGuardado = getVal(m, 'guardadoMes');
    const vRendimento = getVal(m, 'rendimento');
    const cx = x(i).toFixed(1);
    
    // Calcula o início do retângulo invisível para centralizar no ponto
    const rx = (x(i) - larguraFaixa / 2).toFixed(1);

    return `
      <g class="mes-hover-group" data-mes="${nomeMes}" data-ganhos="${fmt(vGanhos)}" data-gastos="${fmt(vGastos)}" data-guardado="${fmt(vGuardado)}" data-rendimento="${fmt(vRendimento)}">
        <!-- Área gigante e invisível para capturar o dedo/mouse -->
        <rect x="${rx}" y="0" width="${larguraFaixa}" height="${H}" fill="transparent" class="hover-area" />
        
        <!-- Linha guia vertical charmosa -->
        <line x1="${cx}" y1="${padT}" x2="${cx}" y2="${H - padB - 4}" stroke="var(--line)" stroke-dasharray="4,4" class="guia-vertical" />
        
        <!-- Os 4 pontos sobrepostos -->
        <circle cx="${cx}" cy="${y(vGanhos).toFixed(1)}" r="4.2" fill="var(--income)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
        <circle cx="${cx}" cy="${y(vGastos).toFixed(1)}" r="4.2" fill="var(--expense)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
        <circle cx="${cx}" cy="${y(vGuardado).toFixed(1)}" r="4.2" fill="var(--gold)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
        <circle cx="${cx}" cy="${y(vRendimento).toFixed(1)}" r="4.2" fill="var(--yield)" stroke="var(--paper-deep)" stroke-width="2" class="ponto-dot" />
      </g>
    `;
  }).join("");

  // No modo "Todos os anos" cada ponto é um ano (ex: "2025"), não um mês —
  // nesse caso mostra o ano inteiro no eixo, sem truncar pros 3 primeiros
  // caracteres como faz com o nome do mês (senão "2025" virava "202").
  const rotulos = mesesAsc.map((m, i) => {
    const nomeCru = m.nome || "";
    const rotulo = /^\d{4}$/.test(nomeCru) ? nomeCru : nomeCru.slice(0, 3).toUpperCase();
    return `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="9" text-anchor="middle" font-family="var(--font-mono)" font-weight="600" fill="var(--muted)">${escapeHtml(rotulo)}</text>`;
  }).join("");
  const linhaZero = y(0).toFixed(1);

  return `
    <div class="historico-grafico-wrap">
      <svg class="historico-grafico" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line x1="${padL}" y1="${linhaZero}" x2="${W - padR}" y2="${linhaZero}" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="4,4" />
        
        <path d="${caminhoSuave(ptsGanhos)}" fill="none" stroke="var(--income)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="${caminhoSuave(ptsDebitos)}" fill="none" stroke="var(--expense)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="${caminhoSuave(ptsGuardado)}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6,4" />
        <path d="${caminhoSuave(ptsRendimento)}" fill="none" stroke="var(--yield)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2,3" />
        
        <!-- Renderiza as áreas de interação POR CIMA das linhas -->
        ${gruposMes}
        ${rotulos}
      </svg>
      <div class="historico-grafico-legenda">
        <span class="legenda-item"><span class="legenda-dot" style="background:var(--income)"></span>Ganhos</span>
        <span class="legenda-item"><span class="legenda-dot" style="background:var(--expense)"></span>Gastos</span>
        <span class="legenda-item"><span class="legenda-dot" style="background:var(--gold)"></span>Guardado</span>
        <span class="legenda-item"><span class="legenda-dot" style="background:var(--yield)"></span>Rendimento</span>
      </div>
    </div>`;
}

function renderHistorico() {
  const wrap = document.getElementById("historicoLista");
  const controles = document.getElementById("historicoControles");
  const selectAno = document.getElementById("historicoAnoSelect");
  if (!wrap) return;

  const anos = (state.historico && state.historico.anos) || [];
  if (anos.length === 0) {
    if (controles) controles.style.display = "none";
    wrap.innerHTML = estadoVazio('Nenhum mês fechado ainda.', ICONE_LIVRO);
    return;
  }

  if (controles) controles.style.display = "block";

  if (selectAno && selectAno.options.length !== anos.length + 1) {
    selectAno.innerHTML = "";
    const optTodos = document.createElement("option");
    optTodos.value = "todos";
    optTodos.textContent = "Todos os anos";
    selectAno.appendChild(optTodos);
    [...anos].sort((a, b) => b.ano - a.ano).forEach(bloco => {
      const opt = document.createElement("option");
      opt.value = bloco.ano;
      opt.textContent = `Ano ${bloco.ano}`;
      selectAno.appendChild(opt);
    });
  }

  let anoAlvo = state.historicoAnoSelecionado;
  if (anoAlvo !== "todos" && !anos.find(a => a.ano === anoAlvo)) {
    anoAlvo = anos[0].ano;
    state.historicoAnoSelecionado = anoAlvo;
  }
  if (selectAno) selectAno.value = anoAlvo;

  const modoTodos = anoAlvo === "todos";
  if (!modoTodos && !anos.find(a => a.ano === anoAlvo)) return;

  const pessoa = state.pessoaAtual;
  const getVal = (m, campo) => {
    const valorPessoa = (sufixo) => {
      if (campo === "guardadoMes") {
        // O histórico já teve duas grafias para o mesmo campo mensal.
        // Alguns registros podem conter uma delas como 0 e a outra com o valor real.
        // Use o maior valor mensal disponível entre as grafias conhecidas.
        const candidatos = [
          m[`guardadoMes${sufixo}`],
          m[`guardado${sufixo}Mes`]
        ].map(Number).filter(Number.isFinite).map(v => Math.max(0, v));
        return candidatos.length ? Math.max(...candidatos) : 0;
      }
      const atual = Number(m[`${campo}${sufixo}`]);
      return Number.isFinite(atual) ? atual : 0;
    };
    if (pessoa === 'ambos') return valorPessoa("Davi") + valorPessoa("Gabriel");
    const sufixo = pessoa.charAt(0).toUpperCase() + pessoa.slice(1);
    return valorPessoa(sufixo);
  };

  const paginaAnterior = paginaCarrosselAtiva("historicoGraficosCarousel");

  // Novo: Inclusão dos campos de rendimento para calcular "Todos os anos" perfeitamente
  const camposSoma = ["ganhosDavi", "ganhosGabriel", "debitosDavi", "debitosGabriel", "guardadoMesDavi", "guardadoMesGabriel", "saldoDavi", "saldoGabriel", "rendimentoDavi", "rendimentoGabriel"];
  
  const agregarAnoComoRegistro = (bloco) => {
    const registro = { nome: String(bloco.ano), mes: bloco.ano };
    camposSoma.forEach((c) => { registro[c] = 0; });
    bloco.meses.forEach((m) => {
      registro.ganhosDavi += Number(m.ganhosDavi) || 0;
      registro.ganhosGabriel += Number(m.ganhosGabriel) || 0;
      registro.debitosDavi += Number(m.debitosDavi) || 0;
      registro.debitosGabriel += Number(m.debitosGabriel) || 0;
      registro.saldoDavi += Number(m.saldoDavi) || 0;
      registro.saldoGabriel += Number(m.saldoGabriel) || 0;
      registro.rendimentoDavi += Number(m.rendimentoDavi) || 0;
      registro.rendimentoGabriel += Number(m.rendimentoGabriel) || 0;
      // Usa a mesma normalização dos meses individuais para não perder
      // históricos antigos que usam guardadoDaviMes/GabrielMes.
      const gd = Math.max(Number(m.guardadoMesDavi) || 0, Number(m.guardadoDaviMes) || 0);
      const gg = Math.max(Number(m.guardadoMesGabriel) || 0, Number(m.guardadoGabrielMes) || 0);
      registro.guardadoMesDavi += gd;
      registro.guardadoMesGabriel += gg;
    });
    return registro;
  };

  let mesesAscendentes, mesesOrdenados, mesesParaCategorias;
  if (modoTodos) {
    const registrosPorAno = [...anos].sort((a, b) => a.ano - b.ano).map(agregarAnoComoRegistro);
    mesesAscendentes = registrosPorAno;
    mesesOrdenados = [...registrosPorAno].sort((a, b) => b.mes - a.mes);
    mesesParaCategorias = anos.flatMap((a) => a.meses);
  } else {
    const bloco = anos.find(a => a.ano === anoAlvo);
    mesesAscendentes = [...bloco.meses].sort((a, b) => a.mes - b.mes);
    mesesOrdenados = [...bloco.meses].sort((a, b) => b.mes - a.mes);
    mesesParaCategorias = bloco.meses;
  }

  const grafico = construirGraficoHistoricoMultiSvg(mesesAscendentes, pessoa);
  const paginaCategorias = construirPaginaCategoriasHistorico(mesesParaCategorias, pessoa, modoTodos ? "todos" : anoAlvo);

  const cards = mesesOrdenados.map((m) => {
    const ganhos = getVal(m, 'ganhos');
    const debitos = getVal(m, 'debitos');
    const guardado = getVal(m, 'guardadoMes');
    const rendimento = getVal(m, 'rendimento'); // Busca o novo rendimento
    const saldo = getVal(m, 'saldo');
    const nomeMes = modoTodos ? `Ano ${m.nome}` : (m.nome.charAt(0) + m.nome.slice(1).toLowerCase());

    const chaveCard = `historico-${modoTodos ? `ano-${m.nome}` : `${m.ano || anoAlvo}-${m.mes}`}-${pessoa}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `
    <article class="historico-mes-card" data-historico-card="${chaveCard}">
      <button type="button" class="historico-mes-head collapse-toggle is-collapsed" data-collapse="${chaveCard}" aria-expanded="false" aria-controls="collapsible-${chaveCard}">
        <span class="historico-mes-nome">${escapeHtml(nomeMes)}</span>
        <span class="historico-mes-head-right">
          <span class="historico-mes-saldo ${saldo < 0 ? "negative" : ""}">${fmt(saldo)}</span>
          <span class="historico-mes-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </span>
      </button>
      <div class="historico-mes-content collapsible is-collapsed" id="collapsible-${chaveCard}">
        <div class="historico-mes-linha">
          <span>Ganhos</span><span class="income">${fmt(ganhos)}</span>
        </div>
        <div class="historico-mes-linha">
          <span>Débitos</span><span class="expense">${fmt(Math.abs(debitos))}</span>
        </div>
        ${guardado > 0 ? `<div class="historico-mes-linha"><span>Guardado</span><span class="gold">${fmt(guardado)}</span></div>` : ""}
        ${rendimento > 0 ? `<div class="historico-mes-linha"><span>Rendeu no mês</span><span class="yield">+ ${fmt(rendimento)}</span></div>` : ""}
        ${pessoa === 'ambos' ? `
        <div class="historico-mes-pessoas">
          <span class="pessoa-tag pessoa-davi">Davi ${fmt(m.saldoDavi)}</span>
          <span class="pessoa-tag pessoa-gabriel">Gabriel ${fmt(m.saldoGabriel)}</span>
        </div>` : ''}
      </div>
    </article>`;
  }).join("");

  let alturaFixa = "";
  const carrosselAtual = document.getElementById("historicoGraficosCarousel");
  if (carrosselAtual && carrosselAtual.style.height) {
    alturaFixa = `height: ${carrosselAtual.style.height};`;
  }

  wrap.innerHTML = `
    <div class="historico-ano-bloco">
      <div class="graficos-carousel-wrap">
        <div class="graficos-carousel" id="historicoGraficosCarousel" style="${alturaFixa}">
          ${grafico}
          ${paginaCategorias}
        </div>
        <div class="graficos-dots is-hidden" id="historicoGraficosDots" aria-hidden="true"></div>
      </div>
      ${cards}
    </div>`;

  atualizarCarrosselGraficos("historicoGraficosCarousel", "historicoGraficosDots");
  restaurarPaginaCarrossel("historicoGraficosCarousel", "historicoGraficosDots", paginaAnterior);
  // Os cards são renderizados dinamicamente; inicializamos as gavetas depois
  // de inserir o HTML para que cada cabeçalho receba seu clique.
  initGavetas();
}

function getColapsoState() {
  try {
    const raw = localStorage.getItem(COLAPSO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) { return {}; }
}
function setColapsoState(estado) {
  try { localStorage.setItem(COLAPSO_STORAGE_KEY, JSON.stringify(estado)); } catch (err) {}
}

function aplicarColapso(btn, alvo, colapsado) {
  alvo.classList.toggle("is-collapsed", colapsado);
  btn.classList.toggle("is-collapsed", colapsado);
  btn.setAttribute("aria-expanded", String(!colapsado));
}

function initGavetas() {
  const estado = getColapsoState();
  document.querySelectorAll(".collapse-toggle").forEach((btn) => {
    const chave = btn.dataset.collapse;
    const alvo = document.getElementById("collapsible-" + chave);
    if (!alvo) return;
    const colapsado = estado[chave] === undefined ? true : !!estado[chave];
    alvo.classList.add("sem-transicao-inicial");
    btn.classList.add("sem-transicao-inicial");
    aplicarColapso(btn, alvo, colapsado);
    void alvo.offsetHeight; 
    requestAnimationFrame(() => {
      alvo.classList.remove("sem-transicao-inicial");
      btn.classList.remove("sem-transicao-inicial");
    });
    btn.addEventListener("click", () => {
      const novoColapsado = !alvo.classList.contains("is-collapsed");
      aplicarColapso(btn, alvo, novoColapsado);
      const estadoAtual = getColapsoState();
      estadoAtual[chave] = novoColapsado;
      setColapsoState(estadoAtual);
    });
  });
}

function posicionarIndicadorAba() {
  const indicador = document.getElementById("tabIndicator");
  const tabbar = document.getElementById("tabbar");
  if (!indicador || !tabbar) return;
  const ativa = tabbar.querySelector(".tab-btn.is-active:not(.is-hidden)");
  if (!ativa) {
    indicador.classList.remove("is-visible");
    return;
  }
  const largura = 26;
  indicador.style.width = largura + "px";
  indicador.style.left = ativa.offsetLeft + (ativa.offsetWidth - largura) / 2 + "px";
  indicador.classList.add("is-visible");
}

function atualizarVisibilidadeFab() {
  const fab = document.getElementById("fabCriar");
  const chatFab = document.getElementById("caixaChatFab");
  const chatAberto = document.getElementById("caixaChat")?.classList.contains("is-open");
  const abaHistorico = document.querySelector('.tab-btn[data-tab="historico"]')?.classList.contains("is-active");
  const ocultarTudo = !!chatAberto || !!abaHistorico;

  if (fab) {
    const ocultar = isAmbos() || ocultarTudo;
    if (ocultar && document.activeElement === fab) fab.blur();
    fab.classList.toggle("is-hidden", ocultar);
    fab.setAttribute("aria-hidden", String(ocultar));
    fab.setAttribute("tabindex", ocultar ? "-1" : "0");
  }
  if (chatFab) {
    const ocultar = isAmbos() || ocultarTudo;
    if (ocultar && document.activeElement === chatFab) chatFab.blur();
    chatFab.classList.toggle("is-hidden", ocultar);
    chatFab.setAttribute("aria-hidden", String(ocultar));
    chatFab.setAttribute("tabindex", ocultar ? "-1" : "0");
  }
}

const tabbarEl = document.getElementById("tabbar");
if (tabbarEl) {
  tabbarEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-hidden", p.dataset.tab !== tab));
    window.scrollTo({ top: 0, behavior: "smooth" });
    posicionarIndicadorAba();
    atualizarVisibilidadeFab();
    if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
    if (tab === "historico") renderHistorico();
  });
}
window.addEventListener("resize", posicionarIndicadorAba);

const personSwitchEl = document.getElementById("personSwitch");
if (personSwitchEl) {
  personSwitchEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".person-btn");
    if (!btn) return;
    trocarPessoa(btn.dataset.pessoa);
  });
}

function parseValor(v) {
  if (v === null || v === undefined) return 0;
  const texto = String(v).trim();
  if (!texto) return 0;
  const normalizado = texto.indexOf(",") !== -1 ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const num = parseFloat(normalizado);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

function aplicarMascaraMoeda(el) {
  if (!el) return;
  el.addEventListener("input", () => {
    let digitos = el.value.replace(/\D/g, "");
    if (!digitos) { el.value = ""; return; }
    digitos = digitos.replace(/^0+(?=\d)/, ""); 
    while (digitos.length < 3) digitos = "0" + digitos; 
    const centavos = digitos.slice(-2);
    const inteiros = digitos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    el.value = `${inteiros},${centavos}`;
  });
}

function aplicarMascaraMoedaEmTodos() {
  ["#formGanhos [name=valor]", "#formFixos [name=valor]", "#formVariaveis [name=valor]"].forEach((sel) => {
    document.querySelectorAll(sel).forEach(aplicarMascaraMoeda);
  });
  ["aporteValor", "editValor", "dividirValor", "transferirValor"].forEach((id) =>
    aplicarMascaraMoeda(document.getElementById(id))
  );
  const form = document.getElementById("formCaixinhas");
  if (form) {
    aplicarMascaraMoeda(form.querySelector("[name=valorInicial]"));
    aplicarMascaraMoeda(form.querySelector("[name=valorObjetivo]"));
  }
}

on("formGanhos", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  const recebido = f.recebido ? f.recebido.checked : false;
  const data = dataDoLancamento(f.data ? f.data.value : "");
  opGanhos.add(nome, valor, { recebido, data, oculto: lancamentoEhOculto(nome) });
  f.reset();
  if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
  preencherDatasComHoje();
});

function parcelaValida(texto) {
  const v = String(texto || "").trim();
  if (!v) return true;
  return /^\d+\s*\/\s*\d+$/.test(v);
}

on("formFixos", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valorTotal = parseValor(f.valor.value);
  if (!nome || !(valorTotal > 0)) return;
  const pago = f.pago ? f.pago.checked : false;
  const tipo = f.tipo ? f.tipo.value : "";
  const data = dataDoLancamento(f.data ? f.data.value : "");

  // "valor" no formulário agora é o valor INTEGRAL da compra — o select de
  // parcelas decide como ele é dividido antes de salvar (cada linha guarda
  // o valor de UMA parcela, mantendo o comportamento do fechamento mensal.
  // pra como isso avança de mês em mês).
  const numParcelas = f.parcelas ? Number(f.parcelas.value) : 0;
  let valor = valorTotal;
  let parcela = "";
  if (numParcelas > 0) {
    valor = Math.round((valorTotal / numParcelas) * 100) / 100;
    // "1/1" (não vazio) pra 1x à vista: assim ela some depois de paga em vez
    // de virar uma cobrança recorrente todo mês (que é o que "parcela
    // vazia" significa pro fechamento de mês).
    parcela = `1/${numParcelas}`;
  }

  const novoFixo = { nome, valor, pago, tipo, data, parcela };
  opFixos.add(nome, valor, { pago, tipo, data, parcela, oculto: lancamentoEhOculto(nome) });
  if (pago) sincronizarGanhoCorrespondenteFixo(state.pessoaAtual, novoFixo, true);
  f.reset();
  if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
  preencherDatasComHoje();
});

on("formVariaveis", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  const pago = f.pago ? f.pago.checked : false;
  const tipo = f.tipo ? f.tipo.value : "";
  const data = dataDoLancamento(f.data ? f.data.value : "");
  const origem = f.origem && f.origem.value === "beneficio" ? "beneficio" : "saldo";
  opVariaveis.add(nome, valor, { pago, tipo, data, origem, oculto: lancamentoEhOculto(nome) });
  f.reset();
  if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
  preencherDatasComHoje();
});

on("formCaixinhas", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valorInicial = f.valorInicial.value ? parseValor(f.valorInicial.value) : 0;
  const valorObjetivo = f.valorObjetivo.value ? parseValor(f.valorObjetivo.value) : 0;
  const icone = f.icone ? normalizarNomeIcone(f.icone.value) : "";
  const data = dataDoLancamento(f.data ? f.data.value : "");
  if (!nome || valorInicial < 0) return;
  addCaixinha(nome, valorInicial, valorObjetivo, icone, data);
  f.reset();
  if (typeof fecharCriacaoFlutuante === "function") fecharCriacaoFlutuante();
  aplicarPreviewIcone(document.getElementById("caixinhaIconPickerCriar"), "");
});

let onConfirmarValor = null;
// Valor mínimo aceito no modal (usado no rendimento: não pode informar um
// total menor do que a caixinha já tem hoje). null = sem mínimo, só exige > 0.
let valorMinimoModal = null;
const modalBackdrop = document.getElementById("modalBackdrop");

function abrirModalValor(titulo, callback, textoBotao, valorInicial, dica, minimo, opts) {
  if (isAmbos()) return;
  onConfirmarValor = callback;
  valorMinimoModal = typeof minimo === "number" ? minimo : null;
  document.getElementById("modalTitle").textContent = titulo;
  const inputValor = document.getElementById("aporteValor");
  inputValor.value = valorInicial ? fmtCampo(valorInicial) : "";
  inputValor.classList.remove("input-erro");
  const elHint = document.getElementById("modalHint");
  if (elHint) {
    elHint.textContent = dica || "";
    elHint.classList.toggle("is-hidden", !dica);
  }
  const botaoConfirmar = document.getElementById("modalConfirmar");
  if (botaoConfirmar) botaoConfirmar.textContent = textoBotao || "Guardar";
  modalBackdrop.classList.remove("is-hidden");
  // semHistorico: usado quando esse modal já está substituindo outro que
  // acabou de fechar (ex.: vindo do menu de ações da caixinha) — nesse
  // caso quem chamou já cuidou do histórico, então não empilha de novo.
  if (!opts || !opts.semHistorico) registrarAberturaModal("modalBackdrop");
  setTimeout(() => {
    inputValor.focus();
    inputValor.select();
  }, 50);
}
function fecharModal() {
  fecharComHistorico("modalBackdrop", () => {
    modalBackdrop.classList.add("is-hidden");
    onConfirmarValor = null;
    valorMinimoModal = null;
    document.getElementById("aporteValor").classList.remove("input-erro");
  });
}
FECHADORES_MODAL.modalBackdrop = fecharModal;
on("modalCancelar", "click", fecharModal);
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) fecharModal();
  });
}

// Enquanto digita, já avisa visualmente se o valor ficou abaixo do mínimo
// permitido (sem travar a digitação — a trava mesmo é no submit).
on("aporteValor", "input", (e) => {
  if (valorMinimoModal == null) return;
  const valor = parseValor(e.target.value);
  e.target.classList.toggle("input-erro", e.target.value !== "" && valor < valorMinimoModal);
});

on("formAporte", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const inputValor = document.getElementById("aporteValor");
  const valor = parseValor(inputValor.value);
  if (!(valor > 0) || !onConfirmarValor) return;
  if (valorMinimoModal != null && valor < valorMinimoModal) {
    inputValor.classList.add("input-erro");
    inputValor.classList.remove("input-tremer");
    void inputValor.offsetWidth; // reinicia a animação se já tremeu antes
    inputValor.classList.add("input-tremer");
    showToast(`O valor não pode ser menor que o que já está guardado (${fmt(valorMinimoModal)})`);
    return;
  }
  onConfirmarValor(valor);
  fecharModal();
});

const TITULOS_CAIXINHA = {
  guardar: (nome) => `Guardar em — ${nome}`,
  retirar: (nome) => `Retirar de — ${nome}`,
  rendimento: (nome) => `Rendimento ganho — ${nome}`, // Texto ajustado
};
const BOTOES_CAIXINHA = {
  guardar: "Guardar",
  retirar: "Retirar",
  rendimento: "Confirmar",
};
function abrirModalCaixinha(acao, idx, opts) {
  const cx = state.caixinhas[idx];
  if (!cx) return;
  const titulo = TITULOS_CAIXINHA[acao](cx.nome);
  const acoes = {
    guardar: (valor) => guardarNaCaixinha(idx, valor),
    retirar: (valor) => retirarDaCaixinha(idx, valor),
    rendimento: (valor) => informarRendimentoCaixinha(idx, valor),
  };

  // Rendimento pede o TOTAL atualizado da caixinha (não quanto rendeu) — por
  // isso vem PRÉ-PREENCHIDO com o total de hoje (guardado + rendimento já
  // acumulado): a pessoa só edita pro número novo, em vez de ter que
  // calcular/lembrar o total de cabeça. Guardar/retirar continuam em branco,
  // porque ali o número digitado já é o valor da própria ação.
  const totalAtualCaixinha = totalCaixinha(cx);
  const valorInicial = acao === "rendimento" ? totalAtualCaixinha : null;
  const dica = acao === "rendimento"
    ? "Digite o valor TOTAL que a caixinha tem hoje (não só o quanto rendeu) — o app calcula a diferença sozinho."
    : null;
  // Rendimento não pode ser um valor menor do que a caixinha já tem — isso
  // seria uma perda, não um rendimento (pra registrar perda, dá pra editar
  // a caixinha direto).
  const minimo = acao === "rendimento" ? totalAtualCaixinha : null;
  abrirModalValor(titulo, acoes[acao], BOTOES_CAIXINHA[acao], valorInicial, dica, minimo, opts);
}

let editContext = null; 
const editBackdrop = document.getElementById("editBackdrop");
const TITULOS_EDICAO = {
  ganhos: "Editar ganho",
  fixos: "Editar gasto fixo",
  variaveis: "Editar gasto variável",
  caixinhas: "Editar caixinha",
};
const EDICAO_TEM_CATEGORIA = { fixos: true, variaveis: true };
const EDICAO_TEM_DATA = { ganhos: true, fixos: true, variaveis: true, caixinhas: true };
const EDICAO_TEM_ORIGEM = { variaveis: true };
const EDICAO_TEM_PARCELA = { fixos: true };

function abrirModalEditar(tipo, idx, item) {
  if (isAmbos()) return;
  editContext = { tipo, idx };
  const tituloEl = document.getElementById("editTitle");
  if (tituloEl) tituloEl.textContent = TITULOS_EDICAO[tipo] || "Editar item";
  document.getElementById("editNome").value = nomeExibicaoItem(item);
  const valorEl = document.getElementById("editValor");
  valorEl.value = item.valor ? fmtCampo(item.valor) : "";
  valorEl.placeholder = tipo === "caixinhas" ? "Objetivo, R$ (0 = sem meta)" : "0,00";

  const categoriaEl = document.getElementById("editCategoria");
  const dataEl = document.getElementById("editData");
  const parcelaEl = document.getElementById("editParcela");
  const origemEl = document.getElementById("editOrigem");
  const temCategoria = !!EDICAO_TEM_CATEGORIA[tipo];
  const temData = !!EDICAO_TEM_DATA[tipo];
  const temParcela = !!EDICAO_TEM_PARCELA[tipo];
  const temOrigem = !!EDICAO_TEM_ORIGEM[tipo];
  const iconPickerEl = document.getElementById("caixinhaIconPickerEditar");

  if (iconPickerEl) {
    const temIcone = tipo === "caixinhas";
    iconPickerEl.classList.toggle("is-hidden", !temIcone);
    if (temIcone) {
      aplicarPreviewIcone(iconPickerEl, item.icone || "");
      renderOpcoesIconesCaixinhas(iconPickerEl);
    } else {
      aplicarPreviewIcone(iconPickerEl, "");
    }
  }

  if (categoriaEl) {
    categoriaEl.classList.toggle("is-hidden", !temCategoria);
    categoriaEl.value = temCategoria ? item.tipo || "" : "";
  }
  if (dataEl) {
    dataEl.classList.toggle("is-hidden", !temData);
    // input[type=date] aceita somente AAAA-MM-DD. Alguns lançamentos guardam
    // também horário (ex.: AAAA-MM-DDTHH:mm:ss), então usamos apenas a parte
    // da data ao abrir a edição. Se o lançamento não tiver data, permanece vazio.
    const dataEdicao = dataDoLancamento(item.data);
    dataEl.value = temData && /^\d{4}-\d{2}-\d{2}/.test(dataEdicao)
      ? dataEdicao.slice(0, 10)
      : "";
  }
  if (parcelaEl) {
    parcelaEl.classList.toggle("is-hidden", !temParcela);
    parcelaEl.value = temParcela ? item.parcela || "" : "";
  }
  if (origemEl) {
    origemEl.classList.toggle("is-hidden", !temOrigem);
    origemEl.value = temOrigem ? (item.origem === "beneficio" ? "beneficio" : "saldo") : "saldo";
  }

  if (editBackdrop) editBackdrop.classList.remove("is-hidden");
  registrarAberturaModal("editBackdrop");
  setTimeout(() => document.getElementById("editNome").focus(), 50);
}
function fecharModalEditar() {
  fecharComHistorico("editBackdrop", () => {
    if (editBackdrop) editBackdrop.classList.add("is-hidden");
    editContext = null;
  });
}
FECHADORES_MODAL.editBackdrop = fecharModalEditar;
on("editCancelar", "click", fecharModalEditar);
if (editBackdrop) {
  editBackdrop.addEventListener("click", (e) => {
    if (e.target === editBackdrop) fecharModalEditar();
  });
}
on("formEditar", "submit", (e) => {
  e.preventDefault();
  if (!editContext || isAmbos()) return;
  const nome = document.getElementById("editNome").value.trim();
  const valorCampo = document.getElementById("editValor").value.trim();
  // Em caixinhas, objetivo vazio significa exatamente o mesmo que 0 (sem meta).
  const valor = valorCampo ? (parseValor(valorCampo) || 0) : 0;
  const { tipo, idx } = editContext;
  if (!nome || (tipo !== "caixinhas" && !(valor > 0))) return;

  if (tipo === "fixos") {
    const parcela = document.getElementById("editParcela").value.trim();
    if (!parcelaValida(parcela)) {
      showToast('Parcela inválida — use o formato "atual/total", ex: 2/48.');
      return;
    }
  }

  if (tipo === "ganhos") {
    const data = document.getElementById("editData").value;
    opGanhos.edit(idx, nome, valor, { data, oculto: lancamentoEhOculto(nome) });
  } else if (tipo === "fixos") {
    const categoria = document.getElementById("editCategoria").value;
    const data = document.getElementById("editData").value;
    const parcela = document.getElementById("editParcela").value.trim();
    const itemAtual = state.gastosFixos[idx];
    const nomeSalvo = itemEhFatura(itemAtual) ? nomeInternoFatura(nome) : nome;
    opFixos.edit(idx, nomeSalvo, valor, { tipo: categoria, data, parcela, fatura: itemEhFatura(itemAtual), faturaId: itemAtual?.faturaId || "", oculto: lancamentoEhOculto(nome) });
  } else if (tipo === "variaveis") {
    const categoria = document.getElementById("editCategoria").value;
    const data = document.getElementById("editData").value;
    const origem = document.getElementById("editOrigem").value === "beneficio" ? "beneficio" : "saldo";
    const itemAtual = state.gastosVariaveis[idx];
    const nomeSalvo = itemEhFatura(itemAtual) ? nomeInternoFatura(nome) : nome;
    // Editar manualmente tira o item do modo "lembrete" (compra adiantada) —
    // a partir daqui ele volta a contar normalmente no saldo, com a nova
    // data/categoria/origem que a pessoa escolheu.
    opVariaveis.edit(idx, nomeSalvo, valor, { tipo: categoria, data, origem, lembrete: false, fatura: itemEhFatura(itemAtual), faturaId: itemAtual?.faturaId || "", oculto: lancamentoEhOculto(nome) });
  } else if (tipo === "caixinhas") {
    const icone = normalizarNomeIcone(document.getElementById("editIcone")?.value || "");
    const data = document.getElementById("editData").value;
    editCaixinha(idx, nome, valor, icone, data);
  }
  fecharModalEditar();
});

const acoesBackdrop = document.getElementById("acoesBackdrop");
const acoesMenuView = document.getElementById("acoesMenuView");
const formDividir = document.getElementById("formDividir");
const formTransferir = document.getElementById("formTransferir");
let categoriaDividir = "variaveis";
let direcaoTransferir = { de: "davi", para: "gabriel" };

function abrirAcoesConjunto() {
  if (acoesMenuView) acoesMenuView.classList.remove("is-hidden");
  if (formDividir) formDividir.classList.add("is-hidden");
  if (formTransferir) formTransferir.classList.add("is-hidden");
  if (acoesBackdrop) acoesBackdrop.classList.remove("is-hidden");
  registrarAberturaModal("acoesBackdrop");
}
function fecharAcoesConjunto() {
  fecharComHistorico("acoesBackdrop", () => {
    if (acoesBackdrop) acoesBackdrop.classList.add("is-hidden");
  });
}
FECHADORES_MODAL.acoesBackdrop = fecharAcoesConjunto;
on("btnAcoesConjunto", "click", () => {
  esconderDicaAcoesConjunto();
  abrirAcoesConjunto();
});
on("acoesFechar", "click", fecharAcoesConjunto);

const CHAVE_DICA_ACOES = "caixa-dica-acoes-conjunto-vista";
function jaViuDicaAcoesConjunto() {
  try { return localStorage.getItem(CHAVE_DICA_ACOES) === "1"; } catch { return false; }
}
function esconderDicaAcoesConjunto() {
  const tip = document.getElementById("acoesConjuntoTip");
  if (tip) {
    tip.classList.remove("is-visivel");
    setTimeout(() => tip.classList.add("is-hidden"), 250);
  }
  try { localStorage.setItem(CHAVE_DICA_ACOES, "1"); } catch {}
}
function mostrarDicaAcoesConjuntoSeNecessario() {
  if (jaViuDicaAcoesConjunto()) return;
  const tip = document.getElementById("acoesConjuntoTip");
  if (!tip) return;
  tip.classList.remove("is-hidden");
  requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add("is-visivel")));
  setTimeout(esconderDicaAcoesConjunto, 6000);
  document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest("#btnAcoesConjunto")) esconderDicaAcoesConjunto();
    }, { once: true });
}
if (acoesBackdrop) {
  acoesBackdrop.addEventListener("click", (e) => {
    if (e.target === acoesBackdrop) fecharAcoesConjunto();
  });
}

const dividirQuemPagouEl = document.getElementById("dividirQuemPagou");
const dividirPagoCheckbox = document.getElementById("dividirPago");
const dividirPagoTexto = document.getElementById("dividirPagoTexto");
const dividirHintEl = document.getElementById("dividirHint");

function atualizarTextoDividir() {
  const valor = dividirQuemPagouEl ? dividirQuemPagouEl.value : "metade";
  if (valor === "metade") {
    if (dividirHintEl) dividirHintEl.textContent = "O valor total é dividido ao meio — metade entra no Davi, metade no Gabriel.";
    if (dividirPagoTexto) dividirPagoTexto.textContent = "Já está pago (as duas partes)";
  } else {
    const pagador = PESSOA_LABEL[valor];
    const devedor = PESSOA_LABEL[valor === "davi" ? "gabriel" : "davi"];
    if (dividirHintEl) dividirHintEl.textContent = `${pagador} paga o valor cheio agora; ${devedor} fica devendo a metade.`;
    if (dividirPagoTexto) dividirPagoTexto.textContent = `${devedor} já pagou a parte dele`;
  }
}
if (dividirQuemPagouEl) dividirQuemPagouEl.addEventListener("change", atualizarTextoDividir);

on("btnAbrirDividir", "click", () => {
  if (acoesMenuView) acoesMenuView.classList.add("is-hidden");
  if (formDividir) formDividir.classList.remove("is-hidden");
  document.getElementById("dividirNome").value = "";
  document.getElementById("dividirValor").value = "";
  const dividirTipoEl = document.getElementById("dividirTipo");
  if (dividirTipoEl) dividirTipoEl.value = "";
  const dividirDataEl = document.getElementById("dividirData");
  if (dividirDataEl) dividirDataEl.value = dataHojeISO();
  if (dividirQuemPagouEl) dividirQuemPagouEl.value = "metade";
  if (dividirPagoCheckbox) dividirPagoCheckbox.checked = true;
  atualizarTextoDividir();
  setTimeout(() => document.getElementById("dividirNome").focus(), 50);
});
on("dividirVoltar", "click", () => {
  if (formDividir) formDividir.classList.add("is-hidden");
  if (acoesMenuView) acoesMenuView.classList.remove("is-hidden");
});

const segmentedDividirEl = document.getElementById("dividirCategoria");
if (segmentedDividirEl) {
  segmentedDividirEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    categoriaDividir = btn.dataset.categoria;
    segmentedDividirEl.querySelectorAll(".segmented-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
  });
}

on("formDividir", "submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("dividirNome").value.trim();
  const valor = parseValor(document.getElementById("dividirValor").value);
  if (!nome || !(valor > 0)) return;
  const dividirTipoEl = document.getElementById("dividirTipo");
  const dividirDataEl = document.getElementById("dividirData");
  const tipo = dividirTipoEl ? dividirTipoEl.value : "";
  const data = dividirDataEl ? dividirDataEl.value : "";
  const pago = dividirPagoCheckbox ? dividirPagoCheckbox.checked : true;
  const quemPagouTudo = dividirQuemPagouEl && dividirQuemPagouEl.value !== "metade" ? dividirQuemPagouEl.value : null;
  const btnSubmit = document.getElementById("dividirSubmit");
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = "Preparando…"; }
  const feedback = mostrarAnimacaoDivisao({ nome, valor, quemPagouTudo });
  // A operação começa imediatamente. A animação é só feedback visual — não
  // deve criar uma espera artificial antes de salvar a divisão.
  const operacao = dividirCompra(nome, valor, categoriaDividir, { tipo, data, pago, quemPagouTudo });
  setEstadoDivisaoFeedback(feedback, "dividindo");
  if (btnSubmit) btnSubmit.textContent = "Dividindo…";
  const duracaoVisual = new Promise((resolve) => window.setTimeout(resolve, 650));
  const [ok] = await Promise.all([operacao, duracaoVisual]);
  if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Dividir"; }
  if (ok) {
    setEstadoDivisaoFeedback(feedback, "sucesso");
    showToast(quemPagouTudo && !pago ? `"${nome}" lançado — ${PESSOA_LABEL[quemPagouTudo === "davi" ? "gabriel" : "davi"]} fica devendo a metade` : `"${nome}" dividido — metade pra cada um`);
    fecharFeedbackDepois(feedback, 1550);
    window.setTimeout(() => { fecharAcoesConjunto(); renderAll(); }, 1150);
  } else {
    setEstadoDivisaoFeedback(feedback, "erro");
    fecharFeedbackDepois(feedback, 1500);
    showToast("Não consegui dividir agora. Tenta de novo em instantes.");
  }
});


on("btnAbrirTransferir", "click", () => {
  if (acoesMenuView) acoesMenuView.classList.add("is-hidden");
  if (formTransferir) formTransferir.classList.remove("is-hidden");
  document.getElementById("transferirNome").value = "";
  document.getElementById("transferirValor").value = "";
  const categoriaEl = document.getElementById("transferirCategoria");
  if (categoriaEl) categoriaEl.value = "";
  direcaoTransferir = { de: "davi", para: "gabriel" };
  renderDirecaoTransferir();
  setTimeout(() => document.getElementById("transferirValor").focus(), 50);
});
on("transferirVoltar", "click", () => {
  if (formTransferir) formTransferir.classList.add("is-hidden");
  if (acoesMenuView) acoesMenuView.classList.remove("is-hidden");
});
on("transferirInverter", "click", () => {
  direcaoTransferir = { de: direcaoTransferir.para, para: direcaoTransferir.de };
  renderDirecaoTransferir();
});

function renderDirecaoTransferir() {
  const deEl = document.getElementById("transferirDe");
  const paraEl = document.getElementById("transferirPara");
  if (deEl) deEl.textContent = PESSOA_LABEL[direcaoTransferir.de];
  if (paraEl) paraEl.textContent = PESSOA_LABEL[direcaoTransferir.para];
}

function mostrarProcessando(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove("is-hidden");
}
function esconderProcessando(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add("is-hidden");
}

