// =====================================================================
// CAIXA — Service Worker
// Cuida do "app shell" e também ajuda a manter os ícones personalizados
// disponíveis offline depois que forem usados/visualizados.
// Os DADOS (ganhos, gastos, caixinhas) continuam indo direto para o
// Apps Script e não são armazenados pelo Service Worker.
// =====================================================================

const CACHE_VERSION = "caixa-v42";
const CACHE_SHELL = `${CACHE_VERSION}-shell`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
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
            // Arquivo indisponível agora não impede o restante da instalação.
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
            .filter(
              (chave) =>
                chave.startsWith("caixa-") &&
                chave !== CACHE_SHELL &&
                chave !== CACHE_RUNTIME
            )
            .map((chave) => caches.delete(chave))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "caixa-flush-fila") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientes) => {
      clientes.forEach((cliente) =>
        cliente.postMessage("caixa-flush-fila")
      );
    })
  );
});

function ehChamadaDaApi(url) {
  return (
    url.hostname.indexOf("script.google") !== -1 ||
    url.hostname.indexOf("googleusercontent") !== -1
  );
}

function ehIconePersonalizado(url) {
  return (
    url.origin === self.location.origin &&
    /^\/?IMG\/caixa[^/]*\.(png|webp)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca cacheia os dados da API.
  if (ehChamadaDaApi(url)) return;

  // Ícones personalizados:
  // cache-first para que os ícones já utilizados continuem disponíveis
  // mesmo sem internet. Se não estiverem no cache, busca normalmente.
  if (ehIconePersonalizado(url)) {
    event.respondWith(
      caches.open(CACHE_RUNTIME).then((cache) =>
        cache.match(req).then((cacheado) => {
          if (cacheado) return cacheado;

          return fetch(req)
            .then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cacheado);
        })
      )
    );
    return;
  }

  // Navegação: rede primeiro; offline usa o shell salvo.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resParaCache = res.clone();
          caches
            .open(CACHE_SHELL)
            .then((cache) => cache.put("./index.html", resParaCache));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Demais recursos: stale-while-revalidate.
  const cacheAlvo =
    url.origin === self.location.origin ? CACHE_SHELL : CACHE_RUNTIME;

  event.respondWith(
    caches.open(cacheAlvo).then((cache) =>
      cache.match(req).then((cacheado) => {
        const buscaNaRede = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cacheado);

        return cacheado || buscaNaRede;
      })
    )
  );
});
