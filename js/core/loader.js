// =====================================================================
// CAIXA — carregador de módulos
// =====================================================================
(function criarLoaderCaixa() {
  "use strict";

  const root = window.CAIXA;
  if (!root) throw new Error("CAIXA namespace não inicializado.");

  root.loadScript = function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      const existente = document.querySelector(`script[data-caixa-module="${id}"]`);
      if (existente) return resolve(existente);

      const script = document.createElement("script");
      script.src = `${src}${src.includes("?") ? "&" : "?"}v=3`;
      script.async = false;
      script.dataset.caixaModule = id;
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Não foi possível carregar o módulo ${id}`));
      (document.head || document.documentElement).appendChild(script);
    });
  };

  root.loadModules = async function loadModules(modulos) {
    for (const modulo of modulos) {
      const id = typeof modulo === "string" ? modulo : modulo.id;
      const src = typeof modulo === "string" ? modulo : modulo.src;
      const deps = typeof modulo === "string" ? [] : (modulo.deps || []);

      const faltantes = deps.filter((dep) => !root.modules[dep]);
      if (faltantes.length) {
        throw new Error(`Dependências ausentes para ${id}: ${faltantes.join(", ")}`);
      }

      await root.loadScript(src, id);
      root.modules[id] ||= { id, api: null, loadedAt: Date.now() };
      root.emit("module:ready", { id });
    }

    root.emit("app:modules-ready", { count: modulos.length });
    return root.modules;
  };
})();
