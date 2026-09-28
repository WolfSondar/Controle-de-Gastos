// =====================================================================
// CAIXA — app.js
// Bootstrap/orquestrador da aplicação.
//
// Regra: app.js não contém regra financeira, UI ou tema.
// Ele somente prepara o núcleo e carrega os módulos na ordem definida.
// =====================================================================
(function inicializarCaixa() {
  "use strict";

  const CORE = [
    ["core:namespace", "js/core/namespace.js"],
    ["core:loader", "js/core/loader.js"],
  ];

  const MODULOS = [
    ["00-bootstrap", "js/modules/00-bootstrap.js"],
    ["01-caixinha-icons", "js/modules/01-caixinha-icons.js", ["00-bootstrap"]],
    ["02-dates-and-selects", "js/modules/02-dates-and-selects.js", ["00-bootstrap"]],
    ["03-indexeddb-cache", "js/modules/03-indexeddb-cache.js", ["00-bootstrap"]],
    ["04-state-and-backend", "js/modules/04-state-and-backend.js", ["03-indexeddb-cache"]],
    ["05-theme-music", "js/modules/05-theme-music.js", ["04-state-and-backend"]],
    ["06-data-sync", "js/modules/06-data-sync.js", ["04-state-and-backend"]],
    ["07-people", "js/modules/07-people.js", ["06-data-sync"]],
    ["08-caixinhas", "js/modules/08-caixinhas.js", ["04-state-and-backend"]],
    ["09-divisions", "js/modules/09-divisions.js", ["04-state-and-backend"]],
    ["10-status-and-payments", "js/modules/10-status-and-payments.js", ["04-state-and-backend"]],
    ["11-calculations", "js/modules/11-calculations.js", ["04-state-and-backend"]],
    ["12-caixinhas-render", "js/modules/12-caixinhas-render.js", ["08-caixinhas", "11-calculations"]],
    ["13-dashboard", "js/modules/13-dashboard.js", ["11-calculations"]],
    ["14-annual-categories", "js/modules/14-annual-categories.js", ["11-calculations"]],
    ["15-history", "js/modules/15-history.js", ["14-annual-categories"]],
    ["16-feedback-and-month-close", "js/modules/16-feedback-and-month-close.js", ["04-state-and-backend"]],
    ["17-init-and-tooltips", "js/modules/17-init-and-tooltips.js", ["13-dashboard", "15-history"]],
    ["18-chat", "js/modules/18-chat.js", ["11-calculations", "15-history"]],
    ["19-theme-preference", "js/modules/19-theme-preference.js", ["05-theme-music"]],
    ["20-settings", "js/modules/20-settings.js", ["04-state-and-backend"]],
    ["public-api", "js/core/public-api.js", ["04-state-and-backend"]],
  ].map(([id, src, deps]) => ({ id, src, deps }));

  const carregar = async () => {
    try {
      for (const [id, src] of CORE) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `${src}?v=7`;
          script.async = false;
          script.dataset.caixaModule = id;
          script.onload = resolve;
          script.onerror = () => reject(new Error(`Não foi possível carregar ${id}`));
          (document.head || document.documentElement).appendChild(script);
        });
      }

      await window.CAIXA.loadModules(MODULOS);
      window.CAIXA.emit("app:ready", { modules: MODULOS.map((m) => m.id) });
    } catch (erro) {
      console.error("[Caixa] Falha ao inicializar a aplicação:", erro);
      document.documentElement.dataset.caixaBootError = "true";
    }
  };

  carregar();
})();
