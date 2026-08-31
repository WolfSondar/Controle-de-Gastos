/**
 * CAIXA — backend em Google Apps Script
 * Conecta a planilha "Sistema de Controle Financeiro e Objetivos" ao site.
 * Suporte a duas pessoas, cada uma na sua própria aba:
 *   - Aba "Davi"
 *   - Aba "Gabriel"
 * E um modo "Ambos", que combina os dados das duas abas, somente leitura.
 *
 * LAYOUT DE COLUNAS (abas Davi/Gabriel) — PARCELA agora é dos GASTOS FIXOS:
 *   A = GANHOS              B = VALOR GANHO         C = DATA        D = RECEBIDO (VERDADEIRO/FALSO)
 *   E = GASTOS FIXOS        F = VALOR FIXO          G = TIPO        H = DATA        I = PARCELA     J = PAGO (VERDADEIRO/FALSO)
 *   K = GASTOS VARIÁVEIS    L = VALOR VARIÁVEL      M = TIPO        N = DATA        O = PAGO (VERDADEIRO/FALSO)
 *   P = GUARDADO (nome da caixinha/investimento/meta)
 *   Q = META (objetivo opcional da caixinha; 0 ou vazio = sem meta)
 *   R = VALOR GUARDADO (quanto está guardado agora nessa caixinha)
 *
 * TIPO: categoria rápida do gasto (ex: "Alimentação", "Transporte", "Lazer"...),
 * usada pra montar o gráfico "Gastos por categoria" no Resumo (e, agora, também
 * o mesmo gráfico agregado por ano na aba Histórico — ver HISTÓRICO abaixo).
 * Texto livre.
 *
 * DATA: data do lançamento (quando recebemos/receberemos ou pagamos/pagaremos),
 * no formato AAAA-MM-DD. Meramente informativa — não afeta nenhum cálculo.
 *
 * PARCELA (agora só nos gastos FIXOS, não mais nos variáveis): texto tipo
 * "2/48" (parcela atual/total de parcelas). Vazio, "1" ou sem "/" = fixo
 * comum, sem prazo pra acabar (assinatura, aluguel...). Foi movida de
 * Variáveis pra Fixos porque um financiamento/parcelamento é, na prática,
 * um compromisso recorrente todo mês até zerar — o mesmo padrão de um
 * gasto fixo, só que com fim marcado. Ao FECHAR O MÊS:
 *   - Fixo SEM parcela (ou "1"): não desaparece nunca, só volta a pendente
 *     — é o comportamento de sempre.
 *   - Fixo COM parcela pendente (atual < total): gera a parcela seguinte
 *     no mês que abre (ex: "Financiamento carro" 2/48 vira 3/48, pendente).
 *   - Fixo que acabou de pagar a ÚLTIMA parcela (atual >= total): não
 *     volta mais — o compromisso terminou, ele sai da lista sozinho.
 * Ver fecharMes() / proximoFixo().
 *
 * Ganhos, gastos fixos e gastos variáveis têm todos o mesmo comportamento de
 * status: RECEBIDO/PAGO é um booleano por linha, alinhado com o nome/valor
 * da mesma linha. O SALDO só considera dinheiro que já trocou de mão:
 *   saldo = ganhos RECEBIDOS − fixos PAGOS − variáveis PAGOS.
 * Um ganho ainda não recebido, ou um gasto (fixo ou variável) ainda não
 * pago, entra na lista mas não mexe no saldo até ser marcado.
 *
 * O valor guardado numa caixinha (coluna R) é independente do saldo
 * disponível — ele NÃO entra na conta do saldo. Guardar dinheiro numa
 * caixinha é lançado pelo app como um gasto variável comum, já PAGO (ex:
 * "Guardado: Nintendo Switch 2"), então já é descontado do saldo por ali;
 * retirar é lançado como um ganho já RECEBIDO. A coluna R só guarda o total
 * acumulado daquela caixinha, pra não ser preciso somar o histórico de
 * lançamentos toda hora.
 *
 * LAYOUT DA ABA "HISTORICO" (um bloco de 13 linhas por ano, a partir da linha 1):
 *   Linha do ano:               B = ano (ex: 2026)
 *   Linha dos meses:            B..M = JANEIRO..DEZEMBRO
 *   Linha GANHOS DAVI:          B..M = total RECEBIDO no mês (só do Davi)
 *   Linha DEBITOS DAVI:         B..M = total PAGO no mês (fixos pagos + variáveis pagos, só do Davi), em NEGATIVO
 *   Linha SALDO DAVI:           B..M = saldo do Davi naquele mês (ganhos recebidos - gastos pagos dele)
 *   Linha GUARDADO DAVI:        B..M = soma do valor guardado em todas as caixinhas do Davi, no fechamento
 *   Linha GASTOS POR CATEGORIA: B..M = texto "Categoria:Valor,Categoria:Valor,..." dos gastos PAGOS do Davi
 *                                naquele mês, agrupados por TIPO (categoria). Ver serializarCategorias().
 *   Linha GANHOS GABRIEL:       B..M = idem GANHOS DAVI, do Gabriel
 *   Linha DEBITOS GABRIEL:      B..M
 *   Linha SALDO GABRIEL:        B..M
 *   Linha GUARDADO GABRIEL:     B..M
 *   Linha GASTOS POR CATEGORIA: B..M = mesmo formato acima, só que dos gastos do Gabriel. Tem o MESMO
 *                                texto de rótulo da linha do Davi (é assim que já está na planilha —
 *                                a diferença entre as duas é só a posição: uma cai dentro do bloco do
 *                                Davi, a outra dentro do bloco do Gabriel).
 *   (linha em branco antes do próximo bloco de ano)
 *   Além disso, nas colunas P/Q (fora da área visual da tabela) o script
 *   guarda o "mês atual" do app (mesAtual/anoAtual), pra saber pra qual mês
 *   os lançamentos de Davi e Gabriel estão valendo agora.
 *
 * As duas linhas "GASTOS POR CATEGORIA" são TEXTO (não moeda) — cada célula
 * de mês guarda todas as categorias daquele mês numa string só, tipo:
 *   "Alimentação:320.50,Transporte:180.00,Lazer:95.30"
 * Ver serializarCategorias()/parseCategorias(). Meses fechados ANTES dessa
 * melhoria simplesmente não têm nada escrito nessas células — o app trata
 * isso como "sem dados de categoria nesse mês", sem quebrar nada.
 *
 * COMO PUBLICAR (faça isso dentro da própria planilha):
 * 1. Na planilha, vá em Extensões > Apps Script.
 * 2. Apague o conteúdo do arquivo Code.gs que abrir e cole TODO o conteúdo deste arquivo.
 * 3. Garanta que existam as abas com os nomes EXATOS: "Davi", "Gabriel" e "HISTORICO".
 *    Nas abas Davi/Gabriel, a linha 1 deve ter os cabeçalhos (colunas A a R):
 *    GANHOS, VALOR GANHO, DATA, RECEBIDO, GASTOS FIXOS, VALOR FIXO, TIPO, DATA, PARCELA, PAGO,
 *    GASTOS VARIÁVEIS, VALOR VARIÁVEL, TIPO, DATA, PAGO, GUARDADO, META, VALOR GUARDADO.
 * 4. IMPORTANTE — migração da PARCELA (de Variáveis pra Fixos), coluna por
 *    coluna, sem perder nada que já está lançado:
 *    a) Nas abas Davi e Gabriel, clique com o botão direito no cabeçalho
 *       da coluna I (hoje é "PAGO" dos fixos) e escolha "Inserir 1 coluna
 *       à esquerda". Isso abre uma coluna I vazia e empurra tudo que vinha
 *       depois (o antigo PAGO dos fixos, e toda a seção de Variáveis e de
 *       Caixinhas) uma posição pra direita.
 *    b) Escreva "PARCELA" no cabeçalho da nova coluna I (linha 1).
 *    c) A parcela dos GASTOS VARIÁVEIS ficava, no layout antigo, na coluna
 *       N — depois do passo (a), ela se deslocou pra coluna O. Pra cada
 *       linha de Variáveis que tinha uma parcela preenchida ali (ex: "2/48"),
 *       é preciso MOVER esse lançamento inteiro pra virar um Gasto Fixo —
 *       porque, com essa mudança, é lá que parcelamento passa a morar:
 *         - Copie NOME, VALOR, TIPO, DATA, PARCELA e PAGO dessa linha de
 *           Variáveis pra uma linha nova em Gastos Fixos (colunas E a J).
 *         - Depois, apague a linha inteira desse lançamento em Variáveis
 *           (ou pelo menos o texto na coluna O, a parcela antiga) — senão
 *           ele continua ali como se fosse uma parcela de variável comum
 *           (que não existe mais) e nunca mais evolui sozinho no fechamento.
 *       Lançamentos de Variáveis sem parcela (o texto na coluna O tá vazio)
 *       não precisam de nada — continuam sendo variáveis normalmente.
 *    d) Depois de mover tudo, se quiser, apague de vez a coluna O antiga
 *       (a que sobrou de parcela em Variáveis) — ela já não é mais lida
 *       pelo script, então pode ficar ou sumir, tanto faz.
 * 5. Se você ainda não tinha NENHUM gasto parcelado lançado (nem em fixos,
 *    nem em variáveis), o passo 4 fica bem mais simples: só faça o (a) e
 *    (b) — inserir a coluna I vazia e nomear "PARCELA" — não tem nada pra
 *    mover.
 * 6. HISTÓRICO — linhas "GASTOS POR CATEGORIA": se a sua aba HISTORICO já
 *    tem essas duas linhas extras (uma logo depois de "GUARDADO DAVI",
 *    outra logo depois de "GUARDADO GABRIEL", empurrando "GANHOS GABRIEL"
 *    em diante uma linha pra baixo, e o bloco do ano seguinte começando 2
 *    linhas mais abaixo do que antes), não precisa fazer nada — é
 *    exatamente esse o layout que este script espera. Se a sua aba ainda
 *    estiver no formato antigo (11 linhas por ano, sem essas duas linhas),
 *    insira 1 linha em branco logo abaixo de "GUARDADO DAVI" e outra logo
 *    abaixo de "GUARDADO GABRIEL" (botão direito na régua de linhas >
 *    "Inserir 1 linha acima/abaixo"), escrevendo "GASTOS POR CATEGORIA" na
 *    coluna A de cada uma. Faça isso só no(s) bloco(s) de ano que já
 *    existirem — blocos de anos futuros que ainda não foram criados nascem
 *    já no formato certo sozinhos (ver garantirBlocoDoAno()).
 * 7. A aba HISTORICO, fora isso, não muda de layout nessa versão. Se você
 *    já publicou uma versão anterior, não precisa apagar nada dela.
 * 8. Clique em "Implantar" (Deploy) > "Gerenciar implantações" > editar a
 *    existente (ícone de lápis) > Nova versão > Implantar.
 *    (Reimplantar por cima mantém a mesma URL — não precisa mudar o config.js.)
 * 9. Copie a URL que termina em /exec (deve ser a mesma de antes).
 *
 * IMPORTANTE: com "Quem pode acessar: Qualquer pessoa", qualquer pessoa que
 * descobrir essa URL consegue ler e alterar a planilha. Não compartilhe a URL
 * publicamente.
 */

// Nome das abas na planilha — uma por pessoa.
const SHEETS = {
  davi: "Davi",
  gabriel: "Gabriel",
};

// Nome de exibição de cada pessoa (usado nas descrições de transferência).
const PESSOA_NOME = {
  davi: "Davi",
  gabriel: "Gabriel",
};

// Margem extra de linhas ao limpar um bloco, pra garantir que nenhum resto de
// dado antigo fique pra trás mesmo se a lista encolher bastante.
const MARGEM_LIMPEZA = 15;

// Ganhos com esses termos no nome (sem acento, sem caixa) são considerados
// "recorrentes" — ao fechar o mês, só eles continuam pro mês seguinte
// (voltando como pendentes, tipo um gasto fixo). Todos os outros ganhos
// (bônus, presentes, "Saldo de mês" antigo, retiradas de caixinha, etc.)
// são descartados no fechamento, porque foram específicos daquele mês.
const TERMOS_GANHO_RECORRENTE = ["salario", "refeicao", "beneficio"];

// ---------------------------------------------------------------------
// LAYOUT DE COLUNAS — abas Davi/Gabriel
// ---------------------------------------------------------------------

const COL_GANHOS = 1; // A
const COL_VALOR_GANHO = 2; // B
const COL_DATA_GANHO = 3; // C
const COL_RECEBIDO = 4; // D

const COL_GASTOS_FIXOS = 5; // E
const COL_VALOR_FIXO = 6; // F
const COL_TIPO_FIXO = 7; // G
const COL_DATA_FIXO = 8; // H
const COL_PARCELA_FIXO = 9; // I
const COL_PAGO_FIXO = 10; // J

const COL_GASTOS_VARIAVEIS = 11; // K
const COL_VALOR_VARIAVEL = 12; // L
const COL_TIPO_VARIAVEL = 13; // M
const COL_DATA_VARIAVEL = 14; // N
const COL_PAGO_VARIAVEL = 15; // O

const COL_GUARDADO = 16; // P
const COL_META = 17; // Q
const COL_VALOR_GUARDADO = 18; // R

// ---------------------------------------------------------------------
// HISTÓRICO — constantes de layout
// ---------------------------------------------------------------------

const HISTORICO_SHEET_NAME = "HISTORICO";
const HISTORICO_ANO_BASE = 2026; // ano do primeiro bloco (linha 1)
const HISTORICO_LINHAS_POR_BLOCO = 13; // 12 linhas de dados + 1 em branco separando os anos
const HISTORICO_NOME_MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];
const HISTORICO_FORMATO_MOEDA =
  '_([$R$ -416]* #,##0.00_);_([$R$ -416]* \\(#,##0.00\\);_([$R$ -416]* "-"??_);_(@_)';
const HISTORICO_LABEL_CATEGORIAS = "GASTOS POR CATEGORIA";

// deslocamento de cada linha de dado em relação à linha do ano (yearRow).
// As duas linhas de categoria (texto, não moeda) ficam interleaved — uma
// dentro do bloco do Davi, outra dentro do bloco do Gabriel — igual já
// está montado na planilha em uso.
const OFFSET_MESES = 1;
const OFFSET_GANHOS_DAVI = 2;
const OFFSET_DEBITOS_DAVI = 3;
const OFFSET_SALDO_DAVI = 4;
const OFFSET_GUARDADO_DAVI = 5;
const OFFSET_CATEGORIAS_DAVI = 6;
const OFFSET_GANHOS_GABRIEL = 7;
const OFFSET_DEBITOS_GABRIEL = 8;
const OFFSET_SALDO_GABRIEL = 9;
const OFFSET_GUARDADO_GABRIEL = 10;
const OFFSET_CATEGORIAS_GABRIEL = 11;

// células de configuração (fora da tabela visual, à direita dela)
const CONFIG_CEL_LABEL = "P1";
const CONFIG_CEL_ANO_LABEL = "P2";
const CONFIG_CEL_MES_LABEL = "P3";
const CONFIG_CEL_ANO = "Q2";
const CONFIG_CEL_MES = "Q3";

function getSheetByPessoa(pessoa) {
  const nomeAba = SHEETS[pessoa];
  if (!nomeAba) throw new Error("Pessoa inválida: " + pessoa);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(nomeAba);
  if (!sheet) throw new Error("Aba não encontrada: " + nomeAba);
  return sheet;
}

function getHistoricoSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(HISTORICO_SHEET_NAME);
  if (!sheet) throw new Error("Aba não encontrada: " + HISTORICO_SHEET_NAME);
  return sheet;
}

// ---------------------------------------------------------------------
// GET — carregar dados (davi | gabriel | ambos | historico)
// ---------------------------------------------------------------------

function doGet(e) {
  try {
    const pessoa = ((e.parameter && e.parameter.pessoa) || "davi").toLowerCase();
    const historicoSheet = getHistoricoSheet();
    const config = lerConfigMesAtual(historicoSheet);

    if (pessoa === "historico") {
      return respond(
        Object.assign({ ok: true }, config, { anos: lerHistoricoCompleto(historicoSheet) })
      );
    }

    if (pessoa === "ambos") {
      const dadosDavi = getAllData(getSheetByPessoa("davi"));
      const dadosGabriel = getAllData(getSheetByPessoa("gabriel"));
      return respond(Object.assign(mesclarDados(dadosDavi, dadosGabriel), config));
    }

    return respond(Object.assign(getAllData(getSheetByPessoa(pessoa)), config));
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function mesclarDados(a, b) {
  return {
    ganhos: marcarPessoa(a.ganhos, "davi").concat(marcarPessoa(b.ganhos, "gabriel")),
    gastosFixos: marcarPessoa(a.gastosFixos, "davi").concat(marcarPessoa(b.gastosFixos, "gabriel")),
    gastosVariaveis: marcarPessoa(a.gastosVariaveis, "davi").concat(marcarPessoa(b.gastosVariaveis, "gabriel")),
    caixinhas: marcarPessoa(a.caixinhas, "davi").concat(marcarPessoa(b.caixinhas, "gabriel")),
  };
}

function marcarPessoa(lista, pessoa) {
  return lista.map(function (item) {
    item.pessoa = pessoa;
    return item;
  });
}

// ---------------------------------------------------------------------
// POST — salvar dados (bloqueado no modo "ambos") + ações de casal
// ("fecharMes" e "transferir" não pertencem a uma pessoa só, então não
// passam pela trava de "ambos é somente leitura" abaixo).
// ---------------------------------------------------------------------

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === "fecharMes") {
      return respond(fecharMes(body.mes, body.ano));
    }
    if (action === "transferir") {
      return respond(transferirEntrePessoas(body.de, body.para, body.nome, body.valor));
    }

    const pessoa = (body.pessoa || "davi").toLowerCase();
    if (pessoa === "ambos") {
      return respond({ ok: false, error: "Modo Ambos é somente leitura. Selecione Davi ou Gabriel para editar." });
    }

    const sheet = getSheetByPessoa(pessoa);
    const payload = body.payload;
    let result;

    switch (action) {
      case "saveGanhos":
        saveGanhos(sheet, payload);
        result = { ok: true };
        break;
      case "saveGastosFixos":
        saveGastosFixos(sheet, payload);
        result = { ok: true };
        break;
      case "saveGastosVariaveis":
        saveGastosVariaveis(sheet, payload);
        result = { ok: true };
        break;
      case "saveCaixinhas":
        saveCaixinhasBlock(sheet, payload); // colunas P,Q,R
        result = { ok: true };
        break;
      default:
        result = { ok: false, error: "Ação desconhecida: " + action };
    }

    return respond(result);
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

// ---------------------------------------------------------------------
// TRANSFERIR — ação de casal: uma pessoa transfere um valor pra outra.
// Sai como gasto variável já PAGO de quem transfere, e entra como ganho já
// RECEBIDO de quem recebe. Não passa pela trava de "ambos" (não pertence a
// uma pessoa só) e não depende de qual pessoa está selecionada no app.
// ---------------------------------------------------------------------

function transferirEntrePessoas(de, para, nome, valor) {
  de = String(de || "").toLowerCase();
  para = String(para || "").toLowerCase();
  valor = Number(valor);
  const descricao = String(nome || "").trim() || "Transferência";

  if (!SHEETS[de] || !SHEETS[para]) throw new Error("Pessoa inválida na transferência");
  if (de === para) throw new Error("Escolha duas pessoas diferentes para transferir");
  if (!valor || valor <= 0) throw new Error("Valor inválido para transferência");

  const sheetDe = getSheetByPessoa(de);
  const sheetPara = getSheetByPessoa(para);
  const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  const variaveisDe = readGastosVariaveis(sheetDe);
  variaveisDe.push({
    nome: "Transferência p/ " + PESSOA_NOME[para] + ": " + descricao,
    valor: valor,
    tipo: "",
    data: hoje,
    pago: true,
  });
  saveGastosVariaveis(sheetDe, variaveisDe);

  const ganhosPara = readGanhos(sheetPara);
  ganhosPara.push({
    nome: "Transferência de " + PESSOA_NOME[de] + ": " + descricao,
    valor: valor,
    data: hoje,
    recebido: true,
  });
  saveGanhos(sheetPara, ganhosPara);

  return { ok: true, de: de, para: para, valor: valor };
}

// ---------------------------------------------------------------------
// FECHAR MÊS
// Calcula o saldo de CADA pessoa separadamente (ganhos RECEBIDOS dela menos
// gastos PAGOS dela — fixos pagos + variáveis pagos), grava GANHOS/DEBITOS/
// SALDO/GUARDADO/GASTOS POR CATEGORIA de cada um no HISTORICO, e joga o
// saldo positivo de cada um como ganho automático (já recebido) — só dela
// mesma — pro mês seguinte (sem dividir ao meio: quem sobrou mais leva mais).
//
// GANHOS no mês seguinte: só os que têm "Salário", "Refeição" ou "Benefício"
// no nome continuam (voltam como pendentes, esperando ser marcados de novo
// quando caírem) — os demais (bônus, presentes, transferências, saldos
// antigos etc.) são descartados, porque valiam só pro mês que fechou. O
// saldo positivo de cada um é somado a essa lista, já como recebido.
//
// GASTOS FIXOS: mantidos (mesmo nome/valor/tipo), voltando a "pendente".
// Se tiverem PARCELA pendente (ex: "2/48"), a parcela seguinte já nasce
// nesse fixo ("3/48"). Se a parcela que acabou de fechar era a última
// (ex: "48/48"), o fixo não volta mais — o compromisso terminou.
//
// GASTOS VARIÁVEIS: são sempre específicos daquele mês (não existe mais
// parcelamento aqui, ele mora em Fixos agora) — a lista inteira, incluindo
// os lançamentos automáticos de "Guardado: ...", é descartada no fechamento.
//
// GASTOS POR CATEGORIA: antes de descartar fixos/variáveis, soma tudo que
// estava PAGO (fixo ou variável) agrupado por TIPO — é essa foto que fica
// gravada no HISTORICO pra sempre, pro gráfico de pizza por ano funcionar
// mesmo depois que os lançamentos originais do mês já sumiram.
//
// CAIXINHAS: mantêm o valor guardado (é acumulado) e não precisam de
// nenhum ajuste no fechamento.
// ---------------------------------------------------------------------

function fecharMes(mes, ano) {
  mes = Number(mes);
  ano = Number(ano);
  if (!mes || mes < 1 || mes > 12 || !ano) {
    throw new Error("Mês ou ano inválido para fechamento");
  }

  const sheetDavi = getSheetByPessoa("davi");
  const sheetGabriel = getSheetByPessoa("gabriel");
  const dadosDavi = getAllData(sheetDavi);
  const dadosGabriel = getAllData(sheetGabriel);

  const ganhosDavi = somaComStatus(dadosDavi.ganhos, "recebido");
  const ganhosGabriel = somaComStatus(dadosGabriel.ganhos, "recebido");
  const debitosDavi = somaFixosPagos(dadosDavi.gastosFixos) + somaComStatus(dadosDavi.gastosVariaveis, "pago");
  const debitosGabriel = somaFixosPagos(dadosGabriel.gastosFixos) + somaComStatus(dadosGabriel.gastosVariaveis, "pago");

  const saldoDavi = ganhosDavi - debitosDavi;
  const saldoGabriel = ganhosGabriel - debitosGabriel;

  const guardadoDavi = somaCampo(dadosDavi.caixinhas, "valorGuardado");
  const guardadoGabriel = somaCampo(dadosGabriel.caixinhas, "valorGuardado");

  const categoriasDavi = categoriasDoMes(dadosDavi);
  const categoriasGabriel = categoriasDoMes(dadosGabriel);

  // 1) grava o mês fechado no HISTORICO, com ganhos/débitos/saldo/guardado/
  // categorias já separados por pessoa.
  const historico = getHistoricoSheet();
  const yearRow = garantirBlocoDoAno(historico, ano);
  const col = 1 + mes; // mês 1 (Jan) -> coluna B (2)
  historico.getRange(yearRow + OFFSET_GANHOS_DAVI, col).setValue(ganhosDavi);
  historico.getRange(yearRow + OFFSET_DEBITOS_DAVI, col).setValue(-debitosDavi);
  historico.getRange(yearRow + OFFSET_SALDO_DAVI, col).setValue(saldoDavi);
  historico.getRange(yearRow + OFFSET_GUARDADO_DAVI, col).setValue(guardadoDavi);
  historico.getRange(yearRow + OFFSET_CATEGORIAS_DAVI, col).setValue(serializarCategorias(categoriasDavi));
  historico.getRange(yearRow + OFFSET_GANHOS_GABRIEL, col).setValue(ganhosGabriel);
  historico.getRange(yearRow + OFFSET_DEBITOS_GABRIEL, col).setValue(-debitosGabriel);
  historico.getRange(yearRow + OFFSET_SALDO_GABRIEL, col).setValue(saldoGabriel);
  historico.getRange(yearRow + OFFSET_GUARDADO_GABRIEL, col).setValue(guardadoGabriel);
  historico.getRange(yearRow + OFFSET_CATEGORIAS_GABRIEL, col).setValue(serializarCategorias(categoriasGabriel));

  // 2) GANHOS do mês seguinte: só os recorrentes (Salário/Refeição/Benefício)
  // continuam, voltando como pendentes — o resto é descartado. Depois soma
  // o saldo positivo de cada um (sem dividir), já como recebido.
  const nomeGanho = "Saldo de " + tituloMes(mes) + "/" + ano;
  const ganhosProximoDavi = dadosDavi.ganhos
    .filter(function (g) { return ehGanhoRecorrente(g.nome); })
    .map(function (g) { return { nome: g.nome, valor: g.valor, data: g.data || "", recebido: false }; });
  const ganhosProximoGabriel = dadosGabriel.ganhos
    .filter(function (g) { return ehGanhoRecorrente(g.nome); })
    .map(function (g) { return { nome: g.nome, valor: g.valor, data: g.data || "", recebido: false }; });

  if (saldoDavi > 0) {
    ganhosProximoDavi.push({ nome: nomeGanho, valor: saldoDavi, data: "", recebido: true });
  }
  if (saldoGabriel > 0) {
    ganhosProximoGabriel.push({ nome: nomeGanho, valor: saldoGabriel, data: "", recebido: true });
  }
  saveGanhos(sheetDavi, ganhosProximoDavi);
  saveGanhos(sheetGabriel, ganhosProximoGabriel);

  // 3) GASTOS FIXOS: continuam (voltando a pendente); os parcelados avançam
  // pra parcela seguinte, e os que acabaram de fechar a última parcela saem
  // da lista sozinhos.
  const proximosFixosDavi = dadosDavi.gastosFixos.map(proximoFixo).filter(Boolean);
  const proximosFixosGabriel = dadosGabriel.gastosFixos.map(proximoFixo).filter(Boolean);
  saveGastosFixos(sheetDavi, proximosFixosDavi);
  saveGastosFixos(sheetGabriel, proximosFixosGabriel);

  // 4) GASTOS VARIÁVEIS: sempre específicos do mês que fechou — a lista
  // inteira (inclusive "Guardado: ...") é descartada, sem exceção. (As
  // categorias já foram somadas e gravadas no passo 1, antes de chegar aqui.)
  saveGastosVariaveis(sheetDavi, []);
  saveGastosVariaveis(sheetGabriel, []);

  // 5) avança o mês atual do app
  let proximoMes = mes + 1;
  let proximoAno = ano;
  if (proximoMes > 12) {
    proximoMes = 1;
    proximoAno = ano + 1;
  }
  garantirBlocoDoAno(historico, proximoAno);
  salvarConfigMesAtual(historico, proximoMes, proximoAno);

  return {
    ok: true,
    fechado: {
      mes: mes,
      ano: ano,
      ganhosDavi: ganhosDavi,
      debitosDavi: debitosDavi,
      saldoDavi: saldoDavi,
      guardadoDavi: guardadoDavi,
      ganhosGabriel: ganhosGabriel,
      debitosGabriel: debitosGabriel,
      saldoGabriel: saldoGabriel,
      guardadoGabriel: guardadoGabriel,
    },
    mesAtual: proximoMes,
    anoAtual: proximoAno,
  };
}

// Normaliza removendo acentos e caixa, pra comparar "Refeição"/"refeicao"/
// "REFEIÇÃO" do mesmo jeito.
function normalizarTexto(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ehGanhoRecorrente(nome) {
  const normalizado = normalizarTexto(nome);
  return TERMOS_GANHO_RECORRENTE.some(function (termo) {
    return normalizado.indexOf(termo) !== -1;
  });
}

// Dado um gasto fixo, devolve como ele volta no mês que abre:
//   - sem parcela (ou "1"/texto inválido): o fixo de sempre, só pendente de novo.
//   - com parcela pendente (atual < total): avança pra parcela seguinte, pendente.
//   - com a ÚLTIMA parcela paga (atual >= total): devolve null — o fixo não
//     volta mais, porque o compromisso terminou.
function proximoFixo(item) {
  const bruto = String(item.parcela || "").trim();
  const m = bruto.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) {
    // não parcelado — fixo comum, continua igual, só volta a pendente
    return { nome: item.nome, valor: item.valor, tipo: item.tipo || "", data: item.data || "", parcela: "", pago: false };
  }
  const atual = Number(m[1]);
  const total = Number(m[2]);
  if (!total || total <= 1 || !atual) {
    // parcela mal formada (ex: "0/0") — trata como não parcelado
    return { nome: item.nome, valor: item.valor, tipo: item.tipo || "", data: item.data || "", parcela: "", pago: false };
  }
  if (atual >= total) return null; // acabou de pagar a última — encerra
  return {
    nome: item.nome,
    valor: item.valor,
    tipo: item.tipo || "",
    data: proximaDataMesmoDia(item.data),
    parcela: (atual + 1) + "/" + total,
    pago: false,
  };
}

// Avança uma data (AAAA-MM-DD) em um mês, mantendo o mesmo dia quando dá.
function proximaDataMesmoDia(dataStr) {
  const bruto = String(dataStr || "").trim();
  if (!bruto) return "";
  const partes = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!partes) return bruto;
  const d = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  if (isNaN(d.getTime())) return bruto;
  d.setMonth(d.getMonth() + 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function somaLista(lista) {
  return (lista || []).reduce(function (acc, item) {
    return acc + (Number(item.valor) || 0);
  }, 0);
}

// Soma só os itens marcados com o campo de status (ex: "recebido" ou
// "pago") em true — é assim que ganhos/gastos com status viram dinheiro
// de verdade no saldo.
function somaComStatus(lista, campo) {
  return (lista || []).reduce(function (acc, item) {
    return acc + (item[campo] === true ? Number(item.valor) || 0 : 0);
  }, 0);
}

function somaCampo(lista, campo) {
  return (lista || []).reduce(function (acc, item) {
    return acc + (Number(item[campo]) || 0);
  }, 0);
}

function somaFixosPagos(lista) {
  return somaComStatus(lista, "pago");
}

// ---------------------------------------------------------------------
// GASTOS POR CATEGORIA — soma dos gastos PAGOS (fixos + variáveis) de uma
// pessoa naquele mês, agrupados pelo campo TIPO (categoria; vazio vira
// "Outros"). Mesma regra do card "Gastos por categoria" do app (ver
// renderCategorias() em app.js), calculada aqui só pra gravar a foto do
// mês no HISTORICO antes dos lançamentos originais serem descartados.
// ---------------------------------------------------------------------

function categoriasDoMes(dados) {
  const mapa = {};
  const pagos = dados.gastosFixos
    .filter(function (g) { return g.pago === true; })
    .concat(dados.gastosVariaveis.filter(function (g) { return g.pago === true; }));
  pagos.forEach(function (g) {
    const cat = (g.tipo && String(g.tipo).trim()) || "Outros";
    mapa[cat] = (mapa[cat] || 0) + (Number(g.valor) || 0);
  });
  return mapa;
}

// Serializa um mapa {categoria: valorTotal} num texto só, tipo
// "Alimentação:320.5,Transporte:180,Lazer:95.3" — pra caber numa única
// célula da aba HISTORICO. Categorias vêm de texto livre (campo TIPO), então
// ":" e "," são trocados por "-" nelas, caso apareçam, pra não quebrar o
// parse na volta (ver parseCategorias). Categorias com valor zerado (ou
// negativo, o que não deveria acontecer) não entram.
function serializarCategorias(mapa) {
  return Object.keys(mapa)
    .filter(function (cat) { return mapa[cat] > 0; })
    .sort(function (a, b) { return mapa[b] - mapa[a]; })
    .map(function (cat) {
      const nomeSeguro = String(cat).replace(/[:,]/g, "-").trim() || "Outros";
      return nomeSeguro + ":" + Number(mapa[cat]).toFixed(2);
    })
    .join(",");
}

// Desfaz serializarCategorias() — devolve um objeto {categoria: valor}.
// Texto vazio (mês fechado antes dessa melhoria, ou sem nenhum gasto pago
// naquele mês) vira objeto vazio, sem erro.
function parseCategorias(texto) {
  const bruto = String(texto || "").trim();
  if (!bruto) return {};
  const mapa = {};
  bruto.split(",").forEach(function (par) {
    const i = par.lastIndexOf(":");
    if (i === -1) return;
    const nome = par.slice(0, i).trim();
    const valor = Number(par.slice(i + 1));
    if (nome && !isNaN(valor)) mapa[nome] = valor;
  });
  return mapa;
}

function tituloMes(mes) {
  const nome = HISTORICO_NOME_MESES[mes - 1] || "";
  return nome.charAt(0) + nome.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------
// HISTÓRICO — leitura, criação de blocos de ano e configuração de mês atual
// ---------------------------------------------------------------------

function linhaDoAno(ano) {
  return 1 + HISTORICO_LINHAS_POR_BLOCO * (ano - HISTORICO_ANO_BASE);
}

// Garante que o bloco de linhas daquele ano exista na aba HISTORICO, criando
// do zero (título do ano, nomes dos meses, rótulos das linhas) se ainda não
// existir. Os valores em si são preenchidos direto pelo fecharMes (não são
// fórmulas, já que tudo é calculado por pessoa e não dá pra derivar de uma
// soma simples da coluna). Retorna a linha onde o bloco começa.
//
// Também é chamada (via fecharMes) em blocos que JÁ existem — nesse caso só
// confere se as duas linhas "GASTOS POR CATEGORIA" têm rótulo na coluna A, e
// escreve se estiver faltando (idempotente: não sobrescreve nada que já foi
// preenchido). Isso cobre o caso de um bloco de ano criado por uma versão
// anterior deste script, antes dessa linha existir.
function garantirBlocoDoAno(sheet, ano) {
  const yearRow = linhaDoAno(ano);
  const anoCel = sheet.getRange(yearRow, 2).getValue();
  if (Number(anoCel) === ano) {
    garantirRotulosCategorias(sheet, yearRow);
    return yearRow; // bloco já existe
  }

  sheet.getRange(yearRow, 2).setValue(ano);

  const mesesRow = yearRow + OFFSET_MESES;
  sheet.getRange(mesesRow, 2, 1, 12).setValues([HISTORICO_NOME_MESES]);

  const rotulos = [
    [OFFSET_GANHOS_DAVI, "GANHOS DAVI"],
    [OFFSET_DEBITOS_DAVI, "DEBITOS DAVI"],
    [OFFSET_SALDO_DAVI, "SALDO DAVI"],
    [OFFSET_GUARDADO_DAVI, "GUARDADO DAVI"],
    [OFFSET_CATEGORIAS_DAVI, HISTORICO_LABEL_CATEGORIAS],
    [OFFSET_GANHOS_GABRIEL, "GANHOS GABRIEL"],
    [OFFSET_DEBITOS_GABRIEL, "DEBITOS GABRIEL"],
    [OFFSET_SALDO_GABRIEL, "SALDO GABRIEL"],
    [OFFSET_GUARDADO_GABRIEL, "GUARDADO GABRIEL"],
    [OFFSET_CATEGORIAS_GABRIEL, HISTORICO_LABEL_CATEGORIAS],
  ];
  rotulos.forEach(function (r) {
    sheet.getRange(yearRow + r[0], 1).setValue(r[1]);
  });

  // Formato de moeda só nas linhas numéricas — GANHOS/DEBITOS/SALDO/GUARDADO
  // de cada pessoa (4 linhas contíguas cada). As linhas "GASTOS POR
  // CATEGORIA", entre elas, ficam de fora (são texto).
  sheet.getRange(yearRow + OFFSET_GANHOS_DAVI, 2, 4, 12).setNumberFormat(HISTORICO_FORMATO_MOEDA);
  sheet.getRange(yearRow + OFFSET_GANHOS_GABRIEL, 2, 4, 12).setNumberFormat(HISTORICO_FORMATO_MOEDA);

  return yearRow;
}

// Escreve o rótulo "GASTOS POR CATEGORIA" (coluna A) nas duas linhas certas
// do bloco, só se ainda estiver vazio — usado tanto num bloco recém-criado
// quanto num bloco antigo que ainda não tinha essas linhas rotuladas.
function garantirRotulosCategorias(sheet, yearRow) {
  [OFFSET_CATEGORIAS_DAVI, OFFSET_CATEGORIAS_GABRIEL].forEach(function (offset) {
    const cel = sheet.getRange(yearRow + offset, 1);
    if (!cel.getValue()) cel.setValue(HISTORICO_LABEL_CATEGORIAS);
  });
}

// Varre os blocos de ano a partir de 2026 e devolve só os meses que já
// foram fechados (têm valor de ganhos do Davi preenchido).
function lerHistoricoCompleto(sheet) {
  const anos = [];
  let ano = HISTORICO_ANO_BASE;

  while (true) {
    const yearRow = linhaDoAno(ano);
    const anoCel = sheet.getRange(yearRow, 2).getValue();
    if (Number(anoCel) !== ano) break;

    const linha = function (offset) {
      return sheet.getRange(yearRow + offset, 2, 1, 12).getValues()[0];
    };
    const ganhosDaviVals = linha(OFFSET_GANHOS_DAVI);
    const debitosDaviVals = linha(OFFSET_DEBITOS_DAVI);
    const saldoDaviVals = linha(OFFSET_SALDO_DAVI);
    const guardadoDaviVals = linha(OFFSET_GUARDADO_DAVI);
    const categoriasDaviVals = linha(OFFSET_CATEGORIAS_DAVI);
    const ganhosGabrielVals = linha(OFFSET_GANHOS_GABRIEL);
    const debitosGabrielVals = linha(OFFSET_DEBITOS_GABRIEL);
    const saldoGabrielVals = linha(OFFSET_SALDO_GABRIEL);
    const guardadoGabrielVals = linha(OFFSET_GUARDADO_GABRIEL);
    const categoriasGabrielVals = linha(OFFSET_CATEGORIAS_GABRIEL);

    const meses = [];
    for (let m = 0; m < 12; m++) {
      const g = ganhosDaviVals[m];
      if (g === "" || g === null || g === undefined) continue; // mês ainda não fechado
      meses.push({
        mes: m + 1,
        nome: HISTORICO_NOME_MESES[m],
        ganhosDavi: Number(ganhosDaviVals[m]) || 0,
        debitosDavi: Number(debitosDaviVals[m]) || 0,
        saldoDavi: Number(saldoDaviVals[m]) || 0,
        guardadoDavi: Number(guardadoDaviVals[m]) || 0,
        categoriasDavi: parseCategorias(categoriasDaviVals[m]),
        ganhosGabriel: Number(ganhosGabrielVals[m]) || 0,
        debitosGabriel: Number(debitosGabrielVals[m]) || 0,
        saldoGabriel: Number(saldoGabrielVals[m]) || 0,
        guardadoGabriel: Number(guardadoGabrielVals[m]) || 0,
        categoriasGabriel: parseCategorias(categoriasGabrielVals[m]),
      });
    }
    if (meses.length > 0) anos.push({ ano: ano, meses: meses });

    ano++;
    if (ano > HISTORICO_ANO_BASE + 50) break; // trava de segurança
  }

  return anos;
}

function lerConfigMesAtual(sheet) {
  const anoCel = sheet.getRange(CONFIG_CEL_ANO).getValue();
  const mesCel = sheet.getRange(CONFIG_CEL_MES).getValue();
  const agora = new Date();
  const ano = anoCel && Number(anoCel) > 2000 ? Number(anoCel) : agora.getFullYear();
  const mes = mesCel && Number(mesCel) >= 1 && Number(mesCel) <= 12 ? Number(mesCel) : agora.getMonth() + 1;
  // se as células ainda não tinham nada, já grava o valor padrão pra próxima vez
  if (!anoCel || !mesCel) salvarConfigMesAtual(sheet, mes, ano);
  return { mesAtual: mes, anoAtual: ano };
}

function salvarConfigMesAtual(sheet, mes, ano) {
  sheet.getRange(CONFIG_CEL_LABEL).setValue("Configuração do app (não editar manualmente)");
  sheet.getRange(CONFIG_CEL_ANO_LABEL).setValue("Ano atual:");
  sheet.getRange(CONFIG_CEL_MES_LABEL).setValue("Mês atual (1-12):");
  sheet.getRange(CONFIG_CEL_ANO).setValue(ano);
  sheet.getRange(CONFIG_CEL_MES).setValue(mes);
}

// ---------------------------------------------------------------------
// LEITURA / ESCRITA — GANHOS (nome, valor, data, recebido)
// ---------------------------------------------------------------------

function readGanhos(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const valores = sheet.getRange(2, COL_GANHOS, lastRow - 1, 4).getValues(); // A,B,C,D
  const result = [];
  valores.forEach(function (row) {
    const nome = row[0];
    if (nome !== "" && nome !== null) {
      result.push({
        nome: String(nome),
        valor: Number(row[1]) || 0,
        data: formatarDataCelula(row[2]),
        recebido: row[3] === true,
      });
    }
  });
  return result;
}

function saveGanhos(sheet, rows) {
  const rowsToClear = linhasParaLimpar(sheet, rows);
  sheet.getRange(2, COL_GANHOS, rowsToClear, 4).clearContent();
  if (!rows || rows.length === 0) return;
  const valores = rows.map(function (r) {
    return [r.nome, r.valor, r.data || "", r.recebido === true];
  });
  sheet.getRange(2, COL_GANHOS, valores.length, 4).setValues(valores);
}

// ---------------------------------------------------------------------
// LEITURA / ESCRITA — GASTOS FIXOS (nome, valor, tipo, data, parcela, pago)
// ---------------------------------------------------------------------

function readGastosFixos(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const valores = sheet.getRange(2, COL_GASTOS_FIXOS, lastRow - 1, 6).getValues(); // E,F,G,H,I,J
  const result = [];
  valores.forEach(function (row) {
    const nome = row[0];
    if (nome !== "" && nome !== null) {
      result.push({
        nome: String(nome),
        valor: Number(row[1]) || 0,
        tipo: row[2] ? String(row[2]) : "",
        data: formatarDataCelula(row[3]),
        parcela: row[4] ? String(row[4]) : "",
        pago: row[5] === true,
      });
    }
  });
  return result;
}

function saveGastosFixos(sheet, rows) {
  const rowsToClear = linhasParaLimpar(sheet, rows);
  sheet.getRange(2, COL_GASTOS_FIXOS, rowsToClear, 6).clearContent();
  if (!rows || rows.length === 0) return;
  const valores = rows.map(function (r) {
    return [r.nome, r.valor, r.tipo || "", r.data || "", r.parcela || "", r.pago === true];
  });
  sheet.getRange(2, COL_GASTOS_FIXOS, valores.length, 6).setValues(valores);
}

// ---------------------------------------------------------------------
// LEITURA / ESCRITA — GASTOS VARIÁVEIS (nome, valor, tipo, data, pago)
// ---------------------------------------------------------------------

function readGastosVariaveis(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const valores = sheet.getRange(2, COL_GASTOS_VARIAVEIS, lastRow - 1, 5).getValues(); // K,L,M,N,O
  const result = [];
  valores.forEach(function (row) {
    const nome = row[0];
    if (nome !== "" && nome !== null) {
      result.push({
        nome: String(nome),
        valor: Number(row[1]) || 0,
        tipo: row[2] ? String(row[2]) : "",
        data: formatarDataCelula(row[3]),
        pago: row[4] === true,
      });
    }
  });
  return result;
}

function saveGastosVariaveis(sheet, rows) {
  const rowsToClear = linhasParaLimpar(sheet, rows);
  sheet.getRange(2, COL_GASTOS_VARIAVEIS, rowsToClear, 5).clearContent();
  if (!rows || rows.length === 0) return;
  const valores = rows.map(function (r) {
    return [r.nome, r.valor, r.tipo || "", r.data || "", r.pago === true];
  });
  sheet.getRange(2, COL_GASTOS_VARIAVEIS, valores.length, 5).setValues(valores);
}

function formatarDataCelula(valor) {
  if (!valor) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    // Datas de célula (tipo "Data" do Sheets) não têm fuso — o Apps Script
    // sempre ancora esse valor em meia-noite UTC ao converter pra Date.
    // Por isso a formatação também tem que ser em UTC ("Etc/GMT"), e não no
    // fuso do script/planilha — senão qualquer fuso atrás de UTC (como o
    // nosso, -3h) sempre volta um dia.
    return Utilities.formatDate(valor, "Etc/GMT", "yyyy-MM-dd");
  }
  return String(valor);
}

// ---------------------------------------------------------------------
// CAIXINHAS (cofrinhos/investimentos/metas, tudo unificado): nome em P,
// meta (objetivo opcional) em Q, valor guardado agora em R.
// ---------------------------------------------------------------------

function readCaixinhas(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, COL_GUARDADO, lastRow - 1, 3).getValues(); // P,Q,R
  const result = [];
  values.forEach(function (row) {
    if (row[0] !== "" && row[0] !== null) {
      result.push({
        nome: String(row[0]),
        valorObjetivo: Number(row[1]) || 0,
        valorGuardado: Number(row[2]) || 0,
      });
    }
  });
  return result;
}

function getAllData(sheet) {
  return {
    ganhos: readGanhos(sheet),
    gastosFixos: readGastosFixos(sheet),
    gastosVariaveis: readGastosVariaveis(sheet),
    caixinhas: readCaixinhas(sheet), // P,Q,R
  };
}

// Quantas linhas limpar antes de reescrever um bloco: o que já estava
// ocupado nessa aba (pra apagar sobras antigas), o que vamos escrever agora,
// e uma margem de segurança — nunca mais um número fixo enorme (999) que
// deixava toda gravação lenta à toa.
function linhasParaLimpar(sheet, novasLinhas) {
  const lastRow = Math.max(sheet.getLastRow() - 1, 0);
  const novas = novasLinhas ? novasLinhas.length : 0;
  return Math.max(lastRow, novas) + MARGEM_LIMPEZA;
}

// Grava as caixinhas em P,Q,R (nome, meta/objetivo, valor guardado).
function saveCaixinhasBlock(sheet, rows) {
  const rowsToClear = linhasParaLimpar(sheet, rows);
  sheet.getRange(2, COL_GUARDADO, rowsToClear, 3).clearContent(); // P,Q,R
  if (!rows || rows.length === 0) return;
  const values = rows.map(function (r) {
    return [r.nome, r.valorObjetivo, r.valorGuardado];
  });
  sheet.getRange(2, COL_GUARDADO, values.length, 3).setValues(values);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
