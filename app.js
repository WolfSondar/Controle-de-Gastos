// =====================================================================
// CAIXA — app.js
// Estado local em memória + sincronização com a planilha via Apps Script
// Agora com seletor de pessoa: davi | gabriel | ambos (somente leitura)
// =====================================================================

const PESSOA_LABEL = { davi: "Davi", gabriel: "Gabriel", ambos: "Juntos" };
const COLAPSO_STORAGE_KEY = "caixaFormsColapsados";
const PESSOA_STORAGE_KEY = "caixaPessoaAtual";
const CACHE_PREFIX = "caixaCache:";
const MES_ATUAL_STORAGE_KEY = "caixaMesAtual";
const MESES_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function getMesAtualCache() {
  try {
    const raw = localStorage.getItem(MES_ATUAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

const mesAtualCache = getMesAtualCache();

const state = {
  ganhos: [],
  gastosFixos: [],
  gastosVariaveis: [],
  caixinhas: [],
  loaded: false,
  pessoaAtual: localStorage.getItem(PESSOA_STORAGE_KEY) || "davi",
  mesAtual: mesAtualCache ? mesAtualCache.mes : null,
  anoAtual: mesAtualCache ? mesAtualCache.ano : null,
  historico: null, // { anos: [...] }, carregado sob demanda ao abrir a aba
};

// Mostra o selo "Mês de referência" no cabeçalho e guarda no aparelho, pra
// já aparecer certo na próxima abertura do app, antes mesmo da planilha responder.
function renderMesAtual() {
  const el = document.getElementById("mesAtualBadge");
  if (!el) return;
  if (!state.mesAtual || !state.anoAtual) {
    el.textContent = "";
    return;
  }
  el.textContent = MESES_LABEL[state.mesAtual - 1] + "/" + state.anoAtual;
  try {
    localStorage.setItem(MES_ATUAL_STORAGE_KEY, JSON.stringify({ mes: state.mesAtual, ano: state.anoAtual }));
  } catch (err) {
    // sem problema, só não guarda o cache
  }
}

// guarda os últimos totais renderizados, pra animar contagem e mostrar o valor flutuante
const prevTotals = { ganhos: null, fixos: null, variaveis: null, saldo: null, guardado: null };

// evita comemorar caixinhas que já chegaram completas do servidor (só comemora quem "acabou de bater")
let primeiraRenderCaixinhas = true;

const fmt = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function isAmbos() {
  return state.pessoaAtual === "ambos";
}

// ---------------------------------------------------------------------
// CACHE LOCAL — guarda o último resultado de cada pessoa no aparelho.
// Isso é o que faz a troca de pessoa e a abertura do app parecerem
// instantâneas: mostramos o último dado conhecido na hora, e atualizamos
// em silêncio assim que a resposta da planilha chega.
// ---------------------------------------------------------------------

function getCache(pessoa) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + pessoa);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function setCache(pessoa, data) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + pessoa,
      JSON.stringify({
        ganhos: data.ganhos || [],
        gastosFixos: data.gastosFixos || [],
        gastosVariaveis: data.gastosVariaveis || [],
        caixinhas: data.caixinhas || [],
      })
    );
  } catch (err) {
    // localStorage cheio ou indisponível — sem problema, só não guarda o cache
  }
}

// ---------------------------------------------------------------------
// SINCRONIZAÇÃO COM A PLANILHA
// ---------------------------------------------------------------------

const syncEl = document.getElementById("syncStatus");

function setSyncState(mode, text) {
  if (!syncEl) return;
  syncEl.dataset.state = mode;
  const label = syncEl.querySelector(".sync-text");
  if (label) label.textContent = text;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("is-visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2600);
}

// ---------------------------------------------------------------------
// HISTORY API — botão/gesto "voltar" fecha o modal em vez de sair do app.
// Toda vez que um modal abre, empilhamos um estado no histórico do
// navegador; ao voltar, o navegador dispara "popstate" e a gente só fecha
// o modal do topo da pilha (sem navegar pra fora da página). Fechar pelo
// X/Cancelar/clique no fundo também precisa "consumir" esse estado — senão
// o próximo "voltar" cairia num estado fantasma e o usuário precisaria
// apertar voltar duas vezes pra sair de verdade.
// ---------------------------------------------------------------------
const pilhaModais = []; // ids dos backdrops abertos, do mais antigo pro mais novo
let suprimirProximoPopstate = false; // true logo antes de um history.back() disparado por nós mesmos

function registrarAberturaModal(id) {
  pilhaModais.push(id);
  history.pushState({ caixaModal: id }, "");
}

// Chame isso DENTRO de cada fecharXxx() já existente, envolvendo a lógica
// real de esconder o backdrop — assim cancelar/clicar fora continua
// funcionando igual, só que agora também sincroniza com o histórico.
// Se o id já não está mais na pilha (porque esse fechamento veio de um
// popstate, ver abaixo), só roda a lógica de esconder e não mexe mais no
// histórico — evita chamar history.back() duas vezes pro mesmo modal.
function fecharComHistorico(id, logicaDeFechar) {
  const idx = pilhaModais.lastIndexOf(id);
  logicaDeFechar();
  if (idx === -1) return;
  pilhaModais.splice(idx, 1);
  suprimirProximoPopstate = true;
  history.back();
}

window.addEventListener("popstate", () => {
  // Esse popstate foi causado pelo nosso próprio history.back() (fechar
  // pelo X/Cancelar) — já cuidamos do modal na hora, nada a fazer aqui.
  if (suprimirProximoPopstate) {
    suprimirProximoPopstate = false;
    return;
  }
  // Popstate "de verdade" (gesto/botão voltar do sistema): fecha só o
  // modal do topo da pilha, sem deixar o navegador sair da página.
  const id = pilhaModais.pop();
  if (!id) return;
  const fechar = FECHADORES_MODAL[id];
  if (fechar) fechar();
});

// Preenchido mais abaixo, perto de cada modal (cada fecharXxx se registra
// aqui). Fica num objeto à parte pra não precisar declarar tudo antes de usar.
const FECHADORES_MODAL = {};

async function carregarDados() {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    setSyncState("error", "Configure a API");
    showToast("Configure a URL do Apps Script em config.js");
    renderAll();
    return;
  }

  // Trava qual pessoa esta chamada representa. Se o usuário trocar de pessoa
  // de novo antes da planilha responder, a gente descarta essa resposta lá
  // embaixo — assim uma resposta antiga nunca "pisa" nos dados da pessoa atual.
  const pessoaRequisitada = state.pessoaAtual;

  const cache = getCache(pessoaRequisitada);
  if (cache) {
    // Mostra o último dado conhecido na hora — sem skeleton, sem espera —
    // e atualiza discretamente assim que a resposta fresca chegar.
    state.ganhos = cache.ganhos;
    state.gastosFixos = cache.gastosFixos;
    state.gastosVariaveis = cache.gastosVariaveis;
    state.caixinhas = cache.caixinhas || [];
    state.loaded = true;
    setSyncState("saving", "Atualizando…");
    renderAll();
  } else {
    setSyncState("saving", "Carregando…");
    renderSkeletons();
  }

  try {
    const url = `${API_URL}?pessoa=${encodeURIComponent(pessoaRequisitada)}`;
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();
    if (data && data.ok === false) {
      throw new Error(data.error || "Erro desconhecido");
    }
    if (state.pessoaAtual !== pessoaRequisitada) return; // usuário já trocou de pessoa, ignora

    state.ganhos = data.ganhos || [];
    state.gastosFixos = data.gastosFixos || [];
    state.gastosVariaveis = data.gastosVariaveis || [];
    state.caixinhas = data.caixinhas || [];
    state.loaded = true;
    if (data.mesAtual) state.mesAtual = data.mesAtual;
    if (data.anoAtual) state.anoAtual = data.anoAtual;
    renderMesAtual();
    setCache(pessoaRequisitada, data);
    setSyncState("idle", "Sincronizado");
    renderAll();
    prefetchOutrasPessoas(pessoaRequisitada);
  } catch (err) {
    if (state.pessoaAtual !== pessoaRequisitada) return;
    setSyncState("error", "Erro ao carregar");
    if (!cache) {
      showToast("Não consegui carregar a planilha. Confira a API_URL.");
      renderAll();
    } else {
      // já tem algo na tela (o cache) — só avisa que não deu pra atualizar agora
      showToast("Não consegui atualizar agora. Mostrando o último dado salvo.");
    }
  }
}

// Depois de carregar a pessoa que o usuário está vendo, busca as outras duas
// visões (a outra pessoa e "Ambos") em segundo plano e guarda no cache —
// sem renderizar nada. Assim, quando o usuário tocar em outra aba, o dado
// já está pronto no aparelho e aparece na hora.
function prefetchOutrasPessoas(pessoaJaCarregada) {
  Object.keys(PESSOA_LABEL)
    .filter((p) => p !== pessoaJaCarregada)
    .forEach((p) => {
      fetch(`${API_URL}?pessoa=${encodeURIComponent(p)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.ok !== false) setCache(p, data);
        })
        .catch(() => {});
    });
}

// Fila de gravação por (pessoa + ação): evita que chamadas POST rápidas e
// sequenciais pro MESMO bloco (ex: togglar "pago" em vários gastos fixos
// seguidos) fiquem em voo ao mesmo tempo e cheguem fora de ordem — o que
// podia fazer uma resposta mais lenta de um payload antigo "pisar" por
// cima de um payload mais novo já salvo. Em vez de disparar um POST por
// clique, cada chamada só guarda o payload mais recente pra aquela chave;
// se já existe uma gravação em andamento, ela é ignorada e o POST seguinte
// (feito quando a gravação atual termina) já sai com o estado mais atual —
// não precisamos mandar todo payload intermediário, só o final.
const filaSalvar = new Map(); // chave -> { emVoo: bool, pendente: payload | null }

async function salvarBloco(action, payload) {
  if (isAmbos()) return; // trava de segurança: modo Ambos nunca salva
  const chave = `${state.pessoaAtual}:${action}`;
  let entrada = filaSalvar.get(chave);
  if (!entrada) {
    entrada = { emVoo: false, pendente: null };
    filaSalvar.set(chave, entrada);
  }

  entrada.pendente = payload;
  if (entrada.emVoo) return; // já tem um POST em andamento — ele vai pegar esse payload ao terminar

  entrada.emVoo = true;
  setSyncState("saving", "Salvando…");
  try {
    while (entrada.pendente !== null) {
      const payloadAtual = entrada.pendente;
      entrada.pendente = null;
      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action, payload: payloadAtual, pessoa: state.pessoaAtual }),
      });
      const data = await res.json().catch(() => null);
      if (data && data.ok === false) {
        throw new Error(data.error || "Erro desconhecido");
      }
    }
    setSyncState("idle", "Salvo");
  } catch (err) {
    setSyncState("error", "Falha ao salvar");
    showToast("Não consegui salvar na planilha agora.");
  } finally {
    entrada.emVoo = false;
  }
}

// ---------------------------------------------------------------------
// SELETOR DE PESSOA (Davi / Gabriel / Ambos)
// ---------------------------------------------------------------------

function trocarPessoa(pessoa) {
  if (pessoa === state.pessoaAtual) return;
  state.pessoaAtual = pessoa;
  localStorage.setItem(PESSOA_STORAGE_KEY, pessoa);
  // troca de pessoa não é "o valor mudando" — não deve animar nem fazer pop
  prevTotals.ganhos = null;
  prevTotals.fixos = null;
  prevTotals.variaveis = null;
  prevTotals.guardado = null;
  prevTotals.saldo = null;
  renderPessoaSwitch();
  atualizarVisibilidadeEdicao();
  atualizarVisibilidadeSplitCard(); // esconde/mostra o gráfico na hora, sem esperar os dados
  atualizarVisibilidadeVisaoGeral(); // idem pro card "Visão geral" (some no modo Ambos)
  atualizarVisibilidadeJuntosView(); // idem pra view "Juntos" e o resumo padrão
  carregarDados();
}

// Mostra/esconde o card de divisão do casal IMEDIATAMENTE ao trocar de pessoa.
// Antes isso só acontecia dentro de renderSplit(), que só roda depois que os
// dados terminam de chegar — por isso o gráfico ficava "grudado" na tela por
// um instante ao sair do modo Ambos, parecendo que travou. Agora a visibilidade
// já muda no clique; o conteúdo (números) é preenchido depois, normalmente.
function atualizarVisibilidadeSplitCard() {
  const card = document.getElementById("splitCard");
  if (!card) return;
  card.classList.toggle("is-hidden", !isAmbos());
}

// "Visão geral" é por pessoa (Davi ou Gabriel) — no modo Ambos ela não faz
// sentido (a "Divisão do casal" já cobre esse caso), então some.
function atualizarVisibilidadeVisaoGeral() {
  const card = document.getElementById("visaoGeralCard");
  if (!card) return;
  card.classList.toggle("is-hidden", isAmbos());
}

function renderPessoaSwitch() {
  document.querySelectorAll(".person-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.pessoa === state.pessoaAtual);
  });
}

// Esconde formulários de adicionar e ações de excluir/aportar no modo Ambos.
// No modo Ambos, também só a aba Resumo faz sentido (é a única com dados agregados úteis).
function atualizarVisibilidadeEdicao() {
  const ambos = isAmbos();
  document.querySelectorAll(".add-form, .goal-actions .btn-aporte, .modo-edicao").forEach((el) => {
    el.classList.toggle("is-hidden", ambos);
  });
  document.body.classList.toggle("modo-somente-leitura", ambos);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const semRestricao = btn.dataset.tab === "resumo" || btn.dataset.tab === "historico";
    btn.classList.toggle("is-hidden", ambos && !semRestricao);
  });

  if (ambos) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === "resumo"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-hidden", p.dataset.tab !== "resumo"));
  }
  posicionarIndicadorAba();
}

// ---------------------------------------------------------------------
// OPERAÇÕES — GANHOS / FIXOS / VARIÁVEIS (nome + valor)
// ---------------------------------------------------------------------

// Atualiza o cache local da pessoa atual com o state em memória.
// Chamada depois de toda mutação local (add/remove/edit) pra garantir que,
// se o usuário trocar de pessoa e voltar antes da planilha responder, o
// cache que ele vê já reflita a mudança — sem o item deletado/editado
// "piscar" de volta por um instante.
function sincronizarCacheAtual() {
  if (isAmbos()) return;
  setCache(state.pessoaAtual, {
    ganhos: state.ganhos,
    gastosFixos: state.gastosFixos,
    gastosVariaveis: state.gastosVariaveis,
    caixinhas: state.caixinhas,
  });
}

function criarOperacoesLista(key, action) {
  return {
    add(nome, valor, extra = {}) {
      if (isAmbos()) return;
      state[key].push({ nome, valor, ...extra });
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderAll();
    },
    remove(index) {
      if (isAmbos()) return;
      state[key].splice(index, 1);
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderAll();
    },
    edit(index, nome, valor) {
      if (isAmbos()) return;
      const item = state[key][index];
      if (!item) return;
      item.nome = nome;
      item.valor = valor;
      sincronizarCacheAtual();
      salvarBloco(action, state[key]);
      renderAll();
    },
  };
}

const opGanhos = criarOperacoesLista("ganhos", "saveGanhos");
const opFixos = criarOperacoesLista("gastosFixos", "saveGastosFixos");
const opVariaveis = criarOperacoesLista("gastosVariaveis", "saveGastosVariaveis");

// ---------------------------------------------------------------------
// OPERAÇÕES — CAIXINHAS (cofrinhos/investimentos guardados, com meta
// opcional — é aqui também que ficavam as antigas "Metas": pra ter uma meta
// nova, basta criar uma caixinha com um objetivo).
//
// O valor guardado numa caixinha é dinheiro que sai do saldo disponível,
// então guardar É um gasto variável (lançado automaticamente como "Guardado:
// nome da caixinha"); retirar é o oposto, um ganho automático. O valor
// guardado em si (cx.valorGuardado) é só um saldo à parte — não entra de
// novo na conta do saldo disponível, senão o dinheiro seria descontado duas
// vezes.
// ---------------------------------------------------------------------

function addCaixinha(nome, valorInicial, valorObjetivo) {
  if (isAmbos()) return;
  state.caixinhas.push({
    nome,
    valorGuardado: valorInicial || 0,
    valorObjetivo: valorObjetivo || 0,
  });
  salvarBloco("saveCaixinhas", state.caixinhas);
  if (valorInicial > 0) {
    // já sai do saldo na hora — o lançamento nasce PAGO, igual a "guardar".
    state.gastosVariaveis.push({ nome: `Guardado: ${nome}`, valor: valorInicial, pago: true });
    salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  }
  sincronizarCacheAtual();
  renderAll();
}
// Remove a caixinha. O valor que estava guardado nela não é apagado do
// histórico de gastos (os lançamentos "Guardado: ..." continuam contando
// como dinheiro que já saiu do saldo no passado — reescrever isso mudaria
// saldos que já foram fechados). Mas pra não "sumir" com o dinheiro que
// ainda estava guardado, ele volta pro saldo disponível como um ganho já
// recebido — assim a remoção nunca reduz o patrimônio total silenciosamente.
function removeCaixinha(index) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const guardado = Number(cx.valorGuardado) || 0;
  state.caixinhas.splice(index, 1);
  if (guardado > 0) {
    state.ganhos.push({ nome: `Retirado da caixinha: ${cx.nome} (removida)`, valor: guardado, recebido: true });
    salvarBloco("saveGanhos", state.ganhos);
  }
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  renderAll();
}
// Editar caixinha também renomeia os lançamentos de gasto variável
// vinculados a ela ("Guardado: nome antigo" -> "Guardado: nome novo"), pra
// eles não ficarem "órfãos" (desconectados do nome atual da caixinha) toda
// vez que ela é renomeada.
function editCaixinha(index, nome, valorObjetivo) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  const nomeAntigo = cx.nome;
  cx.nome = nome;
  cx.valorObjetivo = valorObjetivo || 0;
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
  cx.valorGuardado = (Number(cx.valorGuardado) || 0) + valor;
  state.gastosVariaveis.push({ nome: `Guardado: ${cx.nome}`, valor, pago: true });
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  renderAll();
}
function retirarDaCaixinha(index, valor) {
  if (isAmbos()) return;
  const cx = state.caixinhas[index];
  if (!cx) return;
  cx.valorGuardado = Math.max((Number(cx.valorGuardado) || 0) - valor, 0);
  state.ganhos.push({ nome: `Retirado da caixinha: ${cx.nome}`, valor, recebido: true });
  sincronizarCacheAtual();
  salvarBloco("saveCaixinhas", state.caixinhas);
  salvarBloco("saveGanhos", state.ganhos);
  renderAll();
}

// ---------------------------------------------------------------------
// AÇÕES EM CONJUNTO — dividir uma compra entre Davi e Gabriel
// Busca os dados atuais de cada um, soma metade do valor no fixo/variável
// escolhido, e salva os dois de uma vez — independe de quem está selecionado.
// ---------------------------------------------------------------------

// Pega a lista mais recente que já temos à mão pra uma pessoa, sem bater na
// planilha: se for a pessoa selecionada no momento, usa o `state` (o mais
// fresco possível); senão usa o cache local (alimentado pelo prefetch).
// Só busca na planilha em último caso, se não houver nada local ainda.
async function obterListaLocal(pessoa, chave) {
  if (pessoa === state.pessoaAtual && !isAmbos()) {
    return [...state[chave]];
  }
  const cache = getCache(pessoa);
  if (cache) return [...(cache[chave] || [])];
  const data = await fetch(`${API_URL}?pessoa=${encodeURIComponent(pessoa)}`).then((r) => r.json());
  if (data && data.ok === false) throw new Error(data.error || "Erro ao ler dados atuais");
  return (data && data[chave]) || [];
}

async function dividirCompra(nome, valorTotal, categoria) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    showToast("Configure a URL do Apps Script em config.js");
    return false;
  }
  const metade = Math.round((valorTotal / 2) * 100) / 100;
  const action = categoria === "fixos" ? "saveGastosFixos" : "saveGastosVariaveis";
  const chave = categoria === "fixos" ? "gastosFixos" : "gastosVariaveis";

  try {
    // Usa o que já está em memória/cache em vez de buscar de novo na
    // planilha — é isso que fazia a divisão demorar (2 idas e voltas a
    // mais no Apps Script antes mesmo de começar a salvar).
    const [listaDavi, listaGabriel] = await Promise.all([
      obterListaLocal("davi", chave),
      obterListaLocal("gabriel", chave),
    ]);

    // Fixo dividido nasce pendente (é uma conta que ainda vai vencer);
    // variável dividido nasce pago (representa uma compra que já aconteceu).
    const item = { nome, valor: metade, pago: categoria !== "fixos" };

    listaDavi.push({ ...item });
    listaGabriel.push({ ...item });

    const [resDavi, resGabriel] = await Promise.all([
      fetch(API_URL, { method: "POST", body: JSON.stringify({ action, payload: listaDavi, pessoa: "davi" }) }),
      fetch(API_URL, { method: "POST", body: JSON.stringify({ action, payload: listaGabriel, pessoa: "gabriel" }) }),
    ]);
    const [dataDavi, dataGabriel] = await Promise.all([
      resDavi.json().catch(() => null),
      resGabriel.json().catch(() => null),
    ]);
    if ((dataDavi && dataDavi.ok === false) || (dataGabriel && dataGabriel.ok === false)) {
      throw new Error("Erro ao salvar em um dos dois");
    }

    // Atualiza os caches locais de ambos na hora, pra não repetir o
    // problema do item "fantasma" ao trocar de pessoa logo em seguida.
    const cacheDavi = getCache("davi") || {};
    const cacheGabriel = getCache("gabriel") || {};
    setCache("davi", { ...cacheDavi, [chave]: listaDavi });
    setCache("gabriel", { ...cacheGabriel, [chave]: listaGabriel });
    if (state.pessoaAtual === "davi") state[chave] = listaDavi;
    if (state.pessoaAtual === "gabriel") state[chave] = listaGabriel;

    return true;
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------------
// AÇÕES EM CONJUNTO — transferir um valor de uma pessoa pra outra.
// Sai como gasto variável já PAGO de quem transfere, e entra como ganho já
// RECEBIDO de quem recebe — a planilha calcula isso direto no servidor
// (ação "transferir"), então funciona mesmo que a pessoa selecionada no
// app não seja nenhuma das duas envolvidas.
// ---------------------------------------------------------------------

async function transferirEntrePessoas(de, para, nome, valor) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    showToast("Configure a URL do Apps Script em config.js");
    return false;
  }
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "transferir", de, para, nome, valor }),
    });
    const data = await res.json().catch(() => null);
    if (!data || data.ok === false) throw new Error((data && data.error) || "Erro desconhecido");
    // Os dados de quem transferiu e de quem recebeu mudaram — descarta os
    // caches locais dos dois (e do modo Ambos) pra não mostrar algo velho.
    [de, para, "ambos"].forEach((p) => localStorage.removeItem(CACHE_PREFIX + p));
    return true;
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------------
// STATUS — RECEBIDO (ganhos) / PAGO (fixos e variáveis), mesmo
// comportamento nos três: um booleano por lançamento (coluna própria na
// planilha), que só entra no saldo quando marcado.
// ---------------------------------------------------------------------

function fixoEhPago(item) {
  return item.pago === true;
}
function variavelEhPago(item) {
  return item.pago === true;
}
function ganhoEhRecebido(item) {
  return item.recebido === true;
}

function togglePagoFixo(index) {
  if (isAmbos()) return;
  const item = state.gastosFixos[index];
  if (!item) return;
  item.pago = !fixoEhPago(item);
  sincronizarCacheAtual();
  salvarBloco("saveGastosFixos", state.gastosFixos);
  renderAll();
}
function togglePagoVariavel(index) {
  if (isAmbos()) return;
  const item = state.gastosVariaveis[index];
  if (!item) return;
  item.pago = !variavelEhPago(item);
  sincronizarCacheAtual();
  salvarBloco("saveGastosVariaveis", state.gastosVariaveis);
  renderAll();
}
function toggleRecebidoGanho(index) {
  if (isAmbos()) return;
  const item = state.ganhos[index];
  if (!item) return;
  item.recebido = !ganhoEhRecebido(item);
  sincronizarCacheAtual();
  salvarBloco("saveGanhos", state.ganhos);
  renderAll();
}

// ---------------------------------------------------------------------
// TOTAIS
// ---------------------------------------------------------------------

function soma(lista) {
  return lista.reduce((acc, i) => acc + (Number(i.valor) || 0), 0);
}

// Soma só os itens marcados com o campo de status (ex: "recebido" ou
// "pago") em true.
function somaComStatus(lista, campo) {
  return lista.reduce((acc, i) => acc + (i[campo] === true ? Number(i.valor) || 0 : 0), 0);
}

function somaFixosPagos(lista) {
  return somaComStatus(lista, "pago");
}

function somaCampo(lista, campo) {
  return lista.reduce((acc, i) => acc + (Number(i[campo]) || 0), 0);
}

// Identifica os lançamentos automáticos criados ao guardar/retirar de uma
// caixinha (ver guardarNaCaixinha/retirarDaCaixinha), pra não contar esse
// dinheiro duas vezes em telas que já mostram o valor guardado à parte.
function ehLancamentoDeCaixinha(nome) {
  return typeof nome === "string" && nome.indexOf("Guardado: ") === 0;
}

// Anima um número de "de" até "para", contando em tempo real (efeito de contador).
function animarNumero(el, de, para, duracao = 650) {
  if (!el) return;
  if (de === null || de === undefined || de === para) {
    el.textContent = fmt(para);
    return;
  }
  el.classList.remove("is-pulsing");
  void el.offsetWidth; // reinicia a animação de pulso mesmo se já estava rodando
  el.classList.add("is-pulsing");
  const inicio = performance.now();
  function passo(agora) {
    const p = Math.min((agora - inicio) / duracao, 1);
    const suavizado = 1 - Math.pow(1 - p, 4); // easeOutQuart — mais suave no fim
    el.textContent = fmt(de + (para - de) * suavizado);
    if (p < 1) requestAnimationFrame(passo);
    else el.textContent = fmt(para);
  }
  requestAnimationFrame(passo);
}

// Mostra um valorzinho flutuante tipo "+ R$ 20,00" ou "− R$ 20,00" subindo e sumindo,
// perto do número que mudou — a "cor" pode ser fixa (income/expense) ou seguir o sinal do delta.
function popValorFlutuante(container, delta, corFixa) {
  if (!container || !delta) return;
  const positivo = delta > 0;
  const cor = corFixa || (positivo ? "income" : "expense");
  const span = document.createElement("span");
  span.className = "value-pop " + cor;
  span.textContent = (positivo ? "+ " : "− ") + fmt(Math.abs(delta));
  container.appendChild(span);
  requestAnimationFrame(() => requestAnimationFrame(() => span.classList.add("is-animating")));
  setTimeout(() => span.remove(), 1100);
}

function renderTotais() {
  // Só dinheiro que já "aconteceu" de fato entra no saldo: ganhos
  // RECEBIDOS, fixos PAGOS, variáveis PAGOS — mesmo comportamento pros três.
  const totalGanhosGeral = soma(state.ganhos);
  const totalGanhosRecebidos = somaComStatus(state.ganhos, "recebido");
  const totalGanhosAReceber = totalGanhosGeral - totalGanhosRecebidos;

  const totalFixosGeral = soma(state.gastosFixos);
  const totalFixosPagos = somaFixosPagos(state.gastosFixos);
  const totalFixosAPagar = totalFixosGeral - totalFixosPagos;

  const totalVariaveisGeral = soma(state.gastosVariaveis);
  const totalVariaveisPagos = somaComStatus(state.gastosVariaveis, "pago");
  const totalVariaveisAPagar = totalVariaveisGeral - totalVariaveisPagos;

  // Guardado é só informativo aqui: o valor total parado nas caixinhas.
  // Ele NÃO entra na conta do saldo — guardar já vira um gasto variável já
  // pago na hora (ver guardarNaCaixinha), então já foi descontado ali.
  // Somar de novo aqui descontaria o mesmo dinheiro duas vezes.
  const totalGuardado = somaCampo(state.caixinhas, "valorGuardado");
  const saldo = totalGanhosRecebidos - totalFixosPagos - totalVariaveisPagos;

  const ganhosEl = document.getElementById("statGanhos");
  const fixosEl = document.getElementById("statFixos");
  const variaveisEl = document.getElementById("statVariaveis");
  const guardadoEl = document.getElementById("statGuardado");
  const saldoEl = document.getElementById("saldoValor");

  const primeiraVez = prevTotals.saldo === null;

  animarNumero(ganhosEl, prevTotals.ganhos, totalGanhosRecebidos);
  animarNumero(fixosEl, prevTotals.fixos, totalFixosPagos);
  animarNumero(variaveisEl, prevTotals.variaveis, totalVariaveisPagos);
  animarNumero(guardadoEl, prevTotals.guardado, totalGuardado);
  animarNumero(saldoEl, prevTotals.saldo, saldo);

  if (!primeiraVez) {
    const heroStats = document.querySelectorAll(".hero-stat");
    popValorFlutuante(document.querySelector(".saldo-block"), saldo - prevTotals.saldo);
    popValorFlutuante(heroStats[0], totalGanhosRecebidos - prevTotals.ganhos, "income");
    popValorFlutuante(heroStats[1], totalGuardado - prevTotals.guardado, "gold");
    popValorFlutuante(heroStats[2], totalFixosPagos - prevTotals.fixos, "expense");
    popValorFlutuante(heroStats[3], totalVariaveisPagos - prevTotals.variaveis, "expense");
  }

  saldoEl.classList.toggle("negative", saldo < 0);

  // Formula de baixo do saldo agora é uma projeção: "se tudo que ainda tá
  // pendente fosse recebido/pago, o saldo ficaria assim". Usa os totais
  // GERAIS (sem filtrar por status) — é só uma prévia, não afeta o saldo real.
  const saldoProjetado = totalGanhosGeral - totalFixosGeral - totalVariaveisGeral;
  const formulaEl = document.getElementById("saldoFormula");
  if (formulaEl) {
    formulaEl.textContent = `Projetado: ${fmt(saldoProjetado)}`;
    formulaEl.classList.toggle("negative", saldoProjetado < 0);
  }

  // Pendências ficam pequenininhas dentro de cada card, perto do valor que
  // elas afetam — em vez de um texto só embaixo do saldo.
  const ganhosPendenteEl = document.getElementById("statGanhosPendente");
  if (ganhosPendenteEl) {
    ganhosPendenteEl.textContent = totalGanhosAReceber > 0 ? `+ ${fmt(totalGanhosAReceber)}` : "";
  }
  const fixosPendenteEl = document.getElementById("statFixosPendente");
  if (fixosPendenteEl) {
    fixosPendenteEl.textContent = totalFixosAPagar > 0 ? `− ${fmt(totalFixosAPagar)}` : "";
  }
  const variaveisPendenteEl = document.getElementById("statVariaveisPendente");
  if (variaveisPendenteEl) {
    variaveisPendenteEl.textContent = totalVariaveisAPagar > 0 ? `− ${fmt(totalVariaveisAPagar)}` : "";
  }

  prevTotals.ganhos = totalGanhosRecebidos;
  prevTotals.fixos = totalFixosPagos;
  prevTotals.variaveis = totalVariaveisPagos;
  prevTotals.guardado = totalGuardado;
  prevTotals.saldo = saldo;
}

// ---------------------------------------------------------------------
// RENDER — LISTAS SIMPLES (ganhos / fixos / variáveis)
// ---------------------------------------------------------------------

function tagPessoa(item) {
  if (!isAmbos() || !item.pessoa) return "";
  return `<span class="pessoa-tag pessoa-${item.pessoa}">${PESSOA_LABEL[item.pessoa]}</span>`;
}

const ICONE_LAPIS = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_X = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

// Formata "AAAA-MM-DD" pra "dd/mm", só pro selinho da lista — bem curto,
// pra não competir com o nome do lançamento.
function formatarDataCurta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  return `${m[3]}/${m[2]}`;
}

// Monta os selinhos de categoria/data/parcela que aparecem embaixo do nome
// de cada lançamento (só os que o item realmente tiver).
function metaInfoHtml(item) {
  const partes = [];
  if (item.tipo) partes.push(`<span class="item-tag item-tag-cat">${escapeHtml(item.tipo)}</span>`);
  if (item.parcela && /^\d+\s*\/\s*\d+$/.test(String(item.parcela).trim())) {
    partes.push(`<span class="item-tag item-tag-parcela">${escapeHtml(String(item.parcela).trim())}</span>`);
  }
  const dataCurta = formatarDataCurta(item.data);
  if (dataCurta) partes.push(`<span class="item-tag item-tag-data">${dataCurta}</span>`);
  return partes.length ? `<div class="item-meta">${partes.join("")}</div>` : "";
}

// Se o item é parcelado ("2/10"), mostra "Nome (2/10)" na lista — sem sujar
// o campo "nome" salvo na planilha.
function nomeComParcela(item) {
  const nome = escapeHtml(item.nome);
  if (item.parcela && /^\d+\s*\/\s*\d+$/.test(String(item.parcela).trim())) {
    return `${nome} (${escapeHtml(String(item.parcela).trim())})`;
  }
  return nome;
}

// Fecha (some) as ações reveladas por swipe de um item específico.
function fecharSwipe(li) {
  if (!li) return;
  li.classList.remove("is-swiped");
  const content = li.querySelector(".swipe-content");
  if (content) content.style.transform = "";
}

// ---------------------------------------------------------------------
// GESTO DE SWIPE — desliza um item da lista pra esquerda pra revelar os
// botões de Editar/Excluir (como no WhatsApp/Nubank), em vez de precisar
// acertar botõezinhos pequenos. Um único item aberto por vez.
// ---------------------------------------------------------------------

const LARGURA_ACOES_SWIPE = 136;
const LIMIAR_ABRIR_SWIPE = 56;

function fecharTodosSwipes(ul, exceto) {
  ul.querySelectorAll(".item-list-row.is-swiped").forEach((li) => {
    if (li !== exceto) fecharSwipe(li);
  });
}

function habilitarSwipe(ul) {
  if (!ul || ul._swipeAtivado) return;
  ul._swipeAtivado = true;
  let ativo = null;

  ul.addEventListener(
    "touchstart",
    (e) => {
      const li = e.target.closest(".item-list-row");
      if (!li || e.target.closest(".swipe-actions")) return;
      const t = e.touches[0];
      const jaAberto = li.classList.contains("is-swiped");
      fecharTodosSwipes(ul, li);
      ativo = { li, startX: t.clientX, startY: t.clientY, dragging: false, jaAberto, ultimoDelta: jaAberto ? -LARGURA_ACOES_SWIPE : 0 };
    },
    { passive: true }
  );

  ul.addEventListener(
    "touchmove",
    (e) => {
      if (!ativo) return;
      const t = e.touches[0];
      const dx = t.clientX - ativo.startX;
      const dy = t.clientY - ativo.startY;
      if (!ativo.dragging) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          ativo = null; // gesto vertical — deixa a página rolar normalmente
          return;
        }
        ativo.dragging = true;
      }
      const base = ativo.jaAberto ? -LARGURA_ACOES_SWIPE : 0;
      const novo = Math.max(-LARGURA_ACOES_SWIPE, Math.min(0, base + dx));
      const content = ativo.li.querySelector(".swipe-content");
      if (content) {
        content.style.transition = "none";
        content.style.transform = `translateX(${novo}px)`;
      }
      ativo.ultimoDelta = novo;
    },
    { passive: true }
  );

  const finalizar = () => {
    if (!ativo || !ativo.dragging) {
      ativo = null;
      return;
    }
    const content = ativo.li.querySelector(".swipe-content");
    if (content) content.style.transition = "";
    const abrir = ativo.ultimoDelta <= -LIMIAR_ABRIR_SWIPE;
    ativo.li.classList.toggle("is-swiped", abrir);
    if (content) content.style.transform = abrir ? `translateX(-${LARGURA_ACOES_SWIPE}px)` : "";
    ativo = null;
  };
  ul.addEventListener("touchend", finalizar);
  ul.addEventListener("touchcancel", finalizar);
}

// Toque em qualquer lugar fora de uma lista fecha o swipe aberto nela.
document.addEventListener(
  "touchstart",
  (e) => {
    document.querySelectorAll(".item-list").forEach((ul) => {
      if (!e.target.closest(`#${ul.id}`)) fecharTodosSwipes(ul);
    });
  },
  { passive: true }
);

// Renderiza uma lista com toggle de status (Recebido/Pago) — usada pelas
// três listas simples (ganhos, fixos, variáveis), que agora têm todas o
// mesmo comportamento. Cada item pode ser deslizado pra esquerda pra
// revelar Editar/Excluir (ver habilitarSwipe).
function renderListaComStatus(ulId, lista, tipo, ops, tipoModal, statusKey, toggleFn, rotuloOn, rotuloOff) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = "";
  if (lista.length === 0) {
    ul.innerHTML = `<p class="empty-state">Nada por aqui ainda. Adicione o primeiro item acima.</p>`;
    return;
  }
  const ambos = isAmbos();
  lista.forEach((item, idx) => {
    const on = item[statusKey] === true;
    const li = document.createElement("li");
    li.className = "item-list-row" + (on ? "" : " is-pendente");
    li.dataset.tipo = tipo;
    li.style.animationDelay = Math.min(idx * 35, 250) + "ms";
    li.innerHTML = `
      ${
        ambos
          ? ""
          : `<div class="swipe-actions">
              <button class="swipe-btn swipe-edit" aria-label="Editar" data-idx="${idx}">${ICONE_LAPIS}<span>Editar</span></button>
              <button class="swipe-btn swipe-delete" aria-label="Excluir" data-idx="${idx}">${ICONE_X}<span>Excluir</span></button>
            </div>`
      }
      <div class="swipe-content">
        <div class="item-info">
          <span class="item-nome">${nomeComParcela(item)} ${tagPessoa(item)}</span>
          ${metaInfoHtml(item)}
        </div>
        <div class="item-row">
          <span class="item-valor ${tipo}">${fmt(item.valor)}</span>
          ${
            ambos
              ? `<span class="pago-toggle ${on ? "is-pago" : ""}" aria-disabled="true"><span class="dot"></span>${on ? rotuloOn : rotuloOff}</span>`
              : `<label class="pago-toggle ${on ? "is-pago" : ""}">
                  <input type="checkbox" data-idx="${idx}" ${on ? "checked" : ""} />
                  <span class="dot"></span>${on ? rotuloOn : rotuloOff}
                </label>`
          }
        </div>
      </div>
    `;
    if (!ambos) {
      li.querySelector('input[type="checkbox"]').addEventListener("change", () => toggleFn(idx));
      li.querySelector(".swipe-edit").addEventListener("click", () => {
        fecharSwipe(li);
        abrirModalEditar(tipoModal, idx, item.nome, item.valor);
      });
      li.querySelector(".swipe-delete").addEventListener("click", () => {
        fecharSwipe(li);
        abrirConfirmacao(`Remover "${item.nome}"? Essa ação não pode ser desfeita.`, () => ops.remove(idx));
      });
    }
    ul.appendChild(li);
  });
  habilitarSwipe(ul);
}

// ---------------------------------------------------------------------
// CONFETE — comemoração quando uma meta bate 100%
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// RENDER — CAIXINHAS (inclui as antigas "Metas": toda caixinha pode ter um
// objetivo opcional; sem objetivo definido, ela é só um cofrinho comum)
// ---------------------------------------------------------------------

function renderCaixinhas() {
  const ambos = isAmbos();
  const wrap = document.getElementById("listaCaixinhas");
  if (wrap) {
    wrap.innerHTML = "";
    if (state.caixinhas.length === 0) {
      wrap.innerHTML = `<p class="empty-state">Nenhuma caixinha ainda. Que tal criar uma?</p>`;
    } else {
      state.caixinhas.forEach((cx, idx) => {
        const guardado = Number(cx.valorGuardado) || 0;
        const objetivo = Number(cx.valorObjetivo) || 0;
        const temObjetivo = objetivo > 0;
        const falta = Math.max(objetivo - guardado, 0);
        const pct = temObjetivo ? Math.min((guardado / objetivo) * 100, 100) : 0;
        const completo = temObjetivo && falta <= 0;

        if (completo && !cx._comemorado) {
          if (!primeiraRenderCaixinhas) cx._comemoraAoRenderizar = true;
          cx._comemorado = true;
        } else if (!completo) {
          cx._comemorado = false;
        }

        const card = document.createElement("div");
        card.className = "goal-card caixinha-card" + (cx._comemoraAoRenderizar ? " is-celebrando" : "");
        card.style.animationDelay = Math.min(idx * 40, 250) + "ms";
        card.innerHTML = `
          <div class="goal-head">
            <span class="goal-nome">${escapeHtml(cx.nome)} ${tagPessoa(cx)}</span>
            ${
              temObjetivo
                ? `<span class="goal-falta ${completo ? "completo" : ""}">${completo ? "Objetivo batido ✓" : "faltam " + fmt(falta)}</span>`
                : ""
            }
          </div>
          ${temObjetivo ? `<div class="goal-bar-track"><div class="goal-bar-fill ${completo ? "completo" : ""}" style="width:${pct}%"></div></div>` : ""}
          <div class="caixinha-valores">
            <span class="caixinha-guardado"><strong>${fmt(guardado)}</strong>${temObjetivo ? ` de ${fmt(objetivo)}` : " guardados"}</span>
          </div>
          ${
            ambos
              ? ""
              : `<div class="caixinha-actions">
                  <button class="btn btn-caixinha-guardar" data-idx="${idx}">+ guardar</button>
                  <button class="btn btn-caixinha-retirar" data-idx="${idx}">− retirar</button>
                  <button class="btn-edit" aria-label="Editar caixinha" data-edit="${idx}">${ICONE_LAPIS}</button>
                  <button class="btn-remove" aria-label="Remover caixinha" data-remove="${idx}">${ICONE_X}</button>
                </div>`
          }
        `;
        if (!ambos) {
          card.querySelector(".btn-caixinha-guardar").addEventListener("click", () => abrirModalCaixinha("guardar", idx));
          card.querySelector(".btn-caixinha-retirar").addEventListener("click", () => abrirModalCaixinha("retirar", idx));
          card.querySelector("[data-edit]").addEventListener("click", () => abrirModalEditar("caixinhas", idx, cx.nome, cx.valorObjetivo));
          card.querySelector("[data-remove]").addEventListener("click", () => {
            const guardado = Number(cx.valorGuardado) || 0;
            const aviso =
              guardado > 0
                ? `Remover a caixinha "${cx.nome}"? Os ${fmt(guardado)} guardados nela voltam pro saldo disponível como um ganho. Essa ação não pode ser desfeita.`
                : `Remover a caixinha "${cx.nome}"? Essa ação não pode ser desfeita.`;
            abrirConfirmacao(aviso, () => removeCaixinha(idx));
          });
        }
        if (cx._comemoraAoRenderizar) {
          dispararConfete();
          cx._comemoraAoRenderizar = false;
        }
        wrap.appendChild(card);
      });
    }
  }

  primeiraRenderCaixinhas = false;

  // mini lista no resumo
  const mini = document.getElementById("resumoCaixinhas");
  if (!mini) return;
  mini.innerHTML = "";
  if (state.caixinhas.length === 0) {
    mini.innerHTML = `<p class="empty-state">Crie uma caixinha na aba "Caixinhas".</p>`;
  } else {
    state.caixinhas.forEach((cx) => {
      const guardado = Number(cx.valorGuardado) || 0;
      const objetivo = Number(cx.valorObjetivo) || 0;
      const temObjetivo = objetivo > 0;
      const pct = temObjetivo ? Math.min((guardado / objetivo) * 100, 100) : 0;
      const row = document.createElement("div");
      row.className = "mini-goal";
      row.innerHTML = temObjetivo
        ? `
        <div class="mini-goal-info">
          <div class="mini-goal-nome">${escapeHtml(cx.nome)} ${tagPessoa(cx)}</div>
          <div class="goal-bar-track"><div class="goal-bar-fill ${pct >= 100 ? "completo" : ""}" style="width:${pct}%"></div></div>
        </div>
        <span class="mini-goal-pct">${fmt(guardado)}</span>`
        : `
        <div class="mini-goal-info">
          <div class="mini-goal-nome">${escapeHtml(cx.nome)} ${tagPessoa(cx)}</div>
        </div>
        <span class="mini-goal-pct">${fmt(guardado)}</span>`;
      mini.appendChild(row);
    });
  }
}

// ---------------------------------------------------------------------
// RENDER — RESUMO: lançamentos recentes (mistura tudo, mais recentes primeiro)
// ---------------------------------------------------------------------

const ICONE_GANHO = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_GASTO = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function itensRecentesPorCategoria(lista, tipo, tag, n) {
  return lista
    .slice(-n)
    .reverse()
    .map((i) => ({ ...i, tipo, tag }));
}

function renderRecentes() {
  const ledger = document.getElementById("ledgerRecentes");
  // Pega os últimos N de cada categoria, e não os últimos N do total —
  // assim ganhos nunca somem da lista só porque há muitos gastos depois.
  const todos = [
    ...itensRecentesPorCategoria(state.ganhos, "income", "Ganho", 3),
    ...itensRecentesPorCategoria(state.gastosFixos, "expense", "Fixo", 3),
    ...itensRecentesPorCategoria(state.gastosVariaveis, "expense", "Variável", 3),
  ];

  ledger.innerHTML = "";
  if (todos.length === 0) {
    ledger.innerHTML = `<p class="empty-state">Ainda não há lançamentos. Comece pela aba "Ganhos".</p>`;
    return;
  }
  todos.forEach((item) => {
    const pendente = item.tipo === "income" ? item.recebido === false : item.pago === false;
    const row = document.createElement("div");
    row.className = "ledger-item" + (pendente ? " is-pendente" : "");
    const tagPendente = item.tipo === "income" ? "A receber" : `${item.tag} · pendente`;
    row.innerHTML = `
      <span class="ledger-icon ${item.tipo}">${item.tipo === "income" ? ICONE_GANHO : ICONE_GASTO}</span>
      <div class="ledger-info">
        <span class="ledger-nome">${escapeHtml(item.nome)} ${tagPessoa(item)}</span>
        <span class="ledger-tag">${pendente ? tagPendente : item.tag}</span>
      </div>
      <span class="ledger-valor ${item.tipo}">${item.tipo === "income" ? "+" : "−"} ${fmt(item.valor)}</span>
    `;
    ledger.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// SKELETON LOADING — mostrado enquanto os dados vêm da planilha
// ---------------------------------------------------------------------

function skeletonItemRows(n) {
  return Array.from({ length: n })
    .map(
      () => `
      <li>
        <span class="skeleton" style="width:55%;height:13px;">.</span>
        <span class="skeleton" style="width:64px;height:13px;">.</span>
      </li>`
    )
    .join("");
}

function skeletonLedgerRows(n) {
  return Array.from({ length: n })
    .map(
      () => `
      <div class="ledger-item">
        <span class="skeleton" style="width:34px;height:34px;border-radius:50%;">.</span>
        <div class="ledger-info">
          <span class="skeleton" style="width:65%;height:12px;margin-bottom:6px;">.</span>
          <span class="skeleton" style="width:35%;height:9px;">.</span>
        </div>
        <span class="skeleton" style="width:58px;height:13px;">.</span>
      </div>`
    )
    .join("");
}

function skeletonGoalCards(n) {
  return Array.from({ length: n })
    .map(
      () => `
      <div class="goal-card">
        <div class="skeleton" style="width:55%;height:17px;margin-bottom:16px;">.</div>
        <div class="skeleton" style="height:10px;border-radius:100px;margin-bottom:14px;">.</div>
        <div class="skeleton" style="width:40%;height:12px;">.</div>
      </div>`
    )
    .join("");
}

function skeletonMiniGoals(n) {
  return Array.from({ length: n })
    .map(
      () => `
      <div class="mini-goal">
        <div class="mini-goal-info">
          <div class="skeleton" style="width:50%;height:12px;margin-bottom:8px;">.</div>
          <div class="skeleton" style="height:6px;border-radius:100px;">.</div>
        </div>
        <span class="skeleton" style="width:30px;height:12px;">.</span>
      </div>`
    )
    .join("");
}

function renderSkeletons() {
  ["listaGanhos", "listaFixos", "listaVariaveis"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = skeletonItemRows(3);
  });
  const ledger = document.getElementById("ledgerRecentes");
  if (ledger) ledger.innerHTML = skeletonLedgerRows(4);
  const resumoCx = document.getElementById("resumoCaixinhas");
  if (resumoCx) resumoCx.innerHTML = skeletonMiniGoals(2);
  const listaCaixinhas = document.getElementById("listaCaixinhas");
  if (listaCaixinhas) listaCaixinhas.innerHTML = skeletonGoalCards(2);
  renderVisaoGeralSkeleton();
  if (isAmbos()) renderSplitSkeleton();
}

// Skeleton do gráfico "Visão geral" — sempre aparece na aba Resumo enquanto
// o primeiro carregamento não chega (não depende do modo Ambos).
function renderVisaoGeralSkeleton() {
  const donut = document.getElementById("visaoGeralDonut");
  if (donut) donut.style.background = "var(--paper-deep)";
  const centro = document.getElementById("visaoGeralDonutCenter");
  if (centro) centro.innerHTML = `<span class="skeleton" style="width:76px;height:16px;">.</span>`;
  const legend = document.getElementById("visaoGeralLegend");
  if (legend) {
    legend.innerHTML = [0, 1, 2]
      .map(() => `<div class="split-legend-item"><span class="skeleton" style="width:100%;height:14px;">.</span></div>`)
      .join("");
  }
}

// Skeleton do gráfico de divisão — só aparece no modo Ambos quando ainda não
// existe nenhum cache pra mostrar de cara (ou seja, bem raramente).
function renderSplitSkeleton() {
  const donut = document.getElementById("splitDonut");
  if (donut) donut.style.background = "var(--paper-deep)";
  const centro = document.getElementById("splitDonutCenter");
  if (centro) centro.innerHTML = `<span class="skeleton" style="width:76px;height:16px;">.</span>`;
  const legend = document.getElementById("splitLegend");
  if (legend) {
    legend.innerHTML = [0, 1, 2]
      .map(() => `<div class="split-legend-item"><span class="skeleton" style="width:100%;height:14px;">.</span></div>`)
      .join("");
  }
}

// ---------------------------------------------------------------------
// RENDER GERAL
// ---------------------------------------------------------------------

function renderAll() {
  renderTotais();
  renderListaComStatus("listaGanhos", state.ganhos, "income", opGanhos, "ganhos", "recebido", toggleRecebidoGanho, "Recebido", "Pendente");
  renderListaComStatus("listaFixos", state.gastosFixos, "expense", opFixos, "fixos", "pago", togglePagoFixo, "Pago", "Pendente");
  renderListaComStatus("listaVariaveis", state.gastosVariaveis, "expense", opVariaveis, "variaveis", "pago", togglePagoVariavel, "Pago", "Pendente");
  renderCaixinhas();
  renderVisaoGeral();
  renderCategorias();
  renderRecentes();
  renderSplit();
  renderJuntosView();
}

// ---------------------------------------------------------------------
// RENDER — GASTOS POR CATEGORIA (resumo): donut com a fatia de cada
// categoria (campo TIPO) nos gastos já pagos (fixos + variáveis, sem
// contar os lançamentos automáticos "Guardado: ..." de caixinha).
// ---------------------------------------------------------------------

const PALETA_CATEGORIAS = [
  "#b9862f", "#3c6e4f", "#a8482e", "#5c8aa6", "#8a6bb5",
  "#c99a3f", "#4d9e8a", "#c46a8f", "#7a9e4d", "#a67a4d",
];

function renderCategorias() {
  const card = document.getElementById("categoriaCard");
  const donut = document.getElementById("categoriaDonut");
  const centro = document.getElementById("categoriaDonutCenter");
  const legend = document.getElementById("categoriaLegend");
  if (!card && !donut && !centro && !legend) return;

  const gastos = [
    ...state.gastosFixos.filter(fixoEhPago),
    ...state.gastosVariaveis.filter(variavelEhPago).filter((i) => !ehLancamentoDeCaixinha(i.nome)),
  ];

  const porCategoria = {};
  gastos.forEach((item) => {
    const cat = (item.tipo && String(item.tipo).trim()) || "Outros";
    porCategoria[cat] = (porCategoria[cat] || 0) + (Number(item.valor) || 0);
  });
  const categorias = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
  const total = categorias.reduce((acc, c) => acc + porCategoria[c], 0);

  if (card) card.classList.toggle("is-hidden", categorias.length === 0 || total <= 0);
  if (categorias.length === 0 || total <= 0) return;

  let acumulado = 0;
  const partes = categorias.map((cat, idx) => {
    const cor = PALETA_CATEGORIAS[idx % PALETA_CATEGORIAS.length];
    const pct = (porCategoria[cat] / total) * 100;
    const inicio = acumulado;
    acumulado += pct;
    return { cat, cor, pct, inicio, fim: acumulado, valor: porCategoria[cat] };
  });

  if (donut) {
    donut.style.background = `conic-gradient(${partes.map((p) => `${p.cor} ${p.inicio}% ${p.fim}%`).join(", ")})`;
  }
  if (centro) {
    centro.innerHTML = `${spanCentro(fmt(total))}<small>gasto no total</small>`;
  }
  if (legend) {
    legend.innerHTML = partes
      .map(
        (p) => `
        <div class="split-legend-item">
          <span class="dot" style="background:${p.cor}"></span>
          ${escapeHtml(p.cat)}
          <strong>${p.pct.toFixed(0)}%</strong>
        </div>`
      )
      .join("");
  }
}

// ---------------------------------------------------------------------
// RENDER — VISÃO GERAL (resumo): como o ganho se divide entre guardado,
// gasto e livre. Aparece sempre na aba Resumo, pra qualquer pessoa
// selecionada (Davi, Gabriel ou Ambos).
// ---------------------------------------------------------------------

function renderVisaoGeral() {
  atualizarVisibilidadeVisaoGeral();
  if (isAmbos()) return; // não faz sentido no modo Ambos — ver "Divisão do casal"

  const donut = document.getElementById("visaoGeralDonut");
  const centro = document.getElementById("visaoGeralDonutCenter");
  const legend = document.getElementById("visaoGeralLegend");
  if (!donut && !centro && !legend) return;

  const totalGanhos = somaComStatus(state.ganhos, "recebido");
  // Os lançamentos automáticos "Guardado: ..." já representam o dinheiro que
  // foi pra uma caixinha — não entram aqui de novo pra não contar em dobro
  // junto com o bloco "Guardado" do gráfico.
  const variaveisSemGuardado = state.gastosVariaveis.filter((i) => !ehLancamentoDeCaixinha(i.nome));
  const totalGastos = somaFixosPagos(state.gastosFixos) + somaComStatus(variaveisSemGuardado, "pago");
  const totalGuardado = somaCampo(state.caixinhas, "valorGuardado");
  const livre = totalGanhos - totalGastos - totalGuardado;
  const base = Math.max(totalGanhos, totalGastos + totalGuardado, 0.01);

  const pctGuardado = Math.max((totalGuardado / base) * 100, 0);
  const pctGastos = Math.max((totalGastos / base) * 100, 0);
  const pctLivre = Math.max(100 - pctGuardado - pctGastos, 0);

  const corte1 = pctGuardado;
  const corte2 = pctGuardado + pctGastos;

  if (donut) {
    donut.style.background = `conic-gradient(var(--gold) 0% ${corte1}%, var(--expense) ${corte1}% ${corte2}%, var(--income) ${corte2}% 100%)`;
  }
  if (centro) {
    centro.innerHTML = `${spanCentro(fmt(totalGanhos))}<small>${livre < 0 ? "ganho · estourou" : "ganho no total"}</small>`;
  }
  if (legend) {
    legend.innerHTML = `
      <div class="split-legend-item">
        <span class="dot" style="background:var(--gold)"></span>
        Guardado
        <strong>${pctGuardado.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:var(--expense)"></span>
        Gastos
        <strong>${pctGastos.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:var(--income)"></span>
        Livre
        <strong>${pctLivre.toFixed(0)}%</strong>
      </div>
    `;
  }
}

// ---------------------------------------------------------------------
// RENDER — DIVISÃO DO CASAL (só aparece no modo "Ambos")
// Mostra o total que os dois ganharam juntos, e quanto fatia cada um já gastou.
// ---------------------------------------------------------------------

function renderSplit() {
  const card = document.getElementById("splitCard");
  if (!card) return;
  const ambos = isAmbos();
  card.classList.toggle("is-hidden", !ambos);
  if (!ambos) return;

  const totalGanhos = somaComStatus(state.ganhos, "recebido");
  const gastoPorPessoa = { davi: 0, gabriel: 0 };
  [...state.gastosFixos.filter(fixoEhPago), ...state.gastosVariaveis.filter(variavelEhPago)].forEach((item) => {
    if (item.pessoa === "davi" || item.pessoa === "gabriel") {
      gastoPorPessoa[item.pessoa] += Number(item.valor) || 0;
    }
  });
  const gastoDavi = gastoPorPessoa.davi;
  const gastoGabriel = gastoPorPessoa.gabriel;
  const restante = totalGanhos - gastoDavi - gastoGabriel;
  const base = Math.max(totalGanhos, gastoDavi + gastoGabriel, 0.01);

  const pctDavi = Math.max((gastoDavi / base) * 100, 0);
  const pctGabriel = Math.max((gastoGabriel / base) * 100, 0);
  const pctRestante = Math.max(100 - pctDavi - pctGabriel, 0);

  const corte1 = pctDavi;
  const corte2 = pctDavi + pctGabriel;

  const donut = document.getElementById("splitDonut");
  if (donut) {
    donut.style.background = `conic-gradient(var(--income) 0% ${corte1}%, var(--expense) ${corte1}% ${corte2}%, var(--line-soft) ${corte2}% 100%)`;
  }
  const centro = document.getElementById("splitDonutCenter");
  if (centro) {
    centro.innerHTML = `${spanCentro(fmt(restante))}<small>${restante < 0 ? "no vermelho" : "sobrando"}</small>`;
  }

  const legend = document.getElementById("splitLegend");
  if (legend) {
    legend.innerHTML = `
      <div class="split-legend-item">
        <span class="dot" style="background:var(--income)"></span>
        Davi gastou
        <strong>${pctDavi.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:var(--expense)"></span>
        Gabriel gastou
        <strong>${pctGabriel.toFixed(0)}%</strong>
      </div>
      <div class="split-legend-item">
        <span class="dot" style="background:var(--line-soft)"></span>
        Ainda sobrando
        <strong>${pctRestante.toFixed(0)}%</strong>
      </div>
    `;
  }
}

// ---------------------------------------------------------------------
// RENDER — "JUNTOS": cards de conta por pessoa (Davi/Gabriel), mostrando
// o saldo atual e, pequeno embaixo, o valor projetado — só aparece no
// modo Ambos, substituindo os lançamentos recentes/caixinhas padrão.
// ---------------------------------------------------------------------

const AVATAR_LETRA = { davi: "D", gabriel: "G" };

function agruparPorPessoa(lista) {
  const grupos = { davi: [], gabriel: [] };
  lista.forEach((item) => {
    if (item.pessoa === "davi" || item.pessoa === "gabriel") grupos[item.pessoa].push(item);
  });
  return grupos;
}

function cardJuntos(pessoa, atual, projetado, corClasse) {
  const mostraProjetado = projetado !== null && projetado !== undefined;
  return `
    <div class="juntos-card">
      <span class="juntos-avatar avatar-${pessoa}">${AVATAR_LETRA[pessoa]}</span>
      <div class="juntos-card-info">
        <span class="juntos-card-nome">${PESSOA_LABEL[pessoa]}</span>
        ${mostraProjetado ? `<span class="juntos-card-projetado">Projetado: ${fmt(projetado)}</span>` : ""}
      </div>
      <span class="juntos-card-valor ${corClasse}">${fmt(atual)}</span>
    </div>`;
}

// Mostra/esconde a view "Juntos" e o resumo padrão IMEDIATAMENTE ao trocar
// de pessoa — mesmo princípio do splitCard: não espera os dados chegarem.
function atualizarVisibilidadeJuntosView() {
  const ambos = isAmbos();
  const view = document.getElementById("juntosView");
  if (view) view.classList.toggle("is-hidden", !ambos);
  const resumoPadrao = document.getElementById("resumoPadrao");
  if (resumoPadrao) resumoPadrao.classList.toggle("is-hidden", ambos);
}

function renderJuntosView() {
  atualizarVisibilidadeJuntosView();
  if (!isAmbos()) return;

  const ganhosPorPessoa = agruparPorPessoa(state.ganhos);
  const fixosPorPessoa = agruparPorPessoa(state.gastosFixos);
  const variaveisPorPessoa = agruparPorPessoa(state.gastosVariaveis);
  const caixinhasPorPessoa = agruparPorPessoa(state.caixinhas);

  const ganhosEl = document.getElementById("juntosGanhos");
  if (ganhosEl) {
    ganhosEl.innerHTML = ["davi", "gabriel"]
      .map((p) => cardJuntos(p, somaComStatus(ganhosPorPessoa[p], "recebido"), soma(ganhosPorPessoa[p]), "income"))
      .join("");
  }

  const guardadoEl = document.getElementById("juntosGuardado");
  if (guardadoEl) {
    guardadoEl.innerHTML = ["davi", "gabriel"]
      .map((p) => {
        const atual = somaCampo(caixinhasPorPessoa[p], "valorGuardado");
        return cardJuntos(p, atual, null, "gold");
      })
      .join("");
  }

  const fixosEl = document.getElementById("juntosFixos");
  if (fixosEl) {
    fixosEl.innerHTML = ["davi", "gabriel"]
      .map((p) => cardJuntos(p, somaFixosPagos(fixosPorPessoa[p]), null, "expense"))
      .join("");
  }

  const variaveisEl = document.getElementById("juntosVariaveis");
  if (variaveisEl) {
    variaveisEl.innerHTML = ["davi", "gabriel"]
      .map((p) => cardJuntos(p, somaComStatus(variaveisPorPessoa[p], "pago"), null, "expense"))
      .join("");
  }
}

// Ajusta o tamanho da fonte do valor central do donut conforme o
// tamanho do texto, pra nunca estourar pra fora do círculo (valores
// grandes como "R$ 12.345,00" precisam de uma fonte menor que "R$ 0,00").
function spanCentro(valorFormatado) {
  let tamanho = 13.5;
  if (valorFormatado.length > 9) tamanho = 12;
  if (valorFormatado.length > 11) tamanho = 10.5;
  if (valorFormatado.length > 13) tamanho = 9.5;
  return `<span style="font-size:${tamanho}px">${valorFormatado}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// HISTÓRICO — meses já fechados, com o saldo individual de cada pessoa
// ---------------------------------------------------------------------

function getCacheHistorico() {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + "historico");
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}
function setCacheHistorico(data) {
  try {
    localStorage.setItem(CACHE_PREFIX + "historico", JSON.stringify({ anos: data.anos || [] }));
  } catch (err) {
    // sem problema, só não guarda o cache
  }
}

async function carregarHistorico() {
  const cache = getCacheHistorico();
  if (cache) {
    state.historico = cache;
    renderHistorico();
  } else {
    renderHistoricoSkeleton();
  }
  if (!API_URL || API_URL.includes("COLE_AQUI")) return;
  try {
    const res = await fetch(`${API_URL}?pessoa=historico`);
    const data = await res.json();
    if (data && data.ok === false) throw new Error(data.error || "Erro desconhecido");
    state.historico = data;
    if (data.mesAtual) state.mesAtual = data.mesAtual;
    if (data.anoAtual) state.anoAtual = data.anoAtual;
    renderMesAtual();
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
  wrap.innerHTML = Array.from({ length: 2 })
    .map(
      () => `
      <div class="historico-mes-card">
        <div class="skeleton" style="width:40%;height:16px;margin-bottom:12px;">.</div>
        <div class="skeleton" style="width:100%;height:13px;margin-bottom:8px;">.</div>
        <div class="skeleton" style="width:100%;height:13px;">.</div>
      </div>`
    )
    .join("");
}

function renderHistorico() {
  const wrap = document.getElementById("historicoLista");
  if (!wrap) return;
  const anos = (state.historico && state.historico.anos) || [];
  if (anos.length === 0) {
    wrap.innerHTML = `<p class="empty-state">Nenhum mês fechado ainda. Feche o primeiro mês em "Ações em conjunto".</p>`;
    return;
  }
  // mais recente primeiro: ano decrescente, e dentro do ano, mês decrescente
  const anosOrdenados = [...anos].sort((a, b) => b.ano - a.ano);
  wrap.innerHTML = anosOrdenados
    .map((bloco) => {
      const mesesOrdenados = [...bloco.meses].sort((a, b) => b.mes - a.mes);
      const cards = mesesOrdenados
        .map((m) => {
          const saldoTotal = m.saldoDavi + m.saldoGabriel;
          const ganhosTotal = m.ganhosDavi + m.ganhosGabriel;
          const debitosTotal = m.debitosDavi + m.debitosGabriel;
          const guardadoTotal = m.guardadoDavi + m.guardadoGabriel;
          const nomeMes = m.nome.charAt(0) + m.nome.slice(1).toLowerCase();
          return `
          <div class="historico-mes-card">
            <div class="historico-mes-head">
              <span class="historico-mes-nome">${nomeMes}</span>
              <span class="historico-mes-saldo ${saldoTotal < 0 ? "negative" : ""}">${fmt(saldoTotal)}</span>
            </div>
            <div class="historico-mes-linha">
              <span>Ganhos</span><span class="income">${fmt(ganhosTotal)}</span>
            </div>
            <div class="historico-mes-linha">
              <span>Débitos</span><span class="expense">${fmt(Math.abs(debitosTotal))}</span>
            </div>
            ${
              guardadoTotal > 0
                ? `<div class="historico-mes-linha">
                    <span>Guardado</span><span class="gold">${fmt(guardadoTotal)}</span>
                  </div>`
                : ""
            }
            <div class="historico-mes-pessoas">
              <span class="pessoa-tag pessoa-davi">Davi ${fmt(m.saldoDavi)}</span>
              <span class="pessoa-tag pessoa-gabriel">Gabriel ${fmt(m.saldoGabriel)}</span>
            </div>
          </div>`;
        })
        .join("");
      return `
        <div class="historico-ano-bloco">
          <h3 class="historico-ano-titulo">${bloco.ano}</h3>
          ${cards}
        </div>`;
    })
    .join("");
}

// ---------------------------------------------------------------------
// GAVETAS — botão de recolher nos formulários de Ganhos, Fixos, Variáveis
// e Caixinhas. O estado (aberto/fechado) fica salvo no aparelho, então
// continua do jeito que a pessoa deixou da última vez que abriu o app.
// ---------------------------------------------------------------------

function getColapsoState() {
  try {
    const raw = localStorage.getItem(COLAPSO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}
function setColapsoState(estado) {
  try {
    localStorage.setItem(COLAPSO_STORAGE_KEY, JSON.stringify(estado));
  } catch (err) {
    // sem problema, só não guarda a preferência
  }
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
    // Sem preferência salva ainda: todas as gavetas começam FECHADAS.
    const colapsado = estado[chave] === undefined ? true : !!estado[chave];
    aplicarColapso(btn, alvo, colapsado);
    btn.addEventListener("click", () => {
      const novoColapsado = !alvo.classList.contains("is-collapsed");
      aplicarColapso(btn, alvo, novoColapsado);
      const estadoAtual = getColapsoState();
      estadoAtual[chave] = novoColapsado;
      setColapsoState(estadoAtual);
    });
  });
}

// ---------------------------------------------------------------------
// NAVEGAÇÃO POR ABAS
// ---------------------------------------------------------------------

// "Note" que desliza suavemente até ficar em cima da aba ativa.
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
    if (tab === "historico") carregarHistorico();
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
} else {
  console.warn('Caixa: elemento #personSwitch não encontrado. Confira se o index.html foi atualizado junto com o app.js (falta a <div id="personSwitch"> no cabeçalho).');
}

// ---------------------------------------------------------------------
// FORMULÁRIOS
// ---------------------------------------------------------------------

function parseValor(v) {
  return Math.round(parseFloat(v) * 100) / 100;
}

// Liga um listener só se o elemento existir — evita que um elemento faltando
// no HTML derrube o script inteiro (e trave o resto do app).
function on(id, evento, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`Caixa: elemento #${id} não encontrado no HTML.`);
    return;
  }
  el.addEventListener(evento, handler);
}

on("formGanhos", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  const recebido = f.recebido ? f.recebido.checked : false;
  const data = f.data ? f.data.value : "";
  opGanhos.add(nome, valor, { recebido, data });
  f.reset();
});

on("formFixos", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  const pago = f.pago ? f.pago.checked : false;
  const tipo = f.tipo ? f.tipo.value : "";
  const data = f.data ? f.data.value : "";
  opFixos.add(nome, valor, { pago, tipo, data });
  f.reset();
});

// Valida "Parcela" no formato "atual/total" (ex: "2/10") — vazio é sempre
// válido (significa "à vista", sem parcelamento).
function parcelaValida(texto) {
  const v = String(texto || "").trim();
  if (!v) return true;
  return /^\d+\s*\/\s*\d+$/.test(v);
}

on("formVariaveis", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valor = parseValor(f.valor.value);
  if (!nome || !(valor > 0)) return;
  const pago = f.pago ? f.pago.checked : false;
  const tipo = f.tipo ? f.tipo.value : "";
  const data = f.data ? f.data.value : "";
  const parcela = f.parcela ? f.parcela.value.trim() : "";
  if (!parcelaValida(parcela)) {
    showToast('Parcela inválida — use o formato "atual/total", ex: 2/10.');
    return;
  }
  opVariaveis.add(nome, valor, { pago, tipo, data, parcela });
  f.reset();
});

on("formCaixinhas", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const f = e.target;
  const nome = f.nome.value.trim();
  const valorInicial = f.valorInicial.value ? parseValor(f.valorInicial.value) : 0;
  const valorObjetivo = f.valorObjetivo.value ? parseValor(f.valorObjetivo.value) : 0;
  if (!nome || valorInicial < 0) return;
  addCaixinha(nome, valorInicial, valorObjetivo);
  f.reset();
});

// ---------------------------------------------------------------------
// MODAL DE APORTE
// ---------------------------------------------------------------------

// Modal genérico de "digitar um valor" — usado pelas caixinhas (guardar /
// retirar). Cada chamador define o título e o que fazer com o valor
// digitado via `onConfirmarValor`.
let onConfirmarValor = null;
const modalBackdrop = document.getElementById("modalBackdrop");

function abrirModalValor(titulo, callback, textoBotao) {
  if (isAmbos()) return;
  onConfirmarValor = callback;
  document.getElementById("modalTitle").textContent = titulo;
  document.getElementById("aporteValor").value = "";
  const botaoConfirmar = document.getElementById("modalConfirmar");
  if (botaoConfirmar) botaoConfirmar.textContent = textoBotao || "Guardar";
  modalBackdrop.classList.remove("is-hidden");
  registrarAberturaModal("modalBackdrop");
  setTimeout(() => document.getElementById("aporteValor").focus(), 50);
}
function fecharModal() {
  fecharComHistorico("modalBackdrop", () => {
    modalBackdrop.classList.add("is-hidden");
    onConfirmarValor = null;
  });
}
FECHADORES_MODAL.modalBackdrop = fecharModal;
on("modalCancelar", "click", fecharModal);
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) fecharModal();
  });
}
on("formAporte", "submit", (e) => {
  e.preventDefault();
  if (isAmbos()) return;
  const valor = parseValor(document.getElementById("aporteValor").value);
  if (!(valor > 0) || !onConfirmarValor) return;
  onConfirmarValor(valor);
  fecharModal();
});

const TITULOS_CAIXINHA = {
  guardar: (nome) => `Guardar em — ${nome}`,
  retirar: (nome) => `Retirar de — ${nome}`,
};
const BOTOES_CAIXINHA = {
  guardar: "Guardar",
  retirar: "Retirar",
};
function abrirModalCaixinha(acao, idx) {
  const cx = state.caixinhas[idx];
  if (!cx) return;
  const titulo = TITULOS_CAIXINHA[acao](cx.nome);
  const acoes = {
    guardar: (valor) => guardarNaCaixinha(idx, valor),
    retirar: (valor) => retirarDaCaixinha(idx, valor),
  };
  abrirModalValor(titulo, acoes[acao], BOTOES_CAIXINHA[acao]);
}

// ---------------------------------------------------------------------
// MODAL DE EDIÇÃO (ganhos, fixos, variáveis e caixinhas)
// ---------------------------------------------------------------------

let editContext = null; // { tipo, idx }
const editBackdrop = document.getElementById("editBackdrop");
const TITULOS_EDICAO = {
  ganhos: "Editar ganho",
  fixos: "Editar gasto fixo",
  variaveis: "Editar gasto variável",
  caixinhas: "Editar caixinha",
};

function abrirModalEditar(tipo, idx, nome, valor) {
  if (isAmbos()) return;
  editContext = { tipo, idx };
  const tituloEl = document.getElementById("editTitle");
  if (tituloEl) tituloEl.textContent = TITULOS_EDICAO[tipo] || "Editar item";
  document.getElementById("editNome").value = nome;
  const valorEl = document.getElementById("editValor");
  valorEl.value = valor;
  valorEl.placeholder = tipo === "caixinhas" ? "Objetivo, R$ (0 = sem meta)" : "0,00";
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
  const valor = parseValor(document.getElementById("editValor").value) || 0;
  const { tipo, idx } = editContext;
  if (!nome || (tipo !== "caixinhas" && !(valor > 0))) return;
  if (tipo === "ganhos") opGanhos.edit(idx, nome, valor);
  else if (tipo === "fixos") opFixos.edit(idx, nome, valor);
  else if (tipo === "variaveis") opVariaveis.edit(idx, nome, valor);
  else if (tipo === "caixinhas") editCaixinha(idx, nome, valor);
  fecharModalEditar();
});

// ---------------------------------------------------------------------
// MODAL DE AÇÕES EM CONJUNTO (dividir compra)
// ---------------------------------------------------------------------

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
on("btnAcoesConjunto", "click", abrirAcoesConjunto);
on("acoesFechar", "click", fecharAcoesConjunto);
if (acoesBackdrop) {
  acoesBackdrop.addEventListener("click", (e) => {
    if (e.target === acoesBackdrop) fecharAcoesConjunto();
  });
}

on("btnAbrirDividir", "click", () => {
  if (acoesMenuView) acoesMenuView.classList.add("is-hidden");
  if (formDividir) formDividir.classList.remove("is-hidden");
  document.getElementById("dividirNome").value = "";
  document.getElementById("dividirValor").value = "";
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

  const btnSubmit = document.getElementById("dividirSubmit");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Dividindo…";
  }

  const ok = await dividirCompra(nome, valor, categoriaDividir);

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Dividir";
  }

  if (ok) {
    showToast(`"${nome}" dividido — metade pra cada um`);
    fecharAcoesConjunto();
    carregarDados();
  } else {
    showToast("Não consegui dividir agora. Tenta de novo em instantes.");
  }
});

// ---------------------------------------------------------------------
// MODAL DE AÇÕES EM CONJUNTO — TRANSFERIR (Davi ⇄ Gabriel)
// ---------------------------------------------------------------------

on("btnAbrirTransferir", "click", () => {
  if (acoesMenuView) acoesMenuView.classList.add("is-hidden");
  if (formTransferir) formTransferir.classList.remove("is-hidden");
  document.getElementById("transferirNome").value = "";
  document.getElementById("transferirValor").value = "";
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

on("formTransferir", "submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("transferirNome").value.trim() || "Transferência";
  const valor = parseValor(document.getElementById("transferirValor").value);
  if (!(valor > 0)) return;

  const btnSubmit = document.getElementById("transferirSubmit");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Transferindo…";
  }

  const { de, para } = direcaoTransferir;
  const ok = await transferirEntrePessoas(de, para, nome, valor);

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Transferir";
  }

  if (ok) {
    showToast(`${fmt(valor)} transferido de ${PESSOA_LABEL[de]} pra ${PESSOA_LABEL[para]}`);
    fecharAcoesConjunto();
    carregarDados();
  } else {
    showToast("Não consegui transferir agora. Tenta de novo em instantes.");
  }
});

// ---------------------------------------------------------------------
// FECHAR MÊS — some as pontas do mês pros dois, grava no HISTORICO e
// já passa o saldo de cada um (sem dividir) como ganho automático do
// próximo mês. Some com os variáveis, mantém ganhos e fixos.
// Abre ao tocar no selo de mês, no topo — não é mais uma "ação em conjunto".
// ---------------------------------------------------------------------

const fecharMesBackdrop = document.getElementById("fecharMesBackdrop");

function abrirFecharMes() {
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
  const selectMes = document.getElementById("fecharMesSelect");
  const inputAno = document.getElementById("fecharAnoInput");
  if (selectMes && selectMes.options.length === 0) {
    MESES_LABEL.forEach((nome, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx + 1);
      opt.textContent = nome;
      selectMes.appendChild(opt);
    });
  }
  const agora = new Date();
  const mes = state.mesAtual || agora.getMonth() + 1;
  const ano = state.anoAtual || agora.getFullYear();
  if (selectMes) selectMes.value = String(mes);
  if (inputAno) inputAno.value = ano;
}

async function fecharMesRequisicao(mes, ano) {
  if (!API_URL || API_URL.includes("COLE_AQUI")) {
    showToast("Configure a URL do Apps Script em config.js");
    return null;
  }
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "fecharMes", mes, ano }),
    });
    const data = await res.json().catch(() => null);
    if (!data || data.ok === false) throw new Error((data && data.error) || "Erro desconhecido");
    return data;
  } catch (err) {
    return null;
  }
}

on("formFecharMes", "submit", async (e) => {
  e.preventDefault();
  const mes = Number(document.getElementById("fecharMesSelect").value);
  const ano = Number(document.getElementById("fecharAnoInput").value);
  if (!mes || !ano) return;

  const btnSubmit = document.getElementById("fecharMesSubmit");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Fechando…";
  }

  const resultado = await fecharMesRequisicao(mes, ano);

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Fechar mês";
  }

  if (resultado) {
    const f = resultado.fechado;
    state.mesAtual = resultado.mesAtual;
    state.anoAtual = resultado.anoAtual;
    renderMesAtual();

    // Davi e Gabriel (e Ambos e o histórico) mudaram — os caches antigos
    // ficariam desatualizados, então joga tudo fora e recarrega na hora.
    ["davi", "gabriel", "ambos", "historico"].forEach((p) => localStorage.removeItem(CACHE_PREFIX + p));

    showToast(
      `${MESES_LABEL[f.mes - 1]}/${f.ano} fechado — Davi ${fmt(f.saldoDavi)} · Gabriel ${fmt(f.saldoGabriel)}`
    );
    fecharModalFecharMes();
    carregarDados();
    carregarHistorico();
  } else {
    showToast("Não consegui fechar o mês agora. Tenta de novo em instantes.");
  }
});

// ---------------------------------------------------------------------
// MODAL DE CONFIRMAÇÃO (usado hoje para remover itens e caixinhas)
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// INÍCIO
// ---------------------------------------------------------------------

renderPessoaSwitch();
renderMesAtual();
atualizarVisibilidadeEdicao();
atualizarVisibilidadeSplitCard();
atualizarVisibilidadeVisaoGeral();
atualizarVisibilidadeJuntosView();
initGavetas();
posicionarIndicadorAba();
carregarDados();
