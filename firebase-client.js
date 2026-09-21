/* CAIXA — Firebase / Firestore
 * Camada de dados. O Google Apps Script continua sendo usado apenas pelas
 * rotinas de IA até a segunda etapa da migração.
 * SDK modular carregado diretamente pelo navegador para manter o projeto
 * GitHub Pages sem build obrigatório.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
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
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const cfg = window.CAIXA_FIREBASE_CONFIG || {};
if (!cfg.apiKey || cfg.apiKey.includes("COLE_")) {
  console.warn("CAIXA: configure firebase-config.js antes de usar o banco Firebase.");
  window.CAIXA_FIREBASE_READY = Promise.resolve(null);
} else {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  const provider = new GoogleAuthProvider();
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
  function ehGanhoRecorrente(nome) {
    const n = normalizarTexto(nome);
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
      if(i?.recebido!==true)return a;
      const v=Number(i.valor)||0;
      ganhoEhBeneficio(i)?a.beneficios+=v:a.ganhos+=v;
      return a;
    },{beneficios:0,ganhos:0});
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
      categorias:a.categorias||b.categorias||[], iconCategorias:a.iconCategorias||b.iconCategorias||[],
      mesAtual:a.mesAtual, anoAtual:a.anoAtual,
      configDavi:{mesAtual:a.mesAtual,anoAtual:a.anoAtual}, configGabriel:{mesAtual:b.mesAtual,anoAtual:b.anoAtual},
    };
  }
  async function lerPerfil(uid,pessoa){
    const [snap,cfgSnap]=await Promise.all([getDoc(perfilRef(uid,pessoa)),getDoc(configRef(uid))]);
    const d=snap.exists()?snap.data():{}; const c=cfgSnap.exists()?cfgSnap.data():{};
    return {...d,categorias:d.categorias||c.categorias||[],iconCategorias:d.iconCategorias||c.iconCategorias||[]};
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
      const ganhos=somaRecebidos(dados.ganhos),debitos=somaPagos(dados.gastosFixos)+somaVariaveisReais(dados.gastosVariaveis),saldo=ganhos-debitos;
      const guardado=(dados.caixinhas||[]).reduce((a,c)=>a+totalCaixinha(c),0),guardadoMes=somaCampo(dados.caixinhas,"valorGuardadoMes"),rendimento=somaCampo(dados.caixinhas,"rendimentoTotal"),categorias=categoriasDoMes(dados);
      const hv=hs.exists()?hs.data():{};const anos=Array.isArray(hv.anos)?structuredClone(hv.anos):[];let bloco=anos.find(x=>Number(x.ano)===ano);if(!bloco){bloco={ano,meses:[]};anos.push(bloco);}
      let m=bloco.meses.find(x=>Number(x.mes)===mes);if(!m){m={mes,nome:tituloMes(mes)};bloco.meses.push(m);}const suf=pessoa==="davi"?"Davi":"Gabriel";
      m[`ganhos${suf}`]=ganhos;m[`debitos${suf}`]=-debitos;m[`saldo${suf}`]=saldo;m[`guardado${suf}`]=guardado;m[`guardado${suf}Mes`]=guardadoMes;m[`categorias${suf}`]=categorias;m[`rendimento${suf}`]=rendimento;
      const orig=separarGanhos(dados.ganhos),saldos=separarSaldo(orig,somaPagos(dados.gastosFixos),dados.gastosVariaveis);
      const ganhosProx=[];(dados.ganhos||[]).forEach(g=>{if(g.recebido===false||ehGanhoRecorrente(g.nome))ganhosProx.push({nome:g.nome,valor:g.valor,data:proximaDataMesmoDia(g.data),recebido:false,origem:g.origem||undefined,tipo:g.tipo||undefined});});
      if(saldos.ganhos>0)ganhosProx.push({nome:"Saldo "+tituloMes(mes),valor:saldos.ganhos,data:"",recebido:true,origem:"saldo"});
      if(saldos.beneficios>0)ganhosProx.push({nome:"Saldo Beneficios "+tituloMes(mes),valor:saldos.beneficios,data:"",recebido:true,origem:"beneficio"});
      const fixos=(dados.gastosFixos||[]).map(proximoFixo).filter(Boolean);
      const variaveis=(dados.gastosVariaveis||[]).filter(g=>g?.pago===false);
      const caixinhas=(dados.caixinhas||[]).map(c=>({nome:c.nome,valorObjetivo:c.valorObjetivo,valorGuardado:totalCaixinha(c),rendimentoTotal:0,valorGuardadoMes:0,data:c.data||"",icone:c.icone||""}));
      tx.set(pref,{...dados,ganhos:ganhosProx,gastosFixos:fixos,gastosVariaveis:variaveis,caixinhas,mesAtual:next.mes,anoAtual:next.ano},{merge:false});
      tx.set(href,{anos},{merge:true});
      return {ok:true,fechado:{mes,ano,pessoa,ganhos,debitos,saldo,saldoGanhos:saldos.ganhos,saldoBeneficios:saldos.beneficios,guardado,guardadoMes,rendimento},pessoa,mesAtual:next.mes,anoAtual:next.ano,configDavi:pessoa==="davi"?{mesAtual:next.mes,anoAtual:next.ano}:undefined,configGabriel:pessoa==="gabriel"?{mesAtual:next.mes,anoAtual:next.ano}:undefined};
    });
  }
  async function request({method="POST",body}){
    await window.CAIXA_FIREBASE_READY;
    if(!currentUser) return respostaJson({ok:false,error:"Faça login para usar o Caixa."},401);
    const uid=currentUser.uid;
    if(method==="GET") return get({pessoa:body?.pessoa||"davi"});
    const action=body?.action;
    if(action==="fecharMes") return respostaJson(await fecharMes(uid,body));
    if(action==="transferir"){
      const de=escPessoa(body.de),para=escPessoa(body.para),valor=Number(body.valor);if(de===para||!valor||valor<=0)throw new Error("Transferência inválida");
      const hoje=hojeISO(),desc=String(body.nome||"").trim()||"Transferência";
      await runTransaction(db,async tx=>{const rd=perfilRef(uid,de),rp=perfilRef(uid,para),sd=await tx.get(rd),sp=await tx.get(rp),dd=sd.exists()?sd.data():{},dp=sp.exists()?sp.data():{};const vd=[...(dd.gastosVariaveis||[])];vd.push({nome:"Transferência p/ "+(para==="davi"?"Davi":"Gabriel")+": "+desc,valor,tipo:"",data:hoje,pago:true,origem:"saldo"});const gp=[...(dp.ganhos||[])];gp.push({nome:"Transferência de "+(de==="davi"?"Davi":"Gabriel")+": "+desc,valor,data:hoje,recebido:true});tx.set(rd,{...dd,gastosVariaveis:vd},{merge:false});tx.set(rp,{...dp,ganhos:gp},{merge:false});});
      return respostaJson({ok:true,de,para,valor});
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
  async function importarDados({fonte,historico,iaConfig,resumoMigracao}) {
    await window.CAIXA_FIREBASE_READY;
    if(!currentUser) throw new Error("Faça login antes de importar os dados.");
    const uid=currentUser.uid;
    const d=fonte?.davi||{}, g=fonte?.gabriel||{};
    const config={
      categorias:d.categorias||g.categorias||[],
      iconCategorias:d.iconCategorias||g.iconCategorias||[],
      mesDavi:Number(d.mesAtual)||Number(historico?.configDavi?.mesAtual)||1,
      anoDavi:Number(d.anoAtual)||Number(historico?.configDavi?.anoAtual)||new Date().getFullYear(),
      mesGabriel:Number(g.mesAtual)||Number(historico?.configGabriel?.mesAtual)||1,
      anoGabriel:Number(g.anoAtual)||Number(historico?.configGabriel?.anoAtual)||new Date().getFullYear(),
      iaConfig:iaConfig||null,
    };
    const backupRef = doc(db, "users", uid, "migracoes", "planilha-antes-da-migracao");
    const backup = {
      criadoEm: new Date().toISOString(),
      origem: "Google Sheets via Apps Script",
      resumo: resumoMigracao || null,
      davi: d,
      gabriel: g,
      historico: { anos: Array.isArray(historico?.anos) ? historico.anos : [] },
      config: config,
    };
    await setDoc(backupRef, backup, { merge: false });
    await Promise.all([
      setDoc(perfilRef(uid,"davi"),{...d},{merge:false}),
      setDoc(perfilRef(uid,"gabriel"),{...g},{merge:false}),
      setDoc(configRef(uid),config,{merge:true}),
      setDoc(historicoRef(uid),{anos:Array.isArray(historico?.anos)?historico.anos:[]},{merge:true}),
    ]);
    const [dCheck,gCheck,hCheck] = await Promise.all([getDoc(perfilRef(uid,"davi")),getDoc(perfilRef(uid,"gabriel")),getDoc(historicoRef(uid))]);
    if (!dCheck.exists() || !gCheck.exists() || !hCheck.exists()) throw new Error("A migração terminou sem confirmar todos os documentos no Firestore.");
    return {ok:true, backupPath:`users/${uid}/migracoes/planilha-antes-da-migracao`, resumo:resumoMigracao||null};
  }
  window.CAIXA_FIREBASE={app,auth,db,request,get,loginGoogle,signOut,importarDados,testarFirestore,apagarTesteFirestore};
  window.CAIXA_FIREBASE_CONFIG_STATUS = { ok: true, projectId: cfg.projectId };
  function montarLogin() {
    if (document.getElementById("caixaFirebaseLogin")) return;
    const el = document.createElement("div");
    el.id = "caixaFirebaseLogin";
    el.innerHTML = `<div class="caixa-firebase-login-card">
      <div class="caixa-firebase-login-mark">✦</div>
      <h2>Entrar no Caixa</h2>
      <p>Agora seus lançamentos ficam salvos com segurança no Firebase e sincronizados entre seus dispositivos.</p>
      <button type="button" id="caixaFirebaseGoogle" class="btn btn-gold">Continuar com Google</button>
      <small>Você continuará usando Davi, Gabriel e Juntos normalmente depois de entrar.</small>
      <span id="caixaFirebaseLoginErro" class="caixa-firebase-login-erro"></span>
    </div>`;
    document.body.appendChild(el);
    el.querySelector("#caixaFirebaseGoogle")?.addEventListener("click", async () => {
      const btn = el.querySelector("#caixaFirebaseGoogle");
      const erro = el.querySelector("#caixaFirebaseLoginErro");
      btn.disabled = true; btn.textContent = "Entrando…"; erro.textContent = "";
      try { await loginGoogle(); location.reload(); }
      catch (e) { erro.textContent = "Não foi possível entrar agora. Tente novamente."; btn.disabled = false; btn.textContent = "Continuar com Google"; }
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
