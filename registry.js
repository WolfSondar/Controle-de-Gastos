/**
 * CAIXA — Registro de temas
 *
 * O núcleo financeiro não deve conhecer detalhes visuais de cada tema.
 * Cada tema registra aqui seu identificador, CSS e hooks opcionais.
 *
 * Nesta primeira etapa os hooks sazonais legados continuam sendo chamados
 * pelo app.js para preservar compatibilidade. Os módulos individuais são a
 * nova porta de entrada para futuras migrações de lógica visual.
 */
(function () {
  "use strict";

  const registro = window.CAIXA_TEMAS = window.CAIXA_TEMAS || {};

  window.CAIXA_REGISTRAR_TEMA = function registrarTema(config) {
    if (!config || !config.id) return;
    registro[config.id] = {
      id: config.id,
      css: config.css || null,
      init: typeof config.init === "function" ? config.init : null,
      destroy: typeof config.destroy === "function" ? config.destroy : null
    };
  };

  window.CAIXA_OBTER_TEMA = function obterTema(id) {
    return registro[String(id || "default")] || registro.default || null;
  };

  window.CAIXA_TEMA_ATUAL = function temaAtual() {
    return document.documentElement.dataset.caixaTheme || "default";
  };
})();