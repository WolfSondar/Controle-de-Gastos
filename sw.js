// =====================================================================
// CAIXA — Service Worker
// Cuida só do "app shell" (o app em si: HTML/CSS/JS/ícone) pra abrir
// instalado e funcionar offline. Os DADOS (ganhos, gastos, caixinhas)
// NUNCA passam por aqui — esses continuam indo direto pro Apps Script,
// com a fila offline própria que já existe em app.js (feita na própria
// página, porque o Background Sync API deste Service Worker não existe
// no Safari/iOS).
//
// Suba a versão do cache (CACHE_VERSION) sempre que publicar uma mudança
// em style.css/app.js/index.html — é isso que faz o Service Worker
// perceber que precisa baixar os arquivos novos de novo.
// =====================================================================

const CACHE_VERSION = "caixa-v18";
const CACHE_SHELL = `${CACHE_VERSION}-shell`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

// Arquivos do próprio app — precisam estar disponíveis offline desde a
// primeira instalação. Cada um é cacheado individualmente (não com
// cache.addAll) pra um arquivo faltando (ex: config.js, se ainda não
// existir no ar) não derrubar a instalação inteira.
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./melhorias.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./IMG/Icon.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) =>
      Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch(() => {
            // arquivo indisponível agora (ex: config.js ainda não publicado) —
            // sem problema, os outros continuam sendo cacheados normalmente
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((chave) => chave.startsWith("caixa-") && chave !== CACHE_SHELL && chave !== CACHE_RUNTIME)
            .map((chave) => caches.delete(chave))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Reforço opcional via Background Sync API — só existe em Chrome/Edge/
// Android (não no Safari/iOS, daí a fila offline de verdade viver em
// app.js e não aqui, ver o comentário lá). Quando o navegador dispara
// esse evento (reconectou), a gente só avisa as abas abertas: quem sabe
// a API_URL e faz o POST de fato é a própria página, não o Service
// Worker — assim não precisa duplicar config.js aqui dentro.
self.addEventListener("sync", (event) => {
  if (event.tag !== "caixa-flush-fila") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientes) => {
      clientes.forEach((cliente) => cliente.postMessage("caixa-flush-fila"));
    })
  );
});

function ehChamadaDaApi(url) {
  // Google Apps Script (script.google.com / script.googleusercontent.com) —
  // é onde moram os dados de verdade. Nunca cacheamos isso: cada leitura
  // precisa ser fresca, e a fila offline de app.js já cuida de guardar o
  // que não conseguiu ser enviado.
  return url.hostname.indexOf("script.google") !== -1 || url.hostname.indexOf("googleusercontent") !== -1;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POSTs (salvar dados) passam direto, sem o SW no meio

  const url = new URL(req.url);
  if (ehChamadaDaApi(url)) return; // deixa passar direto pra rede, sem cache

  // Navegação (abrir/recarregar o app): tenta a rede primeiro pra sempre
  // pegar a versão mais nova; se estiver offline, cai pro app shell salvo.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_SHELL).then((cache) => cache.put("./index.html", res.clone()));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Fontes do Google Fonts e demais recursos externos: stale-while-revalidate
  // — mostra o que já está em cache na hora (se tiver) e atualiza em
  // segundo plano, sem travar a pintura da tela.
  const cacheAlvo = url.origin === self.location.origin ? CACHE_SHELL : CACHE_RUNTIME;
  event.respondWith(
    caches.open(cacheAlvo).then((cache) =>
      cache.match(req).then((cacheado) => {
        const buscaNaRede = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cacheado); // sem rede e sem cache: não tem o que fazer, o caller trata o erro
        return cacheado || buscaNaRede;
      })
    )
  );
});
