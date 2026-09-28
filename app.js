// =====================================================================
// CAIXA — app.js
// Orquestrador da aplicação.
//
// O app.js não contém regras de negócio. Ele apenas carrega os módulos
// na ordem necessária para preservar as dependências do sistema legado.
// Para criar/alterar uma funcionalidade, procure primeiro o módulo da
// responsabilidade correspondente em js/modules/.
// =====================================================================

(function carregarModulosCaixa() {
  const modulos = [
    "00-bootstrap.js",
    "01-caixinha-icons.js",
    "02-dates-and-selects.js",
    "03-indexeddb-cache.js",
    "04-state-and-backend.js",
    "05-theme-music.js",
    "06-data-sync.js",
    "07-people.js",
    "08-caixinhas.js",
    "09-divisions.js",
    "10-status-and-payments.js",
    "11-calculations.js",
    "12-caixinhas-render.js",
    "13-dashboard.js",
    "14-annual-categories.js",
    "15-history.js",
    "16-feedback-and-month-close.js",
    "17-init-and-tooltips.js",
    "18-chat.js",
    "19-theme-preference.js",
    "20-settings.js"
  ];

  let cadeia = Promise.resolve();
  modulos.forEach((modulo) => {
    cadeia = cadeia.then(() => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `js/modules/${modulo}`;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${modulo}`));
      document.head.appendChild(script);
    }));
  });

  cadeia.catch((erro) => {
    console.error("[Caixa] Falha ao carregar os módulos:", erro);
  });
})();
