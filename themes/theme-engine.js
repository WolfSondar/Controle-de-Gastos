/**
 * CAIXA — Motor de temas
 *
 * Responsabilidades:
 * - definir o tema visual inicial antes do app principal;
 * - expor a ponte pública do sistema de temas;
 * - aplicar a decoração visual dos popups sazonais.
 *
 * Regras financeiras e dados não pertencem a este arquivo.
 */
(function () {
  "use strict";

  const THEMES = Object.freeze(["default", "christmas", "halloween"]);
  const THEME_STORAGE_KEY = "caixa-tema-estilo-v1";

  function normalizeTheme(value) {
    return THEMES.includes(value) ? value : "default";
  }

  function applyThemeColor(theme) {
    try {
      const dark = document.documentElement.dataset.theme === "dark";
      const colors = {
        default: dark ? "#0d1e19" : "#16332c",
        christmas: dark ? "#0b1d28" : "#b8dfea",
        halloween: dark ? "#12091a" : "#eadcf3"
      };
      document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
        meta.setAttribute("content", colors[theme] || colors.default);
      });
    } catch (_) {}
  }

  function themeCssHref(theme) {
    if (theme === "christmas") return "themes/christmas.css";
    if (theme === "halloween") return "themes/halloween.css?v=9";
    return null;
  }

  function ensureThemeCss(theme) {
    const href = themeCssHref(theme);
    document.querySelectorAll('link[data-caixa-theme-css="seasonal"]').forEach(link => {
      if (!href || link.getAttribute("href") !== href) link.remove();
    });
    if (!href || !document.head) return;
    if (document.querySelector(`link[data-caixa-theme-css="seasonal"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.caixaThemeCss = "seasonal";
    document.head.appendChild(link);
  }

  // Bootstrap visual: executado cedo para evitar o flash do tema padrão.
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const theme = normalizeTheme(saved);
    document.documentElement.dataset.caixaTheme = theme;
    applyThemeColor(theme);
    ensureThemeCss(theme);
    document.documentElement.classList.add("caixa-theme-booting");

    let css = document.getElementById("caixaThemeBootStyle");
    if (!css) {
      css = document.createElement("style");
      css.id = "caixaThemeBootStyle";
      css.textContent = "html.caixa-theme-booting body{visibility:hidden!important}";
      (document.head || document.documentElement).appendChild(css);
    }

    window.CAIXA_REVELAR_TEMA_BOOT = function () {
      document.documentElement.classList.remove("caixa-theme-booting");
    };
  } catch (_) {
    try { document.documentElement.classList.remove("caixa-theme-booting"); } catch (__) {}
  }

  window.CAIXA_TEMA_CORE = {
    obter: id => window.CAIXA_OBTER_TEMA?.(id),
    atual: () => document.documentElement.dataset.caixaTheme || "default",
    normalizar: normalizeTheme,
    aplicarCor: applyThemeColor,
    aplicarEstilos: ensureThemeCss
  };

  try {
    const root = document.documentElement;
    let lastTheme = root.dataset.caixaTheme || "default";
    const observer = new MutationObserver(() => {
      const theme = normalizeTheme(root.dataset.caixaTheme);
      if (theme === lastTheme) return;
      lastTheme = theme;
      ensureThemeCss(theme);
      applyThemeColor(theme);
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-caixa-theme"] });
  } catch (_) {}

  function temaSazonalAtual() {
    const theme = document.documentElement.getAttribute("data-caixa-theme");
    return theme === "christmas" || theme === "halloween" ? theme : null;
  }

  function emojiDoTema(theme) {
    return theme === "halloween" ? "🦇" : "❄️";
  }

  function isPopup(element) {
    return element && element.nodeType === 1 && (
      element.matches?.(".modal, .caixa-chat, .caixa-config-drawer") ||
      element.id === "caixaChat" ||
      element.id === "caixaConfiguracoesOverlay"
    );
  }

  function addFloat(root, className, emoji) {
    if (!root || root.querySelector(`:scope > .${String(className).trim().split(/\s+/).join(".")}`)) return;
    const el = document.createElement("span");
    el.className = className;
    el.setAttribute("aria-hidden", "true");
    el.textContent = emoji;
    root.appendChild(el);
  }

  function decoratePopups() {
    const theme = temaSazonalAtual();
    if (!theme) {
      document.querySelectorAll(".caixa-popup-season-float").forEach(el => el.remove());
      return;
    }
    const emoji = emojiDoTema(theme);
    document.querySelectorAll(".modal, .caixa-chat, .caixa-config-drawer").forEach(root => {
      if (isPopup(root)) {
        addFloat(root, "caixa-popup-season-float", emoji);
        addFloat(root, "caixa-popup-season-float caixa-popup-float-2", emoji);
      }
    });
    document.querySelectorAll(".caixa-categoria-criacao-card").forEach(root => {
      addFloat(root, "caixa-popup-season-float", emoji);
    });
  }

  function initPopupDecoration() {
    if (!document.body) return;
    if (window.CAIXA_TEMA_POPUP_OBSERVER) return;
    const observer = new MutationObserver(decoratePopups);
    observer.observe(document.body, { childList: true, subtree: true });
    window.CAIXA_TEMA_POPUP_OBSERVER = observer;
    decoratePopups();
  }

  window.CAIXA_ATUALIZAR_DECORACAO_POPUPS = function () {
    decoratePopups();
    const emoji = emojiDoTema(temaSazonalAtual());
    document.querySelectorAll(".caixa-popup-season-float").forEach(el => {
      el.textContent = emoji;
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPopupDecoration, { once: true });
  } else {
    initPopupDecoration();
  }
})();
