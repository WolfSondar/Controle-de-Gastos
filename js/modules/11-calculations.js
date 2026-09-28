// =====================================================================
// MÓDULO: 11-calculations
// Cálculos, totais e utilitários de resumo
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

function soma(lista) { return lista.reduce((acc, i) => acc + (Number(i.valor) || 0), 0); }
function somaComStatus(lista, campo) { return lista.reduce((acc, i) => acc + (i[campo] === true ? Number(i.valor) || 0 : 0), 0); }
function somaFixosPagos(lista) { return somaComStatus(lista, "pago"); }
function somaCampo(lista, campo) { return lista.reduce((acc, i) => acc + (Number(i[campo]) || 0), 0); }
// Total "de verdade" guardado numa caixinha: base + rendimento acumulado + o que foi
// depositado neste mês (que só é somado à base no fechamento do mês). Usar sempre essa
// função pra exibir "quanto tem guardado", em vez de olhar só valorGuardado.
function totalCaixinha(cx) {
  return (Number(cx.valorGuardado) || 0) + (Number(cx.rendimentoTotal) || 0) + (Number(cx.valorGuardadoMes) || 0);
}
function somaTotalCaixinhas(lista) { return (lista || []).reduce((acc, cx) => acc + totalCaixinha(cx), 0); }
// Soma dos Gastos Variáveis pagos que contam no saldo — exclui os marcados
// como "lembrete" (compra do mês que vem, paga adiantada: já foi debitada
// no mês em que foi paga, então não conta de novo aqui). Ver fecharMes() no
// A regra também é aplicada localmente pela função variavelContaNoSaldo().
function gastoVariavelEhReal(item) {
  return !ehLancamentoDeCaixinha(item?.nome);
}
function somaVariaveisPagas(lista) {
  return lista.reduce((acc, i) => acc + (gastoVariavelEhReal(i) && i.pago === true && i.lembrete !== true ? Number(i.valor) || 0 : 0), 0);
}

function ehLancamentoDeCaixinha(nome) { return typeof nome === "string" && nome.indexOf("Guardado: ") === 0; }

function animarNumero(el, de, para, duracao = 650, pulsar = true) {
  if (!el) return;
  if (de === null || de === undefined || de === para) {
    el.textContent = fmt(para);
    return;
  }
  if (pulsar) {
    el.classList.remove("is-pulsing");
    void el.offsetWidth;
    el.classList.add("is-pulsing");
  }
  const inicio = performance.now();
  function passo(agora) {
    const p = Math.min((agora - inicio) / duracao, 1);
    const suavizado = 1 - Math.pow(1 - p, 4); 
    el.textContent = fmt(de + (para - de) * suavizado);
    if (p < 1) requestAnimationFrame(passo);
    else el.textContent = fmt(para);
  }
  requestAnimationFrame(passo);
}

function renderTotais() {
  const totalGanhosGeral = soma(state.ganhos);
  const totalGanhosRecebidos = somaComStatus(state.ganhos, "recebido");
  const ganhosPorOrigem = separarGanhosPorOrigem(state.ganhos);
  const totalGanhosAReceber = totalGanhosGeral - totalGanhosRecebidos;

  const totalFixosGeral = soma(state.gastosFixos);
  const totalFixosPagos = somaFixosPagos(state.gastosFixos);
  const totalFixosAPagar = totalFixosGeral - totalFixosPagos;

  const gastosVariaveisReais = state.gastosVariaveis.filter(gastoVariavelEhReal);
  const totalVariaveisGeral = soma(gastosVariaveisReais);
  const totalVariaveisPagos = somaVariaveisPagas(gastosVariaveisReais);
  const totalVariaveisAPagar = Math.max(0, totalVariaveisGeral - totalVariaveisPagos);

  // "Guardado" aqui é o quanto entrou nas caixinhas ESSE mês — igual aos
  // outros 3 cards do topo (Ganhos/Fixos/Variáveis), que também são do mês
  // atual, não um acumulado. O total "de verdade" guardado em cada caixinha
  // (base + rendimento + o que entrou esse mês) já aparece no card de cada
  // caixinha individualmente — aqui é só a movimentação do mês.
  const totalGuardadoAtual = somaTotalCaixinhas(state.caixinhas);
  const totalGuardadoNoMes = somaCampo(state.caixinhas, "valorGuardadoMes");
  // Saldo disponível e benefício usam a mesma fonte de cálculo do fechamento.
  // Assim, o valor que aparece na tela é exatamente o valor que o mês leva
  // para o fechamento, sem uma segunda fórmula escondida no backend.
  const saldosDisponiveis = window.CAIXA_FIREBASE?.calcularSaldosDisponiveis
    ? window.CAIXA_FIREBASE.calcularSaldosDisponiveis({
        ganhos: state.ganhos,
        gastosFixos: state.gastosFixos,
        gastosVariaveis: state.gastosVariaveis,
        caixinhas: state.caixinhas,
      })
    : null;
  const saldo = saldosDisponiveis ? saldosDisponiveis.total : (ganhosPorOrigem.beneficios + ganhosPorOrigem.ganhos - totalFixosPagos - totalVariaveisPagos - totalGuardadoNoMes);

  const ganhosEl = document.getElementById("statGanhos");
  const fixosEl = document.getElementById("statFixos");
  const variaveisEl = document.getElementById("statVariaveis");
  const guardadoEl = document.getElementById("statGuardado");
  const saldoEl = document.getElementById("saldoValor");
  const beneficiosEl = document.getElementById("saldoBeneficios");
  const ganhosSaldoEl = document.getElementById("saldoGanhos");
  const beneficioRestanteEl = document.getElementById("saldoBeneficioRestante");
  const saldoRestanteEl = document.getElementById("saldoRestante");

  const primeiraVez = prevTotals.saldo === null;

  animarNumero(ganhosEl, prevTotals.ganhos, totalGanhosRecebidos);
  animarNumero(fixosEl, prevTotals.fixos, totalFixosPagos);
  animarNumero(variaveisEl, prevTotals.variaveis, totalVariaveisPagos);
  animarNumero(guardadoEl, prevTotals.guardado, totalGuardadoAtual);
  const guardadoMesEl = document.getElementById("statGuardadoMes");
  if (guardadoMesEl) guardadoMesEl.textContent = totalGuardadoNoMes > 0 ? `+ ${fmt(totalGuardadoNoMes)} neste mês` : "";

  // O saldo tem um pequeno indicador de variação dentro do próprio visor.
  // Nunca usamos textContent diretamente no container do saldo, porque isso
  // apagaria o indicador a cada frame da animação numérica.
  let saldoNumeroEl = saldoEl ? saldoEl.querySelector(".saldo-numero") : null;
  if (saldoEl && !saldoNumeroEl) {
    saldoNumeroEl = document.createElement("span");
    saldoNumeroEl.className = "saldo-numero";
    saldoNumeroEl.textContent = saldoEl.textContent.trim();
    saldoEl.textContent = "";
    saldoEl.appendChild(saldoNumeroEl);
  }
  // O saldo muda suavemente, mas o visor nunca pulsa.
  animarNumero(saldoNumeroEl, prevTotals.saldo, saldo, 650, false);

  // O visor do saldo mantém dimensões fixas e mostra apenas a variação
  // da última sincronização no canto direito — sem criar/remover o card.
  if (saldoEl) {
    let deltaEl = saldoEl.querySelector(".saldo-delta");
    if (!deltaEl) {
      deltaEl = document.createElement("span");
      deltaEl.className = "saldo-delta";
      deltaEl.setAttribute("aria-live", "polite");
      saldoEl.appendChild(deltaEl);
    }

    const deltaSaldo = primeiraVez ? 0 : saldo - (Number(prevTotals.saldo) || 0);

    // A variação aparece dentro do próprio visor do saldo por 1 segundo.
    // Depois, tanto a cor de entrada/saída quanto o texto desaparecem e o
    // visor volta exatamente ao estado original.
    if (saldoEl._deltaTimer) {
      clearTimeout(saldoEl._deltaTimer);
      saldoEl._deltaTimer = null;
    }

    saldoEl.classList.remove("saldo-subiu", "saldo-caiu");
    deltaEl.className = "saldo-delta";
    deltaEl.textContent = "";

    if (deltaSaldo > 0) {
      deltaEl.textContent = `+ ${fmt(deltaSaldo)}`;
      deltaEl.className = "saldo-delta positivo is-visible";
      saldoEl.classList.add("saldo-subiu");
    } else if (deltaSaldo < 0) {
      deltaEl.textContent = `− ${fmt(Math.abs(deltaSaldo))}`;
      deltaEl.className = "saldo-delta negativo is-visible";
      saldoEl.classList.add("saldo-caiu");
    }

    if (deltaSaldo !== 0) {
      saldoEl._deltaTimer = setTimeout(() => {
        deltaEl.classList.remove("is-visible");
        saldoEl.classList.remove("saldo-subiu", "saldo-caiu");
        setTimeout(() => {
          if (!deltaEl.classList.contains("is-visible")) {
            deltaEl.textContent = "";
            deltaEl.className = "saldo-delta";
          }
        }, 180);
      }, 1000);
    }
  }

  saldoEl.classList.toggle("negative", saldo < 0);

  // Mostra o que ainda resta de cada origem. O HTML atual do saldo usa
  // saldoBeneficioRestante e saldoRestante; os IDs saldoBeneficios/saldoGanhos
  // continuam sendo usados no card Ganhos.
  const gastosVariaveisBeneficio = saldosDisponiveis ? saldosDisponiveis.gastosVariaveisBeneficio : (state.gastosVariaveis || []).reduce((acc, item) => {
    return acc + (gastoVariavelEhReal(item) && variavelContaNoSaldo(item) && variavelEhBeneficio(item) ? (Number(item.valor) || 0) : 0);
  }, 0);
  const gastosVariaveisSaldo = saldosDisponiveis ? saldosDisponiveis.gastosVariaveisSaldo : (state.gastosVariaveis || []).reduce((acc, item) => {
    return acc + (gastoVariavelEhReal(item) && variavelContaNoSaldo(item) && !variavelEhBeneficio(item) ? (Number(item.valor) || 0) : 0);
  }, 0);
  const beneficioRestante = saldosDisponiveis ? saldosDisponiveis.beneficio : (ganhosPorOrigem.beneficios - gastosVariaveisBeneficio);
  // Deve representar exatamente o mesmo "saldo em conta" usado pelo
  // assistente: gastos reais + dinheiro guardado neste mês.
  const saldoRestante = saldosDisponiveis ? saldosDisponiveis.saldoConta : (ganhosPorOrigem.ganhos - totalFixosPagos - gastosVariaveisSaldo - totalGuardadoNoMes);

  if (beneficiosEl) {
    beneficiosEl.textContent = fmt(beneficioRestante);
    beneficiosEl.classList.toggle("negative", beneficioRestante < 0);
  }
  if (ganhosSaldoEl) {
    ganhosSaldoEl.textContent = fmt(saldoRestante);
    ganhosSaldoEl.classList.toggle("negative", saldoRestante < 0);
  }
  if (beneficioRestanteEl) {
    beneficioRestanteEl.textContent = fmt(beneficioRestante);
    beneficioRestanteEl.classList.toggle("negative", beneficioRestante < 0);
  }
  if (saldoRestanteEl) {
    saldoRestanteEl.textContent = fmt(saldoRestante);
    saldoRestanteEl.classList.toggle("negative", saldoRestante < 0);
  }

  const ganhosPendenteEl = document.getElementById("statGanhosPendente");
  if (ganhosPendenteEl) ganhosPendenteEl.textContent = totalGanhosAReceber > 0 ? `+ ${fmt(totalGanhosAReceber)}` : "";
  const fixosPendenteEl = document.getElementById("statFixosPendente");
  if (fixosPendenteEl) fixosPendenteEl.textContent = totalFixosAPagar > 0 ? `− ${fmt(totalFixosAPagar)}` : "";
  const variaveisPendenteEl = document.getElementById("statVariaveisPendente");
  if (variaveisPendenteEl) variaveisPendenteEl.textContent = totalVariaveisAPagar > 0 ? `− ${fmt(totalVariaveisAPagar)}` : "";

  prevTotals.ganhos = totalGanhosRecebidos;
  prevTotals.fixos = totalFixosPagos;
  prevTotals.variaveis = totalVariaveisPagos;
  prevTotals.guardado = totalGuardadoAtual;
  prevTotals.saldo = saldo;
}

function tagPessoa(item) {
  if (!isAmbos() || !item.pessoa) return "";
  return `<span class="pessoa-tag pessoa-${item.pessoa}">${PESSOA_LABEL[item.pessoa]}</span>`;
}

