// =====================================================================
// MÓDULO: 09-divisions
// Divisões, transferências e vínculos entre pessoas
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

async function obterListaLocal(pessoa, chave) {
  if (pessoa === state.pessoaAtual && !isAmbos()) return [...state[chave]];
  const cache = await getCache(pessoa);
  if (cache) return [...(cache[chave] || [])];
  const data = await fetchApiGet({ pessoa }).then((r) => r.json());
  if (data && data.ok === false) throw new Error(data.error || "Erro ao ler dados atuais");
  return (data && data[chave]) || [];
}

// Marcador guardado dentro do PRÓPRIO nome do lançamento (não tem coluna
// extra sobrando na Firebase pra isso) pra lembrar que aquela "metade" é uma
// dívida de uma compra dividida, e de quem é o dinheiro quando for paga.
// Ex: "Mercado (deve pra Davi)" — assim que a pessoa marca como paga (ver
// togglePagoVariavel/togglePagoFixo), a gente credita o Davi sozinho e tira
// esse pedacinho do nome, que volta a ficar limpo ("Mercado").
function sufixoDivisao(pessoaCredora) {
  return ` (deve pra ${PESSOA_LABEL[pessoaCredora]})`;
}
const REGEX_SUFIXO_DIVISAO = / \(deve pra (Davi|Gabriel)\)$/;
function extrairCredorDivisao(nome) {
  const m = REGEX_SUFIXO_DIVISAO.exec(String(nome || ""));
  if (!m) return null;
  return Object.keys(PESSOA_LABEL).find((p) => PESSOA_LABEL[p] === m[1]) || null;
}
function removerSufixoDivisao(nome) {
  return String(nome || "").replace(REGEX_SUFIXO_DIVISAO, "");
}

function nomeGanhoDivisao(devedor, nomeOriginal) {
  return `A receber de ${PESSOA_LABEL[devedor]}: ${String(nomeOriginal || "").trim()}`;
}
function encontrarGanhoDivisao(listaGanhos, devedor, nomeOriginal, valor, data) {
  const esperado = nomeGanhoDivisao(devedor, nomeOriginal);
  const candidatos = (listaGanhos || []).map((item, idx) => ({ item, idx })).filter(({ item }) => {
    if (String(item.nome || "") !== esperado) return false;
    if (Math.abs((Number(item.valor) || 0) - (Number(valor) || 0)) > 0.009) return false;
    return !data || !item.data || String(item.data).slice(0, 10) === String(data).slice(0, 10);
  });
  return candidatos.length ? candidatos[candidatos.length - 1] : null;
}
async function criarGanhoAReceberDivisao(credor, devedor, nomeOriginal, valor, tipo, data, recebido) {
  if (!temBackendDados()) return false;
  try {
    const res = await caixaApiRequest({ method: "POST", body: JSON.stringify({
      action: "atualizarGanhoDivisao",
      pessoa: credor,
      devedor,
      nomeOriginal,
      valor,
      tipo,
      data,
      recebido: !!recebido,
      criarSeNaoEncontrar: true,
    }) });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) throw new Error("Erro ao criar ganho a receber");
    if (dataRes.ganhos) {
      const cache = await getCache(credor);
      setCache(credor, { ...(cache || {}), ganhos: dataRes.ganhos });
      if (state.pessoaAtual === credor) state.ganhos = dataRes.ganhos;
      removerCache("ambos");
    }
    return true;
  } catch { return false; }
}

async function atualizarGanhoDivisao(credor, devedor, nomeOriginal, valor, data, recebido) {
  if (!temBackendDados()) return false;
  try {
    const res = await caixaApiRequest({ method: "POST", body: JSON.stringify({
      action: "atualizarGanhoDivisao",
      pessoa: credor,
      devedor,
      nomeOriginal,
      valor,
      data,
      recebido: !!recebido,
      criarSeNaoEncontrar: false,
    }) });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) return false;
    if (dataRes.ganhos) {
      const cache = await getCache(credor);
      setCache(credor, { ...(cache || {}), ganhos: dataRes.ganhos });
      if (state.pessoaAtual === credor) state.ganhos = dataRes.ganhos;
      removerCache("ambos");
    }
    return !!dataRes.atualizado;
  } catch { return false; }
}

// opts: { tipo, data, pago, quemPagouTudo }
// A divisão agora é uma operação atômica no Firestore: os dois perfis e,
// quando necessário, o "A receber" são gravados juntos. Isso elimina a
// dependência do Firebase e evita deixar Davi e Gabriel em estados diferentes.
async function dividirCompra(nome, valorTotal, categoria, opts) {
  if (!temBackendDados()) {
    showToast("Configure o Firebase antes de continuar.");
    return false;
  }
  opts = opts || {};
  const tipo = opts.tipo || "";
  const data = opts.data || "";
  const pago = opts.pago !== false;
  const quemPagouTudo = opts.quemPagouTudo || null;
  try {
    const res = await caixaApiRequest({ method: "POST", body: JSON.stringify({
      action: "dividirCompra",
      nome,
      valorTotal,
      categoria,
      tipo,
      data,
      pago,
      quemPagouTudo,
    }) });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) throw new Error((dataRes && dataRes.error) || "Erro ao dividir compra");

    const chave = categoria === "fixos" ? "gastosFixos" : "gastosVariaveis";
    if (dataRes.davi?.[chave] && dataRes.gabriel?.[chave]) {
      const cacheDavi = await getCache("davi");
      const cacheGabriel = await getCache("gabriel");
      setCache("davi", { ...(cacheDavi || {}), [chave]: dataRes.davi[chave] });
      setCache("gabriel", { ...(cacheGabriel || {}), [chave]: dataRes.gabriel[chave] });
      if (state.pessoaAtual === "davi") state[chave] = dataRes.davi[chave];
      if (state.pessoaAtual === "gabriel") state[chave] = dataRes.gabriel[chave];
    }
    if (dataRes.davi?.ganhos) {
      const cacheDavi = await getCache("davi");
      setCache("davi", { ...(cacheDavi || {}), ganhos: dataRes.davi.ganhos });
      if (state.pessoaAtual === "davi") state.ganhos = dataRes.davi.ganhos;
    }
    if (dataRes.gabriel?.ganhos) {
      const cacheGabriel = await getCache("gabriel");
      setCache("gabriel", { ...(cacheGabriel || {}), ganhos: dataRes.gabriel.ganhos });
      if (state.pessoaAtual === "gabriel") state.ganhos = dataRes.gabriel.ganhos;
    }
    marcarAlteracaoLocal();
    removerCache("ambos");
    return true;
  } catch (err) {
    return false;
  }
}

// Credita quem pagou a conta na hora quando a metade da outra pessoa é
// finalmente paga — só o ganho do pagador é criado aqui, porque o gasto de
// quem devia já é o próprio lançamento que acabou de ser marcado como pago
// (não duplica como uma transferência à parte).
async function creditarPagamentoDeDivisao(pagador, devedor, nomeOriginal, valor, tipo, data, recebido = true) {
  const atualizado = await atualizarGanhoDivisao(pagador, devedor, nomeOriginal, valor, data, recebido);
  if (atualizado) return true;
  return criarGanhoAReceberDivisao(pagador, devedor, nomeOriginal, valor, tipo, data, recebido);
}

// Espelha a operação de transferência entre perfis: lança um
// gasto variável já pago de quem transfere e um ganho já recebido de quem
// recebe. Atualizando local/cache direto (em vez de invalidar e ter que
// buscar tudo de novo na Firebase com carregarDados()), a tela responde na
// hora — igual já era feito em dividirCompra.
async function transferirEntrePessoas(de, para, nome, valor, tipo) {
  if (!temBackendDados()) {
    showToast("Configure o Firebase antes de continuar.");
    return false;
  }
  try {
    const res = await caixaApiRequest({
      method: "POST",
      body: JSON.stringify({ action: "transferir", de, para, nome, valor, tipo }),
    });
    const dataRes = await res.json().catch(() => null);
    if (!dataRes || dataRes.ok === false) throw new Error((dataRes && dataRes.error) || "Erro desconhecido");
    const deData = dataRes.de || dataRes.deData;
    const paraData = dataRes.para || dataRes.paraData;
    if (deData?.gastosVariaveis && paraData?.ganhos) {
      const cacheDe = await getCache(de);
      const cachePara = await getCache(para);
      setCache(de, { ...(cacheDe || {}), gastosVariaveis: deData.gastosVariaveis });
      setCache(para, { ...(cachePara || {}), ganhos: paraData.ganhos });
      if (state.pessoaAtual === de) state.gastosVariaveis = deData.gastosVariaveis;
      if (state.pessoaAtual === para) state.ganhos = paraData.ganhos;
    }
    marcarAlteracaoLocal();
    removerCache("ambos");
    return true;
  } catch (err) {
    console.error("Transferência Firebase:", err);
    return false;
  }
}

