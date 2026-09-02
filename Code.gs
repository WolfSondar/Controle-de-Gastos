/**
 * CAIXA — backend em Google Apps Script
 * Conecta a planilha "Sistema de Controle Financeiro e Objetivos" ao site.
 * Suporte a duas pessoas, cada uma na sua própria aba:
 *   - Aba "Davi"
 *   - Aba "Gabriel"
 * E um modo "Ambos", que combina os dados das duas abas, somente leitura.
 *
 * LAYOUT DE COLUNAS (abas Davi/Gabriel):
 *   A = GANHOS              B = VALOR GANHO         C = DATA        D = RECEBIDO (VERDADEIRO/FALSO)
 *   E = GASTOS FIXOS        F = VALOR FIXO          G = TIPO        H = DATA        I = PARCELA     J = PAGO (VERDADEIRO/FALSO)
 *   K = GASTOS VARIÁVEIS    L = VALOR VARIÁVEL      M = TIPO        N = DATA        O = PAGO (VERDADEIRO/FALSO)
 *   P = GUARDADO (nome da caixinha/investimento/meta)
 *   Q = META (objetivo opcional da caixinha; 0 ou vazio = sem meta)
 *   R = VALOR GUARDADO (quanto está guardado agora nessa caixinha, total acumulado)
 *   S = RENDIMENTO TOTAL (rendimento que a caixinha teve no mês atual)
 *   T = VALOR GUARDADO NO MES (quanto foi depositado nessa caixinha no mês atual)
 *   U = LEMBRETE (anotação livre, não é lido pelo app)
 *
 * LAYOUT DA ABA "HISTORICO" (um bloco de 17 linhas por ano, a partir da linha 1):
 *   Linha do ano:               B = ano (ex: 2026)
 *   Linha dos meses:            B..M = JANEIRO..DEZEMBRO
 *   Linha GANHOS DAVI:          B..M = total RECEBIDO no mês
 *   Linha DEBITOS DAVI:         B..M = total PAGO no mês em NEGATIVO
 *   Linha SALDO DAVI:           B..M = saldo do Davi naquele mês
 *   Linha GUARDADO DAVI:        B..M = soma do valor guardado (total acumulado) em todas as caixinhas
 *   Linha GUARDADO DAVI MES:    B..M = soma do que foi depositado nas caixinhas naquele mês
 *   Linha GASTOS POR CATEGORIA: B..M = texto "Categoria:Valor,Categoria:Valor,..."
 *   Linha RENDIMENTO DAVI:      B..M = rendimento das caixinhas naquele mês
 *   Linha GANHOS GABRIEL:       B..M 
 *   Linha DEBITOS GABRIEL:      B..M
 *   Linha SALDO GABRIEL:        B..M
 *   Linha GUARDADO GABRIEL:     B..M
 *   Linha GUARDADO GABRIEL MES: B..M
 *   Linha GASTOS POR CATEGORIA: B..M 
 *   Linha RENDIMENTO GABRIEL:   B..M 
 *   (linha em branco antes do próximo bloco de ano)
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
const COL_RENDIMENTO = 19; // S
const COL_VALOR_GUARDADO_MES = 20; // T

// ---------------------------------------------------------------------
// HISTÓRICO — constantes de layout
// ---------------------------------------------------------------------

const HISTORICO_SHEET_NAME = "HISTORICO";
const HISTORICO_ANO_BASE = 2026; // ano do primeiro bloco (linha 1)
const HISTORICO_LINHAS_POR_BLOCO = 17; // 16 linhas de dados + 1 em branco separando os anos
const HISTORICO_NOME_MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];
const HISTORICO_FORMATO_MOEDA =
  '_([$R$ -416]* #,##0.00_);_([$R$ -416]* \\(#,##0.00\\);_([$R$ -416]* "-"??_);_(@_)';
const HISTORICO_LABEL_CATEGORIAS = "GASTOS POR CATEGORIA";

// deslocamento de cada linha de dado em relação à linha do ano (yearRow).
const OFFSET_MESES = 1;
const OFFSET_GANHOS_DAVI = 2;
const OFFSET_DEBITOS_DAVI = 3;
const OFFSET_SALDO_DAVI = 4;
const OFFSET_GUARDADO_DAVI = 5;
const OFFSET_GUARDADO_DAVI_MES = 6;
const OFFSET_CATEGORIAS_DAVI = 7;
const OFFSET_RENDIMENTO_DAVI = 8;
const OFFSET_GANHOS_GABRIEL = 9;
const OFFSET_DEBITOS_GABRIEL = 10;
const OFFSET_SALDO_GABRIEL = 11;
const OFFSET_GUARDADO_GABRIEL = 12;
const OFFSET_GUARDADO_GABRIEL_MES = 13;
const OFFSET_CATEGORIAS_GABRIEL = 14;
const OFFSET_RENDIMENTO_GABRIEL = 15;

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
// POST — salvar dados
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
        saveCaixinhasBlock(sheet, payload); 
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
// TRANSFERIR
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

  // GUARDADO DAVI/GABRIEL no HISTORICO agora é o total de verdade (base + rendimento +
  // o que foi guardado nesse mês) — é exatamente o valor que vira a nova base das
  // caixinhas quando o mês fecha (ver seção 5 abaixo).
  const guardadoDavi = somaTotalCaixinhas(dadosDavi.caixinhas);
  const guardadoGabriel = somaTotalCaixinhas(dadosGabriel.caixinhas);
  const guardadoDaviMes = somaCampo(dadosDavi.caixinhas, "valorGuardadoMes");
  const guardadoGabrielMes = somaCampo(dadosGabriel.caixinhas, "valorGuardadoMes");

  const categoriasDavi = categoriasDoMes(dadosDavi);
  const categoriasGabriel = categoriasDoMes(dadosGabriel);

  // Calcula o rendimento do mês antes de zerar
  const rendimentoDavi = somaCampo(dadosDavi.caixinhas, "rendimentoTotal");
  const rendimentoGabriel = somaCampo(dadosGabriel.caixinhas, "rendimentoTotal");

  // 1) grava o mês fechado no HISTORICO
  const historico = getHistoricoSheet();
  const yearRow = garantirBlocoDoAno(historico, ano);
  const col = 1 + mes; // mês 1 (Jan) -> coluna B (2)
  historico.getRange(yearRow + OFFSET_GANHOS_DAVI, col).setValue(ganhosDavi);
  historico.getRange(yearRow + OFFSET_DEBITOS_DAVI, col).setValue(-debitosDavi);
  historico.getRange(yearRow + OFFSET_SALDO_DAVI, col).setValue(saldoDavi);
  historico.getRange(yearRow + OFFSET_GUARDADO_DAVI, col).setValue(guardadoDavi);
  historico.getRange(yearRow + OFFSET_GUARDADO_DAVI_MES, col).setValue(guardadoDaviMes);
  historico.getRange(yearRow + OFFSET_CATEGORIAS_DAVI, col).setValue(serializarCategorias(categoriasDavi));
  historico.getRange(yearRow + OFFSET_RENDIMENTO_DAVI, col).setValue(rendimentoDavi); 
  
  historico.getRange(yearRow + OFFSET_GANHOS_GABRIEL, col).setValue(ganhosGabriel);
  historico.getRange(yearRow + OFFSET_DEBITOS_GABRIEL, col).setValue(-debitosGabriel);
  historico.getRange(yearRow + OFFSET_SALDO_GABRIEL, col).setValue(saldoGabriel);
  historico.getRange(yearRow + OFFSET_GUARDADO_GABRIEL, col).setValue(guardadoGabriel);
  historico.getRange(yearRow + OFFSET_GUARDADO_GABRIEL_MES, col).setValue(guardadoGabrielMes);
  historico.getRange(yearRow + OFFSET_CATEGORIAS_GABRIEL, col).setValue(serializarCategorias(categoriasGabriel));
  historico.getRange(yearRow + OFFSET_RENDIMENTO_GABRIEL, col).setValue(rendimentoGabriel); 

  // 2) GANHOS do mês seguinte
  const nomeGanho = "Saldo de " + tituloMes(mes) + "/" + ano;
  
  // Mantém os ganhos que NÃO foram recebidos OU os ganhos recorrentes (salário, etc)
  const ganhosProximoDavi = [];
  dadosDavi.ganhos.forEach(function (g) {
    if (g.recebido === false || ehGanhoRecorrente(g.nome)) {
      ganhosProximoDavi.push({ nome: g.nome, valor: g.valor, data: proximaDataMesmoDia(g.data), recebido: false });
    }
  });

  const ganhosProximoGabriel = [];
  dadosGabriel.ganhos.forEach(function (g) {
    if (g.recebido === false || ehGanhoRecorrente(g.nome)) {
      ganhosProximoGabriel.push({ nome: g.nome, valor: g.valor, data: proximaDataMesmoDia(g.data), recebido: false });
    }
  });

  // Transporta o saldo positivo do mês que fechou
  if (saldoDavi > 0) {
    ganhosProximoDavi.push({ nome: nomeGanho, valor: saldoDavi, data: "", recebido: true });
  }
  if (saldoGabriel > 0) {
    ganhosProximoGabriel.push({ nome: nomeGanho, valor: saldoGabriel, data: "", recebido: true });
  }
  
  saveGanhos(sheetDavi, ganhosProximoDavi);
  saveGanhos(sheetGabriel, ganhosProximoGabriel);

  // 3) GASTOS FIXOS
  const proximosFixosDavi = dadosDavi.gastosFixos.map(proximoFixo).filter(Boolean);
  const proximosFixosGabriel = dadosGabriel.gastosFixos.map(proximoFixo).filter(Boolean);
  saveGastosFixos(sheetDavi, proximosFixosDavi);
  saveGastosFixos(sheetGabriel, proximosFixosGabriel);

  // 4) GASTOS VARIÁVEIS (Transfere os não pagos para o mês seguinte)
  const variaveisPendentesDavi = dadosDavi.gastosVariaveis.filter(function(g) { return g.pago === false; });
  const variaveisPendentesGabriel = dadosGabriel.gastosVariaveis.filter(function(g) { return g.pago === false; });
  
  saveGastosVariaveis(sheetDavi, variaveisPendentesDavi);
  saveGastosVariaveis(sheetGabriel, variaveisPendentesGabriel);

  // 5) CAIXINHAS: fecham o mês consolidando tudo numa base só. O valor guardado
  // (valorGuardado) NÃO é resetado — ele vira valorGuardado + rendimentoTotal +
  // valorGuardadoMes, ou seja, passa a representar o total real acumulado até aqui.
  // rendimentoTotal e valorGuardadoMes é que zeram, pra começar a contar o mês novo
  // (o rendimento e o quanto foi guardado já foram lidos acima e gravados no HISTORICO).
  const caixinhasProximoDavi = dadosDavi.caixinhas.map(function(c) {
    return { nome: c.nome, valorObjetivo: c.valorObjetivo, valorGuardado: valorTotalCaixinha(c), rendimentoTotal: 0, valorGuardadoMes: 0 };
  });
  const caixinhasProximoGabriel = dadosGabriel.caixinhas.map(function(c) {
    return { nome: c.nome, valorObjetivo: c.valorObjetivo, valorGuardado: valorTotalCaixinha(c), rendimentoTotal: 0, valorGuardadoMes: 0 };
  });
  saveCaixinhasBlock(sheetDavi, caixinhasProximoDavi);
  saveCaixinhasBlock(sheetGabriel, caixinhasProximoGabriel);

  // 6) avança o mês atual do app
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
      guardadoDaviMes: guardadoDaviMes,
      rendimentoDavi: rendimentoDavi,
      ganhosGabriel: ganhosGabriel,
      debitosGabriel: debitosGabriel,
      saldoGabriel: saldoGabriel,
      guardadoGabriel: guardadoGabriel,
      guardadoGabrielMes: guardadoGabrielMes,
      rendimentoGabriel: rendimentoGabriel,
    },
    mesAtual: proximoMes,
    anoAtual: proximoAno,
  };
}

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

function proximoFixo(item) {
  const bruto = String(item.parcela || "").trim();
  const m = bruto.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) {
    // Fixo sem parcela (ex: aluguel, internet) — é recorrente mensal, então
    // a data também avança pro mesmo dia do mês seguinte.
    return { nome: item.nome, valor: item.valor, tipo: item.tipo || "", data: proximaDataMesmoDia(item.data), parcela: "", pago: false };
  }
  const atual = Number(m[1]);
  const total = Number(m[2]);
  if (!total || total <= 1 || !atual) {
    return { nome: item.nome, valor: item.valor, tipo: item.tipo || "", data: proximaDataMesmoDia(item.data), parcela: "", pago: false };
  }
  if (atual >= total) return null; 
  return {
    nome: item.nome,
    valor: item.valor,
    tipo: item.tipo || "",
    data: proximaDataMesmoDia(item.data),
    parcela: (atual + 1) + "/" + total,
    pago: false,
  };
}

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

// Total "de verdade" guardado numa caixinha: base + rendimento acumulado + o que foi
// depositado neste mês (que só é somado à base no fechamento do mês).
function valorTotalCaixinha(c) {
  return (Number(c.valorGuardado) || 0) + (Number(c.rendimentoTotal) || 0) + (Number(c.valorGuardadoMes) || 0);
}
function somaTotalCaixinhas(lista) {
  return (lista || []).reduce(function (acc, c) { return acc + valorTotalCaixinha(c); }, 0);
}

function somaFixosPagos(lista) {
  return somaComStatus(lista, "pago");
}

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

function linhaDoAno(ano) {
  return 1 + HISTORICO_LINHAS_POR_BLOCO * (ano - HISTORICO_ANO_BASE);
}

function garantirBlocoDoAno(sheet, ano) {
  const yearRow = linhaDoAno(ano);
  const anoCel = sheet.getRange(yearRow, 2).getValue();
  if (Number(anoCel) === ano) {
    garantirRotulosCategorias(sheet, yearRow);
    return yearRow; 
  }

  sheet.getRange(yearRow, 2).setValue(ano);

  const mesesRow = yearRow + OFFSET_MESES;
  sheet.getRange(mesesRow, 2, 1, 12).setValues([HISTORICO_NOME_MESES]);

  const rotulos = [
    [OFFSET_GANHOS_DAVI, "GANHOS DAVI"],
    [OFFSET_DEBITOS_DAVI, "DEBITOS DAVI"],
    [OFFSET_SALDO_DAVI, "SALDO DAVI"],
    [OFFSET_GUARDADO_DAVI, "GUARDADO DAVI"],
    [OFFSET_GUARDADO_DAVI_MES, "GUARDADO DAVI MES"],
    [OFFSET_CATEGORIAS_DAVI, HISTORICO_LABEL_CATEGORIAS],
    [OFFSET_RENDIMENTO_DAVI, "RENDIMENTO DAVI"],
    [OFFSET_GANHOS_GABRIEL, "GANHOS GABRIEL"],
    [OFFSET_DEBITOS_GABRIEL, "DEBITOS GABRIEL"],
    [OFFSET_SALDO_GABRIEL, "SALDO GABRIEL"],
    [OFFSET_GUARDADO_GABRIEL, "GUARDADO GABRIEL"],
    [OFFSET_GUARDADO_GABRIEL_MES, "GUARDADO GABRIEL MES"],
    [OFFSET_CATEGORIAS_GABRIEL, HISTORICO_LABEL_CATEGORIAS],
    [OFFSET_RENDIMENTO_GABRIEL, "RENDIMENTO GABRIEL"],
  ];
  rotulos.forEach(function (r) {
    sheet.getRange(yearRow + r[0], 1).setValue(r[1]);
  });

  // 5 linhas: GANHOS, DEBITOS, SALDO, GUARDADO, GUARDADO MES
  sheet.getRange(yearRow + OFFSET_GANHOS_DAVI, 2, 5, 12).setNumberFormat(HISTORICO_FORMATO_MOEDA);
  sheet.getRange(yearRow + OFFSET_RENDIMENTO_DAVI, 2, 1, 12).setNumberFormat(HISTORICO_FORMATO_MOEDA);
  sheet.getRange(yearRow + OFFSET_GANHOS_GABRIEL, 2, 5, 12).setNumberFormat(HISTORICO_FORMATO_MOEDA);
  sheet.getRange(yearRow + OFFSET_RENDIMENTO_GABRIEL, 2, 1, 12).setNumberFormat(HISTORICO_FORMATO_MOEDA);

  return yearRow;
}

function garantirRotulosCategorias(sheet, yearRow) {
  [OFFSET_CATEGORIAS_DAVI, OFFSET_CATEGORIAS_GABRIEL].forEach(function (offset) {
    const cel = sheet.getRange(yearRow + offset, 1);
    if (!cel.getValue()) cel.setValue(HISTORICO_LABEL_CATEGORIAS);
  });
}

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
    const guardadoDaviMesVals = linha(OFFSET_GUARDADO_DAVI_MES);
    const categoriasDaviVals = linha(OFFSET_CATEGORIAS_DAVI);
    const rendimentoDaviVals = linha(OFFSET_RENDIMENTO_DAVI);
    
    const ganhosGabrielVals = linha(OFFSET_GANHOS_GABRIEL);
    const debitosGabrielVals = linha(OFFSET_DEBITOS_GABRIEL);
    const saldoGabrielVals = linha(OFFSET_SALDO_GABRIEL);
    const guardadoGabrielVals = linha(OFFSET_GUARDADO_GABRIEL);
    const guardadoGabrielMesVals = linha(OFFSET_GUARDADO_GABRIEL_MES);
    const categoriasGabrielVals = linha(OFFSET_CATEGORIAS_GABRIEL);
    const rendimentoGabrielVals = linha(OFFSET_RENDIMENTO_GABRIEL);

    const meses = [];
    for (let m = 0; m < 12; m++) {
      const g = ganhosDaviVals[m];
      if (g === "" || g === null || g === undefined) continue; 
      meses.push({
        mes: m + 1,
        nome: HISTORICO_NOME_MESES[m],
        ganhosDavi: Number(ganhosDaviVals[m]) || 0,
        debitosDavi: Number(debitosDaviVals[m]) || 0,
        saldoDavi: Number(saldoDaviVals[m]) || 0,
        guardadoDavi: Number(guardadoDaviVals[m]) || 0,
        guardadoMesDavi: Number(guardadoDaviMesVals[m]) || 0,
        categoriasDavi: parseCategorias(categoriasDaviVals[m]),
        rendimentoDavi: Number(rendimentoDaviVals[m]) || 0,
        ganhosGabriel: Number(ganhosGabrielVals[m]) || 0,
        debitosGabriel: Number(debitosGabrielVals[m]) || 0,
        saldoGabriel: Number(saldoGabrielVals[m]) || 0,
        guardadoGabriel: Number(guardadoGabrielVals[m]) || 0,
        guardadoMesGabriel: Number(guardadoGabrielMesVals[m]) || 0,
        categoriasGabriel: parseCategorias(categoriasGabrielVals[m]),
        rendimentoGabriel: Number(rendimentoGabrielVals[m]) || 0,
      });
    }
    if (meses.length > 0) anos.push({ ano: ano, meses: meses });

    ano++;
    if (ano > HISTORICO_ANO_BASE + 50) break; 
  }

  return anos;
}

function lerConfigMesAtual(sheet) {
  const anoCel = sheet.getRange(CONFIG_CEL_ANO).getValue();
  const mesCel = sheet.getRange(CONFIG_CEL_MES).getValue();
  const agora = new Date();
  const ano = anoCel && Number(anoCel) > 2000 ? Number(anoCel) : agora.getFullYear();
  const mes = mesCel && Number(mesCel) >= 1 && Number(mesCel) <= 12 ? Number(mesCel) : agora.getMonth() + 1;
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
// LEITURA / ESCRITA
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
    return Utilities.formatDate(valor, "Etc/GMT", "yyyy-MM-dd");
  }
  return String(valor);
}

// ---------------------------------------------------------------------
// CAIXINHAS
// ---------------------------------------------------------------------

function readCaixinhas(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  // Agora lê 5 colunas: P, Q, R, S, T
  const values = sheet.getRange(2, COL_GUARDADO, lastRow - 1, 5).getValues(); 
  const result = [];
  values.forEach(function (row) {
    if (row[0] !== "" && row[0] !== null) {
      result.push({
        nome: String(row[0]),
        valorObjetivo: Number(row[1]) || 0,
        valorGuardado: Number(row[2]) || 0,
        rendimentoTotal: Number(row[3]) || 0, // Coluna S
        valorGuardadoMes: Number(row[4]) || 0 // Coluna T
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
    caixinhas: readCaixinhas(sheet), 
  };
}

function linhasParaLimpar(sheet, novasLinhas) {
  const lastRow = Math.max(sheet.getLastRow() - 1, 0);
  const novas = novasLinhas ? novasLinhas.length : 0;
  return Math.max(lastRow, novas) + MARGEM_LIMPEZA;
}

function saveCaixinhasBlock(sheet, rows) {
  const rowsToClear = linhasParaLimpar(sheet, rows);
  sheet.getRange(2, COL_GUARDADO, rowsToClear, 5).clearContent(); // Limpa as 5 colunas (P, Q, R, S, T)
  if (!rows || rows.length === 0) return;
  const values = rows.map(function (r) {
    return [r.nome, r.valorObjetivo, r.valorGuardado, r.rendimentoTotal || 0, r.valorGuardadoMes || 0];
  });
  sheet.getRange(2, COL_GUARDADO, values.length, 5).setValues(values);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
