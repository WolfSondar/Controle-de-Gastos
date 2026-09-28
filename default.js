/**
 * CAIXA — Tema padrão
 *
 * O tema padrão é propositalmente neutro: ele fornece o CSS-base da aplicação
 * e não cria decoração nem comportamento sazonal.
 */
(function () {
  "use strict";

  const registrar = window.CAIXA_REGISTRAR_TEMA;
  if (!registrar) return;

  registrar({
    id: "default",
    css: "themes/default.css"
  });
})();