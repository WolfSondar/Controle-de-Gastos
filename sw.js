// =====================================================================
// CAIXA — Service Worker
// Mantém suporte offline sem permitir que o app shell fique preso em uma
// versão antiga depois de uma atualização.
// =====================================================================

// IMPORTANTE: altere esta versão sempre que publicar uma nova versão do app.
// A ativação remove TODOS os caches "caixa-*" de versões anteriores.
const CACHE_VERSION = "caixa-v57";
const CACHE_SHELL = `${CACHE_VERSION}-shell`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./IMG/Icon.jpg",
];

// Arquivos que definem o comportamento/estrutura do app.
// Eles SEMPRE tentam a rede primeiro. O cache só entra como fallback offline.
const APP_SHELL_PATHS = new Set([
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) =>
      Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch(() => {
            // Um arquivo indisponível agora não impede a instalação.
          })
        )
      )
    )
  );

  // A nova versão não fica esperando a aba antiga fechar.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            // Remove qualquer cache antigo do Caixa, sem depender do nome
            // exato da versão anterior.
            .filter((chave) => chave.startsWith("caixa-"))
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


function ehIconePersonalizado(url) {
  return (
    url.origin === self.location.origin &&
    /^\/?IMG\/caixa[^/]*\.(png|webp)$/i.test(url.pathname)
  );
}

function ehAppShell(url) {
  if (url.origin !== self.location.origin) return false;

  // Ignora query/hash para que app.js?v=... continue sendo tratado como
  // recurso crítico do app.
  return APP_SHELL_PATHS.has(url.pathname);
}

// Rede primeiro + fallback no cache.
// Diferentemente de stale-while-revalidate, o navegador nunca recebe o
// arquivo antigo se houver uma versão atual disponível na rede.
function responderRedePrimeiro(req, fallbackRequest = req) {
  return fetch(req)
    .then((res) => {
      if (res && res.ok) {
        // Atualiza o cache da versão ATUAL somente depois de receber a rede.
        caches.open(CACHE_SHELL).then((cache) => {
          cache.put(fallbackRequest, res.clone()).catch(() => {});
        });
      }
      return res;
    })
    .catch(() => caches.match(fallbackRequest));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Ícones personalizados continuam cache-first para funcionamento offline.
  // Eles não fazem parte do código que determina a versão do app.
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

  // Navegação: sempre tenta a versão publicada primeiro.
  // Offline: usa o index.html da versão atualmente instalada.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            caches.open(CACHE_SHELL).then((cache) => {
              cache.put("./index.html", res.clone()).catch(() => {});
            });
          }
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // app.js, style.css e demais recursos críticos:
  // REDE PRIMEIRO. Nunca usa um arquivo antigo enquanto há rede disponível.
  if (ehAppShell(url)) {
    event.respondWith(responderRedePrimeiro(req));
    return;
  }

  // Outros recursos podem continuar com stale-while-revalidate, pois não
  // controlam a lógica/estado principal do aplicativo.
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
