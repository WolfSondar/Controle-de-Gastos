/**
 * CAIXA — Tema Natal
 *
 * Ponto de entrada exclusivo do tema Natal.
 * A decoração existente continua compatível com o motor legado do app.js;
 * novas rotinas visuais devem ser adicionadas aqui, e não no núcleo financeiro.
 */
(function () {
  "use strict";

  const registrar = window.CAIXA_REGISTRAR_TEMA;
  if (!registrar) return;

  registrar({
    id: "christmas",
    css: "themes/christmas.css"
  });
})();