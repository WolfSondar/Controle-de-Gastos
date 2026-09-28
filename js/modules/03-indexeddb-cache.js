// =====================================================================
// MÓDULO: 03-indexeddb-cache
// IndexedDB e cache local
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================


// ---------------------------------------------------------------------
// INDEXEDDB
// ---------------------------------------------------------------------
const IDB_NOME = "caixaDB";
const IDB_VERSAO = 1;
const IDB_LOJA_CACHE = "cache";
const IDB_LOJA_FILA = "filaOffline";

let idbPromise = null;
function abrirIdb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB indisponível neste navegador"));
      return;
    }
    const req = indexedDB.open(IDB_NOME, IDB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_LOJA_CACHE)) db.createObjectStore(IDB_LOJA_CACHE);
      if (!db.objectStoreNames.contains(IDB_LOJA_FILA)) db.createObjectStore(IDB_LOJA_FILA, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

async function idbGet(loja, chave) {
  try {
    const db = await abrirIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(loja, "readonly");
      const req = tx.objectStore(loja).get(chave);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

async function idbSet(loja, chave, valor) {
  try {
    const db = await abrirIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(loja, "readwrite");
      tx.objectStore(loja).put(valor, chave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {}
}

async function idbDelete(loja, chave) {
  try {
    const db = await abrirIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(loja, "readwrite");
      tx.objectStore(loja).delete(chave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {}
}

async function idbListarFila() {
  try {
    const db = await abrirIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_LOJA_FILA, "readonly");
      const store = tx.objectStore(IDB_LOJA_FILA);
      const itens = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          itens.push({ chaveIdb: cursor.key, valor: cursor.value });
          cursor.continue();
        } else {
          resolve(itens);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

function getMesAtualCache() {
  try {
    const pessoa = localStorage.getItem(PESSOA_STORAGE_KEY) || "davi";
    const raw = localStorage.getItem(MES_ATUAL_STORAGE_KEY + ":" + pessoa)
      || localStorage.getItem(MES_ATUAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}


const RESUMO_GRAFICO_CACHE_KEY = "caixa:resumo:grafico:v2";
function lerPaginaGraficoResumo() {
  try {
    const raw = JSON.parse(localStorage.getItem(RESUMO_GRAFICO_CACHE_KEY) || "{}");
    const chave = localStorage.getItem(PESSOA_STORAGE_KEY) || "davi";
    return typeof raw?.[chave] === "string" ? raw[chave] : "";
  } catch (err) {
    return "";
  }
}
function salvarPaginaGraficoResumo(indiceOuId) {
  try {
    const valor = String(indiceOuId || "");
    if (!valor) return;
    const raw = JSON.parse(localStorage.getItem(RESUMO_GRAFICO_CACHE_KEY) || "{}");
    const chave = localStorage.getItem(PESSOA_STORAGE_KEY) || "davi";
    raw[chave] = valor;
    localStorage.setItem(RESUMO_GRAFICO_CACHE_KEY, JSON.stringify(raw));
  } catch (err) {}
}

