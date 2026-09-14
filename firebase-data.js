import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const PESSOAS = ["davi", "gabriel"];
const COLECOES = ["ganhos", "gastosFixos", "gastosVariaveis", "caixinhas"];
const CONFIG_PADRAO = {
  categorias: null,
  iconCategorias: []
};

function erroAcesso() {
  const error = new Error("CAIXA_FIREBASE_ACCESS_REQUIRED");
  error.code = "CAIXA_FIREBASE_ACCESS_REQUIRED";
  return error;
}

async function contexto() {
  const profile = await (window.CAIXA_PROFILE_READY || Promise.resolve(null));
  const user = window.CAIXA_CURRENT_USER;
  if (!profile || !user?.uid) throw erroAcesso();
  const db = getFirestore(window.CAIXA_FIREBASE_APP);
  return { db, uid: user.uid, profile };
}

function pessoaValida(pessoa) {
  return PESSOAS.includes(String(pessoa || "").toLowerCase());
}

function pessoaRef(db, uid, pessoa) {
  return doc(db, "users", uid, "finance", pessoa);
}

function configRef(db, uid) {
  return doc(db, "users", uid, "config", "geral");
}

function historicoRef(db, uid, ano) {
  return doc(db, "users", uid, "historico", String(ano));
}

function dadosVazios() {
  return { ganhos: [], gastosFixos: [], gastosVariaveis: [], caixinhas: [] };
}

function normalizarDados(data) {
  const base = dadosVazios();
  for (const key of COLECOES) base[key] = Array.isArray(data?.[key]) ? data[key] : [];
  return base;
}

function marcarPessoa(lista, pessoa) {
  return (lista || []).map((item) => ({ ...item, pessoa }));
}

async function getPessoa(pessoa) {
  const { db, uid } = await contexto();
  if (!pessoaValida(pessoa)) throw new Error("Pessoa inválida: " + pessoa);
  const [financeSnap, configSnap] = await Promise.all([
    getDoc(pessoaRef(db, uid, pessoa)),
    getDoc(configRef(db, uid))
  ]);
  const financeiro = normalizarDados(financeSnap.exists() ? financeSnap.data() : {});
  const config = configSnap.exists() ? configSnap.data() : {};
  const agora = new Date();
  const mesAtual = Number(config.mesAtual) || (agora.getMonth() + 1);
  const anoAtual = Number(config.anoAtual) || agora.getFullYear();
  return {
    ...financeiro,
    categorias: config.categorias ?? CONFIG_PADRAO.categorias,
    iconCategorias: Array.isArray(config.iconCategorias) ? config.iconCategorias : CONFIG_PADRAO.iconCategorias,
    mesAtual,
    anoAtual,
    exists: financeSnap.exists()
  };
}

async function get(pessoa = "davi") {
  if (pessoa === "ambos") {
    const [davi, gabriel] = await Promise.all([getPessoa("davi"), getPessoa("gabriel")]);
    return {
      ganhos: marcarPessoa(davi.ganhos, "davi").concat(marcarPessoa(gabriel.ganhos, "gabriel")),
      gastosFixos: marcarPessoa(davi.gastosFixos, "davi").concat(marcarPessoa(gabriel.gastosFixos, "gabriel")),
      gastosVariaveis: marcarPessoa(davi.gastosVariaveis, "davi").concat(marcarPessoa(gabriel.gastosVariaveis, "gabriel")),
      caixinhas: marcarPessoa(davi.caixinhas, "davi").concat(marcarPessoa(gabriel.caixinhas, "gabriel")),
      categorias: davi.categorias || gabriel.categorias || null,
      iconCategorias: davi.iconCategorias?.length ? davi.iconCategorias : (gabriel.iconCategorias || []),
      mesAtual: davi.mesAtual || gabriel.mesAtual || null,
      anoAtual: davi.anoAtual || gabriel.anoAtual || null,
      exists: davi.exists || gabriel.exists
    };
  }
  return getPessoa(pessoa);
}

async function saveCollection(pessoa, action, payload) {
  const { db, uid } = await contexto();
  if (!pessoaValida(pessoa)) throw new Error("Pessoa inválida: " + pessoa);
  const mapa = {
    saveGanhos: "ganhos",
    saveGastosFixos: "gastosFixos",
    saveGastosVariaveis: "gastosVariaveis",
    saveCaixinhas: "caixinhas"
  };
  const field = mapa[action];
  if (!field) throw new Error("Ação desconhecida: " + action);
  if (!Array.isArray(payload)) throw new Error("Dados inválidos para " + field);
  await setDoc(pessoaRef(db, uid, pessoa), {
    [field]: payload,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return { ok: true };
}

async function saveConfig(config = {}) {
  const { db, uid } = await contexto();
  const permitido = {};
  if (Object.prototype.hasOwnProperty.call(config, "mesAtual")) permitido.mesAtual = Number(config.mesAtual) || null;
  if (Object.prototype.hasOwnProperty.call(config, "anoAtual")) permitido.anoAtual = Number(config.anoAtual) || null;
  if (Object.prototype.hasOwnProperty.call(config, "categorias")) permitido.categorias = config.categorias;
  if (Object.prototype.hasOwnProperty.call(config, "iconCategorias")) permitido.iconCategorias = Array.isArray(config.iconCategorias) ? config.iconCategorias : [];
  if (!Object.keys(permitido).length) return { ok: true };
  permitido.updatedAt = serverTimestamp();
  await setDoc(configRef(db, uid), permitido, { merge: true });
  return { ok: true };
}

async function getHistory() {
  const { db, uid } = await contexto();
  const snap = await getDocs(collection(db, "users", uid, "historico"));
  const anos = snap.docs.map((item) => {
    const data = item.data() || {};
    return { ano: Number(data.ano || item.id), meses: Array.isArray(data.meses) ? data.meses.filter((m) => m && Number(m.mes)) : [] };
  }).filter((item) => item.meses.length).sort((a, b) => b.ano - a.ano);
  const configSnap = await getDoc(configRef(db, uid));
  const config = configSnap.exists() ? configSnap.data() : {};
  const agora = new Date();
  return { ok: true, anos, mesAtual: Number(config.mesAtual) || (agora.getMonth() + 1), anoAtual: Number(config.anoAtual) || agora.getFullYear(), exists: snap.docs.length > 0 };
}

async function seedFromLocal(pessoa, data) {
  const payload = normalizarDados(data);
  await Promise.all(COLECOES.map((key) => saveCollection(pessoa, `save${key === "ganhos" ? "Ganhos" : key === "gastosFixos" ? "GastosFixos" : key === "gastosVariaveis" ? "GastosVariaveis" : "Caixinhas"}`, payload[key])));
  if (data?.categorias || data?.iconCategorias || data?.mesAtual || data?.anoAtual) {
    await saveConfig({
      categorias: data.categorias ?? null,
      iconCategorias: data.iconCategorias || [],
      mesAtual: data.mesAtual || null,
      anoAtual: data.anoAtual || null
    });
  }
  return payload;
}

function ehLancamentoCaixinha(nome) {
  return typeof nome === "string" && nome.indexOf("Guardado: ") === 0;
}
function normalizarTexto(str) {
  return String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function ganhoBeneficio(item) {
  const origem = String(item?.origem || "").toLowerCase();
  if (origem === "beneficio") return true;
  if (origem === "saldo") return false;
  return normalizarTexto(item?.nome).includes("beneficio");
}
function ganhoRecorrente(nome) {
  const n = normalizarTexto(nome);
  if (n.indexOf("saldo ") === 0) return false;
  return ["salario", "refeicao", "beneficio"].some((t) => n.includes(t));
}
function totalCaixinha(c) {
  return (Number(c?.valorGuardado) || 0) + (Number(c?.rendimentoTotal) || 0) + (Number(c?.valorGuardadoMes) || 0);
}
function proximaDataMesmoDia(data) {
  const bruto = String(data || "").trim();
  if (!bruto) return "";
  const m = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return bruto;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return bruto;
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function proximoFixo(item) {
  const bruto = String(item?.parcela || "").trim();
  const m = bruto.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return { nome: item.nome, valor: item.valor, tipo: item.tipo || "", data: proximaDataMesmoDia(item.data), parcela: "", pago: false };
  const atual = Number(m[1]), total = Number(m[2]);
  if (!total || total <= 1 || !atual) return { nome: item.nome, valor: item.valor, tipo: item.tipo || "", data: proximaDataMesmoDia(item.data), parcela: "", pago: false };
  if (atual >= total) return null;
  return { nome: item.nome, valor: item.valor, tipo: item.tipo || "", data: proximaDataMesmoDia(item.data), parcela: `${atual + 1}/${total}`, pago: false };
}
function separarSaldoPorOrigem(ganhos, fixos, variaveis) {
  const beneficios = (ganhos || []).filter((g) => g.recebido === true && ganhoBeneficio(g)).reduce((s, g) => s + (Number(g.valor) || 0), 0);
  const ganhosSaldo = (ganhos || []).filter((g) => g.recebido === true && !ganhoBeneficio(g)).reduce((s, g) => s + (Number(g.valor) || 0), 0);
  const vars = (variaveis || []).filter((g) => !ehLancamentoCaixinha(g?.nome) && g.pago === true && g.lembrete !== true);
  const gastosBeneficio = vars.filter(ganhoBeneficio).reduce((s, g) => s + (Number(g.valor) || 0), 0);
  const gastosSaldo = (Number(fixos) || 0) + vars.filter((g) => !ganhoBeneficio(g)).reduce((s, g) => s + (Number(g.valor) || 0), 0);
  return { beneficios: Math.max(beneficios - gastosBeneficio, 0), ganhos: Math.max(ganhosSaldo - gastosSaldo, 0) };
}
function categoriasDoMes(data) {
  const mapa = {};
  const pagos = (data.gastosFixos || []).filter((g) => g.pago === true)
    .concat((data.gastosVariaveis || []).filter((g) => !ehLancamentoCaixinha(g?.nome) && g.pago === true));
  pagos.forEach((g) => {
    const cat = String(g.tipo || "").trim() || "Outros";
    mapa[cat] = (mapa[cat] || 0) + (Number(g.valor) || 0);
  });
  return mapa;
}

async function closeMonth(mes, ano) {
  mes = Number(mes); ano = Number(ano);
  if (!mes || mes < 1 || mes > 12 || !ano) throw new Error("Mês ou ano inválido para fechamento");
  const { db, uid } = await contexto();
  const refs = {
    davi: pessoaRef(db, uid, "davi"),
    gabriel: pessoaRef(db, uid, "gabriel"),
    config: configRef(db, uid),
    historico: historicoRef(db, uid, ano)
  };

  const resultado = await runTransaction(db, async (tx) => {
    const daviSnap = await tx.get(refs.davi);
    const gabrielSnap = await tx.get(refs.gabriel);
    const configSnap = await tx.get(refs.config);
    const historicoSnap = await tx.get(refs.historico);
    const davi = normalizarDados(daviSnap.exists() ? daviSnap.data() : {});
    const gabriel = normalizarDados(gabrielSnap.exists() ? gabrielSnap.data() : {});

    const processar = (data) => {
      const ganhosRecebidos = (data.ganhos || []).filter((g) => g.recebido === true).reduce((s, g) => s + (Number(g.valor) || 0), 0);
      const fixosPagos = (data.gastosFixos || []).filter((g) => g.pago === true).reduce((s, g) => s + (Number(g.valor) || 0), 0);
      const variaveisPagas = (data.gastosVariaveis || []).filter((g) => !ehLancamentoCaixinha(g?.nome) && g.pago === true && g.lembrete !== true).reduce((s, g) => s + (Number(g.valor) || 0), 0);
      const guardado = (data.caixinhas || []).reduce((s, c) => s + totalCaixinha(c), 0);
      const guardadoMes = (data.caixinhas || []).reduce((s, c) => s + (Number(c.valorGuardadoMes) || 0), 0);
      const rendimento = (data.caixinhas || []).reduce((s, c) => s + (Number(c.rendimentoTotal) || 0), 0);
      const ganhosOrigem = separarSaldoPorOrigem(data.ganhos, fixosPagos, data.gastosVariaveis);
      const categorias = categoriasDoMes(data);
      const ganhosProximo = (data.ganhos || []).filter((g) => g.recebido === false || ganhoRecorrente(g.nome)).map((g) => ({ nome: g.nome, valor: g.valor, data: proximaDataMesmoDia(g.data), recebido: false, ...(g.origem ? { origem: g.origem } : {}) }));
      const nomeSaldo = `Saldo ${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(ano, mes - 1, 1)).replace(/^./, (c) => c.toUpperCase())}`;
      const nomeBeneficio = `Saldo Beneficios ${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(ano, mes - 1, 1)).replace(/^./, (c) => c.toUpperCase())}`;
      if (ganhosOrigem.ganhos > 0) ganhosProximo.push({ nome: nomeSaldo, valor: ganhosOrigem.ganhos, data: "", recebido: true });
      if (ganhosOrigem.beneficios > 0) ganhosProximo.push({ nome: nomeBeneficio, valor: ganhosOrigem.beneficios, data: "", recebido: true, origem: "beneficio" });
      const fixosProximo = (data.gastosFixos || []).map(proximoFixo).filter(Boolean);
      const variaveisProximo = (data.gastosVariaveis || []).filter((g) => g.pago === false);
      const caixinhasProximo = (data.caixinhas || []).map((c) => ({ nome: c.nome, valorObjetivo: c.valorObjetivo, valorGuardado: totalCaixinha(c), rendimentoTotal: 0, valorGuardadoMes: 0, data: c.data || "", icone: c.icone || "" }));
      return {
        ganhos: ganhosRecebidos,
        debitos: fixosPagos + variaveisPagas,
        saldo: ganhosRecebidos - fixosPagos - variaveisPagas,
        guardado,
        guardadoMes,
        rendimento,
        categorias,
        ganhosProximo,
        fixosProximo,
        variaveisProximo,
        caixinhasProximo,
        saldoGanhos: ganhosOrigem.ganhos,
        saldoBeneficios: ganhosOrigem.beneficios
      };
    };

    const rd = processar(davi), rg = processar(gabriel);
    const meses = historicoSnap.exists() && Array.isArray(historicoSnap.data()?.meses) ? [...historicoSnap.data().meses] : [];
    const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(ano, mes - 1, 1)).toUpperCase();
    const novoMes = {
      mes, nome: nomeMes,
      ganhosDavi: rd.ganhos, debitosDavi: -rd.debitos, saldoDavi: rd.saldo, guardadoDavi: rd.guardado, guardadoMesDavi: rd.guardadoMes, categoriasDavi: rd.categorias, rendimentoDavi: rd.rendimento,
      ganhosGabriel: rg.ganhos, debitosGabriel: -rg.debitos, saldoGabriel: rg.saldo, guardadoGabriel: rg.guardado, guardadoMesGabriel: rg.guardadoMes, categoriasGabriel: rg.categorias, rendimentoGabriel: rg.rendimento
    };
    const idx = meses.findIndex((m) => Number(m?.mes) === mes);
    if (idx >= 0) meses[idx] = novoMes; else meses.push(novoMes);
    meses.sort((a, b) => Number(a.mes) - Number(b.mes));

    tx.set(refs.historico, { ano, meses, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(refs.davi, { ganhos: rd.ganhosProximo, gastosFixos: rd.fixosProximo, gastosVariaveis: rd.variaveisProximo, caixinhas: rd.caixinhasProximo, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(refs.gabriel, { ganhos: rg.ganhosProximo, gastosFixos: rg.fixosProximo, gastosVariaveis: rg.variaveisProximo, caixinhas: rg.caixinhasProximo, updatedAt: serverTimestamp() }, { merge: true });

    let proximoMes = mes + 1, proximoAno = ano;
    if (proximoMes > 12) { proximoMes = 1; proximoAno = ano + 1; }
    tx.set(refs.config, { mesAtual: proximoMes, anoAtual: proximoAno, updatedAt: serverTimestamp() }, { merge: true });

    return { rd, rg, proximoMes, proximoAno };
  });

  return {
    ok: true,
    fechado: {
      mes, ano,
      ganhosDavi: resultado.rd.ganhos, debitosDavi: resultado.rd.debitos, saldoDavi: resultado.rd.saldo, saldoDaviGanhos: resultado.rd.saldoGanhos, saldoDaviBeneficios: resultado.rd.saldoBeneficios, guardadoDavi: resultado.rd.guardado, guardadoDaviMes: resultado.rd.guardadoMes, rendimentoDavi: resultado.rd.rendimento,
      ganhosGabriel: resultado.rg.ganhos, debitosGabriel: resultado.rg.debitos, saldoGabriel: resultado.rg.saldo, saldoGabrielGanhos: resultado.rg.saldoGanhos, saldoGabrielBeneficios: resultado.rg.saldoBeneficios, guardadoGabriel: resultado.rg.guardado, guardadoGabrielMes: resultado.rg.guardadoMes, rendimentoGabriel: resultado.rg.rendimento
    },
    mesAtual: resultado.proximoMes,
    anoAtual: resultado.proximoAno
  };
}

async function transfer(de, para, nome, valor, tipo = "") {
  const { db, uid } = await contexto();
  if (!pessoaValida(de) || !pessoaValida(para) || de === para) throw new Error("Transferência inválida");
  const hoje = new Date();
  const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const descricao = String(nome || "").trim() || "Transferência";
  const deRef = pessoaRef(db, uid, de), paraRef = pessoaRef(db, uid, para);
  await runTransaction(db, async (tx) => {
    const [deSnap, paraSnap] = await Promise.all([tx.get(deRef), tx.get(paraRef)]);
    const deData = normalizarDados(deSnap.exists() ? deSnap.data() : {});
    const paraData = normalizarDados(paraSnap.exists() ? paraSnap.data() : {});
    deData.gastosVariaveis.push({ nome: `Transferência p/ ${para === "davi" ? "Davi" : "Gabriel"}: ${descricao}`, valor, tipo: tipo || "", data, pago: true });
    paraData.ganhos.push({ nome: `Transferência de ${de === "davi" ? "Davi" : "Gabriel"}: ${descricao}`, valor, data, recebido: true });
    tx.set(deRef, { gastosVariaveis: deData.gastosVariaveis, updatedAt: serverTimestamp() }, { merge: true });
    tx.set(paraRef, { ganhos: paraData.ganhos, updatedAt: serverTimestamp() }, { merge: true });
  });
  return { ok: true };
}

window.CAIXA_FIREBASE_DATA = {
  get,
  getPessoa,
  saveCollection,
  saveConfig,
  getHistory,
  closeMonth,
  transfer,
  seedFromLocal,
  ready: Promise.resolve(true)
};
window.CAIXA_FIREBASE_DATA_READY = Promise.resolve(window.CAIXA_FIREBASE_DATA);
