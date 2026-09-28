/**
 * CAIXA — Tema padrão
 * Identidade, recursos e metadados do tema neutro.
 */
(function () {
  "use strict";
  const registrar = window.CAIXA_REGISTRAR_TEMA;
  if (!registrar) return;
  registrar({
    id: "default",
    css: "themes/default.css",
    meta: {
      icon: "IMG/Icon.jpg",
      manifest: "manifest.json",
      music: { day: "music/default_day.mp3", night: "music/default_night.mp3" },
      chrome: { light: "#16332c", dark: "#0d1e19" }
    }
  });
})();
