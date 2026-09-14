/* Caixa — ponte de migração Google Sheets -> Firestore.
 * O app antigo continua chamando fetch(API_URL), mas esta ponte intercepta
 * somente as rotas do Caixa e grava/lê tudo do Firestore por UID.
 * A URL antiga é usada apenas uma vez para importar os dados existentes e,
 * depois, exclusivamente para as respostas de IA enquanto o backend de IA
 * próprio do Firebase não estiver implantado.
 */
(function () {
  const LEGACY_API_URL = "https://script.google.com/macros/s/AKfycbwGZBObuoA_9zIV3K4HXopik1ftVVMOJE7Ru_doCW9vdo8Cz5JVYul-4Nt1rRWHW8rOXw/exec";
  const FIREBASE_API_URL = "firebase://caixa";
  window.CAIXA_LEGACY_API_URL = LEGACY_API_URL;
  var API_URL = FIREBASE_API_URL;
  window.API_URL = FIREBASE_API_URL;

  const originalFetch = window.fetch.bind(window);
  let db = null;
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  window.CAIXA_FIRESTORE_READY = ready;

  function uid() { return window.CAIXA_CURRENT_USER?.uid || null; }
  function peopleRef(person) { return db.collection("users").doc(uid()).collection("dados").doc(person); }
  function metaRef() { return db.collection("users").doc(uid()).collection("meta").doc("app"); }
  function histRef() { return db.collection("users").doc(uid()).collection("historico").doc("meses"); }
  function clean(v) { return v == null ? "" : v; }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function isBoxEntry(x) { return String(x?.nome || "").indexOf("Guardado: ") === 0; }
  function variableReal(x) { return !isBoxEntry(x) && x?.pago === true && x?.lembrete !== true; }
  function received(x) { return x?.recebido === true; }
  function benefit(x) { const o = String(x?.origem || "").toLowerCase(); return o === "beneficio" || (o !== "saldo" && norm(x?.nome).includes("beneficio")); }
  function totalBox(x) { return num(x?.valorGuardado) + num(x?.rendimentoTotal) + num(x?.valorGuardadoMes); }
  function totals(data) {
    const ganhos = (data.ganhos || []).filter(received).reduce((a,x)=>a+num(x.valor),0);
    const fixos = (data.gastosFixos || []).filter(x=>x.pago===true).reduce((a,x)=>a+num(x.valor),0);
    const variaveis = (data.gastosVariaveis || []).filter(variableReal).reduce((a,x)=>a+num(x.valor),0);
    const debitos = fixos + variaveis;
    const guardado = (data.caixinhas || []).reduce((a,x)=>a+totalBox(x),0);
    const guardadoMes = (data.caixinhas || []).reduce((a,x)=>a+num(x.valorGuardadoMes),0);
    const rendimento = (data.caixinhas || []).reduce((a,x)=>a+num(x.rendimentoTotal),0);
    const cats = {};
    [...(data.gastosFixos || []).filter(x=>x.pago===true), ...(data.gastosVariaveis || []).filter(x=>!isBoxEntry(x) && x.pago===true)].forEach(x=>{
      const c = String(x.tipo || "Outros").trim() || "Outros"; cats[c]=(cats[c]||0)+num(x.valor);
    });
    return { ganhos, debitos, saldo: ganhos-debitos, guardado, guardadoMes, rendimento, categorias: cats };
  }
  function nextDate(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return s || "";
    const d = new Date(+m[1], +m[2]-1, +m[3]); d.setMonth(d.getMonth()+1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function nextFixed(x) {
    const m = String(x?.parcela || "").trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return {...x, data:nextDate(x?.data), parcela:"", pago:false};
    const a=+m[1], t=+m[2]; if (!t || t<=1 || !a || a>=t) return a>=t ? null : {...x, data:nextDate(x?.data), parcela:"", pago:false};
    return {...x, data:nextDate(x?.data), parcela:`${a+1}/${t}`, pago:false};
  }
  function recurrent(n) {
    const s=norm(n); if (s.startsWith("saldo ")) return false;
    return ["salario","vale","beneficio","aposentadoria","renda","mesada","pagamento recorrente"].some(t=>s.includes(t));
  }
  function serializeCats(c) { return Object.keys(c).filter(k=>c[k]>0).sort((a,b)=>c[b]-c[a]).map(k=>`${String(k).replace(/[:,]/g,"-").trim()||"Outros"}:${Number(c[k]).toFixed(2)}`).join(","); }

  async function getPerson(person) {
    const snap = await peopleRef(person).get();
    if (!snap.exists) return { ganhos:[], gastosFixos:[], gastosVariaveis:[], caixinhas:[], categorias:null, iconCategorias:[] };
    const d=snap.data()||{};
    return { ganhos:d.ganhos||[], gastosFixos:d.gastosFixos||[], gastosVariaveis:d.gastosVariaveis||[], caixinhas:d.caixinhas||[], categorias:d.categorias||null, iconCategorias:d.iconCategorias||[] };
  }
  async function setPerson(person, data) {
    const payload = { ganhos:data.ganhos||[], gastosFixos:data.gastosFixos||[], gastosVariaveis:data.gastosVariaveis||[], caixinhas:data.caixinhas||[], categorias:data.categorias||null, iconCategorias:data.iconCategorias||[], updatedAt:firebase.firestore.FieldValue.serverTimestamp() };
    await peopleRef(person).set(payload,{merge:true});
    return {ok:true,...payload};
  }

  async function importLegacyIfNeeded() {
    if (!uid()) return;
    const m = await metaRef().get();
    if (m.exists && m.data()?.migratedFromSheets) return;
    const existing = await peopleRef("davi").get();
    if (existing.exists && (existing.data()?.ganhos?.length || existing.data()?.gastosFixos?.length || existing.data()?.gastosVariaveis?.length || existing.data()?.caixinhas?.length)) {
      await metaRef().set({migratedFromSheets:true,migratedAt:firebase.firestore.FieldValue.serverTimestamp(),source:"existing-firestore"},{merge:true});
      return;
    }
    try {
      const results = await Promise.all(["davi","gabriel"].map(async p=>{
        const r=await originalFetch(`${LEGACY_API_URL}?pessoa=${encodeURIComponent(p)}`); const j=await r.json();
        if (j?.ok===false) throw new Error(j.error||"Falha na importação");
        await setPerson(p,j); return j;
      }));
      let hist=null;
      try { const r=await originalFetch(`${LEGACY_API_URL}?pessoa=historico`); hist=await r.json(); } catch(e) {}
      if (hist?.anos) await histRef().set({anos:hist.anos||[],mesAtual:hist.mesAtual||null,anoAtual:hist.anoAtual||null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      await metaRef().set({migratedFromSheets:true,migratedAt:firebase.firestore.FieldValue.serverTimestamp(),source:"google-sheets",mesAtual:hist?.mesAtual||null,anoAtual:hist?.anoAtual||null},{merge:true});
    } catch (e) {
      console.error("Caixa: falha na migração inicial da Planilha",e);
      throw e;
    }
  }

  async function currentMonth() {
    const m=await metaRef().get(); const d=m.data()||{}; if(d.mesAtual&&d.anoAtual) return {mesAtual:d.mesAtual,anoAtual:d.anoAtual};
    const h=await histRef().get(); const hd=h.data()||{}; if(hd.mesAtual&&hd.anoAtual) return {mesAtual:hd.mesAtual,anoAtual:hd.anoAtual};
    const now=new Date(); return {mesAtual:now.getMonth()+1,anoAtual:now.getFullYear()};
  }

  async function closeMonth(mes,ano) {
    const [d,g]=await Promise.all([getPerson("davi"),getPerson("gabriel")]);
    const td=totals(d), tg=totals(g);
    const month={mes:Number(mes),nome:new Date(Number(ano),Number(mes)-1,1).toLocaleString("pt-BR",{month:"long"}),ganhosDavi:td.ganhos,debitosDavi:-td.debitos,saldoDavi:td.saldo,guardadoDavi:td.guardado,guardadoMesDavi:td.guardadoMes,rendimentoDavi:td.rendimento,categoriasDavi:serializeCats(td.categorias),ganhosGabriel:tg.ganhos,debitosGabriel:-tg.debitos,saldoGabriel:tg.saldo,guardadoGabriel:tg.guardado,guardadoMesGabriel:tg.guardadoMes,rendimentoGabriel:tg.rendimento,categoriasGabriel:serializeCats(tg.categorias)};
    const h=await histRef().get(); const hist=h.exists?(h.data()||{}):{anos:[]}; const anos=Array.isArray(hist.anos)?hist.anos.map(x=>({...x,meses:Array.isArray(x.meses)?x.meses.slice():[]})):[];
    let bloco=anos.find(x=>Number(x.ano)===Number(ano)); if(!bloco){bloco={ano:Number(ano),meses:[]};anos.push(bloco);} const idx=bloco.meses.findIndex(x=>Number(x.mes)===Number(mes)); if(idx>=0) bloco.meses[idx]=month; else bloco.meses.push(month); bloco.meses.sort((a,b)=>a.mes-b.mes); anos.sort((a,b)=>a.ano-b.ano);

    function carry(data, total) {
      const ganhosOrig=(data.ganhos||[]).filter(received).reduce((a,x)=>{const v=num(x.valor); if(benefit(x))a.b+=v;else a.g+=v;return a;},{g:0,b:0});
      const fix=(data.gastosFixos||[]).filter(x=>x.pago===true).reduce((a,x)=>a+num(x.valor),0);
      let vb=0,vs=fix; (data.gastosVariaveis||[]).filter(variableReal).forEach(x=>{if(benefit(x))vb+=num(x.valor);else vs+=num(x.valor);});
      return {g:Math.max(ganhosOrig.g-vs,0),b:Math.max(ganhosOrig.b-vb,0)};
    }
    function nextGains(data,c){ const arr=(data.ganhos||[]).filter(x=>x.recebido===false||recurrent(x.nome)).map(x=>({...x,data:nextDate(x.data),recebido:false})); if(c.g>0)arr.push({nome:`Saldo ${new Date(Number(ano),Number(mes)-1,1).toLocaleString("pt-BR",{month:"long"})}`,valor:c.g,data:"",recebido:true}); if(c.b>0)arr.push({nome:`Saldo Beneficios ${new Date(Number(ano),Number(mes)-1,1).toLocaleString("pt-BR",{month:"long"})}`,valor:c.b,data:"",recebido:true}); return arr; }
    function nextBoxes(data){return (data.caixinhas||[]).map(x=>({nome:x.nome,valorObjetivo:x.valorObjetivo,valorGuardado:totalBox(x),rendimentoTotal:0,valorGuardadoMes:0,data:x.data||"",icone:x.icone||""}));}
    const cd=carry(d,td), cg=carry(g,tg);
    const nd={...d,ganhos:nextGains(d,cd),gastosFixos:(d.gastosFixos||[]).map(nextFixed).filter(Boolean),gastosVariaveis:(d.gastosVariaveis||[]).filter(x=>x.pago===false),caixinhas:nextBoxes(d)};
    const ng={...g,ganhos:nextGains(g,cg),gastosFixos:(g.gastosFixos||[]).map(nextFixed).filter(Boolean),gastosVariaveis:(g.gastosVariaveis||[]).filter(x=>x.pago===false),caixinhas:nextBoxes(g)};
    let pm=Number(mes)+1,pa=Number(ano);if(pm>12){pm=1;pa++;}
    await Promise.all([setPerson("davi",nd),setPerson("gabriel",ng),histRef().set({anos,mesAtual:pm,anoAtual:pa,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),metaRef().set({mesAtual:pm,anoAtual:pa},{merge:true})]);
    return {ok:true,fechado:month,mesAtual:pm,anoAtual:pa};
  }

  async function route(url, options) {
    await ready;
    const u=String(url); const method=(options?.method||"GET").toUpperCase();
    if (!u.startsWith(FIREBASE_API_URL)) return originalFetch(url,options);
    const q=u.includes("?")?new URLSearchParams(u.split("?")[1]):new URLSearchParams();
    const pessoa=q.get("pessoa");
    if(method==="GET") {
      if(pessoa==="historico") return jsonResponse(await (async()=>{const h=await histRef().get();return h.exists?h.data():{anos:[],...(await currentMonth())};})());
      if(pessoa==="iaConfig") { const ps=await Promise.all([getPerson("davi"),getPerson("gabriel")]); const p=window.CAIXA_USER_PROFILE||{}; const arr=p.pessoas||[]; const out={tomDavi:arr[0]?.tomIA||"",tomGabriel:arr[1]?.tomIA||"",davi:arr[0]?.immersaoIA?[arr[0].immersaoIA]:[],gabriel:arr[1]?.immersaoIA?[arr[1].immersaoIA]:[],ambos:[]}; return jsonResponse(out); }
      const data=await getPerson(pessoa||"davi"); const cm=await currentMonth(); return jsonResponse({...data,...cm,ok:true});
    }
    let body={}; try{body=JSON.parse(options?.body||"{}");}catch(e){}
    if(body.action==="fecharMes") return jsonResponse(await closeMonth(body.mes,body.ano));
    if(body.action==="transferir") {
      const [de,para]=await Promise.all([getPerson(body.de),getPerson(body.para)]); const valor=num(body.valor), tipo=body.tipo||"";
      de.gastosVariaveis=[...(de.gastosVariaveis||[]),{nome:`Transferência p/ ${body.para}: ${body.nome||""}`.trim(),valor,data:new Date().toISOString().slice(0,10),tipo,origem:"saldo",pago:true}];
      para.ganhos=[...(para.ganhos||[]),{nome:`Transferência de ${body.de}: ${body.nome||""}`.trim(),valor,data:new Date().toISOString().slice(0,10),tipo,origem:"saldo",recebido:true}]; await Promise.all([setPerson(body.de,de),setPerson(body.para,para)]); return jsonResponse({ok:true});
    }
    if(["saveGanhos","saveGastosFixos","saveGastosVariaveis","saveCaixinhas"].includes(body.action)) { const key={saveGanhos:"ganhos",saveGastosFixos:"gastosFixos",saveGastosVariaveis:"gastosVariaveis",saveCaixinhas:"caixinhas"}[body.action]; const p=body.pessoa||"davi"; const data=await getPerson(p); data[key]=body.payload||[]; return jsonResponse(await setPerson(p,data)); }
    if(body.action==="gerarInsightIA"||body.action==="gerarRespostaGastarIA") return originalFetch(LEGACY_API_URL,options);
    return jsonResponse({ok:true});
  }
  function jsonResponse(data){ return new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}}); }

  window.fetch = function(url,options){ return route(url,options); };

  async function init(){
    if(!window.firebase || !window.CAIXA_FIREBASE_CONFIG) throw new Error("Firebase não configurado");
    if(!firebase.apps.length) firebase.initializeApp(window.CAIXA_FIREBASE_CONFIG);
    db=firebase.firestore();
    // Espera a autenticação modular, mas não depende dela para existir.
    let user=null;
    if(window.CAIXA_AUTH_READY) user=await window.CAIXA_AUTH_READY;
    if(!user) user=await new Promise(resolve=>firebase.auth().onAuthStateChanged(resolve));
    if(!user){readyResolve();return;}
    window.CAIXA_CURRENT_USER=user;
    await importLegacyIfNeeded();
    readyResolve();
  }
  init().catch(e=>{console.error("Caixa Firestore",e);readyResolve();});
})();
