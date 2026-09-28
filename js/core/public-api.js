// =====================================================================
// CAIXA — API pública da aplicação
// =====================================================================
// Este arquivo é o ponto de transição entre o legado global e a nova
// arquitetura. Novos módulos devem preferir window.CAIXA em vez de criar
// novas variáveis globais.
(function publicarApiCaixa() {
  "use strict";
  const root = window.CAIXA;
  if (!root) return;

  root.state = window.CAIXA_STATE || null;
  root.firebase = window.CAIXA_FIREBASE || null;

  root.utils.fmt = window.CAIXA_FMT || window.fmt || ((n) =>
    Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

  root.ui = root.ui || {};
  root.ui.render = typeof window.renderAll === "function" ? window.renderAll : null;
  root.ui.toast = typeof window.showToast === "function" ? window.showToast : null;

  root.emit("api:ready", root);
})();
