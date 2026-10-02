// =====================================================================
// MÓDULO: 08-caixinhas
// Criação, edição e movimentação de caixinhas
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

function marcarComemoracaoSeMetaBatida(cx, estavaCompleta) {
  if (!cx) return;
  const objetivo = Number(cx.valorObjetivo) || 0;
  const completaAgora = objetivo > 0 && totalCaixinha(cx) >= objetivo;
  if (!estavaCompleta && completaAgora) cx._comemoraAoRenderizar = true;
}

function addCaixinha(nome, valorInicial, valorObjetivo, icone = "", data = "") {
  if (isAmbos()) return;
  const novaCaixinha = {
    nome,
    valorGuardado: 0,
    valorObjetivo: valorObjetivo || 0,
    valorGuardadoMes: valorInicial || 0,
    icone: normalizarNomeIcone(icone),
    data: String(data || "").trim(),
  };
  state.caixinhas.push(novaCaixinha);
  marcarAlteracaoLocal();
  marcarComemoracaoSeMetaBatida(novaCaixinha, false);
  salvarBloco("saveCaixinhas", state.caixinhas);
  if (valorInicial > 0) {
    state.gastosVariaveis.push({ nome: `Guardado: ${nome}`, valor: valorInicial, pago: true, tipo: "Metas", data: dataHojeISO(), origem: "saldo" });
    salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  }
  sincronizarCacheAtual();
  renderAll();
}
function removeCaixinha(index) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const guardado = totalCaixinha(cx);
  state.caixinhas.splice(index, 1);
  marcarAlteracaoLocal();
  if (guardado > 0) {
    state.ganhos.push({ nome: `Retirado da caixinha: ${cx.nome} (removida)`, valor: guardado, recebido: true, data: dataHojeISO() });
    salvarBloco("saveGanhos", state.ganhos);
  }
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  renderAll();
}
function editCaixinha(index, nome, valorObjetivo, icone = "", data = "") {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const nomeAntigo = cx.nome;
  const objetivoAntes = Number(cx.valorObjetivo) || 0;
  const estavaCompleta = objetivoAntes > 0 && totalCaixinha(cx) >= objetivoAntes;
  cx.nome = nome;
  cx.valorObjetivo = valorObjetivo || 0;
  marcarAlteracaoLocal();
  cx.icone = normalizarNomeIcone(icone);
  cx.data = dataDoLancamento(data);
  marcarComemoracaoSeMetaBatida(cx, estavaCompleta);
  if (nomeAntigo !== nome) {
    const rotuloAntigo = `Guardado: ${nomeAntigo}`;
    const rotuloNovo = `Guardado: ${nome}`;
    let mudouAlgo = false;
    state.gastosVariaveis.forEach((item) => {
      if (item.nome === rotuloAntigo) {
        item.nome = rotuloNovo;
        mudouAlgo = true;
      }
    });
    if (mudouAlgo) salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  }
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  renderAll();
}
function guardarNaCaixinha(index, valor) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const objetivoAntes = Number(cx.valorObjetivo) || 0;
  const estavaCompleta = objetivoAntes > 0 && totalCaixinha(cx) >= objetivoAntes;
  // O depósito entra só no "guardado no mês" — ele só é somado à base (valorGuardado)
  // quando o mês fecha. O total exibido (totalCaixinha) já soma os dois, então o
  // saldo mostrado pro usuário não muda, só onde o valor fica guardado até o fechamento.
  cx.valorGuardadoMes = (Number(cx.valorGuardadoMes) || 0) + valor;
  marcarAlteracaoLocal();
  marcarComemoracaoSeMetaBatida(cx, estavaCompleta);
  state.gastosVariaveis.push({ nome: `Guardado: ${cx.nome}`, valor, pago: true, tipo: "Metas", data: dataHojeISO(), origem: "saldo" });
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  renderAll();
}
function retirarDaCaixinha(index, valor) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  // Tira primeiro do que foi guardado neste mês (o mais "recente"), e só desconta
  // da base (valorGuardado) o que sobrar — assim o total cai exatamente o valor
  // retirado, sem zerar um campo e deixar o outro alto por engano.
  const doMes = Math.min(valor, Number(cx.valorGuardadoMes) || 0);
  const doResto = valor - doMes;
  cx.valorGuardadoMes = Math.max((Number(cx.valorGuardadoMes) || 0) - doMes, 0);
  cx.valorGuardado = Math.max((Number(cx.valorGuardado) || 0) - doResto, 0);
  marcarAlteracaoLocal();
  state.ganhos.push({ nome: `Retirado da caixinha: ${cx.nome}`, valor, recebido: true, data: dataHojeISO() });
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  salvarBloco("saveGanhos", state.ganhos);
  renderAll();
}
// O usuário informa o valor TOTAL ATUALIZADO da caixinha (o que está
// mostrando hoje no banco/investimento) — não quanto rendeu. O app calcula
// a diferença sozinho (positiva = rendeu, negativa = essa caixinha perdeu
// valor no período) e acumula em rendimentoTotal, que vai pra coluna S na
// Firebase (RENDIMENTO). Ver o badge em renderCaixinhas(): mostra em verde
// quando é ganho e em vermelho quando é perda, em vez de só sumir quando
// negativo (perda também é informação — esconder isso seria mascarar que a
// caixinha desvalorizou).
function informarRendimentoCaixinha(index, novoMontanteTotal) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;

  const objetivoAntes = Number(cx.valorObjetivo) || 0;
  const estavaCompleta = objetivoAntes > 0 && totalCaixinha(cx) >= objetivoAntes;

  const valorBaseAtual = Number(cx.valorGuardado) || 0;
  const rendimentoDoPeriodoAnterior = Number(cx.rendimentoTotal) || 0;
  const guardadoMesAtual = Number(cx.valorGuardadoMes) || 0;
  const totalAtualNaTela = valorBaseAtual + rendimentoDoPeriodoAnterior + guardadoMesAtual;
  const diferencaRendimento = Number(novoMontanteTotal) - totalAtualNaTela;

  // O rendimentoTotal continua sendo o componente do período atual usado no
  // patrimônio da caixinha. O acumulado é outro campo e NUNCA é substituído
  // pelo rendimento do mês: ele só recebe a diferença nova.
  // O acumulado é sempre reconstruído a partir do histórico mensal quando
  // esse histórico existir. Assim o chip nunca volta a mostrar somente o
  // rendimento do mês atual por causa de um valor antigo/stale em
  // rendimentoAcumulado.
  const mesAtualRendimento = Number(state.mesAtual) || new Date().getMonth() + 1;
  const anoAtualRendimento = Number(state.anoAtual) || new Date().getFullYear();
  const historico = Array.isArray(cx.rendimentoHistorico)
    ? cx.rendimentoHistorico.map(item => ({
        mes: Number(item?.mes) || 0,
        ano: Number(item?.ano) || 0,
        valor: Number(item?.valor) || 0,
      })).filter(item => item.mes >= 1 && item.mes <= 12 && item.ano > 0 && item.valor !== 0)
    : [];

  if (diferencaRendimento !== 0) {
    cx.rendimentoTotal = rendimentoDoPeriodoAnterior + diferencaRendimento;
    const registro = historico.find(item => item.mes === mesAtualRendimento && item.ano === anoAtualRendimento);
    if (registro) registro.valor += diferencaRendimento;
    else historico.push({ mes: mesAtualRendimento, ano: anoAtualRendimento, valor: diferencaRendimento });
    cx.rendimentoHistorico = historico.filter(item => item.valor !== 0);
    cx.rendimentoAcumulado = cx.rendimentoHistorico.reduce((total, item) => total + (Number(item.valor) || 0), 0);
    marcarAlteracaoLocal();
  } else {
    // Se já houver histórico, ele é a fonte de verdade do acumulado.
    // Se ainda não houver, preservamos o acumulado existente (migração).
    cx.rendimentoHistorico = historico;
    if (historico.length) {
      cx.rendimentoAcumulado = historico.reduce((total, item) => total + (Number(item.valor) || 0), 0);
    } else if (!Number.isFinite(Number(cx.rendimentoAcumulado))) {
      cx.rendimentoAcumulado = rendimentoDoPeriodoAnterior;
    }
  }

  marcarComemoracaoSeMetaBatida(cx, estavaCompleta);
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  renderAll();
}

