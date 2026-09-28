// =====================================================================
// MÓDULO: 19-theme-preference
// Preferência claro/escuro/dispositivo
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

/* ============================================================
   TEMA — preferência local do dispositivo
   Não é salva no Firebase.
   ============================================================ */
(function inicializarTemaLocal() {
  const KEY = "caixa-tema-v1";
  const preferencias = new Set(["light", "dark", "device"]);
  const root = document.documentElement;
  const metaTheme = document.querySelectorAll('meta[name="theme-color"]');

  function lerPreferencia() {
    try {
      const valor = localStorage.getItem(KEY);
      return preferencias.has(valor) ? valor : "device";
    } catch (_) { return "device"; }
  }
  function ehEscuroDoDispositivo() {
    return !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function aplicar(preferencia) {
    const escuro = preferencia === "dark" || (preferencia === "device" && ehEscuroDoDispositivo());
    root.setAttribute("data-theme", escuro ? "dark" : "light");
    root.dataset.themePreference = preferencia;
    metaTheme.forEach(meta => {
      meta.media = "";
      meta.setAttribute("content", escuro ? "#0d1e19" : "#16332c");
    });
    caixaAtualizarCorChromeTema();
    document.querySelectorAll("[data-theme-choice]").forEach(btn => {
      const ativo = btn.dataset.themeChoice === preferencia;
      btn.classList.toggle("is-active", ativo);
      btn.setAttribute("aria-pressed", ativo ? "true" : "false");
    });
  }
  function salvar(preferencia) {
    if (!preferencias.has(preferencia)) preferencia = "device";
    try { localStorage.setItem(KEY, preferencia); } catch (_) {}
    aplicar(preferencia);
  }

  aplicar(lerPreferencia());
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-theme-choice]");
    if (btn) salvar(btn.dataset.themeChoice);
  });
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  media?.addEventListener?.("change", () => {
    if (lerPreferencia() === "device") aplicar("device");
  });
  window.CAIXA_TEMA = { aplicar, salvar, lerPreferencia };
})();

function usuarioAtualEhAdmin(){
  try { return window.CAIXA_FIREBASE?.isAdmin?.() === true; } catch (_) { return false; }
}



/* Mantém a camada visual da cerimônia sincronizada com o tema ativo. */
(function () {
  window.sincronizarTemaCerimonia = function (tema, modo) {
    var root = document.documentElement;
    if (tema) root.setAttribute('data-theme', String(tema).toLowerCase());
    if (modo) root.setAttribute('data-mode', String(modo).toLowerCase());
  };
})();
