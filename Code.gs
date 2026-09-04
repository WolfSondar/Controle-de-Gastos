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

// Nome de exibição de cada pessoa (usado nas descrições de transferência e no insight de IA).
const PESSOA_NOME = {
  davi: "Davi",
  gabriel: "Gabriel",
  ambos: "o casal (Davi e Gabriel)",
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
    // Ação só de leitura (não mexe na planilha) — por isso fica antes do
    // bloqueio de "ambos é somente leitura" logo abaixo: no modo Juntos
    // também dá pra pedir um insight, só não dá pra editar lançamentos.
    if (action === "gerarInsightIA") {
      return respond(gerarInsightComGemini(body.pessoa, body.periodo, body.resumo));
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

// Quantos insights pedimos de uma vez pro Gemini. O app guarda esse "estoque"
// no aparelho e vai consumindo um por sincronização — só pede mais quando
// o estoque fica baixo, então a tela quase nunca fica esperando rede.
const QUANTIDADE_INSIGHTS_POR_PEDIDO = 5;

function gerarInsightComGemini(pessoa, periodo, resumo) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPRIEDADE);
    if (!apiKey) {
      return {
        ok: false,
        error: "Chave do Gemini não configurada. Veja o comentário acima de gerarInsightComGemini() no Code.gs.",
      };
    }

    const pessoaCodigo = String(pessoa || "").toLowerCase();
    const ehCasal = pessoaCodigo === "ambos";
    const nomePessoa = PESSOA_NOME[pessoaCodigo] || "a pessoa";

    const regrasComuns = [
      "Você é um assistente financeiro dentro de um app pessoal de controle de gastos chamado Caixa. Seja o mais específico e afiado possível — nunca dê conselho genérico de curso de finanças.",
      "Contexto do app pra você entender os dados do resumo: 'gastos fixos' são despesas recorrentes do mês (aluguel, assinaturas, etc); 'gastos variáveis' são despesas do dia a dia que mudam de mês a mês; 'caixinhas' são potes de dinheiro guardado — o campo valorGuardado de cada caixinha JÁ É o total real guardado até agora (já inclui o que rendeu e o que foi guardado neste mês, então pra saber quanto falta pra meta é só valorObjetivo − valorGuardado, NUNCA some rendimentoTotal ou guardadoNesseMes de novo em cima disso). rendimentoTotal e guardadoNesseMes são só o detalhamento de parte desse total (quanto rendeu / quanto entrou nesse mês especificamente), úteis pra comentar sobre eles isoladamente, mas não são valores a somar ao valorGuardado.",
      "GLOSSÁRIO DAS CATEGORIAS — o nome da categoria sozinho pode enganar, use SEMPRE o significado real abaixo em vez de chutar pelo nome (ex: 'Alimentação' NÃO é a feira/mercado do mês, é gasto pequeno e avulso — não confunda os dois nem fale que uma caiu quando na verdade foi a outra):\n" + textoGlossarioCategorias(),
      "Você vai receber um resumo em JSON com os números de " + nomePessoa + ", em reais (BRL).",
      "O resumo traz vários recortes de tempo — use o que fizer sentido pra cada insight, sem forçar todos: mesAtual (mês em andamento) vs mesPassado (mês imediatamente anterior); mesmoMesAnoPassado (o MESMO mês, um ano antes — ex: Agosto deste ano vs Agosto do ano passado; só existe se já tiver histórico daquele mês) — é diferente de mesPassado, não confunda os dois; e a visão do ano inteiro em anoAtualAteAgora (soma de tudo que já fechou nesse ano mais o mês em andamento) vs anoAnteriorCompleto (o ano anterior fechado). NUNCA escreva um ano fixo/chutado no texto — sempre use o campo 'ano' que vier dentro de cada bloco do resumo, já que o ano de referência muda sozinho conforme o app avança.",
      "Dentro de mesAtual também vêm 'aindaAReceberEsseMes', 'aindaAPagarFixosEsseMes' e 'aindaAPagarVariaveisEsseMes' — são valores já lançados mas ainda pendentes (não confirmados como recebidos/pagos), não são gasto ou ganho perdido. Quando algum desses vier maior que zero, pode ser um bom ângulo pra um dos insights (ex: lembrar quanto ainda falta entrar ou sair do mês) — mas só use se for relevante, não force em todo insight.",
      "Gere um ARRAY JSON com exatamente " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " insights CURTOS (1 a 3 frases cada, no máximo uns 280 caracteres), em português do Brasil.",
      "Cada um dos " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " insights precisa focar em um ÂNGULO DIFERENTE dos dados — por exemplo: maior variação de categoria vs mês passado, variação de categoria ou do total vs o mesmo mês do ano passado (mesmoMesAnoPassado), ritmo/projeção do gasto no mês, quanto ainda está pendente de receber/pagar, progresso de uma caixinha/meta específica, rendimento de algum investimento, comparação entre o peso dos gastos fixos e dos variáveis, como o ano está indo até agora vs o ano passado, ou quanto sobrou disponível. NUNCA repita a mesma informação, a mesma conclusão ou a mesma sugestão em mais de um item.",
      "Seja específico: cite nomes de categorias e de caixinhas de verdade que aparecerem no resumo — não fale de forma genérica ou vaga.",
      "NÃO termine todos os insights com a mesma sugestão ou o mesmo tipo de conselho (por exemplo, não repita algo como 'que tal começar uma reserva' em mais de um item). Só sugira uma ação quando ela realmente fizer sentido pro dado específico daquele insight, e varie sempre a forma de dizer. Vários dos insights nem precisam ter sugestão nenhuma — às vezes só constatar o dado já basta.",
      "Tom leve, direto, específico e motivador — pode ter humor leve quando fizer sentido, sem ironia pesada nem tom de sermão.",
      "Sempre que citar um valor em dinheiro, formate como reais no padrão brasileiro (vírgula decimal, sempre com 2 casas — ex: R$ 5,00 ou R$ 1.234,56) e marque TODO valor com chaves duplas indicando de que tipo ele é, pra cada um aparecer com a mesma cor usada no gráfico histórico do app (Ganhos=verde, Gastos=vermelho, Guardado=amarelo, Rendimento=azul): {{ganho:R$ 5,00}} pra qualquer valor de ganho/recebimento; {{gasto:R$ 5,00}} pra qualquer valor de gasto/despesa (fixo, variável, de uma categoria, pendência a pagar); {{guardado:R$ 5,00}} pra valor ligado a caixinha — quanto já guardou, quanto falta pra bater a meta, o valor da própria meta; {{rendimento:R$ 5,00}} especificamente pro quanto uma caixinha/investimento rendeu. Só use {{+R$ 5,00}} (favorável) ou {{-R$ 5,00}} (desfavorável) pro raro caso de um valor que não seja claramente nenhum dos quatro tipos, como um saldo geral. Exemplo real de frase: \"Você guardou {{guardado:R$ 150,00}} esse mês, seu Rendimento foi de {{rendimento:R$ 12,30}}, mas o Gasto com transporte subiu {{gasto:R$ 80,00}} em relação ao mês passado.\" NUNCA escreva um valor em reais sem um desses marcadores ao redor, e NUNCA deixe de indicar o tipo quando o valor claramente for um dos quatro — isso é o que importa mais, mais do que decidir se é bom ou ruim.",
      "NUNCA use as expressões 'no azul' ou 'no vermelho' pra falar de saldo — os marcadores acima já indicam a cor certa, não precisa de metáfora de cor no texto.",
      "Se algum dado relevante estiver ausente, nulo ou zerado no resumo, apenas ignore-o — não invente número.",
      "Não use markdown, no máximo 1 emoji por insight, e cada item do array deve ser só o texto puro do insight (sem aspas, sem numeração, sem prefixo tipo 'Insight:').",
    ];

    const regrasPessoa = ehCasal
      ? [
          "Você está olhando as finanças combinadas de um casal, Davi e Gabriel. Fale com os dois no PLURAL ('vocês', 'o gasto de vocês', 'a caixinha de vocês') — nunca no singular, nunca isolando só um nome como se fosse uma pessoa só.",
          "Em pelo menos um dos " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " insights (não em todos), pode soltar um comentário carinhoso ou de parceria, já que são um casal cuidando do orçamento juntos — sem exagerar no clichê.",
          "Se o resumo trouxer o campo transferenciasEntreOsDoisEsseMes com alguma transferência de verdade, comente sobre isso com naturalidade em pelo menos um insight (ex: quem ajudou quem naquele mês), sem julgamento. Mas se esse campo vier dizendo que NÃO houve nenhuma transferência esse mês, NUNCA comente sobre essa ausência — não é um dado relevante nem um sinal de nada (nem bom, nem ruim), então simplesmente ignore esse campo por completo e escolha outro ângulo pro insight.",
        ]
      : ["Fale diretamente com " + nomePessoa + ", no singular ('você')."];

    const promptSistema = regrasComuns
      .concat(regrasPessoa)
      .concat(["Responda SOMENTE com o array JSON de " + QUANTIDADE_INSIGHTS_POR_PEDIDO + " strings, nada além disso — sem crases, sem a palavra json antes."])
      .join(" ");

    const corpo = {
      contents: [
        { role: "user", parts: [{ text: promptSistema + "\n\nResumo em JSON:\n" + JSON.stringify(resumo || {}) }] },
      ],
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema: { type: "ARRAY", items: { type: "STRING" } },
      },
    };

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent";
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": apiKey },
      payload: JSON.stringify(corpo),
      muteHttpExceptions: true,
    });

    const status = res.getResponseCode();
    const data = JSON.parse(res.getContentText() || "{}");

    if (status !== 200) {
      const msg = (data.error && data.error.message) || ("Erro HTTP " + status + " ao chamar o Gemini.");
      return { ok: false, error: msg };
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

    if (!lista) {
      return { ok: false, error: "O Gemini não devolveu uma lista de insights no formato esperado." };
    }

    const textos = lista.map(function (t) { return String(t || "").trim(); }).filter(Boolean);
    if (!textos.length) {
      return { ok: false, error: "O Gemini devolveu uma lista de insights vazia." };
    }

    return { ok: true, textos: textos, periodo: periodo || null };
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
