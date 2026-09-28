/**
 * CAIXA — Tema Halloween
 *
 * Ponto de entrada exclusivo do tema Halloween.
 * A decoração existente continua compatível com o motor legado do app.js;
 * novas rotinas visuais devem ser adicionadas aqui, e não no núcleo financeiro.
 */
(function () {
  "use strict";

  const registrar = window.CAIXA_REGISTRAR_TEMA;
  if (!registrar) return;

  registrar({
    id: "halloween",
    css: "themes/halloween.css"
  });
})();