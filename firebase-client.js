/* CAIXA — Firebase / Firestore / Firebase AI Logic
 * Banco, autenticação e IA do Caixa. Não depende de Google Apps Script.
 * SDK modular carregado diretamente pelo navegador para manter o projeto
 * GitHub Pages sem build obrigatório.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  writeBatch,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Compatibilidade global: os backups precisam estar disponíveis também no console.
// Os wrappers são criados antes da inicialização do Firebase para evitar ReferenceError
// mesmo quando o módulo ainda está carregando ou quando o navegador mantém cache.
if (typeof window.criarBackupFirebase !== "function") {
  window.criarBackupFirebase = async (...args) => {
    await (window.CAIXA_FIREBASE_READY || Promise.resolve());
    const fn = window.CAIXA_FIREBASE?.criarBackupFirebase;
    if (typeof fn !== "function") throw new Error("Firebase ainda não terminou de carregar.");
    return fn(...args);
  };
}
if (typeof window.listarBackupsFirebase !== "function") {
  window.listarBackupsFirebase = async (...args) => {
    await (window.CAIXA_FIREBASE_READY || Promise.resolve());
    const fn = window.CAIXA_FIREBASE?.listarBackupsFirebase;
    if (typeof fn !== "function") throw new Error("Firebase ainda não terminou de carregar.");
    return fn(...args);
  };
}
if (typeof window.restaurarBackupFirebase !== "function") {
  window.restaurarBackupFirebase = async (...args) => {
    await (window.CAIXA_FIREBASE_READY || Promise.resolve());
    const fn = window.CAIXA_FIREBASE?.restaurarBackupFirebase;
    if (typeof fn !== "function") throw new Error("Firebase ainda não terminou de carregar.");
    return fn(...args);
  };
}

const cfg = window.CAIXA_FIREBASE_CONFIG || {};
if (!cfg.apiKey || cfg.apiKey.includes("COLE_")) {
  console.warn("CAIXA: configure firebase-config.js antes de usar o banco Firebase.");
  window.CAIXA_FIREBASE_READY = Promise.resolve(null);
} else {
  const app = initializeApp(cfg);

  // O Firebase AI Logic usa o proxy oficial do Firebase para falar com o Gemini.
  // Nenhuma chave do Gemini fica exposta no código do aplicativo.
  // Em localhost, o Firebase exige o provedor de depuração durante o desenvolvimento.
  // Em produção (GitHub Pages), o reCAPTCHA Enterprise continua sendo usado normalmente.
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (isLocalhost) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  let appCheck = null;
  if (cfg.appCheckRecaptchaKey && !String(cfg.appCheckRecaptchaKey).includes("COLE_")) {
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(cfg.appCheckRecaptchaKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      console.warn("CAIXA: não foi possível iniciar o App Check.", err);
    }
  }

  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  const provider = new GoogleAuthProvider();
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  let currentUser = null;
  let authResolve;
  let authReject;
  window.CAIXA_FIREBASE_READY = new Promise((resolve, reject) => {
    authResolve = resolve;
    authReject = reject;
  });

  function escPessoa(pessoa) {
    return ["davi", "gabriel"].includes(String(pessoa).toLowerCase()) ? String(pessoa).toLowerCase() : "davi";
  }
  function perfilRef(uid, pessoa) {
    return doc(db, "users", uid, "profiles", escPessoa(pessoa));
  }
  function configRef(uid) { return doc(db, "users", uid, "config", "app"); }
  function historicoRef(uid) { return doc(db, "users", uid, "historico", "principal"); }
  function respostaJson(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  }
  function hojeISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function normalizarTexto(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
  function ganhoEhBeneficio(item) {
    if (String(item?.origem || "").toLowerCase() === "beneficio") return true;
    if (String(item?.origem || "").toLowerCase() === "saldo") return false;
    return normalizarTexto(item?.nome).includes("beneficio");
  }
  function ehGanhoComMes(nome) {
    const n = normalizarTexto(nome);
    const meses = [
      "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
    ];
    return meses.some(m => new RegExp(`(^|\\s)${m}(\\s|$)`, "i").test(n));
  }
  function ehGanhoRecorrente(nome) {
    const n = normalizarTexto(nome);
    if (ehGanhoComMes(nome)) return false;
    return ["salario", "refeicao", "beneficio"].some(t => n.includes(t));
  }
  function somaRecebidos(lista) { return (lista || []).reduce((a,i) => a + (i?.recebido === true ? Number(i.valor)||0 : 0), 0); }
  function somaPagos(lista) { return (lista || []).reduce((a,i) => a + (i?.pago === true ? Number(i.valor)||0 : 0), 0); }
  function ehCaixinhaLancamento(nome) { return typeof nome === "string" && nome.indexOf("Guardado: ") === 0; }
  function somaVariaveisReais(lista) { return (lista || []).reduce((a,i) => a + (!ehCaixinhaLancamento(i?.nome) && i?.pago === true && i?.lembrete !== true ? Number(i.valor)||0 : 0),0); }
  function totalCaixinha(c) { return (Number(c?.valorGuardado)||0)+(Number(c?.rendimentoTotal)||0)+(Number(c?.valorGuardadoMes)||0); }
  function somaCampo(lista,campo) { return (lista||[]).reduce((a,i)=>a+(Number(i?.[campo])||0),0); }
  function separarGanhos(lista) {
    return (lista||[]).reduce((a,i)=>{
      if(i?.recebido!==true || ehGanhoComMes(i?.nome))return a;
      const v=Number(i.valor)||0;
      ganhoEhBeneficio(i)?a.beneficios+=v:a.ganhos+=v;
      return a;
    },{beneficios:0,ganhos:0});
  }
  // Fonte única para os valores exibidos no card de Saldo disponível.
  // O fechamento usa exatamente esta mesma conta, evitando que a cerimônia
  // ou o backend reconstruam o saldo com uma fórmula diferente da tela.
  function calcularSaldosDisponiveis(dados) {
    const ganhos = Array.isArray(dados?.ganhos) ? dados.ganhos : [];
    const fixos = Array.isArray(dados?.gastosFixos) ? dados.gastosFixos : [];
    const variaveis = Array.isArray(dados?.gastosVariaveis) ? dados.gastosVariaveis : [];
    const caixinhas = Array.isArray(dados?.caixinhas) ? dados.caixinhas : [];

    const ganhosPorOrigem = ganhos.reduce((acc, item) => {
      if (item?.recebido !== true) return acc;
      const valor = Number(item?.valor) || 0;
      if (ganhoEhBeneficio(item)) acc.beneficios += valor;
      else acc.ganhos += valor;
      return acc;
    }, { beneficios: 0, ganhos: 0 });

    const fixosPagos = fixos.reduce((acc, item) =>
      acc + (item?.pago === true ? Number(item?.valor) || 0 : 0), 0);

    let gastosVariaveisBeneficio = 0;
    let gastosVariaveisSaldo = 0;
    for (const item of variaveis) {
      const real = !ehCaixinhaLancamento(item?.nome);
      if (!real || item?.pago !== true || item?.lembrete === true) continue;
      const valor = Number(item?.valor) || 0;
      if (String(item?.origem || "saldo").toLowerCase() === "beneficio") gastosVariaveisBeneficio += valor;
      else gastosVariaveisSaldo += valor;
    }

    const guardadoNoMes = caixinhas.reduce((acc, item) =>
      acc + (Number(item?.valorGuardadoMes) || 0), 0);

    const beneficio = ganhosPorOrigem.beneficios - gastosVariaveisBeneficio;
    const saldoConta = ganhosPorOrigem.ganhos - fixosPagos - gastosVariaveisSaldo - guardadoNoMes;
    return {
      ganhosPorOrigem,
      fixosPagos,
      gastosVariaveisBeneficio,
      gastosVariaveisSaldo,
      guardadoNoMes,
      beneficio,
      saldoConta,
      total: beneficio + saldoConta,
    };
  }

  function separarSaldo(orig, fixosPagos, variaveis) {
    let variaveisSaldo=0;
    (variaveis||[]).forEach(i=>{ if(i?.pago===true && i?.lembrete!==true && !ehCaixinhaLancamento(i?.nome) && String(i?.origem||"saldo").toLowerCase()!=="beneficio") variaveisSaldo+=Number(i.valor)||0; });
    const totalPagos = (Number(fixosPagos)||0) + variaveisSaldo;
    return { ganhos: Math.max(0,(Number(orig.ganhos)||0)-totalPagos), beneficios: Math.max(0,Number(orig.beneficios)||0) };
  }
  function proximaDataMesmoDia(dataStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataStr||""));
    if(!m)return "";
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    d.setMonth(d.getMonth()+1);
    const p=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function proximoFixo(item) {
    if(!item)return null;
    const out={...item};
    const p=String(item.parcela||"").trim();
    if(p){
      const m=/^(\d+)\s*\/\s*(\d+)$/.exec(p);
      if(m){
        const n=Number(m[1]), total=Number(m[2]);
        if(n>=total)return null;
        out.parcela=`${n+1}/${total}`;
      }
    }
    out.data=proximaDataMesmoDia(item.data);
    out.pago=false;
    return out;
  }
  function categoriasDoMes(dados) {
    const mapa={};
    const add=(i)=>{if(i?.pago!==true||ehCaixinhaLancamento(i?.nome)||i?.lembrete===true)return;const c=String(i.tipo||"Outros").trim()||"Outros";mapa[c]=(mapa[c]||0)+(Number(i.valor)||0);};
    (dados.gastosFixos||[]).forEach(add);(dados.gastosVariaveis||[]).forEach(add);return mapa;
  }
  function tituloMes(m){return ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"][m-1]||"";}
  function mesSeguinte(m,a){return m===12?{mes:1,ano:a+1}:{mes:m+1,ano:a};}
  function mergeAmbos(a,b){
    return {
      ganhos:[...(a.ganhos||[]).map(x=>({...x,pessoa:"davi"})),...(b.ganhos||[]).map(x=>({...x,pessoa:"gabriel"}))],
      gastosFixos:[...(a.gastosFixos||[]).map(x=>({...x,pessoa:"davi"})),...(b.gastosFixos||[]).map(x=>({...x,pessoa:"gabriel"}))],
      gastosVariaveis:[...(a.gastosVariaveis||[]).map(x=>({...x,pessoa:"davi"})),...(b.gastosVariaveis||[]).map(x=>({...x,pessoa:"gabriel"}))],
      caixinhas:[...(a.caixinhas||[]).map(x=>({...x,pessoa:"davi"})),...(b.caixinhas||[]).map(x=>({...x,pessoa:"gabriel"}))],
      categorias:a.categorias||b.categorias||[], iconCategorias:a.iconCategorias||b.iconCategorias||[], iconNomes:a.iconNomes||b.iconNomes||{}, temasConfig:a.temasConfig||b.temasConfig||null,
      iaConfig:a.iaConfig||b.iaConfig||null, faturas:Array.isArray(a.faturas)?a.faturas:[],
      mesAtual:a.mesAtual, anoAtual:a.anoAtual,
      configDavi:{mesAtual:a.mesAtual,anoAtual:a.anoAtual}, configGabriel:{mesAtual:b.mesAtual,anoAtual:b.anoAtual},
    };
  }
  async function lerPerfil(uid,pessoa){
    const [snap,cfgSnap]=await Promise.all([getDoc(perfilRef(uid,pessoa)),getDoc(configRef(uid))]);
    const d=snap.exists()?snap.data():{}; const c=cfgSnap.exists()?cfgSnap.data():{};
    return {...d,
      // Configurações globais pertencem ao documento /config/app. Elas são
      // compartilhadas pelos dois perfis e, por isso, têm prioridade sobre
      // cópias antigas que possam existir dentro do perfil.
      categorias:c.categorias||d.categorias||[],
      iconCategorias:c.iconCategorias||d.iconCategorias||[],
      iconNomes:c.iconNomes||d.iconNomes||{},
      temasConfig:c.temasConfig||null,
      iaConfig:c.iaConfig||null,
      faturas:Array.isArray(c.faturas)?c.faturas:[],
    };
  }
  async function lerHistorico(uid){
    const [h,c,d,g]=await Promise.all([getDoc(historicoRef(uid)),getDoc(configRef(uid)),getDoc(perfilRef(uid,"davi")),getDoc(perfilRef(uid,"gabriel"))]);
    const hv=h.exists()?h.data():{};const cv=c.exists()?c.data():{};
    const dv=d.exists()?d.data():{},gv=g.exists()?g.data():{};
    return {ok:true,anos:Array.isArray(hv.anos)?hv.anos:[],mesAtual:Number(dv.mesAtual)||Number(cv.mesDavi)||1,anoAtual:Number(dv.anoAtual)||Number(cv.anoDavi)||new Date().getFullYear(),configDavi:{mesAtual:Number(dv.mesAtual)||Number(cv.mesDavi)||1,anoAtual:Number(dv.anoAtual)||Number(cv.anoDavi)||new Date().getFullYear()},configGabriel:{mesAtual:Number(gv.mesAtual)||Number(cv.mesGabriel)||1,anoAtual:Number(gv.anoAtual)||Number(cv.anoGabriel)||new Date().getFullYear()}};
  }
  async function fecharMes(uid,body){
    const pessoa=escPessoa(body.pessoa),mes=Number(body.mes),ano=Number(body.ano),next=mesSeguinte(mes,ano);
    if(Number(body.mes)<1||Number(body.mes)>12||!ano)throw new Error("Mês ou ano inválido para fechamento");
    return runTransaction(db, async tx=>{
      const pref=perfilRef(uid,pessoa), href=historicoRef(uid); const ps=await tx.get(pref), hs=await tx.get(href);
      const dados=ps.exists()?ps.data():{}; if(Number(dados.mesAtual)!==mes||Number(dados.anoAtual)!==ano)throw new Error(`O mês informado não é o mês atual de ${pessoa}.`);
      const ganhos=somaRecebidos(dados.ganhos),debitos=somaPagos(dados.gastosFixos)+somaVariaveisReais(dados.gastosVariaveis);
      const saldos=calcularSaldosDisponiveis(dados),saldo=saldos.total;
      const guardado=(dados.caixinhas||[]).reduce((a,c)=>a+totalCaixinha(c),0),guardadoMes=somaCampo(dados.caixinhas,"valorGuardadoMes"),rendimento=somaCampo(dados.caixinhas,"rendimentoTotal"),categorias=categoriasDoMes(dados);
      const hv=hs.exists()?hs.data():{};const anos=Array.isArray(hv.anos)?structuredClone(hv.anos):[];let bloco=anos.find(x=>Number(x.ano)===ano);if(!bloco){bloco={ano,meses:[]};anos.push(bloco);}
      let m=bloco.meses.find(x=>Number(x.mes)===mes);if(!m){m={mes,nome:tituloMes(mes)};bloco.meses.push(m);}const suf=pessoa==="davi"?"Davi":"Gabriel";
      m[`ganhos${suf}`]=ganhos;m[`debitos${suf}`]=-debitos;m[`saldo${suf}`]=saldo;m[`guardado${suf}`]=guardado;m[`guardado${suf}Mes`]=guardadoMes;m[`categorias${suf}`]=categorias;m[`rendimento${suf}`]=rendimento;
      const ganhosProx=[];(dados.ganhos||[]).forEach(g=>{
        if(g.recebido===false||ehGanhoRecorrente(g.nome)){
          const ganhoProx={nome:g.nome,valor:g.valor,data:proximaDataMesmoDia(g.data),recebido:false};
          if(g.origem!==undefined&&g.origem!==null&&g.origem!=="")ganhoProx.origem=g.origem;
          if(g.tipo!==undefined&&g.tipo!==null&&g.tipo!=="")ganhoProx.tipo=g.tipo;
          ganhosProx.push(ganhoProx);
        }
      });

      // O saldo que sobrou no encerramento vira um GANHO recebido no novo mês.
      // Assim ele aparece normalmente no fluxo de ganhos e volta a participar
      // do cálculo do Saldo disponível. Não usamos apenas campos auxiliares
      // de saldo inicial: o usuário deve enxergar esse dinheiro como saldo
      // carregado do mês anterior.
      if (saldos.saldoConta > 0) {
        ganhosProx.push({
          nome: `Saldo ${tituloMes(mes)}`,
          valor: Number(saldos.saldoConta.toFixed(2)),
          data: "",
          recebido: true,
          origem: "saldo",
          tipo: "saldo_anterior"
        });
      }
      if (saldos.beneficio > 0) {
        ganhosProx.push({
          nome: `Saldo Beneficios ${tituloMes(mes)}`,
          valor: Number(saldos.beneficio.toFixed(2)),
          data: "",
          recebido: true,
          origem: "beneficio",
          tipo: "saldo_anterior"
        });
      }
      const fixos=(dados.gastosFixos||[]).map(proximoFixo).filter(Boolean);
      const variaveis=(dados.gastosVariaveis||[]).filter(g=>g?.pago===false);
      const caixinhas=(dados.caixinhas||[]).map(c=>({nome:c.nome,valorObjetivo:c.valorObjetivo,valorGuardado:totalCaixinha(c),rendimentoTotal:0,valorGuardadoMes:0,data:c.data||"",icone:c.icone||""}));
      tx.set(pref,{...dados,ganhos:ganhosProx,gastosFixos:fixos,gastosVariaveis:variaveis,caixinhas,
        saldoInicialConta:0,
        saldoInicialBeneficio:0,
        mesAtual:next.mes,anoAtual:next.ano},{merge:false});
      tx.set(href,{anos},{merge:true});
      return {ok:true,fechado:{mes,ano,pessoa,ganhos,debitos,saldo,saldoGanhos:saldos.ganhos,saldoBeneficios:saldos.beneficios,guardado,guardadoMes,rendimento},pessoa,mesAtual:next.mes,anoAtual:next.ano,configDavi:pessoa==="davi"?{mesAtual:next.mes,anoAtual:next.ano}:undefined,configGabriel:pessoa==="gabriel"?{mesAtual:next.mes,anoAtual:next.ano}:undefined};
    });
  }

  function nomeGanhoDivisaoLocal(devedor, nomeOriginal) {
    return `A receber de ${devedor === "davi" ? "Davi" : "Gabriel"}: ${String(nomeOriginal || "").trim()}`;
  }
  function encontrarGanhoDivisaoLocal(lista, devedor, nomeOriginal, valor, data) {
    const esperado = nomeGanhoDivisaoLocal(devedor, nomeOriginal);
    const candidatos = (lista || []).map((item, idx) => ({item, idx})).filter(({item}) => {
      if (String(item?.nome || "") !== esperado) return false;
      if (Math.abs((Number(item?.valor)||0) - (Number(valor)||0)) > 0.009) return false;
      return !data || !item.data || String(item.data).slice(0,10) === String(data).slice(0,10);
    });
    return candidatos.length ? candidatos[candidatos.length - 1] : null;
  }
  async function dividirCompraFirestore(uid, body) {
    const categoria = body.categoria === "fixos" ? "gastosFixos" : body.categoria === "variaveis" ? "gastosVariaveis" : null;
    if (!categoria) throw new Error("Categoria inválida para divisão");
    const valorTotal = Number(body.valorTotal);
    if (!(valorTotal > 0)) throw new Error("Valor inválido para divisão");
    const tipo = String(body.tipo || "");
    const data = String(body.data || "");
    const pago = body.pago !== false;
    const quemPagouTudo = body.quemPagouTudo === "davi" || body.quemPagouTudo === "gabriel" ? body.quemPagouTudo : null;
    const nome = String(body.nome || "").trim();
    if (!nome) throw new Error("Nome da compra obrigatório");
    const metade = Math.round((valorTotal / 2) * 100) / 100;

    return runTransaction(db, async tx => {
      const rd = perfilRef(uid,"davi"), rg = perfilRef(uid,"gabriel");
      const [sd, sg] = await Promise.all([tx.get(rd), tx.get(rg)]);
      const d = sd.exists() ? sd.data() : {};
      const g = sg.exists() ? sg.data() : {};
      const ld = [...(d[categoria] || [])], lg = [...(g[categoria] || [])];
      const base = {tipo, data, origem:"saldo"};
      let itemDavi, itemGabriel;
      if (quemPagouTudo) {
        const devedor = quemPagouTudo === "davi" ? "gabriel" : "davi";
        const itemPagador = {...base,nome,valor:valorTotal,pago:true};
        const itemDevedor = pago ? {...base,nome,valor:metade,pago:true} : {...base,nome:`${nome} (deve pra ${quemPagouTudo === "davi" ? "Davi" : "Gabriel"})`,valor:metade,pago:false};
        if (quemPagouTudo === "davi") { itemDavi=itemPagador; itemGabriel=itemDevedor; }
        else { itemGabriel=itemPagador; itemDavi=itemDevedor; }
      } else {
        itemDavi={...base,nome,valor:metade,pago}; itemGabriel={...base,nome,valor:metade,pago};
      }
      ld.push(itemDavi); lg.push(itemGabriel);

      let gd = [...(d.ganhos || [])], gg = [...(g.ganhos || [])];
      if (quemPagouTudo) {
        const devedor = quemPagouTudo === "davi" ? "gabriel" : "davi";
        const nomeGanho = nomeGanhoDivisaoLocal(devedor, nome);
        const ganho = {nome:nomeGanho,valor:metade,data:data || hojeISO(),recebido:!!pago,tipo};
        if (quemPagouTudo === "davi") gd.push(ganho); else gg.push(ganho);
      }
      tx.set(rd,{...d,[categoria]:ld,ganhos:gd},{merge:false});
      tx.set(rg,{...g,[categoria]:lg,ganhos:gg},{merge:false});
      return {ok:true,davi:{[categoria]:ld,ganhos:gd},gabriel:{[categoria]:lg,ganhos:gg}};
    });
  }

  async function atualizarGanhoDivisaoFirestore(uid, body) {
    const credor = escPessoa(body.pessoa), devedor = escPessoa(body.devedor);
    if (credor === devedor) throw new Error("Credor e devedor devem ser pessoas diferentes");
    const valor = Number(body.valor), nomeOriginal = String(body.nomeOriginal || "").trim(), data = String(body.data || "");
    if (!(valor > 0) || !nomeOriginal) throw new Error("Dados inválidos para ganho da divisão");
    const ref = perfilRef(uid,credor);
    return runTransaction(db, async tx => {
      const snap = await tx.get(ref); const dados = snap.exists()?snap.data():{}; const ganhos=[...(dados.ganhos||[])];
      const achado = encontrarGanhoDivisaoLocal(ganhos,devedor,nomeOriginal,valor,data);
      if (!achado && body.criarSeNaoEncontrar !== true) return {ok:true,atualizado:false,ganhos};
      if (achado) achado.item.recebido = !!body.recebido;
      else ganhos.push({nome:nomeGanhoDivisaoLocal(devedor,nomeOriginal),valor,data:data||hojeISO(),recebido:!!body.recebido,tipo:String(body.tipo||"")});
      tx.set(ref,{...dados,ganhos},{merge:false});
      return {ok:true,atualizado:true,ganhos};
    });
  }

  async function sincronizarGanhoCorrespondenteFixoFirestore(uid, body) {
    const devedor = escPessoa(body.pessoa), credor = devedor === "davi" ? "gabriel" : "davi";
    const nome = String(body.nome || "").trim(), valor = Number(body.valor), data = String(body.data || "");
    const ref = perfilRef(uid,credor);
    return runTransaction(db, async tx => {
      const snap=await tx.get(ref); const dados=snap.exists()?snap.data():{}; const ganhos=[...(dados.ganhos||[])];
      const nomeN=normalizarTexto(nome), dataN=data.slice(0,10);
      const candidatos=ganhos.map((item,idx)=>({item,idx})).filter(({item})=>normalizarTexto(item.nome)===nomeN && Math.abs((Number(item.valor)||0)-valor)<=0.009 && (item.recebido===true)!==!!body.recebido);
      if(!candidatos.length)return {ok:true,atualizado:false,ganhos};
      candidatos.sort((a,b)=>{
        const da=String(a.item.data||"").slice(0,10), dbb=String(b.item.data||"").slice(0,10);
        const dist=(x)=>dataN && /^\d{4}-\d{2}-\d{2}$/.test(x)?Math.abs(new Date(`${x}T00:00:00`)-new Date(`${dataN}T00:00:00`)):Number.MAX_SAFE_INTEGER;
        return dist(da)-dist(dbb)||a.idx-b.idx;
      });
      candidatos[0].item.recebido=!!body.recebido;
      tx.set(ref,{...dados,ganhos},{merge:false});
      return {ok:true,atualizado:true,ganhos};
    });
  }

  async function atualizarCategoriasFirestore(uid, categorias, operacao = {}) {
    const lista = Array.isArray(categorias) ? categorias : [];
    const nomes = new Set(lista.map(c => String(c?.nome || "").trim()).filter(Boolean));
    if (!nomes.size) throw new Error("Mantenha pelo menos uma categoria.");
    if ([...nomes].some(n => n.length > 60)) throw new Error("O nome da categoria é muito longo.");
    if (nomes.size !== lista.length) throw new Error("Existem categorias repetidas.");
    const de = String(operacao?.renomearDe || "").trim();
    const para = String(operacao?.renomearPara || "").trim();
    const excluir = String(operacao?.excluirNome || "").trim();
    const fallback = nomes.has("Outro") ? "Outro" : lista[0].nome;

    return runTransaction(db, async tx => {
      const [sd,sg,sc] = await Promise.all([
        tx.get(perfilRef(uid,"davi")),
        tx.get(perfilRef(uid,"gabriel")),
        tx.get(configRef(uid))
      ]);
      const d = sd.exists()?sd.data():{}, g = sg.exists()?sg.data():{}, c = sc.exists()?sc.data():{};
      const atualizarLista = (listaItens) => (Array.isArray(listaItens)?listaItens:[]).map(item => {
        if (!item || typeof item !== "object") return item;
        const out = {...item};
        if (de && para && String(out.tipo||"") === de) out.tipo = para;
        if (excluir && String(out.tipo||"") === excluir) out.tipo = fallback;
        return out;
      });
      const novoD = {...d,
        gastosFixos:atualizarLista(d.gastosFixos),
        gastosVariaveis:atualizarLista(d.gastosVariaveis)
      };
      const novoG = {...g,
        gastosFixos:atualizarLista(g.gastosFixos),
        gastosVariaveis:atualizarLista(g.gastosVariaveis)
      };
      tx.set(perfilRef(uid,"davi"),novoD,{merge:false});
      tx.set(perfilRef(uid,"gabriel"),novoG,{merge:false});
      tx.set(configRef(uid),{categorias:lista},{merge:true});
      return {ok:true,categorias:lista};
    });
  }

  async function request({method="POST",body}){
    await window.CAIXA_FIREBASE_READY;
    if(!currentUser) return respostaJson({ok:false,error:"Faça login para usar o Caixa."},401);
    const uid=currentUser.uid;
    if(method==="GET") return get({pessoa:body?.pessoa||"davi"});
    const action=body?.action;
    if(action==="fecharMes") return respostaJson(await fecharMes(uid,body));
    if(action==="dividirCompra") return respostaJson(await dividirCompraFirestore(uid,body));
    if(action==="atualizarGanhoDivisao") return respostaJson(await atualizarGanhoDivisaoFirestore(uid,body));
    if(action==="sincronizarGanhoCorrespondenteFixo") return respostaJson(await sincronizarGanhoCorrespondenteFixoFirestore(uid,body));
    if(action==="saveConfig"){
      const patch = body?.payload && typeof body.payload === "object" ? body.payload : {};
      const permitidos = ["categorias","iconCategorias","iconNomes","temasConfig","iaConfig","faturas"];
      const limpo = {};
      for (const chave of permitidos) {
        if (Object.prototype.hasOwnProperty.call(patch, chave)) limpo[chave] = patch[chave];
      }
      if (Object.prototype.hasOwnProperty.call(limpo,"categorias") && !Array.isArray(limpo.categorias)) throw new Error("Categorias inválidas.");
      if (Object.prototype.hasOwnProperty.call(limpo,"faturas") && !Array.isArray(limpo.faturas)) throw new Error("Faturas inválidas.");
      if (Object.prototype.hasOwnProperty.call(limpo,"iaConfig") && limpo.iaConfig !== null && typeof limpo.iaConfig !== "object") throw new Error("Configuração da IA inválida.");
      await setDoc(configRef(uid), limpo, {merge:true});
      return respostaJson({ok:true});
    }
    if(action==="saveCategorias"){
      const categorias = Array.isArray(body?.payload?.categorias) ? body.payload.categorias : [];
      const renomearDe = String(body?.payload?.renomearDe || "").trim();
      const renomearPara = String(body?.payload?.renomearPara || "").trim();
      const excluirNome = String(body?.payload?.excluirNome || "").trim();
      return respostaJson(await atualizarCategoriasFirestore(uid, categorias, {renomearDe,renomearPara,excluirNome}));
    }
    if(action==="transferir"){
      const de=escPessoa(body.de),para=escPessoa(body.para),valor=Number(body.valor);if(de===para||!valor||valor<=0)throw new Error("Transferência inválida");
      const hoje=hojeISO(),desc=String(body.nome||"").trim()||"Transferência";
      let returnData={deData:null,paraData:null};
      await runTransaction(db,async tx=>{const rd=perfilRef(uid,de),rp=perfilRef(uid,para),sd=await tx.get(rd),sp=await tx.get(rp),dd=sd.exists()?sd.data():{},dp=sp.exists()?sp.data():{};const vd=[...(dd.gastosVariaveis||[])];vd.push({nome:"Transferência p/ "+(para==="davi"?"Davi":"Gabriel")+": "+desc,valor,tipo:String(body.tipo||""),data:hoje,pago:true,origem:"saldo"});const gp=[...(dp.ganhos||[])];gp.push({nome:"Transferência de "+(de==="davi"?"Davi":"Gabriel")+": "+desc,valor,data:hoje,recebido:true});tx.set(rd,{...dd,gastosVariaveis:vd},{merge:false});tx.set(rp,{...dp,ganhos:gp},{merge:false});returnData={deData:{...dd,gastosVariaveis:vd},paraData:{...dp,ganhos:gp}};});
      return respostaJson({ok:true,de,para,valor,de:returnData.deData,para:returnData.paraData,deData:returnData.deData,paraData:returnData.paraData});
    }
    const pessoa=escPessoa(body?.pessoa);
    if (!["saveGanhos","saveGastosFixos","saveGastosVariaveis","saveCaixinhas"].includes(action)) {
      return respostaJson({ ok:false, error:`Ação Firebase não suportada: ${action || "(vazia)"}` }, 400);
    }
    const field={saveGanhos:"ganhos",saveGastosFixos:"gastosFixos",saveGastosVariaveis:"gastosVariaveis",saveCaixinhas:"caixinhas"}[action];
    await setDoc(perfilRef(uid,pessoa),{[field]:Array.isArray(body.payload)?body.payload:[]},{merge:true});
    return respostaJson({ok:true});
  }
  async function get({pessoa}){
    await window.CAIXA_FIREBASE_READY;if(!currentUser)return respostaJson({ok:false,error:"Faça login para usar o Caixa."},401);const uid=currentUser.uid;
    if(pessoa==="historico")return respostaJson(await lerHistorico(uid));
    if(pessoa==="ambos"){const [a,b]=await Promise.all([lerPerfil(uid,"davi"),lerPerfil(uid,"gabriel")]);return respostaJson(mergeAmbos(a,b));}
    const d=await lerPerfil(uid,pessoa);return respostaJson({ok:true,...d});
  }
  const MODELO_IA_CAIXA = "gemini-3.8-flash";
  const TIPOS_INSIGHT_CAIXA = ["gasto", "ganho", "beneficio", "guardado", "rendimento", "atencao", "comparacao", "planejamento", "geral"];

  function textoTomIAFirebase(pessoa, iaConfig) {
    if (pessoa === "gabriel") return String(iaConfig?.tomGabriel || "").trim();
    if (pessoa === "ambos") return String(iaConfig?.tomAmbos || "natural, equilibrado e conversado, falando com vocês dois").trim();
    return String(iaConfig?.tomDavi || "").trim();
  }

  function textoImersaoIAFirebase(pessoa, iaConfig) {
    const comum = Array.isArray(iaConfig?.ambos) ? iaConfig.ambos : [];
    if (pessoa === "gabriel") return [...(Array.isArray(iaConfig?.gabriel) ? iaConfig.gabriel : []), ...comum];
    if (pessoa === "ambos") return comum;
    return [...(Array.isArray(iaConfig?.davi) ? iaConfig.davi : []), ...comum];
  }

  async function modeloIA() {
    await window.CAIXA_FIREBASE_READY;
    return getGenerativeModel(ai, { model: MODELO_IA_CAIXA });
  }

  async function gerarComRetry(model, prompt, generationConfig, tentativas = 3) {
    let ultimoErro = null;
    for (let tentativa = 0; tentativa < tentativas; tentativa++) {
      try {
        const instancia = getGenerativeModel(ai, {
          model: MODELO_IA_CAIXA,
          generationConfig,
        });
        return await instancia.generateContent(prompt);
      } catch (err) {
        ultimoErro = err;
        if (tentativa < tentativas - 1) await new Promise(resolve => setTimeout(resolve, 900 * (tentativa + 1)));
      }
    }
    throw ultimoErro || new Error("Falha ao chamar a IA.");
  }

  function promptGastarIA(pessoa, resumo, iaConfig) {
    const tom = textoTomIAFirebase(pessoa, iaConfig) || "natural, direto e conversado.";
    const imersao = textoImersaoIAFirebase(pessoa, iaConfig);
    const limite = Number(resumo?.mesAtual?.limiteDeGastoProjetado) || 0;
    const beneficio = Number(resumo?.mesAtual?.beneficioDisponivel) || 0;
    return [
      "Você é o assistente financeiro do app Caixa e está respondendo quanto a pessoa ainda pode gastar.",
      "Responda de forma muito curta e natural, normalmente uma única frase para cada campo.",
      "Não explique a conta, não liste saldo atual, entradas futuras ou contas reservadas. A pessoa quer a margem de gasto.",
      "Use exclusivamente os números de mesAtual no resumo. Para saldo em conta, use limiteDeGastoProjetado. Para benefício, use beneficioDisponivel.",
      "IMPORTANTE: limiteDeGastoProjetado NÃO é dinheiro disponível agora. É o que ficará livre DEPOIS de considerar as obrigações pendentes deste mês. Se positivo, não diga 'você tem X'; diga que, depois de pagar o que falta, sobram X para gastar. Se zero, diga que não sobra margem. Se negativo, diga que não pode gastar mais nada e ainda falta dinheiro para cobrir as obrigações.",
      "Seja humano, direto e sem tom de sermão. Não julgue os gastos.",
      `PERSONA/TOM: ${tom}`,
      `IMERSÃO PESSOAL: ${imersao.length ? imersao.join(" | ") : "nenhuma informação adicional."}`,
      "Valores monetários devem permanecer completos no padrão R$ 0,00. Para destacar margem positiva use {{+R$ 0,00}}; para falta use {{-R$ 0,00}}. Não invente outros valores monetários.",
      "Retorne SOMENTE JSON no formato {\"respostas\":{\"saldo\":\"...\",\"beneficio\":\"...\"}}.",
      `limiteDeGastoProjetado=${limite}. beneficioDisponivel=${beneficio}.`,
      "Resumo completo em JSON:", JSON.stringify(resumo || {})
    ].join("\n");
  }

  async function gerarRespostaGastarIA({ pessoa = "davi", periodo = null, resumo = {} } = {}) {
    await window.CAIXA_FIREBASE_READY;
    if (!currentUser) return { ok: false, error: "Faça login para usar a IA." };
    const iaConfig = await getIAConfig();
    const generationConfig = {
      responseMimeType: "application/json",
      responseSchema: Schema.object({
        properties: {
          respostas: Schema.object({
            properties: {
              saldo: Schema.string(),
              beneficio: Schema.string(),
            },
          }),
        },
      }),
    };
    try {
      const result = await gerarComRetry(await modeloIA(), promptGastarIA(String(pessoa).toLowerCase(), resumo, iaConfig), generationConfig, 3);
      const texto = result?.response?.text?.() || "";
      const parsed = JSON.parse(texto);
      const respostas = parsed?.respostas;
      if (!respostas) throw new Error("Resposta da IA sem o formato esperado.");
      return { ok: true, respostas: { saldo: String(respostas.saldo || "").trim(), beneficio: String(respostas.beneficio || "").trim() }, periodo };
    } catch (err) {
      console.warn("CAIXA — erro na IA de gasto:", err);
      return { ok: false, error: String(err?.message || err) };
    }
  }

  function promptInsightsIA(pessoa, resumo, modo, iaConfig) {
    const tom = textoTomIAFirebase(pessoa, iaConfig) || "natural, direto e conversado.";
    const imersao = textoImersaoIAFirebase(pessoa, iaConfig);
    const regras = [
      "Você é o assistente financeiro do app Caixa, um app pessoal de controle de gastos. Seja específico aos números recebidos; nunca dê conselho financeiro genérico.",
      "Lançamentos cujo nome começa por 'Guardado: ' são transferências para caixinhas e NÃO são gastos de consumo. Nunca trate esses lançamentos como despesa.",
      "valorGuardado das caixinhas é o total acumulado real guardado até agora. Não some rendimentoTotal ou guardadoNesseMes novamente ao valorGuardado.",
      "Diferencie sempre mês em andamento de histórico e diferencie contas futuras de contas que vencem neste mês. Gastos futuros não reduzem a margem de gasto do mês atual.",
      "Quando comentar planejamento futuro, considere também ganhosFuturos; um gasto futuro isolado não é uma dívida líquida.",
      "Use saldoAtualEmConta, saldoProjetadoComEntradas, contasAbertasTotal e limiteDeGastoProjetado para falar de disponibilidade. Para 'quanto ainda posso gastar', prefira limiteDeGastoProjetado.",
      "aindaAPagarFixosEsseMes e aindaAPagarVariaveisEsseMes são exclusivamente pendências deste mês. Não some gastosFuturos a elas.",
      "Use categorias, lançamentos, caixinhas, recebimentos e comparações somente quando os dados realmente sustentarem a observação. Nunca invente números, nomes ou causas.",
      "Os insights devem ser curtos, em português do Brasil, com 1 a 3 frases e no máximo aproximadamente 280 caracteres no texto.",
      "Cada insight deve ter um ângulo diferente. Evite repetir a mesma informação ou recomendação.",
      "Cada objeto deve ter somente titulo, texto e tipo. titulo deve ser curto e em CAIXA ALTA. tipo deve ser um destes: gasto, ganho, beneficio, guardado, rendimento, atencao, comparacao, planejamento ou geral.",
      `TOM/PERSONA: ${tom}`,
      `CONTEXTO PESSOAL: ${imersao.length ? imersao.join(" | ") : "nenhum."}`,
      "Use o contexto pessoal apenas quando houver ligação natural com os dados; não force referências pessoais.",
    ];
    if (modo === "statusFinanceiro") {
      regras.push("MODO STATUS FINANCEIRO: o primeiro insight será mostrado diretamente no card de status. Ele deve ser uma observação curta de 1 a 2 frases explicando por que o status calculado pelo aplicativo faz sentido. Não crie outro status, não faça lista e não dê uma recomendação no primeiro insight.");
    } else if (modo === "economia") {
      regras.push("MODO DICAS: produza dicas de verdade, concretas e imediatamente aplicáveis aos números atuais. Evite frases genéricas como 'gaste com sabedoria', 'organize suas finanças' ou 'economize mais'. Uma dica pode aproveitar uma situação boa, não precisa apontar um problema.");
    } else {
      regras.push("Escolha os ângulos mais úteis do resumo atual, priorizando mudanças relevantes, pendências do mês, categorias, caixinhas, recebimentos e planejamento quando existirem dados para isso.");
    }
    return regras.join("\n") + "\n\nResumo em JSON:\n" + JSON.stringify(resumo || {});
  }

  async function gerarInsightIA({ pessoa = "davi", periodo = null, resumo = {}, modo = "" } = {}) {
    await window.CAIXA_FIREBASE_READY;
    if (!currentUser) return { ok: false, error: "Faça login para usar a IA." };
    const iaConfig = await getIAConfig();
    const generationConfig = {
      responseMimeType: "application/json",
      responseSchema: Schema.array({
        minItems: 5,
        maxItems: 5,
        items: Schema.object({
          properties: {
            titulo: Schema.string(),
            texto: Schema.string(),
            tipo: Schema.enumString({ enum: TIPOS_INSIGHT_CAIXA }),
          },
        }),
      }),
    };
    const prompt = promptInsightsIA(String(pessoa).toLowerCase(), resumo, modo, iaConfig);
    try {
      let result = await gerarComRetry(await modeloIA(), prompt, generationConfig, 3);
      let texto = result?.response?.text?.() || "";
      let lista = JSON.parse(texto);
      if (!Array.isArray(lista) || lista.length < 5) {
        result = await gerarComRetry(await modeloIA(), `${prompt}\n\nATENÇÃO: gere exatamente 5 objetos válidos e independentes agora.`, generationConfig, 2);
        texto = result?.response?.text?.() || "";
        lista = JSON.parse(texto);
      }
      const textos = (Array.isArray(lista) ? lista : []).map(item => {
        if (!item || typeof item !== "object") return null;
        const titulo = String(item.titulo || "").trim();
        const textoInsight = String(item.texto || "").trim();
        const tipoBruto = String(item.tipo || "geral").trim().toLowerCase();
        if (!titulo || !textoInsight) return null;
        return { titulo: titulo.slice(0, 32), texto: textoInsight, tipo: TIPOS_INSIGHT_CAIXA.includes(tipoBruto) ? tipoBruto : "geral" };
      }).filter(Boolean).slice(0, 5);
      if (textos.length < 5) throw new Error("A IA não devolveu os 5 insights completos.");
      return { ok: true, textos, periodo };
    } catch (err) {
      console.warn("CAIXA — erro na IA de insights:", err);
      return { ok: false, error: String(err?.message || err) };
    }
  }

  async function getIAConfig(){
    await window.CAIXA_FIREBASE_READY;
    if(!currentUser) return null;
    const snap=await getDoc(configRef(currentUser.uid));
    if(!snap.exists()) return null;
    const data=snap.data()||{};
    return data.iaConfig || null;
  }
  async function loginGoogle(){return signInWithPopup(auth,provider);}
  async function testarFirestore() {
    await window.CAIXA_FIREBASE_READY;
    if (!currentUser) throw new Error("Faça login antes de testar o Firestore.");
    const uid = currentUser.uid;
    const ref = doc(db, "users", uid, "_testes", "conexao");
    const payload = {
      ok: true,
      mensagem: "Conexão Firestore funcionando",
      atualizadoEm: new Date().toISOString()
    };
    await setDoc(ref, payload, { merge: true });
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("O Firestore aceitou a gravação, mas não retornou o documento.");
    const dados = snap.data() || {};
    if (dados.ok !== true) throw new Error("O documento de teste retornou dados inesperados.");
    return { ok: true, path: `users/${uid}/_testes/conexao`, dados };
  }
  async function apagarTesteFirestore() {
    await window.CAIXA_FIREBASE_READY;
    if (!currentUser) throw new Error("Faça login antes de limpar o teste.");
    const ref = doc(db, "users", currentUser.uid, "_testes", "conexao");
    const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
    await deleteDoc(ref);
    return { ok: true };
  }
  function resumoFirestoreDados(dados) {
    const pessoa = (d = {}) => ({
      ganhos: Array.isArray(d.ganhos) ? d.ganhos.length : 0,
      gastosFixos: Array.isArray(d.gastosFixos) ? d.gastosFixos.length : 0,
      gastosVariaveis: Array.isArray(d.gastosVariaveis) ? d.gastosVariaveis.length : 0,
      caixinhas: Array.isArray(d.caixinhas) ? d.caixinhas.length : 0,
      mesAtual: Number(d.mesAtual) || null,
      anoAtual: Number(d.anoAtual) || null,
    });
    return {
      davi: pessoa(dados?.davi),
      gabriel: pessoa(dados?.gabriel),
      anosHistorico: Array.isArray(dados?.historico?.anos) ? dados.historico.anos.length : 0,
    };
  }

  function resumosIguais(a, b) {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  }

  async function verificarMigracaoFirebase() {
    await window.CAIXA_FIREBASE_READY;
    if (!currentUser) throw new Error("Faça login antes de verificar a migração.");
    const uid = currentUser.uid;
    const [dSnap, gSnap, hSnap, estadoSnap] = await Promise.all([
      getDoc(perfilRef(uid, "davi")),
      getDoc(perfilRef(uid, "gabriel")),
      getDoc(historicoRef(uid)),
      getDoc(doc(db, "users", uid, "migracoes", "estado")),
    ]);
    const dados = {
      davi: dSnap.exists() ? dSnap.data() : {},
      gabriel: gSnap.exists() ? gSnap.data() : {},
      historico: hSnap.exists() ? hSnap.data() : { anos: [] },
    };
    return {
      ok: true,
      migrado: estadoSnap.exists() && estadoSnap.data()?.status === "concluida",
      resumo: resumoFirestoreDados(dados),
      estado: estadoSnap.exists() ? estadoSnap.data() : null,
    };
  }

  function backupsCollectionRef(uid) {
    return collection(db, "users", uid, "backups");
  }

  function backupIdAgora() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }

  async function criarBackupFirebase() {
    await window.CAIXA_FIREBASE_READY;
    if (!currentUser) throw new Error("Faça login antes de criar um backup.");
    const uid = currentUser.uid;
    const [dSnap, gSnap, hSnap, cSnap] = await Promise.all([
      getDoc(perfilRef(uid, "davi")),
      getDoc(perfilRef(uid, "gabriel")),
      getDoc(historicoRef(uid)),
      getDoc(configRef(uid)),
    ]);

    const id = backupIdAgora();
    const backup = {
      criadoEm: new Date().toISOString(),
      tipo: "manual",
      versao: 1,
      davi: dSnap.exists() ? dSnap.data() : {},
      gabriel: gSnap.exists() ? gSnap.data() : {},
      historico: hSnap.exists() ? hSnap.data() : { anos: [] },
      config: cSnap.exists() ? cSnap.data() : {},
    };

    const ref = doc(db, "users", uid, "backups", id);
    await setDoc(ref, backup, { merge: false });

    return {
      ok: true,
      id,
      path: `users/${uid}/backups/${id}`,
      criadoEm: backup.criadoEm,
      resumo: resumoFirestoreDados(backup),
    };
  }

  async function listarBackupsFirebase() {
    await window.CAIXA_FIREBASE_READY;
    if (!currentUser) throw new Error("Faça login antes de listar os backups.");
    const uid = currentUser.uid;
    const snap = await getDocs(backupsCollectionRef(uid));
    const backups = snap.docs.map(s => {
      const d = s.data() || {};
      return {
        id: s.id,
        criadoEm: d.criadoEm || null,
        tipo: d.tipo || "manual",
        versao: d.versao || 1,
        path: `users/${uid}/backups/${s.id}`,
        resumo: resumoFirestoreDados(d),
      };
    });
    backups.sort((a, b) => String(b.criadoEm || b.id).localeCompare(String(a.criadoEm || a.id)));
    return { ok: true, backups, total: backups.length };
  }

  async function restaurarBackupFirebase(id) {
    await window.CAIXA_FIREBASE_READY;
    if (!currentUser) throw new Error("Faça login antes de restaurar um backup.");
    const uid = currentUser.uid;
    const backupId = String(id || "").trim();
    if (!backupId) throw new Error("Informe o ID do backup que deseja restaurar.");

    const backupRef = doc(db, "users", uid, "backups", backupId);
    const backupSnap = await getDoc(backupRef);
    if (!backupSnap.exists()) throw new Error(`Backup não encontrado: ${backupId}`);
    const backup = backupSnap.data() || {};

    const davi = backup.davi || {};
    const gabriel = backup.gabriel || {};
    const historico = backup.historico || { anos: [] };
    const config = backup.config || {};

    // A restauração substitui os quatro documentos principais pelo estado salvo
    // no backup, sem apagar o próprio backup. Assim ele pode ser reutilizado.
    const batch = writeBatch(db);
    batch.set(perfilRef(uid, "davi"), davi, { merge: false });
    batch.set(perfilRef(uid, "gabriel"), gabriel, { merge: false });
    batch.set(historicoRef(uid), historico, { merge: false });
    batch.set(configRef(uid), config, { merge: false });
    await batch.commit();

    return {
      ok: true,
      id: backupId,
      path: `users/${uid}/backups/${backupId}`,
      criadoEm: backup.criadoEm || null,
      resumo: resumoFirestoreDados(backup),
      restauradoEm: new Date().toISOString(),
    };
  }

  async function importarDados({fonte,historico,iaConfig,resumoMigracao}) {
    await window.CAIXA_FIREBASE_READY;
    if(!currentUser) throw new Error("Faça login antes de importar os dados.");
    const uid=currentUser.uid;
    const d=fonte?.davi||{}, g=fonte?.gabriel||{};
    const config={
      categorias:d.categorias||g.categorias||[],
      iconCategorias:d.iconCategorias||g.iconCategorias||[],
      iconNomes:d.iconNomes||g.iconNomes||{},
      temasConfig:d.temasConfig||g.temasConfig||null,
      mesDavi:Number(d.mesAtual)||Number(historico?.configDavi?.mesAtual)||1,
      anoDavi:Number(d.anoAtual)||Number(historico?.configDavi?.anoAtual)||new Date().getFullYear(),
      mesGabriel:Number(g.mesAtual)||Number(historico?.configGabriel?.mesAtual)||1,
      anoGabriel:Number(g.anoAtual)||Number(historico?.configGabriel?.anoAtual)||new Date().getFullYear(),
      iaConfig:iaConfig||null,
    };
    const backupRef = doc(db, "users", uid, "migracoes", "planilha-antes-da-migracao");
    const estadoRef = doc(db, "users", uid, "migracoes", "estado");
    const backupSnap = await getDoc(backupRef);
    const estadoSnap = await getDoc(estadoRef);
    if (estadoSnap.exists() && estadoSnap.data()?.status === "concluida") {
      return { ok:true, jaMigrado:true, backupPath:`users/${uid}/migracoes/planilha-antes-da-migracao`, resumo:estadoSnap.data()?.resumoDestino||resumoMigracao||null };
    }
    if (backupSnap.exists()) {
      const backupAtual = backupSnap.data() || {};
      const resumoBackup = backupAtual.resumo || null;
      if (resumoBackup && resumoMigracao && !resumosIguais(resumoBackup, resumoMigracao)) {
        throw new Error("Já existe um backup de migração diferente neste usuário. A importação foi interrompida para evitar sobrescrever dados.");
      }
    }

    const backup = {
      criadoEm: backupSnap.exists() ? (backupSnap.data()?.criadoEm || new Date().toISOString()) : new Date().toISOString(),
      origem: "Google Sheets via Apps Script",
      resumo: resumoMigracao || null,
      davi: d,
      gabriel: g,
      historico: { anos: Array.isArray(historico?.anos) ? historico.anos : [] },
      config: config,
    };

    // Primeiro preservamos a fonte em um documento de backup. Depois gravamos
    // os quatro documentos de destino em um único batch, evitando estados
    // intermediários entre Davi/Gabriel/config/histórico.
    const batch = writeBatch(db);
    batch.set(backupRef, backup, { merge: false });
    batch.set(perfilRef(uid,"davi"),{...d},{merge:false});
    batch.set(perfilRef(uid,"gabriel"),{...g},{merge:false});
    batch.set(configRef(uid),config,{merge:true});
    batch.set(historicoRef(uid),{anos:Array.isArray(historico?.anos)?historico.anos:[]},{merge:true});
    await batch.commit();

    const verificado = await verificarMigracaoFirebase();
    if (!verificado.ok || !resumosIguais(verificado.resumo, resumoMigracao)) {
      throw new Error("A gravação terminou, mas a conferência dos dados no Firestore não bateu com a fonte. Nenhuma nova tentativa automática foi feita.");
    }

    const estadoFinal = {
      status: "concluida",
      concluidaEm: new Date().toISOString(),
      origem: "Snapshot da planilha",
      resumoFonte: resumoMigracao || null,
      resumoDestino: verificado.resumo,
      backupPath: `users/${uid}/migracoes/planilha-antes-da-migracao`,
    };
    await setDoc(estadoRef, estadoFinal, { merge:false });
    return {ok:true, jaMigrado:false, backupPath:estadoFinal.backupPath, resumo:verificado.resumo};
  }
  window.CAIXA_FIREBASE={app,auth,db,request,get,getIAConfig,gerarInsightIA,gerarRespostaGastarIA,loginGoogle,signOut,importarDados,verificarMigracaoFirebase,testarFirestore,apagarTesteFirestore,criarBackupFirebase,listarBackupsFirebase,restaurarBackupFirebase,calcularSaldosDisponiveis};
  window.criarBackupFirebase = criarBackupFirebase;
  window.listarBackupsFirebase = listarBackupsFirebase;
  window.restaurarBackupFirebase = restaurarBackupFirebase;
  window.CAIXA_FIREBASE_CONFIG_STATUS = { ok: true, projectId: cfg.projectId };
  function montarLogin() {
    if (document.getElementById("caixaFirebaseLogin")) return;
    const el = document.createElement("div");
    el.id = "caixaFirebaseLogin";
    el.innerHTML = `<div class="caixa-firebase-login-card">
      <div class="caixa-firebase-login-mark" aria-hidden="true"><span>Caixa</span></div>
      <div class="caixa-firebase-login-kicker">CONTROLE FINANCEIRO</div>
      <h2>Bem-vindo de volta</h2>
      <p class="caixa-firebase-login-lead">Entre para continuar no seu Caixa.</p>
      <button type="button" id="caixaFirebaseGoogle" class="btn caixa-firebase-google">
        <svg class="caixa-google-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M21.35 12.27c0-.73-.07-1.43-.2-2.1H12v3.98h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.27Z"/>
          <path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7Z"/>
          <path fill="#FBBC05" d="M6.54 13.78A5.86 5.86 0 0 1 6.23 12c0-.62.11-1.22.31-1.78V7.69H3.3A9.73 9.73 0 0 0 2.26 12c0 1.57.38 3.05 1.04 4.31l3.24-2.53Z"/>
          <path fill="#EA4335" d="M12 6.19c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.84 3.27 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 7.91 9.46 6.19 12 6.19Z"/>
        </svg>
        <span>Continuar com Google</span>
      </button>
      <div class="caixa-firebase-login-foot">
        <span class="caixa-login-lock" aria-hidden="true">⌁</span>
        Seus dados ficam protegidos pela sua conta Google.
      </div>
      <span id="caixaFirebaseLoginErro" class="caixa-firebase-login-erro" role="alert"></span>
    </div>`;
    document.body.appendChild(el);
    el.querySelector("#caixaFirebaseGoogle")?.addEventListener("click", async () => {
      const btn = el.querySelector("#caixaFirebaseGoogle");
      const erro = el.querySelector("#caixaFirebaseLoginErro");
      btn.disabled = true; btn.classList.add("caixa-firebase-login-google-loading"); btn.textContent = "Entrando…"; erro.textContent = "";
      try { await loginGoogle(); location.reload(); }
      catch (e) { erro.textContent = "Não foi possível entrar agora. Tente novamente."; btn.disabled = false; btn.classList.remove("caixa-firebase-login-google-loading"); btn.innerHTML = `<svg class="caixa-google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.73-.07-1.43-.2-2.1H12v3.98h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.27Z"/><path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7Z"/><path fill="#FBBC05" d="M6.54 13.78A5.86 5.86 0 0 1 6.23 12c0-.62.11-1.22.31-1.78V7.69H3.3A9.73 9.73 0 0 0 2.26 12c0 1.57.38 3.05 1.04 4.31l3.24-2.53Z"/><path fill="#EA4335" d="M12 6.19c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.84 3.27 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 7.91 9.46 6.19 12 6.19Z"/></svg><span>Continuar com Google</span>`; }
    });
  }
  onAuthStateChanged(auth,user=>{
    currentUser=user||null;
    document.documentElement.classList.toggle("firebase-authenticated",!!user);
    if (!user) montarLogin();
    else document.getElementById("caixaFirebaseLogin")?.remove();
    document.dispatchEvent(new CustomEvent(user?"caixa:firebase-logged-in":"caixa:firebase-logged-out",{detail:{user}}));
    if(authResolve){authResolve(user);authResolve=null;authReject=null;}
  });
}
