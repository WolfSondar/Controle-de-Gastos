/**
 * CAIXA — Tema Natal
 * Tudo que identifica o tema fica aqui; regras financeiras ficam no núcleo.
 */
(function () {
  "use strict";
  const registrar = window.CAIXA_REGISTRAR_TEMA;
  if (!registrar) return;
  registrar({
    id: "christmas",
    css: "themes/christmas.css",
    meta: {
      icon: "IMG/Icon-Christmas.png",
      manifest: "manifest-christmas.json",
      music: { day: "music/christmas_day.mp3", night: "music/christmas_night.mp3" },
      chrome: { light: "#b8dfea", dark: "#0b1d28" },
      seasonal: { month: 12, startDay: 1, endDay: 31 }
    }
  });
})();
