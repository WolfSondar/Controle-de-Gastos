// =====================================================================
// CAIXA — namespace central
// =====================================================================
// Camada de infraestrutura compartilhada. Os módulos legados continuam
// funcionando como scripts clássicos, mas passam a ter uma API central para
// comunicação e, gradualmente, podem deixar de depender de globais soltas.
(function criarNamespaceCaixa() {
  "use strict";

  const root = window.CAIXA = window.CAIXA || {};
  root.version = root.version || "3.0.0";
  root.modules = root.modules || {};
  root.events = root.events || {};
  root.core = root.core || {};
  root.utils = root.utils || {};

  const listeners = root.events;

  root.on = function on(evento, handler) {
    if (typeof handler !== "function") return () => {};
    (listeners[evento] ||= new Set()).add(handler);
    return () => listeners[evento]?.delete(handler);
  };

  root.emit = function emit(evento, payload) {
    const grupo = listeners[evento];
    if (!grupo) return;
    grupo.forEach((handler) => {
      try { handler(payload); } catch (erro) { console.error(`[CAIXA] evento ${evento}`, erro); }
    });
  };

  root.registerModule = function registerModule(id, api = {}) {
    root.modules[id] = {
      id,
      api,
      loadedAt: Date.now(),
    };
    root.emit("module:loaded", { id, api });
    return api;
  };

  root.getModule = function getModule(id) {
    return root.modules[id]?.api || null;
  };

  root.utils.qs = (selector, scope = document) => scope.querySelector(selector);
  root.utils.qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  root.utils.clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  root.utils.number = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  window.CAIXA_CORE = root;
  root.emit("core:ready", root);
})();
