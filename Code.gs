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
 *   P = ORIGEM DO GASTO VARIÁVEL ("saldo" ou "beneficio") — fica ao lado do PAGO dos variáveis
 *   Q = GUARDADO (nome da caixinha/investimento/meta)
 *   R = META (objetivo opcional da caixinha; 0 ou vazio = sem meta)
 *   S = VALOR GUARDADO (quanto está guardado agora nessa caixinha, total acumulado)
 *   T = RENDIMENTO TOTAL (rendimento que a caixinha teve no mês atual)
 *   U = VALOR GUARDADO NO MES (quanto foi depositado nessa caixinha no mês atual)
 *   V = DATA (prazo opcional da caixinha, formato yyyy-MM-dd)
 *   W = ICON (nome do arquivo do ícone personalizado, ex: caixa_zelda.png)
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

// Nome de exibição de cada pessoa (usado nas descrições de transferência e no insight de IA).
const PESSOA_NOME = {
  davi: "Davi",
  gabriel: "Gabriel",
  ambos: "o casal (Davi e Gabriel)",
};

// Aba com as configurações gerais do app, incluindo a "imersão" de contexto
// pessoal e o "tom" usados pra deixar os insights de IA mais personalizados.
//   Coluna D = IMERSÃO IA DAVI     (uma frase/traço por linha, com tag opcional tipo "[COMIDA] ...")
//   Coluna E = IMERSÃO IA GABRIEL
//   Coluna F = IMERSÃO IA AMBOS    (traços que valem pros dois, usados também no modo Juntos)
//   Coluna G = TOM IA DAVI         (descrição de como a IA deve "falar" com o Davi — persona/estilo)
//   Coluna H = TOM IA GABRIEL      (idem, pro Gabriel — no modo Juntos o tom fica sempre neutro/padrão)
const CONFIGS_SHEET_NAME = "CONFIGS";
const COL_IMERSAO_DAVI = 4;
const COL_IMERSAO_GABRIEL = 5;
const COL_IMERSAO_AMBOS = 6;
const COL_TOM_DAVI = 7;
const COL_TOM_GABRIEL = 8;
const COL_ICON_CATEGORIA = 10; // J — categoria dos ícones
const COL_ICON_NOMES = 11; // K — nomes dos arquivos (separados por vírgula, ponto e vírgula ou linha)

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

const COL_ORIGEM_VARIAVEL = 16; // P — origem do dinheiro do gasto variável
const COL_GUARDADO = 17; // Q
const COL_META = 18; // R
const COL_VALOR_GUARDADO = 19; // S
const COL_RENDIMENTO = 20; // T
const COL_VALOR_GUARDADO_MES = 21; // U
const COL_DATA_CAIXINHA = 22; // V — prazo opcional da caixinha
const COL_ICONE = 23; // W — ícone personalizado da caixinha

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
    iconCategorias: a.iconCategorias || b.iconCategorias || {},
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
    // Ação só de leitura (não mexe na planilha) — por isso fica antes do
    // bloqueio de "ambos é somente leitura" logo abaixo: no modo Juntos
    // também dá pra pedir um insight, só não dá pra editar lançamentos.
    if (action === "gerarInsightIA") {
      return respond(gerarInsightComIA(body.pessoa, body.periodo, body.resumo));
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
    origem: "saldo",
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
// INSIGHT COM IA (Gemini)
// ---------------------------------------------------------------------
// Como configurar (uma vez só):
//   1) Gere uma chave grátis em https://aistudio.google.com/apikey
//   2) Neste editor do Apps Script: ⚙️ "Configurações do projeto" (ícone de
//      engrenagem no menu lateral) → "Propriedades do script" → "Adicionar
//      propriedade do script" → nome GEMINI_API_KEY, valor = a chave gerada.
//   3) Salve e publique de novo (Implantar > Gerenciar implantações > Editar
//      > Nova versão) pra a mudança valer no site.
// A chave NUNCA fica no HTML/JS do site — só aqui no backend, então quem
// abrir o app no navegador não consegue vê-la.
//
// FALLBACK OPENAI: opcionalmente adicione também a propriedade de script
// OPENAI_API_KEY com uma chave da OpenAI API. O sistema usa o último provedor
// que funcionou como preferido; se ele falhar, tenta o outro automaticamente.
// Assim, se o Gemini estiver indisponível, a OpenAI assume; se depois a OpenAI
// falhar, o Gemini volta a assumir. A chave da OpenAI também fica somente no
// backend. A assinatura do ChatGPT e o uso da API são serviços separados: a
// chave precisa ter acesso à API e faturamento/uso configurados na plataforma
// da OpenAI.
//
// Nota sobre o formato da chave: a partir de 2026 o Google passou a emitir
// chaves novas no formato "AQ.Ab..." (no lugar do antigo "AIzaSy..."). O
// código abaixo já manda a chave pelo header x-goog-api-key (o jeito atual
// recomendado pelo Google), que funciona com os dois formatos. Se mesmo
// assim a Gemini API responder erro de autenticação, vale conferir em
// aistudio.google.com/apikey se essa chave está restrita à "Generative
// Language API" e gerar uma nova se precisar.
//
// Se quiser trocar o modelo (ex: por um mais esperto/mais caro), troque só
// a constante abaixo. Nomes de modelo disponíveis aparecem em
// https://ai.google.dev/gemini-api/docs/models — evite modelos "gemini-2.5-*",
// que a Google está desativando em outubro/2026.
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_API_KEY_PROPRIEDADE = "GEMINI_API_KEY";
const GEMINI_API_KEY_2_PROPRIEDADE = "GEMINI_API_KEY_2";
const GEMINI_ULTIMA_CHAVE_PROPRIEDADE = "GEMINI_ULTIMA_CHAVE";
const OPENAI_API_KEY_PROPRIEDADE = "OPENAI_API_KEY";
const OPENAI_MODEL = "gpt-5.6-luna";
const IA_ULTIMO_PROVEDOR_PROPRIEDADE = "IA_ULTIMO_PROVEDOR";

// Fallback entre provedores: o sistema prefere o último provedor que funcionou.
// Se ele falhar nesta chamada, tenta imediatamente o outro. Se o outro funcionar,
// ele passa a ser o preferido na próxima chamada. As chaves ficam somente nas
// Propriedades do Script e nunca são enviadas ao navegador.
function provedorIAPreferido() {
  const salvo = PropertiesService.getScriptProperties().getProperty(IA_ULTIMO_PROVEDOR_PROPRIEDADE);
  return salvo === "openai" ? "openai" : "gemini";
}

function registrarProvedorIASucesso(provedor) {
  try { PropertiesService.getScriptProperties().setProperty(IA_ULTIMO_PROVEDOR_PROPRIEDADE, provedor); } catch (err) {}
}

function ehErroTransitórioIA(status) {
  return [408, 409, 429, 500, 502, 503, 504].indexOf(Number(status)) !== -1;
}

function extrairTextosOpenAI(data) {
  let texto = data && data.output_text;
  if (!texto && data && Array.isArray(data.output)) {
    const partes = [];
    data.output.forEach(function(item) {
      (item.content || []).forEach(function(c) {
        if (c.type === "output_text" && c.text) partes.push(c.text);
      });
    });
    texto = partes.join("\n");
  }
  if (!texto) return null;
  try {
    const parsed = JSON.parse(texto);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.textos)) return parsed.textos;
    if (parsed && Array.isArray(parsed.insights)) return parsed.insights;
  } catch (err) {}
  return null;
}

function gerarInsightComOpenAI(corpoGemini, periodo) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(OPENAI_API_KEY_PROPRIEDADE);
  if (!apiKey) return { ok: false, error: "Chave da OpenAI não configurada." };

  const prompt = corpoGemini.contents[0].parts[0].text;
  const corpo = {
    model: OPENAI_MODEL,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    temperature: 0.95,
    max_output_tokens: 2400,
    text: {
      format: {
        type: "json_schema",
        name: "insights",
        strict: true,
        schema: {
          type: "object",
          properties: {
            textos: { type: "array", minItems: QUANTIDADE_INSIGHTS_POR_PEDIDO, maxItems: QUANTIDADE_INSIGHTS_POR_PEDIDO, items: { type: "string" } }
          },
          required: ["textos"],
          additionalProperties: false
        }
      }
    }
  };

  const opcoes = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  };

  const atrasos = [1200, 2800, 5200];
  let res, status = 0, data = {};
  for (let tentativa = 0; tentativa <= atrasos.length; tentativa++) {
    res = UrlFetchApp.fetch("https://api.openai.com/v1/responses", opcoes);
    status = res.getResponseCode();
    try { data = JSON.parse(res.getContentText() || "{}"); } catch (err) { data = {}; }
    if (status === 200 || !ehErroTransitórioIA(status) || tentativa === atrasos.length) break;
    Utilities.sleep(atrasos[tentativa]);
  }

  if (status !== 200) {
    const msg = (data.error && (data.error.message || data.error.code)) || ("Erro HTTP " + status + " ao chamar a OpenAI.");
    return { ok: false, error: msg, status: status };
  }

  const textos = (extrairTextosOpenAI(data) || []).map(function(t) { return String(t || "").trim(); }).filter(Boolean);
  if (textos.length < QUANTIDADE_INSIGHTS_POR_PEDIDO) {
    return { ok: false, error: "A OpenAI não devolveu os 10 insights completos neste momento.", status: 200 };
  }
  return { ok: true, textos: textos.slice(0, QUANTIDADE_INSIGHTS_POR_PEDIDO), periodo: periodo || null, tentativas: [{ chave: (opcoesModo && opcoesModo.indiceChave) || null, status: 200, motivo: "OK" }] };
}

function obterChavesGemini() {
  const props = PropertiesService.getScriptProperties();
  const chave1 = String(props.getProperty(GEMINI_API_KEY_PROPRIEDADE) || "").trim();
  const chave2 = String(props.getProperty(GEMINI_API_KEY_2_PROPRIEDADE) || "").trim();
  return [chave1, chave2];
}

function indiceChaveGeminiPreferida() {
  const salvo = PropertiesService.getScriptProperties().getProperty(GEMINI_ULTIMA_CHAVE_PROPRIEDADE);
  return salvo === "2" ? 1 : 0;
}

function registrarChaveGeminiSucesso(indice) {
  try { PropertiesService.getScriptProperties().setProperty(GEMINI_ULTIMA_CHAVE_PROPRIEDADE, String(indice + 1)); } catch (err) {}
}

function gerarInsightComIA(pessoa, periodo, resumo) {
  const chaves = obterChavesGemini();
  const preferida = indiceChaveGeminiPreferida();
  const ordem = [preferida, preferida === 0 ? 1 : 0];
  const diagnosticos = [];

  for (let i = 0; i < ordem.length; i++) {
    const indice = ordem[i];
    const chave = chaves[indice];
    if (!chave) {
      diagnosticos.push({ chave: indice + 1, status: "sem_chave", motivo: "A chave não está configurada." });
      continue;
    }

    const resultado = gerarInsightComGemini(pessoa, periodo, resumo, {
      apiKeyForcada: chave,
      indiceChave: indice + 1,
      diagnosticoIA: true,
    });

    if (resultado && resultado.ok) {
      registrarChaveGeminiSucesso(indice);
      resultado.chaveUsada = indice + 1;
      resultado.tentativas = diagnosticos.concat(resultado.tentativas || []);
      return resultado;
    }

    diagnosticos.push({
      chave: indice + 1,
      status: (resultado && resultado.status) || "erro",
      motivo: (resultado && resultado.error) || "Falha desconhecida.",
    });
  }

  return {
    ok: false,
    error: "As duas chaves do Gemini falharam.",
    diagnostico: diagnosticos,
    ocultarInsight: true,
  };
}


// Glossário de categorias pra IA não "chutar" o significado só pelo nome
// (foi assim que ela errou dizendo que "Alimentação" tinha caído, quando na
// real Alimentação é outra coisa — ver explicação abaixo). Baseado no que
// foi explicado + inferência por contraste com as categorias vizinhas.
const GLOSSARIO_CATEGORIAS = {
  "Alimentação": "Compras pequenas e avulsas de comida/bebida do dia a dia — padaria, uma coquinha na rua, um doce comprado de um colega. NÃO é a compra grande de mantimentos (isso é 'Mercado') nem pedido/refeição em restaurante (isso é 'Delivery & Restaurantes').",
  "Mercado": "Compra de supermercado/mantimentos para casa — a compra grande, geralmente mensal ou quinzenal (diferente de 'Alimentação', que é gasto avulso pequeno).",
  "Delivery & Restaurantes": "Pedidos por aplicativo de delivery e refeições feitas em restaurantes, bares ou lanchonetes.",
  "Assinaturas & Serviços": "Assinaturas recorrentes de serviços — streaming, softwares, planos de aplicativo, etc.",
  "Beleza & Cuidados": "Produtos e serviços de estética pessoal — cosméticos, salão de beleza, barbearia, manicure.",
  "Bem-estar": "Academia, psicóloga/terapia, corte de cabelo, e atividades parecidas de cuidado pessoal e saúde mental/física.",
  "Carro": "Despesas gerais de manutenção e posse do carro — revisão, seguro, IPVA, peças (diferente de 'Combustível', que é só abastecimento, e de 'Estacionamento').",
  "Casa & Manutenção": "Reparos e manutenção da casa/apartamento — conserto, material de construção, mobília.",
  "Celular & Internet": "Conta de celular e plano de internet/wi-fi.",
  "Combustível": "Gasolina, álcool ou gás para o carro/moto.",
  "Contas": "Contas fixas da casa — água, luz, condomínio.",
  "Educação": "Cursos, material escolar, mensalidade de curso ou faculdade.",
  "Estacionamento": "Vagas pagas, zona azul.",
  "Financiamento": "Parcelas de financiamento (carro, casa, etc).",
  "Jogos": "Jogos eletrônicos — compras, assinaturas de serviço de jogos, itens dentro de jogo.",
  "Lazer": "Entretenimento em geral que não seja jogos eletrônicos — cinema, shows, parques, passeios.",
  "Metas": "Categoria TÉCNICA do sistema, não é um gasto real do dia a dia: é usada só nos lançamentos automáticos 'Guardado: nome da caixinha' quando o usuário guarda dinheiro numa caixinha.",
  "Outro": "Categoria coringa pra gastos que não se encaixam em nenhuma outra categoria.",
  "Pessoal": "Gasto de uso/cuidado pessoal diverso que não se encaixa nas outras categorias mais específicas.",
  "Pets": "Despesas com animais de estimação — ração, veterinário, petshop.",
  "Presente": "Presentes dados a outras pessoas.",
  "Reparação Histórica": "Termo interno do casal: um valor que Davi passa pra Gabriel todo mês, porque Gabriel bancou as contas de Davi durante um período em que ele ficou desempregado. NÃO é uma dívida cobrada com juros nem algo formal — é um repasse mensal combinado entre os dois. Se aparecer, pode comentar com o mesmo tom carinhoso/parceria usado pra outras coisas do casal, sem soar como cobrança ou constrangimento.",
  "Saídas & Confraternizações": "Sair com amigos, happy hour, festas, confraternização de trabalho.",
  "Saúde & Farmácia": "Só gasto com remédio, médico, consulta, exame — nada de bem-estar geral (isso é a categoria Bem-estar).",
  "Taxas & Tarifas": "Taxas bancárias, tarifas de serviços, juros, multas administrativas.",
  "Tech & Equipamentos": "Compra de eletrônicos e equipamentos — celular novo, notebook, acessórios de tecnologia.",
  "Transporte": "Deslocamento do dia a dia que não seja no carro próprio — ônibus, aplicativo de transporte, metrô.",
  "Vestuário & Acessórios": "Roupas, calçados, acessórios.",
  "Viagens": "Despesas de viagens e turismo.",
};

function textoGlossarioCategorias() {
  return Object.keys(GLOSSARIO_CATEGORIAS)
    .map(function (nome) { return "- " + nome + ": " + GLOSSARIO_CATEGORIAS[nome]; })
    .join("\n");
}

// Lê a "imersão" de contexto pessoal e o "tom" na aba CONFIGS (colunas
// D:K — ver comentário de CONFIGS_SHEET_NAME acima). Cada célula não-vazia
// de uma coluna vira uma linha na lista (tom.davi/tom.gabriel viram texto
// único, juntando as linhas). Se a aba ou as colunas não existirem (ou
// estiverem vazias), devolve tudo vazio — é opcional, nunca deve quebrar
// o insight.
function lerCategoriasIcones() {
  const regras = [];
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIGS_SHEET_NAME);
    if (!sheet) return regras;
    const ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 2) return regras;

    const valores = sheet.getRange(2, COL_ICON_CATEGORIA, ultimaLinha - 1, 2).getValues();
    valores.forEach(function(linha) {
      const categoria = String(linha[0] || "").trim();
      const bruto = String(linha[1] || "").trim();
      if (!categoria || !bruto) return;
      const padroes = bruto.split(/[\n,;]+/).map(function(nome) { return nome.trim(); }).filter(Boolean);
      if (padroes.length) regras.push({ categoria: categoria, padroes: padroes });
    });
  } catch (err) {}
  return regras;
}

const CACHE_PROMPT_IA_SEGUNDOS = 30;
const CACHE_PROMPT_IA_CHAVE = "caixa_ia_contexto_v1";

function lerImersaoIA() {
  const vazio = { davi: [], gabriel: [], ambos: [], tomDavi: "", tomGabriel: "" };

  // O contexto/prompt pessoal é renovado no máximo a cada 30 segundos.
  // Não existe um timer no Apps Script para "acordar" sozinho; a renovação
  // acontece na próxima geração de IA após o TTL, sem fazer uma chamada ao
  // Gemini só para atualizar a configuração.
  try {
    const cache = CacheService.getScriptCache();
    const salvo = cache.get(CACHE_PROMPT_IA_CHAVE);
    if (salvo) return JSON.parse(salvo);
  } catch (err) {}
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIGS_SHEET_NAME);
    if (!sheet) return vazio;

    const ultimaLinha = sheet.getLastRow();
    if (ultimaLinha < 2) return vazio;

    // Linha 1 = cabeçalho, dados a partir da linha 2. Pega D:H de uma vez.
    const valores = sheet.getRange(2, COL_IMERSAO_DAVI, ultimaLinha - 1, 5).getValues();

    const coluna = function (idx) {
      return valores
        .map(function (linha) { return String(linha[idx] || "").trim(); })
        .filter(Boolean);
    };

    const resultado = {
      davi: coluna(0),
      gabriel: coluna(1),
      ambos: coluna(2),
      tomDavi: coluna(3).join(" "),
      tomGabriel: coluna(4).join(" "),
    };
    try { CacheService.getScriptCache().put(CACHE_PROMPT_IA_CHAVE, JSON.stringify(resultado), CACHE_PROMPT_IA_SEGUNDOS); } catch (err) {}
    return resultado;
  } catch (err) {
    return vazio;
  }
}

// Monta a instrução de tom/persona pra quem está pedindo o insight. No
// modo Juntos o tom fica sempre neutro (não dá pra falar como duas
// personas diferentes ao mesmo tempo), então devolve string vazia.
function textoTomIA(pessoaCodigo) {
  if (pessoaCodigo === "ambos") return "";
  const imersao = lerImersaoIA();
  const tom = pessoaCodigo === "gabriel" ? imersao.tomGabriel : imersao.tomDavi;
  return tom || "";
}

// Monta o bloco de texto de imersão a ser enviado no prompt, já filtrado
// pra quem está pedindo o insight (davi | gabriel | ambos).
function textoImersaoIA(pessoaCodigo) {
  const imersao = lerImersaoIA();
  let linhas = [];

  if (pessoaCodigo === "ambos") {
    linhas = imersao.ambos
      .concat(imersao.davi.map(function (l) { return "(sobre o Davi) " + l; }))
      .concat(imersao.gabriel.map(function (l) { return "(sobre o Gabriel) " + l; }));
  } else if (pessoaCodigo === "gabriel") {
    linhas = imersao.gabriel.concat(imersao.ambos);
  } else {
    linhas = imersao.davi.concat(imersao.ambos);
  }

  if (!linhas.length) return "";

  return linhas.map(function (l) { return "- " + l; }).join("\n");
}

// Quantos insights pedimos de uma vez pro Gemini. O app guarda esse "estoque"
// no aparelho e vai consumindo um por sincronização — só pede mais quando
// o estoque fica baixo, então a tela quase nunca fica esperando rede.
const QUANTIDADE_INSIGHTS_POR_PEDIDO = 5;

function gerarInsightComGemini(pessoa, periodo, resumo, opcoesModo) {
  try {
    const apiKey = (opcoesModo && opcoesModo.apiKeyForcada) || PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPRIEDADE);
    const modoSomentePrompt = opcoesModo && opcoesModo.modoSomentePrompt === true;

    const pessoaCodigo = String(pessoa || "").toLowerCase();
    const ehCasal = pessoaCodigo === "ambos";
    const nomePessoa = PESSOA_NOME[pessoaCodigo] || "a pessoa";

    const regrasComuns = [
      "Você é um assistente financeiro dentro de um app pessoal de controle de gastos chamado Caixa. Seja o mais específico e afiado possível — nunca dê conselho genérico de curso de finanças.",
      "Contexto do app pra você entender os dados do resumo: 'gastos fixos' são despesas recorrentes do mês (aluguel, assinaturas, etc); 'gastos variáveis' são despesas do dia a dia que mudam de mês a mês; 'caixinhas' são potes de dinheiro guardado — o campo valorGuardado de cada caixinha JÁ É o total real guardado até agora (já inclui o que rendeu e o que foi guardado neste mês, então pra saber quanto falta pra meta é só valorObjetivo − valorGuardado, NUNCA some rendimentoTotal ou guardadoNesseMes de novo em cima disso). rendimentoTotal e guardadoNesseMes são só o detalhamento de parte desse total (quanto rendeu / quanto entrou nesse mês especificamente), úteis pra comentar sobre eles isoladamente, mas não são valores a somar ao valorGuardado.",
      "MUITO IMPORTANTE — não confunda 'total acumulado de sempre' com 'total deste ano/mês': o valorGuardado de cada caixinha (e a soma dele entre as caixinhas) é um saldo ACUMULADO DESDE SEMPRE, que só muda quando alguém guarda ou retira — ele NÃO reseta a cada mês nem a cada ano. Por isso NUNCA introduza esse valor com uma frase que dê a entender que é algo do período atual, tipo 'neste ano você já guardou X' ou 'esse mês você guardou X entre as caixinhas' — isso é falso e confunde quem lê. Fale dele de forma atemporal (ex: 'você já tem X guardado na caixinha Tal' ou 'no total, X guardados entre as caixinhas'). Quem quer saber quanto foi guardado especificamente NESTE MÊS é o campo mesAtual.guardadoNoMes (ou guardadoNesseMes de cada caixinha), e quem quer saber o total do ANO é anoAtualAteAgora.guardado — só use frases como 'neste ano' ou 'esse mês' quando o valor vier de um desses dois campos, nunca do valorGuardado bruto da caixinha.",
      "O resumo tem um campo totalGuardadoAtualDeVerdade — é o total real, ATUAL, de tudo que está guardado agora nas caixinhas, exatamente como aparece na aba Caixinhas do app. Use esse campo (ou os valorGuardado de cada caixinha) toda vez que for falar 'quanto você tem guardado hoje' ou o total guardado no momento. Já os campos guardado dentro de anoAtualAteAgora e anoAnteriorCompleto são o CRESCIMENTO LÍQUIDO das caixinhas naquele período (total final menos total inicial, já descontando qualquer saque no meio do caminho) — não são soma de depósitos mês a mês, então podem ser bem menores do que somar os valores guardados mês a mês, e isso é esperado.",
      "GLOSSÁRIO DAS CATEGORIAS — o nome da categoria sozinho pode enganar, use SEMPRE o significado real abaixo em vez de chutar pelo nome (ex: 'Alimentação' NÃO é a feira/mercado do mês, é gasto pequeno e avulso — não confunda os dois nem fale que uma caiu quando na verdade foi a outra):\n" + textoGlossarioCategorias(),
      "Você vai receber um resumo em JSON com os números de " + nomePessoa + ", em reais (BRL).",
      "SEPARAÇÃO DOS GANHOS: dentro de mesAtual, 'beneficiosRecebidos' é a soma dos ganhos já recebidos cujo NOME contém a palavra 'beneficio' (com ou sem acento, inclusive nomes como 'Multibeneficio'); 'ganhosRecebidosSemBeneficio' é a soma dos demais ganhos recebidos. Esses dois valores formam juntos 'ganhosRecebidos'. Quando comparar ou comentar a composição da renda, use esses campos em vez de tentar inferir a divisão só pelos nomes individuais. No modo Juntos, a mesma separação aparece dentro de mesAtual.porPessoa para Davi e Gabriel.",
      "O resumo traz vários recortes de tempo — use o que fizer sentido pra cada insight, sem forçar todos: mesAtual (mês em andamento) vs mesPassado (mês imediatamente anterior); mesmoMesAnoPassado (o MESMO mês, um ano antes — ex: Agosto deste ano vs Agosto do ano passado; só existe se já tiver histórico daquele mês) — é diferente de mesPassado, não confunda os dois; e a visão do ano inteiro em anoAtualAteAgora (soma de tudo que já fechou nesse ano mais o mês em andamento) vs anoAnteriorCompleto (o ano anterior fechado). NUNCA escreva um ano fixo/chutado no texto — sempre use o campo 'ano' que vier dentro de cada bloco do resumo, já que o ano de referência muda sozinho conforme o app avança.",
      "CAIXINHAS COM PRAZO: cada objeto em caixinhas pode trazer prazo, diasAtePrazo, mesesAtePrazo, faltaParaMeta, necessarioGuardarPorMes, guardadoNesseMes e diferencaParaMediaMensalNesteMes. Use esses dados para fazer comentários de planejamento quando houver uma meta e um prazo. 'necessarioGuardarPorMes' é a média que precisa ser guardada por mês, a partir de agora, para cobrir o valor que falta até a data; 'guardadoNesseMes' é quanto já entrou nessa caixinha no mês atual. Se fizer sentido, diga de forma concreta algo como 'faltam X meses para [caixinha] e a média necessária é Y por mês'. Se guardadoNesseMes estiver abaixo da média necessária, pode comentar que ainda faltam Z para alcançar a média deste mês, mas lembre que o mês ainda está em andamento e não trate o valor parcial como se fosse o mês inteiro. Nunca invente uma média, prazo ou valor: use somente os campos calculados no resumo. Prazo passado é atraso; meta já completa não precisa de recomendação de aporte.",
      "Dentro de mesAtual também vêm 'aindaAReceberEsseMes', 'aindaAPagarFixosEsseMes' e 'aindaAPagarVariaveisEsseMes' — são valores já lançados mas ainda pendentes (não confirmados como recebidos/pagos), não são gasto ou ganho perdido. Quando algum desses vier maior que zero, pode ser um bom ângulo pra um dos insights (ex: lembrar quanto ainda falta entrar ou sair do mês) — mas só use se for relevante, não force em todo insight.",
      "Gere um ARRAY JSON com exatamente " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " objetos de insight CURTOS (1 a 3 frases cada, no máximo uns 280 caracteres por texto), em português do Brasil.",
      "Cada objeto deve ter exatamente estes campos: titulo, texto e tipo. O titulo deve ser CURTO, forte e contextual (1 a 3 palavras), em CAIXA ALTA, como \"GASTO\", \"RECEBIMENTO\", \"CAIXINHA\", \"RENDIMENTO\", \"COMPARAÇÃO\", \"ATENÇÃO\" ou outro título específico que combine com aquele insight. O campo tipo deve ser exatamente um destes valores: gasto, ganho, beneficio, guardado, rendimento, atencao, comparacao, planejamento ou geral. O tipo serve apenas para a interface aplicar a cor adequada ao titulo.",
      "Cada um dos " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " insights precisa focar em um ÂNGULO DIFERENTE dos dados — por exemplo: maior variação de categoria vs mês passado, variação de categoria ou do total vs o mesmo mês do ano passado (mesmoMesAnoPassado), ritmo/projeção do gasto no mês, quanto ainda está pendente de receber/pagar, progresso de uma caixinha/meta específica, rendimento de algum investimento, comparação entre o peso dos gastos fixos e dos variáveis, como o ano está indo até agora vs o ano passado, ou quanto sobrou disponível. NUNCA repita a mesma informação, a mesma conclusão ou a mesma sugestão em mais de um item.",
      "Seja específico: cite nomes de categorias e de caixinhas de verdade que aparecerem no resumo — não fale de forma genérica ou vaga.",
      "ORIGEM DOS GASTOS VARIÁVEIS: cada item variável em lancamentosComNomeDoMesAtual.gastosDoMes traz origem=\"saldo\" ou origem=\"beneficio\". Isso informa de qual reserva o gasto foi pago. Use essa informação quando fizer análises de composição do dinheiro, especialmente para comparar quanto do Benefício já foi utilizado e quanto do Saldo normal foi utilizado. Nunca invente a origem de um gasto; para gastos fixos, não existe esse campo e eles continuam sendo tratados como despesas do Saldo.",
      "O resumo traz lancamentosComNomeDoMesAtual.ganhosDoMes (ganhos recebidos; cada item também informa beneficio=true/false seguindo a mesma regra de nome) e .gastosDoMes (TODOS os gastos do mês em andamento, fixos e variáveis juntos), com o NOME DE VERDADE de cada lançamento (ex: 'Almoço - Tia Marina', 'Pokémon Pokopia'). Cada item de gastosDoMes também traz: categoria; tipoLancamento ('fixo' = mensalidade/parcela recorrente, ou 'variavel' = gasto avulso); parcela (só quando for um fixo parcelado, ex: '1/5' = primeira de cinco parcelas — cite isso quando for relevante, tipo 'ainda faltam 4 parcelas'); status (pago | pendente | atrasado | mes_que_vem | pago_adiantado — 'atrasado' significa que venceu no mês passado e ainda não foi pago, é um bom ângulo pra alertar a pessoa citando o nome; 'mes_que_vem' é uma parcela/conta já lançada mas que só vence no mês seguinte, não é uma pendência de agora); e, só no modo Juntos, pessoa (de qual das duas pessoas é aquele lançamento — NUNCA ignore esse campo quando ele existir, ver as regras específicas do modo Juntos abaixo). Como um fixo parcelado e um variável avulso podem ter a MESMA categoria, cruze os dois quando fizer sentido — ex: se o total de uma categoria subiu, você pode dizer que parte veio de uma parcela fixa (citando o nome e a parcela) e parte de uma compra avulsa (citando o nome), em vez de só falar no total agregado da categoria. Preste atenção nesses nomes: se um deles deixar claro de onde veio o dinheiro ou pra onde foi (uma pessoa, um lugar, uma ocasião), pode citar isso literalmente em um dos insights pra ficar mais pessoal e específico — mas só quando o nome realmente disser isso com clareza, nunca invente uma relação ou um contexto que o nome não deixa explícito, e não force esse ângulo em todo insight.",
      "NÃO termine todos os insights com a mesma sugestão ou o mesmo tipo de conselho (por exemplo, não repita algo como 'que tal começar uma reserva' em mais de um item). Só sugira uma ação quando ela realmente fizer sentido pro dado específico daquele insight, e varie sempre a forma de dizer. Vários dos insights nem precisam ter sugestão nenhuma — às vezes só constatar o dado já basta.",
      "Tom leve, direto, específico e motivador — pode ter humor leve quando fizer sentido, sem ironia pesada nem tom de sermão.",
      "NUNCA presuma ou insinue julgamento sobre o MOTIVO de uma compra — não escreva coisas como 'espero que valha cada centavo', 'espero que essa aventura valha a pena', 'vale o investimento?', 'cuidado pra não desequilibrar o orçamento', 'não deixe isso pesar no bolso' ou qualquer variação que sugira que o gasto precisa se justificar, provar seu valor ou que a pessoa devia se policiar por ter gastado com algo que gosta. A pessoa não te deve explicação de por que comprou algo, e gastar com o que dá prazer (jogo, lazer, hobby, capricho) não é um problema a ser questionado, alertado ou monitorado com cautela — só o próprio dado (valor, categoria, comparação com outro período) fala por si, sem nenhum comentário de prudência grudado nele. Só é aceitável um tom de alerta real quando os PRÓPRIOS DADOS mostrarem um problema concreto e objetivo (ex: saldo disponível do mês ficou negativo, ou uma conta está 'atrasada') — nunca como reação a um valor alto sozinho ou a um gasto de lazer/hobby específico.",
      "Sempre que citar um valor em dinheiro, formate como reais no padrão brasileiro (vírgula decimal, sempre com 2 casas — ex: R$ 5,00 ou R$ 1.234,56) e marque TODO valor com chaves duplas indicando de que tipo ele é, pra cada um aparecer com a mesma cor usada no gráfico histórico do app (Ganhos=verde, Gastos=vermelho, Guardado=amarelo, Rendimento=azul): {{ganho:R$ 5,00}} pra qualquer valor de ganho/recebimento; {{gasto:R$ 5,00}} pra qualquer valor de gasto/despesa (fixo, variável, de uma categoria, pendência a pagar); {{guardado:R$ 5,00}} pra valor ligado a caixinha — quanto já guardou, quanto falta pra bater a meta, o valor da própria meta; {{rendimento:R$ 5,00}} especificamente pro quanto uma caixinha/investimento rendeu. Só use {{+R$ 5,00}} (favorável) ou {{-R$ 5,00}} (desfavorável) pro raro caso de um valor que não seja claramente nenhum dos quatro tipos, como um saldo geral. Exemplo real de frase: \"Você guardou {{guardado:R$ 150,00}} esse mês, seu Rendimento foi de {{rendimento:R$ 12,30}}, mas o Gasto com transporte subiu {{gasto:R$ 80,00}} em relação ao mês passado.\" NUNCA escreva um valor em reais sem um desses marcadores ao redor, e NUNCA deixe de indicar o tipo quando o valor claramente for um dos quatro — isso é o que importa mais, mais do que decidir se é bom ou ruim. PROIBIDO abreviar um valor monetário de qualquer forma (nunca escreva algo como \"R$ 3k\", \"R$ 2.5k\" ou \"3 mil reais\") — o valor dentro do marcador é sempre o número completo e exato, no formato R$ 0,00. Essa regra vale SEMPRE, mesmo que o tom/persona configurado pra essa pessoa seja informal, gamer ou de internet — a persona muda só o vocabulário ao redor do número, nunca o próprio número ou o marcador dele.",
      "NUNCA use as expressões 'no azul' ou 'no vermelho' pra falar de saldo — os marcadores acima já indicam a cor certa, não precisa de metáfora de cor no texto.",
      "Se algum dado relevante estiver ausente, nulo ou zerado no resumo, apenas ignore-o — não invente número.",
      "Não use markdown, no máximo 1 emoji por insight, e cada item do array deve ser só o texto puro do insight (sem aspas, sem numeração, sem prefixo tipo 'Insight:').",
    ];

    const blocoImersao = textoImersaoIA(pessoaCodigo);
    const regrasImersao = blocoImersao
      ? [
          "CONTEXTO PESSOAL (imersão) sobre quem está falando com você, organizado em tópicos livres (a tag entre colchetes, quando existir, é só uma dica de assunto, não uma categoria financeira — não tente casar com o nome exato de uma categoria de gasto):\n" + blocoImersao,
          "Use um traço desse contexto pessoal SOMENTE se ele se encaixar de forma natural e específica no insight que você está gerando naquele momento (ex: um gasto que claramente é sobre aquele assunto, tema, pet, hobby etc). NUNCA force uma menção pessoal só por ter o dado disponível, e NUNCA invente uma ligação que os dados não sustentam claramente. É perfeitamente normal — e esperado — que a maioria dos " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " insights não use nada desse contexto. Como regra geral, no máximo 1 ou 2 dos insights devem puxar algum traço pessoal, nunca todos — EXCETO se um dos próprios traços pedir explicitamente mais profundidade ou mais frequência num assunto específico (ex: 'quando o assunto for X, pode se aprofundar mais'). Nesse caso, siga essa instrução específica em vez do limite geral, mas só quando o gasto realmente for sobre aquele assunto.",
          "Quando usar, o tom pode ficar mais leve, caloroso e conversado (como um amigo comentando, não um extrato bancário), mas sem exagerar — ainda é sobre o dinheiro. Se estiver no modo Juntos (ambos), um traço marcado '(sobre o Davi)' ou '(sobre o Gabriel)' só pode ser usado junto de um gasto que o campo pessoa do lançamento confirma ser daquela pessoa específica — nunca atribua ao casal um traço que é de só um dos dois.",
        ]
      : [];

    const textoTom = textoTomIA(pessoaCodigo);
    const regrasTom = textoTom
      ? [
          "TOM/PERSONA obrigatório pra ESTA pessoa — siga em TODOS os " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " insights, do primeiro ao último, sem exceção: " + textoTom,
          "Esse tom é sobre o JEITO de escrever (vocabulário, expressões, personalidade) — ele NUNCA muda, ignora ou substitui nenhuma das regras de dados, valores, marcadores {{...}} ou formatação definidas acima. Adapte a persona ao redor dos números certos, nunca o contrário.",
        ]
      : [];

    const regrasPessoa = ehCasal
      ? [
          "Você está olhando as finanças combinadas de um casal, Davi e Gabriel. O resumo, nesse modo Juntos, traz um recorte por pessoa em mesAtual.porPessoa e (quando existir mês fechado anterior) mesPassado.porPessoa — cada um com ganhosRecebidos/ganhos, gastoFixoPago+gastoVariavelPago/gastos, e categorias SEPARADOS por pessoa. Além disso, cada item de lancamentosComNomeDoMesAtual.ganhosDoMes e .gastosDoMes tem um campo pessoa dizendo de qual dos dois é aquele lançamento específico.",
          "REGRA MAIS IMPORTANTE DESSE MODO: NUNCA atribua ao casal genericamente ('vocês foram à padaria', 'os dois gastaram com X') um lançamento que o campo pessoa diz ser de UM SÓ deles — isso é factualmente errado. Se duas coisas da mesma categoria forem de pessoas diferentes, trate como duas coisas separadas e diga o nome de cada um (ex: 'o Davi foi na padaria umas 3 vezes, e o Gabriel gastou com X' — não 'vocês foram na padaria' se só um dos dois foi).",
          "O ângulo mais valioso desse modo é justamente COMPARAR os dois usando mesAtual.porPessoa (e mesPassado.porPessoa quando existir) — é isso que diferencia o modo Juntos de simplesmente ver o insight de uma pessoa só. Gere pelo menos 2 dos " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " insights com esse ângulo comparativo, variando o tipo de comparação entre eles. Exemplos do tipo de coisa que funciona bem: apontar quem gastou mais numa categoria específica e por quanto (ex: 'o Davi gastou R$X a mais que o Gabriel em Jogos'); mostrar que um pesou mais numa categoria enquanto o outro pesou mais em outra (ex: 'o Davi gastou mais com Presente, enquanto o Gabriel puxou mais o Financiamento'); calcular que fração da soma dos ganhos dos dois (porPessoa.davi.ganhosRecebidos + porPessoa.gabriel.ganhosRecebidos) foi pra uma categoria específica somando os gastos dos dois nela, e citar nomes de lugares/lançamentos de verdade dessa categoria vindos de gastosDoMes quando disponíveis (ex: idas ao mercado tal, delivery tal); comparar como a distribuição de gastos entre os dois mudou desse mês pro mês passado usando mesPassado.porPessoa (ex: 'em relação a Agosto, vocês equilibraram melhor quem paga o quê').",
          "Fale no PLURAL ('vocês', 'o gasto de vocês') só quando o insight for de fato sobre algo dos dois juntos (um total combinado, uma caixinha, uma comparação entre eles). Ao falar de algo específico de UMA pessoa (um gasto dela, uma categoria em que ela pesou mais que a outra), use o nome dela no singular — nunca generalize pro casal algo que pertence só a uma pessoa.",
          "Em pelo menos um dos " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " insights (não em todos), pode soltar um comentário carinhoso ou de parceria, já que são um casal cuidando do orçamento juntos — sem exagerar no clichê.",
          "Se o resumo trouxer o campo transferenciasEntreOsDoisEsseMes com alguma transferência de verdade, comente sobre isso com naturalidade em pelo menos um insight (ex: quem ajudou quem naquele mês), sem julgamento. Mas se esse campo vier dizendo que NÃO houve nenhuma transferência esse mês, NUNCA comente sobre essa ausência — não é um dado relevante nem um sinal de nada (nem bom, nem ruim), então simplesmente ignore esse campo por completo e escolha outro ângulo pro insight.",
        ]
      : ["Fale diretamente com " + nomePessoa + ", no singular ('você')."];

    const promptSistema = regrasComuns
      .concat(regrasPessoa)
      .concat(regrasImersao)
      .concat(regrasTom)
      .concat(["Responda SOMENTE com o array JSON de " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " objetos, nada além disso — sem crases, sem a palavra json antes. Cada objeto deve ter somente titulo, texto e tipo."])
      .join(" ");

    const corpo = {
      contents: [
        { role: "user", parts: [{ text: promptSistema + "\n\nResumo em JSON:\n" + JSON.stringify(resumo || {}) }] },
      ],
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 2400,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          minItems: QUANTIDADE_INSIGHTS_POR_PEDIDO,
          maxItems: QUANTIDADE_INSIGHTS_POR_PEDIDO,
          items: {
            type: "OBJECT",
            properties: {
              titulo: { type: "STRING" },
              texto: { type: "STRING" },
              tipo: { type: "STRING", enum: ["gasto", "ganho", "beneficio", "guardado", "rendimento", "atencao", "comparacao", "planejamento", "geral"] },
            },
            required: ["titulo", "texto", "tipo"],
          },
        },
      },
    };

    if (modoSomentePrompt) return { ok: false, _corpo: corpo };
    if (!apiKey) return { ok: false, error: "Chave do Gemini não configurada." };

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent";
    const opcoesFetch = {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": apiKey },
      payload: JSON.stringify(corpo),
      muteHttpExceptions: true,
    };

    // Gemini pode devolver 503/429 por indisponibilidade momentânea ou limite
    // de taxa. Fazemos retry com espera crescente, mas só nesses erros
    // transitórios; erros de configuração/autorização não ficam esperando.
    const atrasosRetryMs = [1200, 2800, 5200];
    let res = null;
    let status = 0;
    let data = {};
    for (let tentativa = 0; tentativa <= atrasosRetryMs.length; tentativa++) {
      res = UrlFetchApp.fetch(url, opcoesFetch);
      status = res.getResponseCode();
      try { data = JSON.parse(res.getContentText() || "{}"); } catch (errParse) { data = {}; }

      const transitório = [429, 500, 502, 503, 504].indexOf(status) !== -1;
      if (status === 200 || !transitório || tentativa === atrasosRetryMs.length) break;
      Utilities.sleep(atrasosRetryMs[tentativa]);
    }

    if (status !== 200) {
      const msg = (data.error && data.error.message) || ("Erro HTTP " + status + " ao chamar o Gemini.");
      return {
        ok: false,
        error: msg,
        status: status,
        diagnostico: [{ chave: (opcoesModo && opcoesModo.indiceChave) || null, status: status, motivo: msg }],
      };
    }

    const texto =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!texto) {
      return { ok: false, error: "O Gemini não retornou nenhum texto (pode ter sido bloqueado por segurança)." };
    }

    let lista;
    try {
      const parsed = JSON.parse(texto);
      lista = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.insights) ? parsed.insights : null);
    } catch (erroParse) {
      lista = null;
    }

    function normalizarInsightGerado(item) {
      if (!item || typeof item !== "object") return null;
      const titulo = String(item.titulo || "").trim();
      const textoInsight = String(item.texto || "").trim();
      const tiposValidos = ["gasto", "ganho", "beneficio", "guardado", "rendimento", "atencao", "comparacao", "planejamento", "geral"];
      const tipo = tiposValidos.indexOf(String(item.tipo || "").trim().toLowerCase()) !== -1
        ? String(item.tipo).trim().toLowerCase()
        : "geral";
      if (!titulo || !textoInsight) return null;
      return { titulo: titulo.slice(0, 32), texto: textoInsight, tipo: tipo };
    }

    let insightsValidos = Array.isArray(lista) ? lista.map(normalizarInsightGerado).filter(Boolean) : [];

    // Mesmo com responseSchema, nunca confiamos cegamente na quantidade devolvida.
    // Se vier menos que 5, fazemos uma segunda tentativa reforçando a exigência.
    if (insightsValidos.length < QUANTIDADE_INSIGHTS_POR_PEDIDO) {
      try {
        const corpoRetry = JSON.parse(JSON.stringify(corpo));
        corpoRetry.contents[0].parts[0].text += "\n\nATENÇÃO: sua resposta anterior não trouxe 5 objetos válidos. Ignore a resposta anterior e gere AGORA exatamente 5 objetos independentes, cada um com titulo, texto e tipo válidos.";
        const resRetry = UrlFetchApp.fetch(url, Object.assign({}, opcoesFetch, { payload: JSON.stringify(corpoRetry) }));
        const statusRetry = resRetry.getResponseCode();
        let dataRetry = {};
        try { dataRetry = JSON.parse(resRetry.getContentText() || "{}"); } catch (errParseRetry) { dataRetry = {}; }
        if (statusRetry === 200) {
          const textoRetry = dataRetry.candidates && dataRetry.candidates[0] && dataRetry.candidates[0].content && dataRetry.candidates[0].content.parts && dataRetry.candidates[0].content.parts[0] && dataRetry.candidates[0].content.parts[0].text;
          if (textoRetry) {
            try {
              const parsedRetry = JSON.parse(textoRetry);
              const listaRetry = Array.isArray(parsedRetry) ? parsedRetry : (parsedRetry && Array.isArray(parsedRetry.insights) ? parsedRetry.insights : null);
              insightsValidos = Array.isArray(listaRetry) ? listaRetry.map(normalizarInsightGerado).filter(Boolean) : [];
            } catch (errParseRetry2) { insightsValidos = []; }
          }
        }
      } catch (errRetry) {}
    }

    if (insightsValidos.length < QUANTIDADE_INSIGHTS_POR_PEDIDO) {
      return { ok: false, error: "O Gemini não conseguiu devolver os 5 insights completos neste momento." };
    }

    return { ok: true, textos: insightsValidos.slice(0, QUANTIDADE_INSIGHTS_POR_PEDIDO), periodo: periodo || null };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
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
  // O saldo que sobra no fechamento é separado pela origem dos ganhos.
  // Agora cada gasto variável informa se saiu do Saldo ou do Benefício.
  // Gastos fixos continuam saindo do Saldo. Assim, a origem do dinheiro
  // é preservada exatamente, sem precisar fazer rateio proporcional.
  const ganhosOrigemDavi = separarGanhosPorOrigem(dadosDavi.ganhos);
  const ganhosOrigemGabriel = separarGanhosPorOrigem(dadosGabriel.ganhos);
  const saldosProximoDavi = separarSaldoPorOrigem(ganhosOrigemDavi, somaFixosPagos(dadosDavi.gastosFixos), dadosDavi.gastosVariaveis);
  const saldosProximoGabriel = separarSaldoPorOrigem(ganhosOrigemGabriel, somaFixosPagos(dadosGabriel.gastosFixos), dadosGabriel.gastosVariaveis);
  const nomeSaldo = "Saldo " + tituloMes(mes);
  const nomeSaldoBeneficios = "Saldo Beneficios " + tituloMes(mes);
  
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

  // Transporta o saldo positivo do mês que fechou, mantendo a origem.
  if (saldosProximoDavi.ganhos > 0) {
    ganhosProximoDavi.push({ nome: nomeSaldo, valor: saldosProximoDavi.ganhos, data: "", recebido: true });
  }
  if (saldosProximoDavi.beneficios > 0) {
    ganhosProximoDavi.push({ nome: nomeSaldoBeneficios, valor: saldosProximoDavi.beneficios, data: "", recebido: true });
  }
  if (saldosProximoGabriel.ganhos > 0) {
    ganhosProximoGabriel.push({ nome: nomeSaldo, valor: saldosProximoGabriel.ganhos, data: "", recebido: true });
  }
  if (saldosProximoGabriel.beneficios > 0) {
    ganhosProximoGabriel.push({ nome: nomeSaldoBeneficios, valor: saldosProximoGabriel.beneficios, data: "", recebido: true });
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
    return { nome: c.nome, valorObjetivo: c.valorObjetivo, valorGuardado: valorTotalCaixinha(c), rendimentoTotal: 0, valorGuardadoMes: 0, data: c.data || "", icone: c.icone || "" };
  });
  const caixinhasProximoGabriel = dadosGabriel.caixinhas.map(function(c) {
    return { nome: c.nome, valorObjetivo: c.valorObjetivo, valorGuardado: valorTotalCaixinha(c), rendimentoTotal: 0, valorGuardadoMes: 0, data: c.data || "", icone: c.icone || "" };
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
      saldoDaviGanhos: saldosProximoDavi.ganhos,
      saldoDaviBeneficios: saldosProximoDavi.beneficios,
      guardadoDavi: guardadoDavi,
      guardadoDaviMes: guardadoDaviMes,
      rendimentoDavi: rendimentoDavi,
      ganhosGabriel: ganhosGabriel,
      debitosGabriel: debitosGabriel,
      saldoGabriel: saldoGabriel,
      saldoGabrielGanhos: saldosProximoGabriel.ganhos,
      saldoGabrielBeneficios: saldosProximoGabriel.beneficios,
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

function ganhoEhBeneficio(item) {
  return normalizarTexto(item && item.nome).indexOf("beneficio") !== -1;
}

function separarGanhosPorOrigem(lista) {
  return (lista || []).reduce(function (acc, item) {
    if (item.recebido !== true) return acc;
    const valor = Number(item.valor) || 0;
    if (ganhoEhBeneficio(item)) acc.beneficios += valor;
    else acc.ganhos += valor;
    return acc;
  }, { beneficios: 0, ganhos: 0 });
}

function gastoVariavelEhBeneficio(item) {
  return String(item && item.origem || "saldo").toLowerCase() === "beneficio";
}

function separarSaldoPorOrigem(ganhosOrigem, gastosFixosPagos, gastosVariaveis) {
  const beneficios = Number(ganhosOrigem && ganhosOrigem.beneficios) || 0;
  const ganhos = Number(ganhosOrigem && ganhosOrigem.ganhos) || 0;
  const fixos = Number(gastosFixosPagos) || 0;
  const variaveis = (gastosVariaveis || []).filter(function (g) { return g.pago === true && g.lembrete !== true; });
  const gastosBeneficios = variaveis.reduce(function (acc, g) {
    return acc + (gastoVariavelEhBeneficio(g) ? Number(g.valor) || 0 : 0);
  }, 0);
  const gastosSaldo = fixos + variaveis.reduce(function (acc, g) {
    return acc + (!gastoVariavelEhBeneficio(g) ? Number(g.valor) || 0 : 0);
  }, 0);
  return {
    beneficios: Math.max(beneficios - gastosBeneficios, 0),
    ganhos: Math.max(ganhos - gastosSaldo, 0),
  };
}

function ehGanhoRecorrente(nome) {
  const normalizado = normalizarTexto(nome);
  // Saldos transportados são lançamentos de continuidade, não ganhos
  // recorrentes. Em especial, "Saldo Beneficios Agosto" contém a palavra
  // "beneficio", mas jamais deve ser recriado novamente no fechamento seguinte.
  if (normalizado.indexOf("saldo ") === 0) return false;
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
  const origens = sheet.getRange(2, COL_ORIGEM_VARIAVEL, lastRow - 1, 1).getValues(); // P
  const result = [];
  valores.forEach(function (row, i) {
    const nome = row[0];
    if (nome !== "" && nome !== null) {
      result.push({
        nome: String(nome),
        valor: Number(row[1]) || 0,
        tipo: row[2] ? String(row[2]) : "",
        data: formatarDataCelula(row[3]),
        pago: row[4] === true,
        origem: String((origens[i] && origens[i][0]) || "saldo").toLowerCase() === "beneficio" ? "beneficio" : "saldo",
      });
    }
  });
  return result;
}

function saveGastosVariaveis(sheet, rows) {
  const rowsToClear = linhasParaLimpar(sheet, rows);
  sheet.getRange(2, COL_GASTOS_VARIAVEIS, rowsToClear, 5).clearContent();
  sheet.getRange(2, COL_ORIGEM_VARIAVEL, rowsToClear, 1).clearContent();
  if (!rows || rows.length === 0) return;
  const valores = rows.map(function (r) {
    return [r.nome, r.valor, r.tipo || "", r.data || "", r.pago === true];
  });
  const origens = rows.map(function (r) {
    return [String(r.origem || "saldo").toLowerCase() === "beneficio" ? "beneficio" : "saldo"];
  });
  sheet.getRange(2, COL_GASTOS_VARIAVEIS, valores.length, 5).setValues(valores);
  sheet.getRange(2, COL_ORIGEM_VARIAVEL, origens.length, 1).setValues(origens);
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
  // Agora lê 7 colunas: Q, R, S, T, U, V, W
  const values = sheet.getRange(2, COL_GUARDADO, lastRow - 1, 7).getValues(); 
  const result = [];
  values.forEach(function (row) {
    if (row[0] !== "" && row[0] !== null) {
      result.push({
        nome: String(row[0]),
        valorObjetivo: Number(row[1]) || 0,
        valorGuardado: Number(row[2]) || 0,
        rendimentoTotal: Number(row[3]) || 0, // Coluna S
        valorGuardadoMes: Number(row[4]) || 0, // Coluna T
        data: formatarDataCelula(row[5]), // Coluna U
        icone: row[6] ? String(row[6]).trim() : "" // Coluna V
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
    iconCategorias: lerCategoriasIcones(),
  };
}

function linhasParaLimpar(sheet, novasLinhas) {
  const lastRow = Math.max(sheet.getLastRow() - 1, 0);
  const novas = novasLinhas ? novasLinhas.length : 0;
  return Math.max(lastRow, novas) + MARGEM_LIMPEZA;
}

function saveCaixinhasBlock(sheet, rows) {
  const rowsToClear = linhasParaLimpar(sheet, rows);
  sheet.getRange(2, COL_GUARDADO, rowsToClear, 7).clearContent(); // Limpa Q:W, incluindo prazo e ícone
  if (!rows || rows.length === 0) return;
  const values = rows.map(function (r) {
    return [r.nome, r.valorObjetivo, r.valorGuardado, r.rendimentoTotal || 0, r.valorGuardadoMes || 0, r.data || "", r.icone || ""];
  });
  sheet.getRange(2, COL_GUARDADO, values.length, 7).setValues(values);
}

/**
 * MIGRAÇÃO ÚNICA DO LAYOUT ANTIGO (P:V = caixinhas, W = origem)
 * para o novo layout (P = origem, Q:W = caixinhas).
 *
 * Execute esta função UMA VEZ no editor do Apps Script, depois de atualizar
 * o código. Ela move os valores e a formatação das colunas antigas para as
 * novas posições e preserva a origem que estava em W.
 */
function migrarLayoutOrigemParaP() {
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty("CAIXA_LAYOUT_ORIGEM_P_MIGRADO") === "1") {
    return { ok: true, mensagem: "O layout já foi migrado anteriormente. Nenhuma alteração foi feita." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomes = [SHEETS.davi, SHEETS.gabriel];

  nomes.forEach(function (nomeAba) {
    const sheet = ss.getSheetByName(nomeAba);
    if (!sheet) return;

    const ultimaLinha = Math.max(sheet.getLastRow(), 1);

    // Guarda os dados antigos antes de qualquer alteração.
    const origemAntiga = sheet.getRange(1, 23, ultimaLinha, 1).getValues(); // W
    const caixinhasAntigas = sheet.getRange(1, 16, ultimaLinha, 7).getValues(); // P:V

    // Guarda larguras para que P:V mantenham o mesmo tamanho visual após a mudança.
    const largurasAntigas = [];
    for (let col = 16; col <= 22; col++) {
      largurasAntigas.push(sheet.getColumnWidth(col));
    }
    const larguraOrigemAntiga = sheet.getColumnWidth(23); // W

    // Primeiro move apenas a formatação, enquanto P:V e W ainda estão intactos.
    sheet.getRange(1, 23, ultimaLinha, 1).copyTo(
      sheet.getRange(1, 16, ultimaLinha, 1),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );
    sheet.getRange(1, 16, ultimaLinha, 7).copyTo(
      sheet.getRange(1, 17, ultimaLinha, 7),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );

    // Novo layout: P = origem; Q:W = antigo P:V.
    sheet.getRange(1, 17, ultimaLinha, 7).setValues(caixinhasAntigas);
    sheet.getRange(1, 16, ultimaLinha, 1).setValues(origemAntiga);

    // Mantém as larguras das antigas caixinhas em Q:W e a largura de W antigo em P.
    sheet.setColumnWidth(16, larguraOrigemAntiga);
    for (let i = 0; i < 7; i++) {
      sheet.setColumnWidth(17 + i, largurasAntigas[i]);
    }
  });

  SpreadsheetApp.flush();
  props.setProperty("CAIXA_LAYOUT_ORIGEM_P_MIGRADO", "1");
  return { ok: true, mensagem: "Layout migrado: P = origem; Q:W = caixinhas." };
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
