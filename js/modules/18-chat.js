// =====================================================================
// MÓDULO: 18-chat
// Assistente Caixa e fluxos conversacionais
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

(function inicializarAssistenteCaixa() {
  const fab = document.getElementById("caixaChatFab");
  const chat = document.getElementById("caixaChat");
  const close = document.getElementById("caixaChatClose");
  const body = document.getElementById("caixaChatBody");
  const quick = document.getElementById("caixaChatQuick");
  const thinking = document.getElementById("caixaChatThinking");
  if (!fab || !chat || !close || !body || !quick || !thinking) return;

  const CHAT_PROMPTS = {
    gastar: "Você é o assistente financeiro do Caixa. Descubra de qual origem o usuário quer gastar (benefício ou saldo em conta) e, para o saldo normal, informe quanto realmente pode gastar depois de considerar as entradas que ainda vão cair e todas as contas abertas que precisam ser reservadas. O saldo atual exibido no cartão é apenas o saldo de hoje; não o confunda com o limite de gasto projetado. Use somente os números calculados pelo aplicativo.",
    gastos: "Você é o assistente financeiro do Caixa. Mostre quanto já foi gasto no mês, separando gastos fixos, variáveis e o total.",
    categorias: "Você é o assistente financeiro do Caixa. Identifique as categorias que mais consumiram dinheiro no mês atual e apresente as três maiores, sem inventar dados.",
    guardado: "Você é o assistente financeiro do Caixa. Informe quanto existe atualmente nas caixinhas e destaque metas, se houver.",
    pendencias: "Você é o assistente financeiro do Caixa. Mostre o que ainda falta pagar e o que ainda falta receber neste mês, distinguindo claramente contas deste mês de lançamentos com vencimento no mês que vem ou depois. Nunca trate uma conta futura como se vencesse agora.",
  };

  const IC = {
    wallet: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" stroke-width="1.7"/><path d="M4 8h16M16 12h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="16.5" cy="12" r=".8" fill="currentColor"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none"><path d="m6 3 2 1.2L10 3l2 1.2L14 3l2 1.2L18 3v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 21V3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m7 15 3-4 3 2 5-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pig: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 11.5c0-3.3 3-5.5 7-5.5h2c3.2 0 5.5 1.8 6 4.5l1.5 1v3l-2 .4c-.5 1.5-1.6 2.5-3 3.1V20h-2v-1.4c-.8.2-1.7.3-2.6.3s-1.8-.1-2.6-.3V20h-2v-2.2C5.8 16.9 5 14.5 5 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="15.5" cy="10" r=".9" fill="currentColor"/><path d="M4 12H2.5M18 8.5V6.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3.2 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3ZM19 16l.7 2.3L22 19l-.7-2.3L16 19l2.3-.7L19 16Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    calculator: '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="3.5" width="14" height="17" rx="2.2" stroke="currentColor" stroke-width="1.6"/><path d="M8 7.5h8M8 11.5h2M14 11.5h2M8 15.5h2M14 15.5h2M11 11.5h1M11 15.5h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none"><path d="M20.8 8.9c0 5.3-8.8 10.2-8.8 10.2S3.2 14.2 3.2 8.9C3.2 6.4 5 4.5 7.4 4.5c1.7 0 3.1.9 4.6 2.5 1.5-1.6 2.9-2.5 4.6-2.5 2.4 0 4.2 1.9 4.2 4.4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  };

  const ACOES = [
    { id: "gastar", icon: "wallet", titulo: "Quanto ainda posso gastar?", subtitulo: "Separar benefício e saldo em conta" },
    { id: "categorias", icon: "chart", titulo: "Onde estou gastando mais?", subtitulo: "As categorias que mais pesaram" },
    { id: "guardado", icon: "pig", titulo: "Progresso das caixinhas", subtitulo: "Metas, prazos e quanto falta guardar" },
    { id: "mudou", icon: "chart", titulo: "O que mais mudou este mês?", subtitulo: "Compare com o mês anterior" },
    { id: "aconteceu", icon: "sparkle", titulo: "O que aconteceu este mês?", subtitulo: "Um resumo do que mudou por aqui" },
    { id: "pendencias", icon: "clock", titulo: "Ainda falta pagar", subtitulo: "Veja contas, parcelas e valores pendentes" },
  ];

  let pensamentoTimer = null;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function chatFmt(n) { return typeof fmt === "function" ? fmt(Number(n) || 0) : Number(n || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
  function naoNegativo(n) { return Math.max(0, Number(n) || 0); }
  function listaFinita(lista) { return Array.isArray(lista) ? lista : []; }

  function totaisChat() {
    const ganhosRecebidos = somaComStatus(state.ganhos || [], "recebido");
    const ganhosOrigem = separarGanhosPorOrigem(state.ganhos || []);
    const fixosPagos = somaFixosPagos(state.gastosFixos || []);
    const fixosTotais = listaFinita(state.gastosFixos).reduce((a, i) => a + (Number(i.valor) || 0), 0);
    const variaveisPagos = somaVariaveisPagas(state.gastosVariaveis || []);
    const beneficioGasto = listaFinita(state.gastosVariaveis).reduce((a, i) =>
      a + (gastoVariavelEhReal(i) && variavelContaNoSaldo(i) && variavelEhBeneficio(i) ? Number(i.valor) || 0 : 0), 0);
    const saldoGasto = listaFinita(state.gastosVariaveis).reduce((a, i) =>
      a + (gastoVariavelEhReal(i) && variavelContaNoSaldo(i) && !variavelEhBeneficio(i) ? Number(i.valor) || 0 : 0), 0);
    const beneficio = ganhosOrigem.beneficios - beneficioGasto;
    const guardadoNoMes = somaCampo(state.caixinhas || [], "valorGuardadoMes");
    // Para decidir "quanto ainda posso gastar" pelo saldo em conta,
    // partimos do saldo que já existe hoje, descontamos o que foi reservado
    // nas caixinhas neste mês, somamos o que ainda vai entrar (somente ganhos
    // sem benefício) e reservamos os gastos fixos ainda não pagos.
    const saldoAtualConta = ganhosOrigem.ganhos - fixosPagos - saldoGasto - guardadoNoMes;
    // Para perguntas e indicadores DO MÊS ATUAL, considerar somente ganhos
    // que pertencem ao mês aberto. Ganhos lançados para meses futuros ficam
    // disponíveis separadamente para projeções de longo prazo.
    const aReceberEsseMes = listaFinita(state.ganhos).reduce((a, i) =>
      a + (i.recebido !== true && !ganhoEhBeneficio(i) && !ehFuturoDoMesAtual(i) ? Number(i.valor) || 0 : 0), 0);
    const aReceberFuturos = Math.max(0, listaFinita(state.ganhos).reduce((a, i) =>
      a + (i.recebido !== true && !ganhoEhBeneficio(i) ? Number(i.valor) || 0 : 0), 0) - aReceberEsseMes);
    const aReceber = aReceberEsseMes;
    const aPagarFixos = listaFinita(state.gastosFixos).reduce((a, i) =>
      a + (i.pago !== true ? Number(i.valor) || 0 : 0), 0);
    const aPagarVariaveis = listaFinita(state.gastosVariaveis).reduce((a, i) =>
      a + (gastoVariavelEhReal(i) && i.pago !== true && !i.lembrete && !variavelEhBeneficio(i) ? Number(i.valor) || 0 : 0), 0);
    // Para "quanto posso gastar ESTE MÊS", reservamos somente as contas
    // pendentes que vencem no mês aberto. Contas de meses futuros não reduzem
    // a margem deste mês; elas ficam separadas para a projeção futura.
    const aPagarFixosEsseMes = listaFinita(state.gastosFixos).reduce((a, i) =>
      a + (i.pago !== true && !ehFuturoDoMesAtual(i) ? Number(i.valor) || 0 : 0), 0);
    const aPagarVariaveisEsseMes = listaFinita(state.gastosVariaveis).reduce((a, i) =>
      a + (gastoVariavelEhReal(i) && i.pago !== true && !i.lembrete && !variavelEhBeneficio(i) && !ehFuturoDoMesAtual(i) ? Number(i.valor) || 0 : 0), 0);
    const aPagarFixosFuturos = Math.max(0, aPagarFixos - aPagarFixosEsseMes);
    const aPagarVariaveisFuturos = Math.max(0, aPagarVariaveis - aPagarVariaveisEsseMes);
    // Margem de gasto do mês atual: saldo disponível hoje + ganhos ainda a
    // receber neste mês - compromissos pendentes deste mês.
    const conta = saldoAtualConta + aReceberEsseMes - aPagarFixosEsseMes - aPagarVariaveisEsseMes;
    // Projeção de todos os lançamentos abertos, incluindo meses futuros.
    const contaProjetadaTodosOsMeses = saldoAtualConta + (aReceberEsseMes + aReceberFuturos) - aPagarFixos - aPagarVariaveis;
    const saldoGeral = ganhosRecebidos - fixosPagos - variaveisPagos;
    return { ganhosRecebidos, ganhosOrigem, fixosPagos, fixosTotais, variaveisPagos, beneficio, saldoAtualConta, conta, contaProjetadaTodosOsMeses, saldoGeral, aReceber, aReceberEsseMes, aReceberFuturos, aPagarFixos, aPagarVariaveis, aPagarFixosEsseMes, aPagarVariaveisEsseMes, aPagarFixosFuturos, aPagarVariaveisFuturos };
  }

  function categoriasChat() {
    const porCat = {};
    listaFinita(state.gastosFixos).forEach(i => {
      if (i.pago !== true) return;
      const cat = String(i.tipo || "Outros").trim() || "Outros";
      porCat[cat] = (porCat[cat] || 0) + (Number(i.valor) || 0);
    });
    listaFinita(state.gastosVariaveis).forEach(i => {
      if (!gastoVariavelEhReal(i) || !variavelContaNoSaldo(i) || i.pago !== true) return;
      const cat = String(i.tipo || "Outros").trim() || "Outros";
      porCat[cat] = (porCat[cat] || 0) + (Number(i.valor) || 0);
    });
    return Object.entries(porCat).sort((a,b) => b[1] - a[1]);
  }

  function metasChat() {
    return listaFinita(state.caixinhas)
      .map(cx => {
        const atual = typeof totalCaixinha === "function" ? totalCaixinha(cx) : ((Number(cx.valorGuardado)||0)+(Number(cx.rendimentoTotal)||0)+(Number(cx.valorGuardadoMes)||0));
        const objetivo = Number(cx.valorObjetivo) || 0;
        return { nome: cx.nome || "Caixinha", atual, objetivo, falta: Math.max(objetivo - atual, 0), prazo: cx.data || "" };
      })
      .filter(x => x.objetivo > 0)
      .sort((a,b) => (b.atual / b.objetivo) - (a.atual / a.objetivo));
  }

  function appendMensagem(html, quem = "bot") {
    const wrap = document.createElement("div");
    wrap.className = `caixa-chat-message ${quem}`;
    const bubble = document.createElement("div");
    bubble.className = "caixa-chat-bubble";
    bubble.innerHTML = html;
    wrap.appendChild(bubble);
    // Remove the quick actions only from the welcome area; subsequent answers
    // get their own compact "voltar" action.
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function mostrarAcoesRapidas() {
    quick.innerHTML = "";
    ACOES.forEach(acao => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "caixa-chat-action";
      btn.dataset.chatAcao = acao.id;
      btn.innerHTML = `
        <span class="caixa-chat-action-icon">${IC[acao.icon]}</span>
        <span class="caixa-chat-action-text"><strong>${esc(acao.titulo)}</strong><small>${esc(acao.subtitulo)}</small></span>
        <span class="caixa-chat-action-arrow">›</span>`;
      quick.appendChild(btn);
    });
  }

  function mostrarMenuCompacto() {
    const anterior = document.getElementById("caixaChatBack");
    if (anterior) anterior.remove();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "caixaChatBack";
    btn.className = "caixa-chat-action";
    btn.style.marginTop = "4px";
    btn.innerHTML = `
      <span class="caixa-chat-action-icon">${IC.sparkle}</span>
      <span class="caixa-chat-action-text"><strong>Escolher outra coisa</strong><small>Voltar para as ações rápidas</small></span>
      <span class="caixa-chat-action-arrow">↩</span>`;
    btn.addEventListener("click", () => {
      // Voltar ao menu encerra completamente o contexto da resposta anterior.
      window._caixaChatSessao = (Number(window._caixaChatSessao) || 0) + 1;
      clearTimeout(pensamentoTimer);
        pensamentoTimer = null;
            thinking.classList.add("is-hidden");
      body.querySelectorAll(".caixa-chat-message, .caixa-chat-choices, .caixa-chat-select-wrap, .caixa-chat-simulador-form, #caixaChatBack").forEach(x => x.remove());
      quick.classList.remove("is-hidden");
      const quickTitle = quick.previousElementSibling;
      if (quickTitle && quickTitle.classList.contains("caixa-chat-quick-title")) quickTitle.classList.remove("is-hidden");
      const welcome = body.querySelector(".caixa-chat-welcome");
      if (welcome) welcome.classList.remove("is-hidden");
      body.scrollTop = 0;
      quick.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    body.appendChild(btn);
  }

  function compararMesAnteriorChat() {
    const anos = listaFinita(state.historico?.anos);
    if (!state.mesAtual || !state.anoAtual || !anos.length) return null;
    let pm = state.mesAtual - 1, pa = state.anoAtual;
    if (pm === 0) { pm = 12; pa--; }
    const bloco = anos.find(a => Number(a.ano) === pa);
    const mes = bloco?.meses?.find(m => Number(m.mes) === pm);
    if (!mes) return null;
    const get = (campo) => {
      if (state.pessoaAtual === "ambos") return (Number(mes[`${campo}Davi`]) || 0) + (Number(mes[`${campo}Gabriel`]) || 0);
      const suf = state.pessoaAtual === "gabriel" ? "Gabriel" : "Davi";
      return Number(mes[`${campo}${suf}`]) || 0;
    };
    // DEBITOS no HISTORICO são gravados negativos. Para comparar com os
    // gastos atuais (que são positivos), normalizamos aqui uma única vez.
    return { ganhos: get("ganhos"), gastos: Math.abs(get("debitos")), guardado: Math.max(0, get("guardadoMes")), nome: mes.nome || "mês anterior" };
  }

  function calcularRespostaGastar(origem) {
    const t = totaisChat();
    const valor = origem === "beneficio" ? t.beneficio : t.conta;
    const nome = origem === "beneficio" ? "benefício" : "saldo em conta";
    const classe = origem === "beneficio" ? "chat-valor-gold" : "chat-valor-pos";
    let texto;
    if (origem === "beneficio") {
      if (valor > 0) texto = `Você ainda pode gastar <span class="${classe} chat-valor">${chatFmt(valor)}</span> usando o <strong>${nome}</strong> neste mês.`;
      else texto = `Neste momento, o <strong>${nome}</strong> está sem margem para novos gastos.`;
    } else if (valor > 0) {
      texto = `Depois de pagar tudo que falta, sobram <span class="${classe} chat-valor">${chatFmt(valor)}</span> para você gastar.`;
    } else if (valor === 0) {
      texto = `Você não tem margem para novos gastos agora.`;
    } else {
      texto = `Você não pode gastar mais nada agora — ainda faltam <span class="chat-valor chat-valor-neg">${chatFmt(Math.abs(valor))}</span> para fechar as obrigações.`;
    }
    return texto;
  }

  function respostaCaixinha(cx) {
    const atual = typeof totalCaixinha === "function" ? totalCaixinha(cx) : ((Number(cx.valorGuardado)||0)+(Number(cx.rendimentoTotal)||0)+(Number(cx.valorGuardadoMes)||0));
    const objetivo = Number(cx.valorObjetivo) || 0;
    const falta = Math.max(objetivo - atual, 0);
    const prazo = String(cx.data || "");
    const pct = objetivo > 0 ? Math.min((atual / objetivo) * 100, 100) : 0;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(prazo);
    let meses = null;
    let dias = null;
    if (m) {
      const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const hoje = new Date();
      const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      dias = Math.ceil((alvo - hojeLocal) / 86400000);
      if (dias > 0) meses = Math.max(1, Math.ceil(dias / 30.4375));
    }
    let plano;
    if (!objetivo) plano = `Essa caixinha tem data, mas ainda está sem <strong>objetivo financeiro</strong> definido.`;
    else if (!falta) plano = `<strong>Meta concluída!</strong> Você já chegou ao objetivo de ${chatFmt(objetivo)}.`;
    else if (dias !== null && dias <= 0) plano = `O prazo de <strong>${formatarDataCurta(prazo)}</strong> já passou e ainda faltam <strong class="chat-valor chat-valor-neg">${chatFmt(falta)}</strong> para a meta.`;
    else {
      const mensal = falta / meses;
      plano = `Para chegar em <strong>${chatFmt(objetivo)}</strong> até <strong>${formatarDataCurta(prazo)}</strong>, você precisa guardar cerca de <strong class="chat-valor chat-valor-gold">${chatFmt(mensal)}</strong> por mês.`;
    }
    const icone = normalizarNomeIcone(cx.icone || "");
    const iconeHtml = icone ? `<img src="${esc(urlIconeCaixinha(icone))}" alt="" class="chat-goal-icon-img" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML=ICONE_COFRINHO;">` : ICONE_COFRINHO;
    return `<div class="chat-goal-result"><div class="chat-goal-result-top"><span class="chat-goal-result-icon" style="--pct:${pct}%"><span>${iconeHtml}</span></span><div><strong>${esc(cx.nome || "Caixinha")}</strong><small>Meta em ${formatarDataCurta(prazo)}</small></div><b>${Math.round(pct)}%</b></div><div class="chat-goal-result-track"><i style="width:${pct}%"></i></div><div class="chat-goal-result-numbers"><span>Guardado <strong>${chatFmt(atual)}</strong></span><span>Falta <strong>${chatFmt(falta)}</strong></span></div><div class="chat-goal-result-plan">${plano}</div></div>`;
  }

  function executarAcao(id) {
    window._caixaChatSessao = (Number(window._caixaChatSessao) || 0) + 1;
    quick.classList.add("is-hidden");
    const quickTitle = quick.previousElementSibling;
    if (quickTitle && quickTitle.classList.contains("caixa-chat-quick-title")) quickTitle.classList.add("is-hidden");
    const welcome = body.querySelector(".caixa-chat-welcome");
    if (welcome) welcome.classList.add("is-hidden");
    const oldBack = document.getElementById("caixaChatBack");
    if (oldBack) oldBack.remove();
    if (id === "gastar") {
      appendMensagem("Claro. <strong>De onde sairia esse próximo gasto?</strong>");
      const escolhas = document.createElement("div");
      escolhas.className = "caixa-chat-choices";
      [
        ["beneficio", "Benefício", "Usar o valor disponível do benefício", totaisChat().beneficio],
        ["saldo", "Saldo em conta", "Usar o dinheiro do saldo normal", totaisChat().saldoAtualConta]
      ].forEach(([valor, titulo, sub, quantia]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "caixa-chat-choice";
        btn.innerHTML = `<span><strong>${titulo}</strong><small>${sub}</small></span><span class="choice-value">${chatFmt(quantia)}</span>`;
        btn.addEventListener("click", () => {
          escolhas.remove();
          appendMensagem(titulo, "user");
          iniciarPensamento(async () => {
            const tAtual = totaisChat();
            appendMensagem(calcularRespostaGastar(valor));
          });
        });
        escolhas.appendChild(btn);
      });
      body.appendChild(escolhas);
      body.scrollTop = body.scrollHeight;
      return;
    }

    iniciarPensamento(() => {
      const t = totaisChat();

      if (id === "categorias") {
        const cats = categoriasChat();
        if (!cats.length) return appendMensagem("Ainda não encontrei gastos pagos suficientes para montar esse ranking.");
        const top = cats.slice(0,3).map((x,i) => `${i+1}. <strong>${esc(x[0])}</strong> — <span class="chat-valor chat-valor-neg">${chatFmt(x[1])}</span>`).join("<br>");
        appendMensagem(`<strong>Onde mais saiu dinheiro:</strong><br>${top}<span class="caixa-chat-note">Considerei os gastos que efetivamente contam no mês atual.</span>`);
      }

      if (id === "guardado") {
        const comData = listaFinita(state.caixinhas).filter(cx => String(cx.data || "").trim());
        if (!comData.length) {
          appendMensagem(`Não encontrei nenhuma caixinha com <strong>data de objetivo</strong> cadastrada ainda.<span class="caixa-chat-note">Cadastre uma data na caixinha para eu calcular quanto você precisa guardar por mês.</span>`);
          return;
        }
        appendMensagem(`<strong>Qual caixinha você quer planejar?</strong><span class="caixa-chat-note">Mostrando apenas caixinhas que têm uma data definida.</span>`);
        const escolhas = document.createElement("div");
        escolhas.className = "caixa-chat-choices caixa-chat-caixinhas-choices";
        comData.forEach((cx, idx) => {
          const atual = typeof totalCaixinha === "function" ? totalCaixinha(cx) : ((Number(cx.valorGuardado)||0)+(Number(cx.rendimentoTotal)||0)+(Number(cx.valorGuardadoMes)||0));
          const objetivo = Number(cx.valorObjetivo) || 0;
          const pct = objetivo > 0 ? Math.min((atual / objetivo) * 100, 100) : 0;
          const falta = Math.max(objetivo - atual, 0);
          const icone = normalizarNomeIcone(cx.icone || "");
          const iconeHtml = icone
            ? `<img src="${esc(urlIconeCaixinha(icone))}" alt="" class="chat-goal-icon-img" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML=ICONE_COFRINHO;">`
            : ICONE_COFRINHO;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "caixa-chat-goal-choice";
          btn.innerHTML = `<span class="chat-goal-choice-icon ${objetivo > 0 ? "has-goal" : ""}" style="--pct:${pct}%"><span>${iconeHtml}</span></span><span class="chat-goal-choice-main"><strong>${esc(cx.nome || "Caixinha")}</strong><small>${formatarDataCurta(cx.data)} · ${objetivo > 0 ? `${chatFmt(atual)} de ${chatFmt(objetivo)}` : "sem objetivo definido"}</small>${objetivo > 0 ? `<span class="chat-goal-mini-track"><i style="width:${pct}%"></i></span>` : ""}</span><span class="chat-goal-choice-arrow">›</span>`;
          btn.addEventListener("click", () => {
            iniciarPensamento(() => appendMensagem(respostaCaixinha(cx)));
            escolhas.remove();
          });
          escolhas.appendChild(btn);
        });
        body.appendChild(escolhas);

        body.scrollTop = body.scrollHeight;
      }

      if (id === "mudou") {
        const ant = compararMesAnteriorChat();
        if (!ant) {
          appendMensagem(`<strong>Ainda não tenho dados históricos suficientes para comparar.</strong><span class="caixa-chat-note">Assim que existir um mês anterior fechado com dados comparáveis, eu mostro as mudanças sem inventar informações.</span>`);
        } else {
          const atual={gastos:(Number(t.fixosPagos)||0)+(Number(t.variaveisPagos)||0),ganhos:Number(t.ganhosRecebidos)||0,guardado:somaCampo(state.caixinhas,"valorGuardadoMes")},ca=Object.fromEntries(categoriasChat()),cp=categoriasHistoricoAnteriorChat(),pend=categoriasPendentesChat(),linhas=[];
          if(cp) Array.from(new Set([...Object.keys(ca),...Object.keys(cp),...Object.keys(pend)])).map(cat=>({cat,atualPago:Number(ca[cat])||0,anteriorPago:Number(cp[cat])||0,pendente:Number(pend[cat])||0})).filter(x=>{
            // Pendente não é gasto realizado. Se a categoria tem valor neste
            // mês apenas porque está pendente, ela NÃO pode ser comparada
            // como queda (ex.: mês passado R$400 pagos, este mês R$800 pendentes).
            if (x.atualPago === 0 && x.pendente > 0) {
              return false;
            }
            return Math.abs(x.atualPago - x.anteriorPago) >= .01;
          }).map(x=>({cat:x.cat,delta:x.atualPago-x.anteriorPago})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,5).forEach(x=>linhas.push(`<li><strong>${esc(x.cat)}</strong>: <span class="comparacao-seta ${x.delta>0?"neg":"pos"}">${x.delta>0?"↑":"↓"}</span> <span class="chat-valor ${x.delta>0?"chat-valor-neg":"chat-valor-pos"}">${chatFmt(Math.abs(x.delta))}</span></li>`));
          const dg=atual.gastos-ant.gastos,dr=atual.ganhos-ant.ganhos,ds=atual.guardado-ant.guardado;
          appendMensagem(`<strong>Este mês x ${esc(ant.nome||"mês anterior")}</strong><div class="chat-comparacao-bloco"><div class="chat-comparacao-titulo">Gastos</div>${linhas.length?`<ul>${linhas.join("")}</ul>`:`<p>Não houve mudança de categoria relevante.</p>`}<div class="chat-comparacao-resultado">Resultado: ${dg===0?"seus gastos ficaram iguais":`você gastou <span class="chat-valor ${dg>0?"chat-valor-neg":"chat-valor-pos"}">${chatFmt(Math.abs(dg))}</span> ${dg>0?"a mais":"a menos"}`}.</div><div class="chat-comparacao-titulo">Ganhos</div><div class="chat-comparacao-resultado">${dr===0?"seus ganhos ficaram iguais":`você recebeu <span class="chat-valor chat-valor-pos">${chatFmt(Math.abs(dr))}</span> ${dr>0?"a mais":"a menos"}`}.</div>${ant.guardado||atual.guardado?`<div class="chat-comparacao-resultado">Guardado: ${ds===0?"mesmo valor":`<span class="chat-valor chat-valor-gold">${chatFmt(Math.abs(ds))}</span> ${ds>0?"a mais":"a menos"}`}.</div>`:""}</div>`);
        }
      }

      if (id === "aconteceu") {
        const eventos=[],t=totaisChat(),totalGastos=(Number(t.fixosPagos)||0)+(Number(t.variaveisPagos)||0),totalGanhos=Number(t.ganhosRecebidos)||0,guardadoMes=somaCampo(state.caixinhas,"valorGuardadoMes");
        if(totalGanhos>0)eventos.push(`Você recebeu <span class="chat-valor chat-valor-pos">${chatFmt(totalGanhos)}</span> neste mês.`);
        if(totalGastos>0)eventos.push(`Você gastou <span class="chat-valor chat-valor-neg">${chatFmt(totalGastos)}</span> até agora neste mês.`);
        if(guardadoMes>0)eventos.push(`Você guardou <span class="chat-valor chat-valor-gold">${chatFmt(guardadoMes)}</span> nas caixinhas neste mês.`);
        const compromissosFixos=listaFinita(state.gastosFixos).filter(i=>!ehFuturoDoMesAtual(i)).length;const compromissosVariaveis=listaFinita(state.gastosVariaveis).filter(i=>gastoVariavelEhReal(i)&&!i.lembrete&&!ehFuturoDoMesAtual(i)).length;const totalCompromissos=compromissosFixos+compromissosVariaveis;const quitados=listaFinita(state.gastosFixos).filter(i=>i.pago===true&&!ehFuturoDoMesAtual(i)).length+listaFinita(state.gastosVariaveis).filter(i=>gastoVariavelEhReal(i)&&i.pago===true&&!i.lembrete&&!ehFuturoDoMesAtual(i)).length;if(quitados>0&&totalCompromissos>0)eventos.push(`Você já quitou <strong>${quitados} de ${totalCompromissos}</strong> compromisso${totalCompromissos===1?"":"s"} neste mês.`);
        listaFinita(state.caixinhas).filter(cx=>{const o=Number(cx.valorObjetivo)||0,a=typeof totalCaixinha==="function"?totalCaixinha(cx):Number(cx.valorGuardado)||0;return o>0&&a>=o&&(Number(cx.valorGuardadoMes)||0)>0;}).slice(0,2).forEach(cx=>eventos.push(`A caixinha <strong>${esc(cx.nome||"Caixinha")}</strong> alcançou a meta de <span class="chat-valor chat-valor-gold">${chatFmt(cx.valorObjetivo)}</span>.`));
        const resultado=totalGanhos-totalGastos-guardadoMes;if(Math.abs(resultado)>=.01)eventos.push(`O resultado líquido do mês até agora é <span class="chat-valor ${resultado>=0?"chat-valor-pos":"chat-valor-neg"}">${chatFmt(Math.abs(resultado))}</span> ${resultado>=0?"positivo":"negativo"}.`);
        appendMensagem(eventos.length?`<strong>O que aconteceu este mês: (Até agora)</strong><ul class="caixa-chat-acontecimentos-lista">${eventos.slice(0,7).map(e=>`<li>${e}</li>`).join("")}</ul>`:`<strong>O que aconteceu este mês: (Até agora)</strong><span class="caixa-chat-note">Ainda não encontrei informações relevantes para destacar sem inventar contexto.</span>`);
      }

  if (id === "pendencias") {
        const fixosPendentes = listaFinita(state.gastosFixos).filter(i => i.pago !== true && (Number(i.valor) || 0) > 0);
        const variaveisPendentes = listaFinita(state.gastosVariaveis).filter(i => gastoVariavelEhReal(i) && i.pago !== true && !i.lembrete && (Number(i.valor) || 0) > 0);
        const totalPend = t.aPagarFixos + t.aPagarVariaveis;
        const linhaPendente = (i, tipo) => {
          const parcelaRaw = tipo === "fixo" && /^\d+\s*\/\s*\d+$/.test(String(i.parcela || "").trim())
            ? String(i.parcela).trim().replace(/\s+/g, "") : "";
          const parcela = parcelaRaw ? `<span class="chat-pendente-parcela">(${esc(parcelaRaw)})</span>` : "";
          const proximoMes = ehDoProximoMes(i)
            ? `<span class="chat-pendente-proximo">Mês que vem</span>` : "";
          const data = formatarDataCurta(i.data);
          const nome = i.nome || (tipo === "fixo" ? "Gasto fixo" : "Gasto variável");
          return `<li><span class="chat-pendente-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h12M13 7l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="chat-pendente-main"><strong>${esc(nome)}${parcela}</strong><small>${[proximoMes, data ? `<span>${data}</span>` : ""].filter(Boolean).join(" · ")}</small></span><strong class="chat-valor chat-valor-neg">${chatFmt(i.valor)}</strong></li>`;
        };
        const pendenciasOrdenadas = [
          ...fixosPendentes.map(i => ({ item: i, tipo: "fixo" })),
          ...variaveisPendentes.map(i => ({ item: i, tipo: "variavel" }))
        ].sort((a, b) => compararDataAscendente(a.item.data, b.item.data));
        const linhasPendencias = pendenciasOrdenadas.map(({ item, tipo }) => linhaPendente(item, tipo)).join("");
        const detalhes = pendenciasOrdenadas.length
          ? `<ul class="caixa-chat-pendencias-lista lista-simples">${linhasPendencias}</ul>`
          : "";
        const vazio = !detalhes ? `<div class="caixa-chat-empty">Nenhum gasto pendente encontrado.</div>` : detalhes;
        const totalDesteMes = t.aPagarFixosEsseMes + t.aPagarVariaveisEsseMes;
        const totalFuturo = t.aPagarFixosFuturos + t.aPagarVariaveisFuturos;
        const notaPendencias = totalFuturo > 0
          ? `Deste total, ${chatFmt(totalDesteMes)} vencem neste mês e ${chatFmt(totalFuturo)} são contas futuras já lançadas.`
          : `Todas as contas pendentes de ${chatFmt(totalDesteMes)} vencem neste mês.`;
        appendMensagem(`<strong>Ainda falta pagar ${chatFmt(totalPend)} no total.</strong>${vazio}<span class="caixa-chat-note">${notaPendencias} Também há ${chatFmt(t.aReceber)} para receber.</span>`);
      }


    });
  }


  // -------------------------------------------------------------------
  // CADASTRO CONVERSACIONAL
  // O botão + usa este fluxo para TODOS os tipos de lançamento. Cada
  // pergunta aparece como uma mensagem do assistente, com cards e/ou
  // campo de resposta. O salvamento usa as mesmas operações dos formulários
  // antigos, portanto a Firebase e as regras existentes continuam iguais.
  // -------------------------------------------------------------------
  let cadastroAtivo = null;

  function escolhaChat(opcoes, callback, opts = {}) {
    const wrap = document.createElement("div");
    wrap.className = `caixa-chat-choices ${opts.className || ""}`;
    opcoes.forEach(op => {
      const [valor, titulo, sub = "", extraClass = ""] = op;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `caixa-chat-choice ${extraClass}`;
      btn.innerHTML = `<span><strong>${esc(titulo)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${opts.showArrow === false ? "" : `<span class="caixa-chat-choice-arrow">›</span>`}`;
      btn.addEventListener("click", () => {
        wrap.remove();
        appendMensagem(esc(titulo), "user");
        callback(valor, titulo);
      });
      wrap.appendChild(btn);
    });
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function selectChat(label, opcoes, callback, opts = {}) {
    appendMensagem(`<strong>${esc(label)}</strong>`);
    const wrap = document.createElement("div");
    wrap.className = `caixa-chat-select-wrap ${opts.className || ""}`;
    const select = document.createElement("select");
    select.className = "caixa-chat-select";
    select.setAttribute("aria-label", label);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = opts.placeholder || "Selecione uma opção…";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    opcoes.forEach(op => {
      const [valor, titulo] = op;
      const option = document.createElement("option");
      option.value = String(valor);
      option.textContent = titulo;
      select.appendChild(option);
    });
    if (opts.defaultValue !== undefined && opts.defaultValue !== null) {
      const valorPadrao = String(opts.defaultValue);
      const existe = Array.from(select.options).some((option) => option.value === valorPadrao);
      if (existe) {
        select.value = valorPadrao;
        placeholder.selected = false;
      }
    }
    const enviar = document.createElement("button");
    enviar.type = "button";
    enviar.className = "caixa-chat-select-btn";
    enviar.textContent = "Continuar";
    const concluir = () => {
      if (select.value === "") { select.focus(); return; }
      const titulo = select.options[select.selectedIndex]?.textContent || select.value;
      wrap.remove();
      appendMensagem(titulo, "user");
      callback(select.value, titulo);
    };
    select.addEventListener("change", () => { if (opts.autoSubmit) concluir(); });
    select.addEventListener("keydown", e => { if (e.key === "Enter") concluir(); });
    enviar.addEventListener("click", concluir);
    wrap.append(select, enviar);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    setTimeout(() => select.focus(), 40);
    return wrap;
  }

  function formatarNomeCadastro(texto) {
    return String(texto || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("pt-BR")
      .replace(/(^|[\s\-\u2013\u2014'])[\p{L}\p{M}]/gu, m => m.toLocaleUpperCase("pt-BR"));
  }

  function campoChat(label, placeholder, callback, opts = {}) {
    if (!opts.skipQuestion) appendMensagem(`<strong>${esc(label)}</strong>`);
    const wrap = document.createElement("div");
    wrap.className = `caixa-chat-simulador-form caixa-chat-cadastro-form ${opts.className || ""}`;
    const inputType = opts.type || "text";
    const valorInicial = opts.value != null ? `value="${esc(opts.value)}"` : "";
    wrap.innerHTML = `
      <label class="caixa-chat-simulador-input">
        <span>${esc(label)}</span>
        <input type="${inputType}" ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""} autocomplete="${opts.autocomplete || "off"}" placeholder="${esc(placeholder || "")}" aria-label="${esc(label)}" ${valorInicial}>
      </label>
      <button type="button" class="caixa-chat-simulador-btn">Enviar</button>`;
    body.appendChild(wrap);
    const input = wrap.querySelector("input");
    const enviar = () => {
      let valor = String(input.value || "").trim();
      if (opts.formatarNome && valor) {
        valor = formatarNomeCadastro(valor);
        input.value = valor;
      }
      if (!valor && !opts.allowEmpty) { input.focus(); return; }
      wrap.remove();
      if (!opts.skipResponse) appendMensagem(valor || "Pular", "user");
      callback(valor);
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") enviar(); });
    wrap.querySelector("button").addEventListener("click", enviar);
    setTimeout(() => input.focus(), 40);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function campoValorCadastro(label, callback, opts = {}) {
    if (!opts.skipQuestion) appendMensagem(`<strong>${esc(label)}</strong>`);
    const wrap = document.createElement("div");
    wrap.className = "caixa-chat-simulador-form caixa-chat-cadastro-form caixa-chat-valor-form";
    wrap.innerHTML = `
      <label class="caixa-chat-simulador-input">
        <span>${esc(label)}</span>
        <input type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(opts.placeholder || "Ex.: 300,00")}" aria-label="${esc(label)}">
      </label>
      <button type="button" class="caixa-chat-simulador-btn">Enviar</button>`;
    body.appendChild(wrap);

    const input = wrap.querySelector("input");
    const enviar = wrap.querySelector("button");
    const permitirVazio = !!opts.allowEmpty;

    const formatar = () => {
      let digitos = String(input.value || "").replace(/\D/g, "");
      if (!digitos) {
        input.value = "";
        return;
      }
      digitos = digitos.replace(/^0+(?=\d)/, "");
      while (digitos.length < 3) digitos = "0" + digitos;
      const centavos = digitos.slice(-2);
      const inteiros = digitos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      input.value = `R$ ${inteiros},${centavos}`;
    };

    const atualizarBotao = () => {
      const texto = String(input.value || "").trim();
      const numero = parseValor(texto.replace(/^R\$\s*/i, ""));
      enviar.disabled = !((numero > 0) || (permitirVazio && texto === ""));
      enviar.classList.toggle("is-disabled", enviar.disabled);
    };

    input.addEventListener("input", () => {
      formatar();
      atualizarBotao();
    });

    const concluir = () => {
      const texto = String(input.value || "").trim();
      const numero = texto ? parseValor(texto.replace(/^R\$\s*/i, "")) : 0;
      if (!texto && permitirVazio) {
        wrap.remove();
        appendMensagem("Pular", "user");
        callback(0);
        return;
      }
      if (!(numero > 0)) {
        input.focus();
        input.classList.add("input-erro");
        setTimeout(() => input.classList.remove("input-erro"), 500);
        return;
      }
      wrap.remove();
      appendMensagem(input.value, "user");
      callback(numero);
    };

    input.addEventListener("keydown", e => { if (e.key === "Enter") concluir(); });
    enviar.addEventListener("click", concluir);
    atualizarBotao();
    setTimeout(() => input.focus(), 40);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function categoriasEscolhiveis(callback) {
    const cats = typeof categoriasAtuais === "function" ? categoriasAtuais() : [];
    const op = cats.map(c => [c, c]);
    op.push(["__sem_categoria", "Sem categoria"]);
    selectChat("E em qual categoria ele entra?", op, (valor, titulo) => {
      callback(valor === "__sem_categoria" ? "" : valor, titulo);
    }, { placeholder: "Selecione uma categoria…", defaultValue: "__sem_categoria" });
  }

  function escolhaIconeChat(callback) {
    const menu = document.createElement("div");
    menu.className = "caixa-chat-icon-picker";
    menu.innerHTML = `
      <div class="caixa-chat-icon-search-wrap">
        <span class="caixa-chat-icon-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"></circle><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>
        </span>
        <input type="search" class="caixa-chat-icon-search" placeholder="Pesquisar ícone…" autocomplete="off" spellcheck="false" aria-label="Pesquisar ícone">
        <button type="button" class="caixa-chat-icon-search-clear is-hidden" aria-label="Limpar pesquisa">×</button>
      </div>
      <div class="caixa-chat-icon-grid" role="listbox" aria-label="Escolha um ícone"></div>
      <div class="caixa-chat-icon-empty is-hidden">Nenhum ícone encontrado.</div>
    `;
    body.appendChild(menu);

    const search = menu.querySelector(".caixa-chat-icon-search");
    const clear = menu.querySelector(".caixa-chat-icon-search-clear");
    const grid = menu.querySelector(".caixa-chat-icon-grid");
    const empty = menu.querySelector(".caixa-chat-icon-empty");
    const opcoes = [{ nome: "", label: "Sem ícone" }, ...(Array.isArray(iconesCaixinhas) ? ordenarIconesPorUso(iconesCaixinhas) : []).map(nome => ({ nome, label: nomeIconeBonito(nome) }))];

    const desenhar = (termo = "") => {
      const busca = normalizarTextoBuscaIcone(termo);
      grid.innerHTML = "";
      const filtradas = opcoes.filter(x => !busca || normalizarTextoBuscaIcone(`${x.nome} ${x.label}`).includes(busca));
      empty.classList.toggle("is-hidden", filtradas.length > 0);
      clear.classList.toggle("is-hidden", !busca);

      filtradas.forEach(({ nome, label }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "caixa-chat-icon-choice";
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-label", label);
        btn.title = label;
        if (!nome) {
          btn.innerHTML = '<span class="caixa-chat-icon-none">×</span>';
        } else {
          const img = document.createElement("img");
          img.src = urlIconeCaixinha(nome);
          img.alt = "";
          img.loading = "lazy";
          img.decoding = "async";
          img.onerror = () => btn.remove();
          btn.appendChild(img);
        }
        btn.addEventListener("click", () => {
          menu.remove();
          if (nome) registrarUsoIconeCaixinha(nome);
          if (nome) {
            appendMensagem(`<span class="caixa-chat-icon-selected" title="${esc(label)}"><img src="${esc(urlIconeCaixinha(nome))}" alt="${esc(label)}"></span>`, "user");
          } else {
            appendMensagem("Sem ícone", "user");
          }
          callback(nome, label);
        });
        grid.appendChild(btn);
      });
    };

    search.addEventListener("input", () => desenhar(search.value));
    clear.addEventListener("click", () => { search.value = ""; desenhar(""); search.focus(); });
    search.addEventListener("keydown", e => { if (e.key === "Escape") { menu.remove(); body.scrollTop = body.scrollHeight; } });
    desenhar("");
    setTimeout(() => search.focus(), 40);
    body.scrollTop = body.scrollHeight;
    return menu;
  }

  function formatarDataParaChat(valor) {
    const s = String(valor || "").trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function perguntaDataCadastro(callback, label = "Qual é a data?") {
    appendMensagem(`<strong>${esc(label)}</strong>`);
    const hoje = dataHojeISO();
    campoChat(label, "", valor => {
      const data = valor || hoje;
      appendMensagem(esc(formatarDataParaChat(data)), "user");
      callback(data);
    }, { type: "date", autocomplete: "off", value: hoje, skipResponse: true, skipQuestion: true });
  }

  function perguntaStatusCadastro(label, positivo, negativo, callback) {
    appendMensagem(`<strong>${esc(label)}</strong>`);
    escolhaChat([[true, positivo, ""], [false, negativo, ""]], callback);
  }

  function mostrarFeedbackCadastro(titulo, mensagem) {
    // Feedback visual fora do balão: a confirmação aparece imediatamente e
    // transforma o cadastro em uma pequena recompensa visual, sem depender
    // apenas da última mensagem do chat.
    const anterior = document.getElementById("caixaCadastroFeedback");
    if (anterior) anterior.remove();

    const isGanho = /ganho/i.test(titulo);
    const isCaixinha = /caixinha/i.test(titulo);
    const tipo = isGanho ? "ganho" : isCaixinha ? "caixinha" : "gasto";
    const icone = isGanho ? "↑" : isCaixinha ? "◇" : "✓";
    const etiqueta = isGanho ? "GANHO" : isCaixinha ? "CAIXINHA" : "GASTO";

    const overlay = document.createElement("div");
    overlay.id = "caixaCadastroFeedback";
    overlay.className = `caixa-cadastro-feedback caixa-cadastro-feedback-${tipo}`;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div class="caixa-cadastro-feedback-confetti" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
      <div class="caixa-cadastro-feedback-card">
        <div class="caixa-cadastro-feedback-orb" aria-hidden="true"><span>${icone}</span></div>
        <div class="caixa-cadastro-feedback-kicker"><span class="caixa-cadastro-feedback-dot"></span>${etiqueta}</div>
        <strong class="caixa-cadastro-feedback-title">${esc(titulo.replace(/^(Gasto|Ganho|Caixinha) (adicionado|criada)$/i, "$1"))}</strong>
        <div class="caixa-cadastro-feedback-detail">${mensagem}</div>
        <div class="caixa-cadastro-feedback-stamp"><span>✓</span> Registrado com sucesso</div>
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-visible"));

    const remover = () => {
      overlay.classList.remove("is-visible");
      overlay.classList.add("is-closing");
      setTimeout(() => overlay.remove(), 260);
    };
    setTimeout(remover, 2100);
    overlay.addEventListener("click", remover, { once: true });
  }

  function finalizarCadastro(titulo, mensagem) {
    appendMensagem(`<strong>${esc(titulo)}</strong><br>${mensagem}`);
    mostrarFeedbackCadastro(titulo, mensagem);
    cadastroAtivo = null;
    appendMensagem("Quer adicionar outro lançamento?");
    escolhaChat([
      ["sim", "Sim, adicionar outro", "Voltar para o início do cadastro"]
    ], escolha => {
      if (escolha === "sim") iniciarCadastroConversacional();
    });
  }

  function iniciarCadastroConversacional() {
    if (isAmbos()) {
      appendMensagem("No modo <strong>Juntos</strong>, o cadastro individual fica indisponível. Escolha Davi ou Gabriel para adicionar um lançamento.");
      return;
    }
    window._caixaChatSessao = (Number(window._caixaChatSessao) || 0) + 1;
    quick.classList.add("is-hidden");
    const quickTitle = quick.previousElementSibling;
    if (quickTitle && quickTitle.classList.contains("caixa-chat-quick-title")) quickTitle.classList.add("is-hidden");
    const welcome = body.querySelector(".caixa-chat-welcome");
    if (welcome) welcome.classList.add("is-hidden");
    body.querySelectorAll("#caixaChatBack").forEach(x => x.remove());
    cadastroAtivo = { etapa: "tipo" };

    appendMensagem("Claro! Vamos registrar isso juntos. <strong>O que você quer adicionar?</strong>");
    escolhaChat([
      ["gasto", "Gasto", "Algo que você comprou, pagou ou parcelou"],
      ["ganho", "Ganho", "Dinheiro que entrou ou vai entrar"],
      ["caixinha", "Caixinha", "Reserva, meta ou dinheiro guardado"]
    ], tipo => {
      cadastroAtivo.tipo = tipo;
      if (tipo === "gasto") fluxoGasto();
      if (tipo === "ganho") fluxoGanho();
      if (tipo === "caixinha") fluxoCaixinha();
    });

    function fluxoGasto() {
      appendMensagem("Vamos ao <strong>gasto</strong>.");
      campoChat("O que foi?", "Ex.: Mercado, Amazon, aluguel…", nome => {
        cadastroAtivo.nome = nome;
        campoValorCadastro("Qual foi o valor?", valor => {
          cadastroAtivo.valor = valor;
          appendMensagem("Esse gasto acontece <strong>só este mês</strong> ou vai <strong>se repetir nos próximos meses</strong>?");
          escolhaChat([
            ["fixo", "Vai se repetir", "Entra como gasto fixo"],
            ["variavel", "Só este mês", "Entra como gasto variável"]
          ], tipoGasto => {
            cadastroAtivo.tipoGasto = tipoGasto;
            if (tipoGasto === "fixo") fluxoGastoFixo();
            else fluxoGastoVariavel();
          });
        });
      }, { formatarNome: true });
    }

    function perguntarFaturaAntesDaData(callback) {
      appendMensagem("Esse gasto vai entrar em uma <strong>fatura</strong>?");
      escolhaChat([
        ["sim", "Sim"],
        ["nao", "Não"]
      ], escolha => {
        if (escolha === "sim") {
          cadastroAtivo.fatura = true;
          const faturas = faturasConfiguradas(state.pessoaAtual);
          const concluirFatura = (faturaId) => {
            const fatura = faturaPorId(faturaId, state.pessoaAtual);
            const vencimento = dataVencimentoFaturaAtual(fatura?.id || "");
            cadastroAtivo.faturaId = fatura?.id || "";
            cadastroAtivo.faturaNome = fatura?.nome || "Fatura";
            cadastroAtivo.data = vencimento;
            appendMensagem(`Vencimento em: ${esc(formatarDataParaChat(vencimento))}`);
            callback(vencimento, true);
          };
          if (faturas.length > 1) {
            selectChat(
              "Em qual fatura?",
              faturas.map(f => [String(f.id), String(f.nome || "Fatura")]),
              concluirFatura,
              { placeholder: "Escolha a fatura…" }
            );
          } else {
            concluirFatura(faturas[0]?.id || "");
          }
        } else {
          cadastroAtivo.fatura = false;
          cadastroAtivo.faturaId = "";
          cadastroAtivo.faturaNome = "";
          perguntaDataCadastro(data => callback(data, false));
        }
      });
    }

    function fluxoGastoFixo() {
      categoriasEscolhiveis(cat => {
        cadastroAtivo.categoria = cat;
        appendMensagem("Esse gasto será <strong>à vista</strong> ou <strong>parcelado</strong>?");
        escolhaChat([
          ["avista", "À vista"],
          ["parcelado", "Parcelado", "Dividido em parcelas"]
        ], modalidade => {
          cadastroAtivo.modalidade = modalidade;
          if (modalidade === "parcelado") {
            selectChat("Em quantas parcelas?", Array.from({length:23}, (_,i)=>[String(i+2), `${i+2}x`]), qtd => {
              cadastroAtivo.parcelas = Number(qtd);
              perguntarFaturaAntesDaData(data => { cadastroAtivo.data = data; statusFixo(); });
            }, { placeholder: "Escolha o número de parcelas…" });
          } else {
            // Gasto fixo à vista continua recorrente; sem número de parcelas,
            // o backend cria o mesmo gasto no mês seguinte.
            cadastroAtivo.parcelas = 0;
            perguntarFaturaAntesDaData(data => { cadastroAtivo.data = data; statusFixo(); });
          }
        });
      });
    }

    function statusFixo() {
      perguntaStatusCadastro("Essa conta já foi paga?", "Sim, já paguei", "Não, está pendente", pago => {
        const n = cadastroAtivo.parcelas || 0;
        const valor = n > 0 ? Math.round((cadastroAtivo.valor / n) * 100) / 100 : cadastroAtivo.valor;
        const parcela = n > 0 ? `1/${n}` : "";
        const nomeSalvo = cadastroAtivo.fatura ? nomeInternoFatura(cadastroAtivo.nome) : cadastroAtivo.nome;
        opFixos.add(nomeSalvo, valor, { pago, tipo: cadastroAtivo.categoria, data: dataDoLancamento(cadastroAtivo.data), parcela, fatura: cadastroAtivo.fatura === true, faturaId: cadastroAtivo.faturaId || "" });
        finalizarCadastro("Gasto adicionado", `${esc(cadastroAtivo.nome)} · <span class="chat-valor chat-valor-neg">${chatFmt(valor)}</span>${n > 1 ? ` · parcela 1/${n}` : ""}.`);
      });
    }

    function fluxoGastoVariavel() {
      categoriasEscolhiveis(cat => {
        cadastroAtivo.categoria = cat;
        appendMensagem("De onde saiu esse dinheiro?");
        escolhaChat([
          ["saldo", "Saldo em conta", "Sai do saldo normal"],
          ["beneficio", "Benefício", "Sai do saldo do benefício"]
        ], origem => {
          cadastroAtivo.origem = origem;
          perguntarFaturaAntesDaData(data => {
            cadastroAtivo.data = data;
            perguntaStatusCadastro("Essa compra já foi paga?", "Sim, já paguei", "Não, está pendente", pago => {
              const nomeSalvo = cadastroAtivo.fatura ? nomeInternoFatura(cadastroAtivo.nome) : cadastroAtivo.nome;
              opVariaveis.add(nomeSalvo, cadastroAtivo.valor, { pago, tipo: cadastroAtivo.categoria, data: dataDoLancamento(cadastroAtivo.data), origem: cadastroAtivo.origem, fatura: cadastroAtivo.fatura === true, faturaId: cadastroAtivo.faturaId || "" });
              finalizarCadastro("Gasto adicionado", `${esc(cadastroAtivo.nome)} · <span class="chat-valor chat-valor-neg">${chatFmt(cadastroAtivo.valor)}</span>.`);
            });
          });
        });
      });
    }

    function fluxoGanho() {
      appendMensagem("Vamos registrar o <strong>ganho</strong>.");
      campoChat("Nome do ganho", "Ex.: Salário, vale, benefício…", nome => {
        cadastroAtivo.nome = nome;
        campoValorCadastro("Qual é o valor?", valor => {
          cadastroAtivo.valor = valor;
          appendMensagem("Esse ganho pertence ao <strong>saldo em conta</strong> ou ao <strong>benefício</strong>?");
          escolhaChat([
            ["saldo", "Saldo em conta", "Entra no saldo normal"],
            ["beneficio", "Benefício", "Entra no saldo do benefício"]
          ], origem => {
            cadastroAtivo.origem = origem;
            perguntaDataCadastro(data => {
              cadastroAtivo.data = data;
              perguntaStatusCadastro("Esse dinheiro já foi recebido?", "Sim, já recebi", "Ainda vou receber", recebido => {
                opGanhos.add(cadastroAtivo.nome, cadastroAtivo.valor, { recebido, data: dataDoLancamento(cadastroAtivo.data), origem: cadastroAtivo.origem });
                finalizarCadastro("Ganho adicionado", `${esc(cadastroAtivo.nome)} · <span class="chat-valor chat-valor-pos">${chatFmt(cadastroAtivo.valor)}</span>.`);
              });
            });
          });
        });
      }, { formatarNome: true });
    }

    function fluxoCaixinha() {
      appendMensagem("Vamos criar a <strong>caixinha</strong>.");
      campoChat("Nome da caixinha", "Ex.: Reserva de emergência, viagem…", nome => {
        cadastroAtivo.nome = nome;
        campoValorCadastro("Quanto já quer guardar nela?", valor => {
          cadastroAtivo.valorInicial = valor;
          appendMensagem("Vamos definir a meta da caixinha.");
          campoValorCadastro("Objetivo", valorObjetivo => {
            cadastroAtivo.valorObjetivo = valorObjetivo || 0;
            appendMensagem("Vamos definir o prazo da meta.");
            campoChat("Prazo", "Escolha uma data ou deixe em branco", data => {
              cadastroAtivo.data = dataDoLancamento(data);
              appendMensagem("Agora escolha um ícone, se quiser.");
              escolhaIconeChat(icone => {
                cadastroAtivo.icone = icone;
                addCaixinha(cadastroAtivo.nome, cadastroAtivo.valorInicial, cadastroAtivo.valorObjetivo, cadastroAtivo.icone, cadastroAtivo.data);
                finalizarCadastro("Caixinha criada", cadastroAtivo.valorInicial > 0
                  ? `${esc(cadastroAtivo.nome)} · guardado inicial de <span class="chat-valor chat-valor-gold">${chatFmt(cadastroAtivo.valorInicial)}</span>.`
                  : `${esc(cadastroAtivo.nome)} · sem valor inicial guardado.`);
              });
            }, { type: "date", allowEmpty: true });
          }, { allowEmpty: true, placeholder: "Ex.: 5.000,00 — ou deixe em branco" });
        }, { allowZero: true, allowEmpty: true, placeholder: "Ex.: 500,00 — ou deixe em branco" });
      }, { formatarNome: true });
    }
  }

  function iniciarPensamento(cb, mensagem = "Só um instante… estou organizando os números para você…") {
    clearTimeout(pensamentoTimer);
    const textoPensamento = thinking.querySelector("em");
    if (textoPensamento) textoPensamento.textContent = mensagem;
    thinking.classList.remove("is-hidden");
    body.scrollTop = body.scrollHeight;
    pensamentoTimer = setTimeout(async () => {
      try {
        const resultado = cb();
        if (resultado && typeof resultado.then === "function") await resultado;
      } finally {
        thinking.classList.add("is-hidden");
        mostrarMenuCompacto();
      }
    }, 620);
  }

  function categoriasPendentesChat() {
    const mapa = {};
    const adicionar = (item, tipo) => {
      if (!item || item.pago === true || ehFuturoDoMesAtual(item)) return;
      if (tipo === "variavel" && (!gastoVariavelEhReal(item) || item.lembrete || !variavelContaNoSaldo(item))) return;
      if (tipo === "fixo" && (Number(item.valor) || 0) <= 0) return;
      const cat = String(item.tipo || "Outros").trim() || "Outros";
      mapa[cat] = (mapa[cat] || 0) + (Number(item.valor) || 0);
    };
    listaFinita(state.gastosFixos).forEach(i => adicionar(i, "fixo"));
    listaFinita(state.gastosVariaveis).forEach(i => adicionar(i, "variavel"));
    return mapa;
  }

  function categoriasHistoricoAnteriorChat(){
    const ant=compararMesAnteriorChat(); if(!ant)return null; const anos=listaFinita(state.historico?.anos); let pm=state.mesAtual-1,pa=state.anoAtual; if(pm===0){pm=12;pa--;} const bloco=anos.find(a=>Number(a.ano)===pa),mes=bloco?.meses?.find(m=>Number(m.mes)===pm); if(!mes)return null;
    const fontes=state.pessoaAtual==="ambos"?[mes.categoriasDavi||{},mes.categoriasGabriel||{}]:[state.pessoaAtual==="gabriel"?(mes.categoriasGabriel||{}):(mes.categoriasDavi||{})]; const mapa={}; fontes.forEach(obj=>Object.entries(obj).forEach(([cat,valor])=>{if(String(cat).trim().toLowerCase()!=="metas")mapa[cat]=(mapa[cat]||0)+Math.abs(Number(valor)||0);})); return mapa;
  }
  function renderResumoAcontecimentos(){}
  window.renderResumoAcontecimentos=renderResumoAcontecimentos;

  let fechamentoChatTimer = null;
  function abrirChat() {
    if (fechamentoChatTimer) { clearTimeout(fechamentoChatTimer); fechamentoChatTimer = null; }
    // O + usa o mesmo painel do chat. Limpamos a altura temporária do fechamento
    // antes de abrir para que o painel possa medir o conteúdo normalmente.
    chat.style.height = "";
    chat.classList.remove("is-closing");
    chat.removeAttribute("inert");
    chat.classList.add("is-open");
    chat.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-expanded", "true");
    atualizarVisibilidadeFab();
    const first = quick.querySelector("button");
    if (first) setTimeout(() => first.focus(), 80);
  }
  function fecharChat() {
    if (!chat.classList.contains("is-open")) return;
    // Congela a altura por alguns frames. Sem isso, resetar o conteúdo enquanto
    // a transição de saída roda faz o painel encolher de forma visível e parece
    // que ele cresce/"estoura" antes de fechar — especialmente no fluxo do +.
    const alturaAtual = chat.offsetHeight;
    if (alturaAtual > 0) chat.style.height = alturaAtual + "px";
    // Retira o foco de qualquer controle interno antes de esconder o painel.
    // Isso evita o aviso do navegador sobre aria-hidden em um elemento focado.
    if (chat.contains(document.activeElement)) document.activeElement?.blur?.();
    chat.classList.add("is-closing");
    chat.classList.remove("is-open");
    chat.setAttribute("aria-hidden", "true");
    chat.setAttribute("inert", "");
    fab.setAttribute("aria-expanded", "false");
    atualizarVisibilidadeFab();
    cadastroAtivo = null;
    if (fechamentoChatTimer) clearTimeout(fechamentoChatTimer);
    fechamentoChatTimer = setTimeout(() => {
      fechamentoChatTimer = null;
      resetarChatParaSelecao();
      chat.classList.remove("is-closing");
      chat.style.height = "";
    }, 280);
  }

  fab.addEventListener("click", () => chat.classList.contains("is-open") ? fecharChat() : abrirChat());
  close.addEventListener("click", fecharChat);

  document.addEventListener("caixa:abrirCadastroChat", () => {
    abrirChat();
    resetarChatParaSelecao();
    iniciarCadastroConversacional();
  });

  quick.addEventListener("click", e => {
    const btn = e.target.closest("[data-chat-acao]");
    if (!btn) return;
    executarAcao(btn.dataset.chatAcao);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && chat.classList.contains("is-open")) fecharChat();
  });

  // Recalcula tudo de novo quando a pessoa trocar Davi/Gabriel/Juntos ou os
  // dados forem sincronizados. A interface fica sempre ligada ao state atual.
  function resetarChatParaSelecao() {
    window._caixaChatSessao = (Number(window._caixaChatSessao) || 0) + 1;
    clearTimeout(pensamentoTimer);
    pensamentoTimer = null;
    thinking.classList.add("is-hidden");
    body.querySelectorAll(".caixa-chat-message, .caixa-chat-choices, .caixa-chat-select-wrap, .caixa-chat-simulador-form, #caixaChatBack").forEach(x => x.remove());
    quick.classList.remove("is-hidden");
    const quickTitle = quick.previousElementSibling;
    if (quickTitle && quickTitle.classList.contains("caixa-chat-quick-title")) quickTitle.classList.remove("is-hidden");
    const welcome = body.querySelector(".caixa-chat-welcome");
    if (welcome) welcome.classList.remove("is-hidden");
    body.scrollTop = 0;
    atualizarVisibilidadeFab();
  }

  document.addEventListener("click", e => {
    if (e.target.closest(".person-btn")) {
      resetarChatParaSelecao();
      fecharChat();
    }
  });
  document.addEventListener("caixa:firebase-logged-in", () => {
    document.getElementById("caixaConfigAdminCard")?.classList.toggle("is-hidden", !usuarioAtualEhAdmin());
    if (usuarioAtualEhAdmin() && typeof viewAtual !== "undefined" && viewAtual === "admin") renderAdmin();
  });
  document.addEventListener("caixa:firebase-logged-out", () => {
    document.getElementById("caixaConfigAdminCard")?.classList.add("is-hidden");
    if (typeof viewAtual !== "undefined" && viewAtual === "admin") mostrarView("home");
  });

  document.addEventListener("caixa:perfil-trocado", () => {
    resetarChatParaSelecao();
    fecharChat();
  });

  mostrarAcoesRapidas();

  // Expor os prompts para diagnóstico/uso futuro sem chamar a IA.
})();


