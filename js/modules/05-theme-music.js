// =====================================================================
// MÓDULO: 05-theme-music
// Tema sazonal e música
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

// =====================================================================
// MÚSICA TEMÁTICA — restaurada
// Arquivos esperados em ./music/:
// default_day.mp3 / default_night.mp3
// halloween_day.mp3 / halloween_night.mp3
// christmas_day.mp3 / christmas_night.mp3
// Dia: 06:00–17:59 | Noite: 18:00–05:59.
// =====================================================================
let caixaMusicaAudio = null;
let caixaMusicaSrcAtual = "";
let caixaMusicaInteracaoArmada = false;
let caixaMusicaRelogio = null;
let caixaMusicaTransicaoId = 0;
const CAIXA_MUSICA_ENABLED_KEY = "caixa-musica-enabled-v1";
const CAIXA_MUSICA_VOLUME_KEY = "caixa-musica-volume-v1";

function caixaMusicaHabilitada() {
  try { return localStorage.getItem(CAIXA_MUSICA_ENABLED_KEY) !== "0"; } catch (_) { return true; }
}
function caixaMusicaVolume() {
  try {
    const n = Number(localStorage.getItem(CAIXA_MUSICA_VOLUME_KEY));
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.025;
  } catch (_) { return 0.025; }
}
function caixaSalvarPreferenciaMusica(ativa, volume) {
  try {
    localStorage.setItem(CAIXA_MUSICA_ENABLED_KEY, ativa ? "1" : "0");
    localStorage.setItem(CAIXA_MUSICA_VOLUME_KEY, String(Math.min(1, Math.max(0, Number(volume) || 0))));
  } catch (_) {}
}
window.CAIXA_MUSICA_CONFIG = {
  enabled: caixaMusicaHabilitada,
  volume: caixaMusicaVolume,
  setEnabled(ativa) {
    const audio = caixaMusicaAudio;
    caixaSalvarPreferenciaMusica(ativa, caixaMusicaVolume());
    if (!ativa) { if (audio && !audio.paused) audio.pause(); return; }
    caixaIniciarMusicaTema(false);
  },
  setVolume(volume) {
    const v = Math.min(1, Math.max(0, Number(volume) || 0));
    caixaSalvarPreferenciaMusica(caixaMusicaHabilitada(), v);
    if (caixaMusicaAudio) caixaMusicaAudio.volume = v;
  }
};

function caixaPeriodoMusical() {
  const hora = new Date().getHours();
  return hora >= 6 && hora < 18 ? "day" : "night";
}

function caixaArquivoMusicaTema(tema = document.documentElement.dataset.caixaTheme || "default") {
  const id = window.CAIXA_TEMA_CORE?.normalizar?.(tema) || "default";
  const music = metadadosTemaApp(id).music || {};
  return music[caixaPeriodoMusical()] || metadadosTemaApp("default").music?.[caixaPeriodoMusical()] || "";
}

// Mantém a barra/status do navegador alinhada ao tema atual, inclusive no mobile.
function caixaAtualizarCorChromeTema() {
  try {
    const root = document.documentElement;
    const escuro = root.dataset.theme === "dark";
    const sazonal = root.dataset.caixaTheme || "default";
    const chrome = metadadosTemaApp(sazonal).chrome || metadadosTemaApp("default").chrome || {};
    const cor = escuro ? chrome.dark : chrome.light;
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute("content", cor));
    return cor;
  } catch (_) { return null; }
}
window.CAIXA_ATUALIZAR_COR_CHROME_TEMA = caixaAtualizarCorChromeTema;

// Ícone do site + manifesto PWA acompanham o tema sazonal.
// O navegador atualiza o favicon imediatamente; o ícone do app instalado
// passa a usar o manifesto correspondente na próxima atualização/instalação
// que o navegador aceitar (o momento exato é controlado pelo navegador).
function caixaAtualizarIconeTema() {
  try {
    const root = document.documentElement;
    const tema = root.dataset.caixaTheme || "default";
    const meta = metadadosTemaApp(tema);
    const fallback = metadadosTemaApp("default");
    const icon = meta.icon || fallback.icon;
    const manifest = meta.manifest || fallback.manifest;
    document.querySelectorAll('link[data-caixa-theme-icon="favicon"]').forEach(link => {
      link.href = new URL(icon, document.baseURI).href + `?theme=${encodeURIComponent(tema)}`;
    });
    document.querySelectorAll('link[data-caixa-theme-icon="apple"]').forEach(link => {
      link.href = new URL(icon, document.baseURI).href + `?theme=${encodeURIComponent(tema)}`;
    });
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      const atual = new URL(manifest, document.baseURI).href;
      if (manifestLink.href !== atual) manifestLink.href = atual;
    }
  } catch (_) {}
}
window.CAIXA_ATUALIZAR_ICONE_TEMA = caixaAtualizarIconeTema;

// Se o tema sazonal for trocado por qualquer caminho do app, atualiza imediatamente
// a barra do sistema e a trilha sonora, sem esperar o próximo intervalo.
(function observarMudancaDeTemaSazonal(){
  try {
    const root = document.documentElement;
    let ultimoTema = root.dataset.caixaTheme || "default";
    const observer = new MutationObserver(() => {
      const tema = root.dataset.caixaTheme || "default";
      if (tema === ultimoTema) return;
      ultimoTema = tema;
      window.CAIXA_ATUALIZAR_COR_CHROME_TEMA?.();
      window.CAIXA_ATUALIZAR_ICONE_TEMA?.();
      window.CAIXA_ATUALIZAR_MUSICA_TEMA?.();
    });
    observer.observe(root, { attributes:true, attributeFilter:["data-caixa-theme"] });
  } catch (_) {}
})();

try { window.CAIXA_ATUALIZAR_ICONE_TEMA?.(); } catch (_) {}

function caixaGarantirPlayerMusica() {
  if (caixaMusicaAudio) {
    caixaMusicaAudio.volume = caixaMusicaVolume();
    return caixaMusicaAudio;
  }
  const audio = document.createElement("audio");
  audio.id = "caixaTemaMusicPlayer";
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = caixaMusicaVolume();
  audio.setAttribute("aria-hidden", "true");
  audio.style.display = "none";
  document.body.appendChild(audio);
  caixaMusicaAudio = audio;
  audio.addEventListener("error", () => {});
  return audio;
}

function caixaArmarInteracaoMusica() {
  if (caixaMusicaInteracaoArmada) return;
  caixaMusicaInteracaoArmada = true;
  const tentar = () => {
    // O gesto do usuário só deve desbloquear a reprodução.
    // Nunca force a troca/reinício da faixa que já está tocando.
    caixaIniciarMusicaTema(false);
    ["pointerdown", "touchstart", "keydown", "click"].forEach(ev =>
      document.removeEventListener(ev, tentar, true)
    );
  };
  ["pointerdown", "touchstart", "keydown", "click"].forEach(ev =>
    document.addEventListener(ev, tentar, true)
  );
}

function caixaMusicaClampVolume(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function caixaMusicaFade(audio, de, para, duracao = 650) {
  return new Promise(resolve => {
    const inicio = performance.now();
    const id = ++caixaMusicaTransicaoId;
    const volumeInicial = caixaMusicaClampVolume(de);
    const volumeFinal = caixaMusicaClampVolume(para);
    audio.volume = volumeInicial;
    const passo = agora => {
      if (id !== caixaMusicaTransicaoId) { resolve(false); return; }
      const t = Math.min(1, Math.max(0, (agora - inicio) / duracao));
      const suavizado = t * (2 - t);
      // O cálculo pode gerar um valor infinitesimalmente abaixo de 0/1
      // por ponto flutuante. O HTMLMediaElement não aceita isso.
      audio.volume = caixaMusicaClampVolume(
        volumeInicial + (volumeFinal - volumeInicial) * suavizado
      );
      if (t < 1) requestAnimationFrame(passo);
      else {
        audio.volume = volumeFinal;
        resolve(true);
      }
    };
    requestAnimationFrame(passo);
  });
}

async function caixaIniciarMusicaTema(forcarTroca = false) {
  const audio = caixaGarantirPlayerMusica();
  if (!caixaMusicaHabilitada()) {
    if (!audio.paused) audio.pause();
    return;
  }
  // A música só toca enquanto esta página/aba estiver ativa.
  // Se o navegador ocultar a aba, pausamos sem perder a posição da faixa.
  if (document.hidden || !document.hasFocus?.()) {
    if (!audio.paused) audio.pause();
    return;
  }
  const srcAbs = new URL(caixaArquivoMusicaTema(), document.baseURI).href;
  const mesmaFaixa = caixaMusicaSrcAtual === srcAbs;

  // IMPORTANTE: chamadas repetidas (inclusive por cliques, renderizações ou
  // abertura de menus) não podem reiniciar a música. Só trocamos a faixa
  // quando o arquivo realmente mudou.
  if (mesmaFaixa) {
    if (!audio.paused && !audio.ended) return;
    try {
      audio.volume = caixaMusicaVolume();
      await audio.play();
    } catch (_) {
      caixaArmarInteracaoMusica();
    }
    return;
  }

  const estavaTocando = !audio.paused && !audio.ended;
  const volumeAlvo = caixaMusicaVolume();
  ++caixaMusicaTransicaoId;

  // Se já existe uma faixa tocando, faz fade-out antes de trocar o arquivo.
  if (estavaTocando) {
    await caixaMusicaFade(audio, audio.volume, 0, 500);
    audio.pause();
  } else {
    audio.pause();
  }

  audio.src = srcAbs;
  audio.load();
  caixaMusicaSrcAtual = srcAbs;
  audio.volume = 0;

  try {
    await audio.play();
    await caixaMusicaFade(audio, 0, volumeAlvo, 700);
  } catch (_) {
    audio.volume = volumeAlvo;
    caixaArmarInteracaoMusica();
  }
}

function atualizarMusicaTema() {
  // Atualização idempotente: só troca se o tema/período apontar para outro MP3.
  caixaIniciarMusicaTema(false);
}

// Pausa imediatamente ao sair da aba/janela e retoma ao voltar.
(function configurarMusicaPaginaAtiva(){
  let configurado = false;
  const atualizar = () => {
    const audio = caixaMusicaAudio;
    const ativa = !document.hidden && (document.hasFocus?.() ?? true);
    if (!ativa) {
      if (audio && !audio.paused) audio.pause();
      return;
    }
    if (audio && audio.src) {
      caixaIniciarMusicaTema(false);
    }
  };
  const configurar = () => {
    if (configurado) return;
    configurado = true;
    document.addEventListener("visibilitychange", atualizar);
    window.addEventListener("focus", atualizar);
    window.addEventListener("blur", atualizar);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", configurar, {once:true});
  else configurar();
})();

function iniciarRelogioMusicaTema() {
  if (caixaMusicaRelogio) return;
  caixaMusicaRelogio = setInterval(() => {
    const esperado = new URL(caixaArquivoMusicaTema(), document.baseURI).href;
    if (esperado !== caixaMusicaSrcAtual) caixaIniciarMusicaTema(true);
  }, 60000);
}

window.CAIXA_ATUALIZAR_MUSICA_TEMA = atualizarMusicaTema;
window.CAIXA_INICIAR_MUSICA_TEMA = () => caixaIniciarMusicaTema(false);
iniciarRelogioMusicaTema();

function caixaSincronizarTemaSazonalGlobal() {
  const sazonais = ["christmas", "halloween"];
  const disponiveis = sazonais.filter(id => caixaTemaPodeSerUsadoGlobal(id));
  // A escolha manual dos temas sazonais deixou de existir: o sistema sempre
  // decide sozinho entre um sazonal válido e Padrão.
  const ativo = disponiveis[0] || "default";
  try { localStorage.setItem("caixa-tema-estilo-v1", ativo); } catch (_) {}
  document.documentElement.dataset.caixaTheme = ativo;
  window.CAIXA_ATUALIZAR_COR_CHROME_TEMA?.();
  window.CAIXA_ATUALIZAR_ICONE_TEMA?.();
  window.CAIXA_ATUALIZAR_MUSICA_TEMA?.();
  return ativo;
}

window.CAIXA_TEMA_ATIVO = caixaTemaAtivoGlobal;
window.CAIXA_SINCRONIZAR_TEMA_SAZONAL = caixaSincronizarTemaSazonalGlobal;
window.CAIXA_GARANTIR_CSS_TEMA = caixaGarantirCssTemaGlobal;

