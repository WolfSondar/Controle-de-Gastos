/**
 * CAIXA — Tema Halloween
 * Tudo que identifica o tema fica aqui; regras financeiras ficam no núcleo.
 */
(function () {
  "use strict";
  const registrar = window.CAIXA_REGISTRAR_TEMA;
  if (!registrar) return;
  registrar({
    id: "halloween",
    css: "themes/halloween.css",
    meta: {
      icon: "IMG/Icon-Halloween.png",
      manifest: "manifest-halloween.json",
      music: { day: "music/halloween_day.mp3", night: "music/halloween_night.mp3" },
      chrome: { light: "#eadcf3", dark: "#12091a" },
      seasonal: { month: 10, startDay: 1, endDay: 31 }
    }
  });
})();
