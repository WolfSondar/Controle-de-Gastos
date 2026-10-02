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

// Gráfico de barras agrupadas por mês: cada mês é uma unidade visual clara.
function construirGraficoHistoricoMultiSvg(mesesAsc, pessoa) {
  const getVal = (m, campo) => {
    const valorPessoa = (sufixo) => {
      if (campo === "guardadoMes") {
        const candidatos = [m[`guardadoMes${sufixo}`], m[`guardado${sufixo}Mes`]]
          .map(Number).filter(Number.isFinite).map(v => Math.max(0, v));
        return candidatos.length ? Math.max(...candidatos) : 0;
      }
      const atual = Number(m[`${campo}${sufixo}`]);
      if (Number.isFinite(atual)) return atual;
      if (campo === "ganhosSaldo" || campo === "ganhosBeneficio") {
        const total = Number(m[`ganhos${sufixo}`]);
        return Number.isFinite(total) ? total / 2 : 0;
      }
      if (campo === "gastosSaldo" || campo === "gastosBeneficio") {
        const total = Math.abs(Number(m[`debitos${sufixo}`]));
        return Number.isFinite(total) ? total / 2 : 0;
      }
      if (campo === "saldoSaldo" || campo === "saldoBeneficio") {
        const total = Number(m[`saldo${sufixo}`]);
        return Number.isFinite(total) ? total / 2 : 0;
      }
      if (campo === "rendimento") {
        const total = Number(m[`rendimento${sufixo}`]);
        return Number.isFinite(total) ? total : 0;
      }
      return 0;
    };
    if (pessoa === 'ambos') return valorPessoa("Davi") + valorPessoa("Gabriel");
    const sufixo = pessoa.charAt(0).toUpperCase() + pessoa.slice(1);
    return valorPessoa(sufixo);
  };

  // Visão anual: o gráfico mostra a movimentação de cada categoria no mês,
  // enquanto os cards continuam mostrando os saldos finais. Isso evita que
  // um mês com muita movimentação, mas saldo final próximo de zero, pareça
  // vazio no gráfico (ex.: setembro com Ganho/Gasto e saldo final de R$ 14,60).
  // Para Saldo e Benefício usamos o valor de entrada (Ganho) como a altura da
  // barra; os detalhes de Ganho/Gasto e o saldo final ficam no tooltip/cards.
  // O gráfico principal resume o mês em apenas 3 barras:
  // 1) Ganho = Ganho de Saldo + Ganho de Benefício
  // 2) Gasto = Gasto de Saldo + Gasto de Benefício
  // 3) Guardado = valor guardado nas caixinhas no mês
  // O detalhamento por Saldo/Benefício continua exclusivamente no tooltip.
  const series = {
    ganho: mesesAsc.map(m => Math.max(0, getVal(m, 'ganhosSaldo')) + Math.max(0, getVal(m, 'ganhosBeneficio'))),
    gasto: mesesAsc.map(m => Math.max(0, getVal(m, 'gastosSaldo')) + Math.max(0, getVal(m, 'gastosBeneficio'))),
    guardado: mesesAsc.map(m => getVal(m, 'guardadoMes'))
  };

  const detalhes = {
    ganhosSaldo: mesesAsc.map(m => Math.max(0, getVal(m, 'ganhosSaldo'))),
    gastosSaldo: mesesAsc.map(m => Math.max(0, getVal(m, 'gastosSaldo'))),
    ganhosBeneficio: mesesAsc.map(m => Math.max(0, getVal(m, 'ganhosBeneficio'))),
    gastosBeneficio: mesesAsc.map(m => Math.max(0, getVal(m, 'gastosBeneficio'))),
    rendimento: mesesAsc.map(m => getVal(m, 'rendimento'))
  };

  const n = Math.max(1, mesesAsc.length);
  // O espaço é calculado para que 12 meses continuem legíveis no celular.
  // No modo anual, o gráfico ocupa praticamente toda a largura do card.
  // Os grupos ficam compactos horizontalmente, mas com barras grandes o
  // suficiente para a leitura no celular.
  const groupW = n >= 11 ? 34 : n >= 9 ? 38 : n >= 7 ? 44 : n >= 5 ? 56 : 78;
  const gap = n >= 11 ? 4 : n >= 9 ? 5 : n >= 7 ? 7 : n >= 5 ? 9 : 12;
  const W = Math.max(380, 18 + n * groupW + Math.max(0, n - 1) * gap + 18);
  const H = 320;
  const padL = 10, padR = 10, padT = 10, padB = 50;
  const plotBottom = H - padB;
  const plotH = plotBottom - padT;
  // Cada uma das três séries exibidas pode ter sua própria escala vertical.
  // Isso evita que um Guardado muito maior esconda Ganho/Gasto, sem misturar
  // o detalhamento por Saldo/Benefício, que continua no tooltip.
  const maxPorSerie = Object.fromEntries(
    Object.entries(series).map(([chave, valores]) => [
      chave,
      Math.max(1, ...valores.map(v => Math.abs(Number(v) || 0)))
    ])
  );
  const scalePorSerie = Object.fromEntries(
    Object.entries(maxPorSerie).map(([chave, max]) => [chave, (plotH * 0.82) / max])
  );

  const center = (i) => {
    const totalGroups = n * groupW + (n - 1) * gap;
    const left = (W - totalGroups) / 2;
    return left + groupW / 2 + i * (groupW + gap);
  };

  const compact = n >= 10;
  const barW = n >= 11 ? 8 : n >= 9 ? 8.5 : n >= 7 ? 9.5 : n >= 5 ? 12 : 16;
  const barGap = n >= 11 ? 2.5 : n >= 9 ? 3 : 3.5;
  const monthBarsW = barW * 3 + barGap * 2;

  const bar = (x, value, color, extraClass = '', serie = '') => {
    const v = Number(value) || 0;
    if (v === 0) return '';
    const scale = scalePorSerie[serie] || 1;
    const h = Math.min(plotH * 0.82, Math.max(5, Math.abs(v) * scale));
    const y = v >= 0 ? plotBottom - h : plotBottom;
    return `<rect class="historico-barra ${extraClass}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="${(barW/2).toFixed(1)}" fill="${color}"/>`;
  };

  const gruposMes = mesesAsc.map((m, i) => {
    const cx = center(i);
    const start = cx - monthBarsW / 2;
    const xs = [0,1,2].map(k => start + k * (barW + barGap));
    const nomeCru = m.nome || '';
    const nomeMes = /^\d{4}$/.test(nomeCru) ? nomeCru : nomeCru.charAt(0).toUpperCase() + nomeCru.slice(1).toLowerCase();
    const rotulo = /^\d{4}$/.test(nomeCru) ? nomeCru : nomeCru.slice(0, 3).toUpperCase();
    const tabW = compact ? Math.max(25, groupW - 2) : Math.min(72, groupW + 10);
    const bgMarkup = '';

    return `
      <g class="mes-hover-group" data-mes="${escapeHtml(nomeMes)}"
         data-ganhos-saldo="${Number(detalhes.ganhosSaldo[i]) || 0}"
         data-ganhos-beneficio="${Number(detalhes.ganhosBeneficio[i]) || 0}"
         data-gastos-saldo="${Number(detalhes.gastosSaldo[i]) || 0}"
         data-gastos-beneficio="${Number(detalhes.gastosBeneficio[i]) || 0}"
         data-guardado="${Number(series.guardado[i]) || 0}"
         data-rendimento="${Number(detalhes.rendimento[i]) || 0}">
        ${bgMarkup}
        <rect x="${(cx - groupW/2 - 3).toFixed(1)}" y="6" width="${(groupW + 6).toFixed(1)}" height="${(plotBottom + 42).toFixed(1)}" rx="14" fill="transparent" class="hover-area"/>
        ${bar(xs[0], series.ganho[i], 'var(--income)', 'barra-ganho', 'ganho')}
        ${bar(xs[1], series.gasto[i], 'var(--expense)', 'barra-gasto', 'gasto')}
        ${bar(xs[2], series.guardado[i], 'var(--gold)', 'barra-caixinha', 'guardado')}
        <rect x="${(cx-tabW/2).toFixed(1)}" y="${(plotBottom+13).toFixed(1)}" width="${tabW}" height="23" rx="11.5" fill="var(--paper)" stroke="var(--line)" class="historico-mes-tab" />
        <text x="${cx.toFixed(1)}" y="${(plotBottom+28.5).toFixed(1)}" font-size="${compact ? 8 : 9}" text-anchor="middle" font-family="var(--font-mono)" font-weight="800" letter-spacing=".06em" fill="var(--muted)">${escapeHtml(rotulo)}</text>
      </g>`;
  }).join('');

  const grid = [0.25, 0.5, 0.75, 1].map(fr => {
    const y = plotBottom - plotH * 0.86 * fr;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1" opacity="${fr === 1 ? '.45' : '.18'}" />`;
  }).join('');

  return `
    <div class="historico-grafico-wrap historico-grafico-barras-wrap">
      <div class="historico-grafico-scroll">
        <svg class="historico-grafico historico-grafico-barras" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet">
          ${grid}
          ${gruposMes}
        </svg>
      </div>
      <div class="historico-grafico-legenda" aria-label="Legenda do gráfico">
        <div class="historico-legenda-grupo historico-legenda-ganho">
          <span class="historico-legenda-item"><span class="historico-legenda-titulo">Ganho</span><i class="historico-legenda-bloco" style="--legenda-cor:var(--income)"></i></span>
        </div>
        <div class="historico-legenda-grupo historico-legenda-gasto">
          <span class="historico-legenda-item"><span class="historico-legenda-titulo">Gasto</span><i class="historico-legenda-bloco" style="--legenda-cor:var(--expense)"></i></span>
        </div>
        <div class="historico-legenda-grupo historico-legenda-caixinhas">
          <span class="historico-legenda-item"><span class="historico-legenda-titulo">Guardou</span><i class="historico-legenda-bloco" style="--legenda-cor:var(--gold)"></i></span>
        </div>
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
      if (Number.isFinite(atual)) return atual;
      // Compatibilidade com meses fechados antes da separação por origem.
      if (campo === "ganhosSaldo" || campo === "ganhosBeneficio") {
        const total = Number(m[`ganhos${sufixo}`]);
        return Number.isFinite(total) ? total / 2 : 0;
      }
      if (campo === "gastosSaldo" || campo === "gastosBeneficio") {
        const total = Math.abs(Number(m[`debitos${sufixo}`]));
        return Number.isFinite(total) ? total / 2 : 0;
      }
      if (campo === "saldoSaldo" || campo === "saldoBeneficio") {
        const total = Number(m[`saldo${sufixo}`]);
        return Number.isFinite(total) ? total / 2 : 0;
      }
      return 0;
    };
    if (pessoa === 'ambos') return valorPessoa("Davi") + valorPessoa("Gabriel");
    const sufixo = pessoa.charAt(0).toUpperCase() + pessoa.slice(1);
    return valorPessoa(sufixo);
  };

  const paginaAnterior = paginaCarrosselAtiva("historicoGraficosCarousel");

  // Novo: Inclusão dos campos de rendimento para calcular "Todos os anos" perfeitamente
  const camposSoma = ["ganhosDavi", "ganhosGabriel", "debitosDavi", "debitosGabriel", "ganhosSaldoDavi", "ganhosSaldoGabriel", "ganhosBeneficioDavi", "ganhosBeneficioGabriel", "gastosSaldoDavi", "gastosSaldoGabriel", "gastosBeneficioDavi", "gastosBeneficioGabriel", "saldoSaldoDavi", "saldoSaldoGabriel", "saldoBeneficioDavi", "saldoBeneficioGabriel", "guardadoMesDavi", "guardadoMesGabriel", "saldoDavi", "saldoGabriel", "rendimentoDavi", "rendimentoGabriel"];
  
  const agregarAnoComoRegistro = (bloco) => {
    const registro = { nome: String(bloco.ano), mes: bloco.ano };
    camposSoma.forEach((c) => { registro[c] = 0; });
    bloco.meses.forEach((m) => {
      registro.ganhosDavi += Number(m.ganhosDavi) || 0;
      registro.ganhosGabriel += Number(m.ganhosGabriel) || 0;
      registro.ganhosSaldoDavi += Number(m.ganhosSaldoDavi) || 0;
      registro.ganhosSaldoGabriel += Number(m.ganhosSaldoGabriel) || 0;
      registro.ganhosBeneficioDavi += Number(m.ganhosBeneficioDavi) || 0;
      registro.ganhosBeneficioGabriel += Number(m.ganhosBeneficioGabriel) || 0;
      registro.gastosSaldoDavi += Number(m.gastosSaldoDavi) || 0;
      registro.gastosSaldoGabriel += Number(m.gastosSaldoGabriel) || 0;
      registro.gastosBeneficioDavi += Number(m.gastosBeneficioDavi) || 0;
      registro.gastosBeneficioGabriel += Number(m.gastosBeneficioGabriel) || 0;
      registro.saldoSaldoDavi += Number(m.saldoSaldoDavi) || 0;
      registro.saldoSaldoGabriel += Number(m.saldoSaldoGabriel) || 0;
      registro.saldoBeneficioDavi += Number(m.saldoBeneficioDavi) || 0;
      registro.saldoBeneficioGabriel += Number(m.saldoBeneficioGabriel) || 0;
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

  // Modo de teste desativado: o gráfico usa somente os meses realmente
  // cadastrados no histórico. A visão anual agora é compactada para exibir
  // todos os meses disponíveis de uma vez.
  const SIMULAR_TODOS_OS_MESES_TESTE = false;
  if (SIMULAR_TODOS_OS_MESES_TESTE && !modoTodos) {
    const nomesMesesTeste = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
    ];
    const basePorMes = [
      [2450, 720, 1380, 410, 260],
      [2520, 760, 1420, 460, 310],
      [2480, 810, 1360, 430, 280],
      [2600, 790, 1480, 500, 350],
      [2550, 830, 1510, 470, 300],
      [2680, 860, 1550, 520, 390],
      [2710, 820, 1600, 490, 420],
      [2640, 780, 1580, 450, 360],
      [2760, 840, 1620, 510, 430],
      [2780, 900, 1640, 540, 460],
      [2890, 870, 1710, 510, 520],
      [3050, 940, 1780, 560, 600]
    ];
    // Simulação visual: todos os 12 meses usam dados fictícios, inclusive os meses reais.
    mesesAscendentes = Array.from({ length: 12 }, (_, idx) => {
      const mes = idx + 1;
      const [gs, xs, gb, xb, guard] = basePorMes[idx];
      const registro = {
        nome: nomesMesesTeste[idx], mes, ano: anoAlvo,
        ganhosSaldoDavi: gs * 0.58, ganhosSaldoGabriel: gs * 0.42,
        gastosSaldoDavi: xs * 0.56, gastosSaldoGabriel: xs * 0.44,
        ganhosBeneficioDavi: gb * 0.48, ganhosBeneficioGabriel: gb * 0.52,
        gastosBeneficioDavi: xb * 0.50, gastosBeneficioGabriel: xb * 0.50,
        saldoSaldoDavi: (gs - xs) * 0.58, saldoSaldoGabriel: (gs - xs) * 0.42,
        saldoBeneficioDavi: (gb - xb) * 0.48, saldoBeneficioGabriel: (gb - xb) * 0.52,
        guardadoMesDavi: guard * 0.55, guardadoMesGabriel: guard * 0.45,
        ganhosDavi: gs * 0.58 + gb * 0.48,
        ganhosGabriel: gs * 0.42 + gb * 0.52,
        debitosDavi: -(xs * 0.56 + xb * 0.50),
        debitosGabriel: -(xs * 0.44 + xb * 0.50),
        saldoDavi: (gs - xs) * 0.58 + (gb - xb) * 0.48,
        saldoGabriel: (gs - xs) * 0.42 + (gb - xb) * 0.52,
        rendimentoDavi: 0,
        rendimentoGabriel: 0
      };
      return registro;
    });
    mesesOrdenados = [...mesesAscendentes].sort((a, b) => b.mes - a.mes);
    mesesParaCategorias = mesesAscendentes;
  }

  const grafico = construirGraficoHistoricoMultiSvg(mesesAscendentes, pessoa);
  const paginaCategorias = construirPaginaCategoriasHistorico(mesesParaCategorias, pessoa, modoTodos ? "todos" : anoAlvo);

  const cards = mesesOrdenados.map((m) => {
    const saldoSaldo = getVal(m, 'saldoSaldo');
    const saldoBeneficio = getVal(m, 'saldoBeneficio');
    const guardado = getVal(m, 'guardadoMes');
    const nomeMes = modoTodos ? `Ano ${m.nome}` : (m.nome.charAt(0) + m.nome.slice(1).toLowerCase());

    const chaveCard = `historico-${modoTodos ? `ano-${m.nome}` : `${m.ano || anoAlvo}-${m.mes}`}-${pessoa}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `
    <article class="historico-mes-card" data-historico-card="${chaveCard}">
      <div class="historico-mes-head historico-mes-head-static">
        <span class="historico-mes-nome">${escapeHtml(nomeMes)}</span>
        <div class="historico-mes-resumo" aria-label="Resumo final do mês">
          ${saldoBeneficio !== 0 ? `
          <div class="historico-resumo-item historico-resumo-beneficio">
            <span>Benefício</span>
            <strong>${fmt(saldoBeneficio)}</strong>
          </div>` : ''}
          ${saldoSaldo !== 0 ? `
          <div class="historico-resumo-item historico-resumo-saldo ${saldoSaldo < 0 ? 'negative' : ''}">
            <span>Saldo</span>
            <strong>${fmt(saldoSaldo)}</strong>
          </div>` : ''}
          ${guardado !== 0 ? `
          <div class="historico-resumo-item historico-resumo-guardado">
            <span>Guardou</span>
            <strong>${fmt(guardado)}</strong>
          </div>` : ''}
        </div>
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
const EDICAO_TEM_ORIGEM = { fixos: true, variaveis: true };
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
  const faturaEl = document.getElementById("editFatura");
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
  if (faturaEl) {
    const configs = (state.faturas || []).filter(f => String(f.pessoa || "davi") === String(state.pessoaAtual || "davi"));
    faturaEl.innerHTML = '<option value="">Sem fatura</option>' + configs.map(f => `<option value="${String(f.id).replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">${String(f.nome || "Fatura").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</option>`).join("");
    const habilita = (tipo === "fixos" || tipo === "variaveis") && !(item.origem === "beneficio");
    faturaEl.classList.toggle("is-hidden", !habilita);
    faturaEl.value = habilita && item.fatura === true ? String(item.faturaId || "") : "";
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
    const origem = document.getElementById("editOrigem").value === "beneficio" ? "beneficio" : "saldo";
    const itemAtual = state.gastosFixos[idx];
    const faturaId = origem === "beneficio" ? "" : (document.getElementById("editFatura")?.value || "");
    const nomeSalvo = faturaId ? nomeInternoFatura(nome) : nome;
    opFixos.edit(idx, nomeSalvo, valor, { tipo: categoria, data, parcela, origem, fatura: !!faturaId, faturaId, oculto: lancamentoEhOculto(nome) });
  } else if (tipo === "variaveis") {
    const categoria = document.getElementById("editCategoria").value;
    const data = document.getElementById("editData").value;
    const origem = document.getElementById("editOrigem").value === "beneficio" ? "beneficio" : "saldo";
    const itemAtual = state.gastosVariaveis[idx];
    const faturaId = origem === "beneficio" ? "" : (document.getElementById("editFatura")?.value || "");
    const nomeSalvo = faturaId ? nomeInternoFatura(nome) : (origem === "beneficio" ? nomeInternoBeneficio(nome) : nome);
    // Editar manualmente tira o item do modo "lembrete" (compra adiantada) —
    // a partir daqui ele volta a contar normalmente no saldo, com a nova
    // data/categoria/origem que a pessoa escolheu.
    opVariaveis.edit(idx, nomeSalvo, valor, { tipo: categoria, data, origem, lembrete: false, fatura: !!faturaId, faturaId, oculto: lancamentoEhOculto(nome) });
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
const faturaPagarView = document.getElementById("faturaPagarView");
const faturaPagarOpcoes = document.getElementById("faturaPagarOpcoes");
const faturaPagamentoView = document.getElementById("faturaPagamentoView");
const faturaPagamentoLista = document.getElementById("faturaPagamentoLista");
let faturasElegiveisPagar = [];
let faturaSelecionadaPagamento = null;
let categoriaDividir = "variaveis";
let direcaoTransferir = { de: "davi", para: "gabriel" };

function mostrarSubViewFatura(view) {
  [acoesMenuView, faturaPagarView, faturaPagamentoView, formDividir, formTransferir].forEach(el => el?.classList.add("is-hidden"));
  view?.classList.remove("is-hidden");
}
function abrirAcoesConjunto() {
  mostrarSubViewFatura(acoesMenuView);
  if (acoesBackdrop) acoesBackdrop.classList.remove("is-hidden");
  registrarAberturaModal("acoesBackdrop");
}
function fecharAcoesConjunto() {
  fecharComHistorico("acoesBackdrop", () => { if (acoesBackdrop) acoesBackdrop.classList.add("is-hidden"); });
}
FECHADORES_MODAL.acoesBackdrop = fecharAcoesConjunto;
on("btnAcoesConjunto", "click", () => { esconderDicaAcoesConjunto(); abrirAcoesConjunto(); });
on("acoesFechar", "click", fecharAcoesConjunto);

function montarGruposFaturaPendentes() {
  const hoje = new Date(), mes = Number(state.mesAtual || hoje.getMonth() + 1), ano = Number(state.anoAtual || hoje.getFullYear());
  const pessoa = state.pessoaAtual === "gabriel" ? "gabriel" : "davi";
  const configs = (Array.isArray(state.faturas) ? state.faturas : []).filter(f => String(f?.pessoa || "davi") === pessoa);
  const mapa = new Map();
  [["fixos", state.gastosFixos || []], ["variaveis", state.gastosVariaveis || []]].forEach(([origem, lista]) => {
    lista.forEach((item, idx) => {
      if (item?.pago === true || !itemEhFatura(item)) return;
      const dt = /^(\d{4})-(\d{2})/.exec(String(item.data || ""));
      if (dt && (Number(dt[1]) !== ano || Number(dt[2]) !== mes)) return;
      const cfg = configs.find(f => String(f.id) === String(item.faturaId || "")) || configs[0] || { id: "default", nome: "Fatura", dia: 1 };
      const key = String(item.faturaId || cfg.id || "default");
      if (!mapa.has(key)) mapa.set(key, { id: key, nome: String(cfg.nome || "Fatura"), dia: Number(cfg.dia) || 1, registros: [] });
      mapa.get(key).registros.push({ item, idx, origem });
    });
  });
  return [...mapa.values()].map(g => {
    const last = new Date(ano, mes, 0).getDate();
    g.vencimento = `${ano}-${String(mes).padStart(2,"0")}-${String(Math.min(g.dia,last)).padStart(2,"0")}`;
    g.total = g.registros.reduce((n,r) => n + (Number(r.item.valor) || 0), 0);
    return g;
  }).sort((a,b) => a.vencimento.localeCompare(b.vencimento));
}
on("btnPagarFaturaMes", "click", () => {
  faturasElegiveisPagar = montarGruposFaturaPendentes();
  if (!faturasElegiveisPagar.length) { showToast("Não há itens de fatura pendentes neste mês."); return; }
  if (faturasElegiveisPagar.length === 1) { abrirDetalhePagamentoFatura(faturasElegiveisPagar[0]); return; }
  if (faturaPagarOpcoes) faturaPagarOpcoes.innerHTML = faturasElegiveisPagar.map((g,i) => `
    <button type="button" class="acao-card" data-fatura-pagar="${i}">
      <span class="acao-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M7 15h4"/></svg></span>
      <span class="acao-card-texto"><strong>${escapeHtml(g.nome)}</strong><small>${g.registros.length} ${g.registros.length === 1 ? "lançamento pendente" : "lançamentos pendentes"} · vence ${formatarDataCurta(g.vencimento)}</small></span><strong class="fatura-opcao-total">${fmt(g.total)}</strong><span class="acao-card-seta">›</span>
    </button>`).join("");
  mostrarSubViewFatura(faturaPagarView);
});
on("faturaPagarVoltar", "click", () => mostrarSubViewFatura(acoesMenuView));
faturaPagarOpcoes?.addEventListener("click", e => {
  const btn = e.target.closest("[data-fatura-pagar]"); if (!btn) return;
  const grupo = faturasElegiveisPagar[Number(btn.dataset.faturaPagar)]; if (grupo) abrirDetalhePagamentoFatura(grupo);
});
function abrirDetalhePagamentoFatura(grupo) {
  faturaSelecionadaPagamento = grupo;
  const titulo = document.getElementById("faturaPagamentoTitulo");
  const resumo = document.getElementById("faturaPagamentoResumo");
  const fill = document.getElementById("faturaPagamentoProgressFill");
  if (titulo) titulo.textContent = grupo.nome;
  if (resumo) resumo.textContent = `${grupo.registros.length} lançamentos · total de ${fmt(grupo.total)} · vencimento ${formatarDataCurta(grupo.vencimento)}`;
  if (fill) fill.style.width = "0%";
  if (faturaPagamentoLista) faturaPagamentoLista.innerHTML = grupo.registros.map((r,i) => `<div class="fatura-pagamento-item" data-fatura-item="${i}"><span class="fatura-pagamento-check">✓</span><span class="fatura-pagamento-name">${escapeHtml(nomeExibicaoItem(r.item))}</span><strong>${fmt(r.item.valor)}</strong></div>`).join("");
  const confirmar = document.getElementById("faturaPagamentoConfirmar");
  if (confirmar) { confirmar.disabled = false; confirmar.textContent = `Pagar ${fmt(grupo.total)}`; }
  mostrarSubViewFatura(faturaPagamentoView);
}
document.getElementById("faturaPagamentoCancelar")?.addEventListener("click", () => mostrarSubViewFatura(faturasElegiveisPagar.length > 1 ? faturaPagarView : acoesMenuView));
document.getElementById("faturaPagamentoConfirmar")?.addEventListener("click", async () => {
  const grupo = faturaSelecionadaPagamento; if (!grupo) return;
  const btn = document.getElementById("faturaPagamentoConfirmar");
  if (btn) { btn.disabled = true; btn.textContent = "Processando pagamento…"; }
  const rows = [...(faturaPagamentoLista?.querySelectorAll(".fatura-pagamento-item") || [])];
  const aguardarAnimacao = ms => new Promise(resolve => setTimeout(resolve, ms));
  for (let i=0; i<rows.length; i++) {
    const row = rows[i];
    // Primeiro confirma visualmente este lançamento; só depois recolhe o espaço
    // para que os itens seguintes deslizem suavemente, sem salto de layout.
    row.classList.add("is-paying");
    const fill = document.getElementById("faturaPagamentoProgressFill");
    if (fill) fill.style.width = `${Math.round((i+1)/rows.length*100)}%`;
    await aguardarAnimacao(360);
    row.style.height = `${row.getBoundingClientRect().height}px`;
    row.style.flex = "0 0 auto";
    row.offsetHeight; // aplica a altura inicial antes da transição
    row.classList.add("is-collapsing");
    await aguardarAnimacao(380);
    row.remove();
  }
  const agoraPagamento = new Date();
  const dataPagamentoHoje = `${agoraPagamento.getFullYear()}-${String(agoraPagamento.getMonth()+1).padStart(2,"0")}-${String(agoraPagamento.getDate()).padStart(2,"0")}T${String(agoraPagamento.getHours()).padStart(2,"0")}:${String(agoraPagamento.getMinutes()).padStart(2,"0")}:${String(agoraPagamento.getSeconds()).padStart(2,"0")}`;
  grupo.registros.forEach(r => {
    const lista = r.origem === "fixos" ? state.gastosFixos : state.gastosVariaveis;
    const item = lista?.[r.idx];
    if (item) { item.pago = true; item.data = dataPagamentoHoje; }
  });
  const [okFixos, okVariaveis] = await Promise.all([
    salvarBloco("saveGastosFixos", state.gastosFixos),
    salvarBloco("saveGastosVariaveis", state.gastosVariaveis)
  ]);
  if (okFixos === false || okVariaveis === false) {
    showToast("Não foi possível confirmar todos os pagamentos. Confira a lista antes de tentar novamente.");
    if (btn) { btn.disabled = false; btn.textContent = "Tentar salvar novamente"; }
    return;
  }
  showToast(`Fatura ${grupo.nome} paga — ${fmt(grupo.total)} registrados como pagos.`);
  fecharAcoesConjunto(); renderAll();
});

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

