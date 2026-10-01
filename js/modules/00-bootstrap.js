// =====================================================================
// MÓDULO: 00-bootstrap
// Bootstrap global e constantes compartilhadas
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

// =====================================================================
// CAIXA — app.js
// Núcleo da aplicação: dados, Firebase, cálculos e comportamento.
// A infraestrutura visual dos temas vive em themes/theme-engine.js.
// =====================================================================

// Camada global de navegação: a barra de abas deve sempre ficar acima dos
// títulos de status ("Recebidos"/"Pagos"), independentemente do tema ou
// do usuário. Isso evita que o título atravesse visualmente os botões.
(function garantirCamadaNavegacaoGlobal(){
  try {
    const id = "caixaNavegacaoGlobalStyle";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      #tabbar{position:fixed!important;z-index:1200!important;}
      .status-list-title-row{position:relative!important;z-index:1!important;}
      .status-row-over-title{position:relative!important;z-index:30!important;}
      .status-list-title{position:relative;z-index:1;}
    `;
    (document.head || document.documentElement).appendChild(style);
  } catch (_) {}
})();

const PESSOA_LABEL = { davi: "Davi", gabriel: "Gabriel", ambos: "Juntos" };
const COLAPSO_STORAGE_KEY = "caixaFormsColapsados";
const PESSOA_STORAGE_KEY = "caixaPessoaAtual";
const CACHE_PREFIX = "caixaCache:";
const MES_ATUAL_STORAGE_KEY = "caixaMesAtual";
const MESES_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Helper DOM compartilhado pelos módulos. Fica no bootstrap porque vários
// módulos registram eventos antes de o módulo de histórico ser carregado.
function on(id, evento, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener(evento, handler);
}

// Paleta de fallback usada quando uma categoria antiga não possui cor em CONFIGS.
// Deve existir antes de corDaCategoria(), que é utilizada por módulos carregados
// posteriormente e também por renderizações disparadas de forma assíncrona.
const PALETA_CATEGORIAS = [
  "#b9862f", "#3c6e4f", "#a8482e", "#5c8aa6", "#8a6bb5",
  "#c99a3f", "#4d9e8a", "#c46a8f", "#7a9e4d", "#a67a4d",
  "#d96a53", "#6c8c77", "#b59b52", "#5b778c", "#9678a3",
  "#80705a", "#a15a4b", "#4a7866", "#c2a36b", "#6a5c78",
  "#8b7e66", "#588f82", "#b5725c", "#7d8c85", "#6e7580",
  "#4f5d8a", "#9e5a3f", "#5a8a5e", "#8a4f7a", "#c9885c",
  "#d35400", "#34495e", "#4b6584", "#eb3b5a", "#20bf6b"
];

// Nomes de categoria em ordem (o que os <select> mostram). A aba CONFIGS é
// a única fonte de verdade: coluna A = nome; coluna B = cor.
function categoriasAtuais() {
  return Array.isArray(state.categoriasConfig)
    ? state.categoriasConfig.map((c) => c.nome)
    : [];
}

// Cor de uma categoria: vem da aba CONFIGS. A paleta fixa permanece apenas
// para categorias antigas já gravadas que não existam mais na configuração.
function corDaCategoria(nome, idxFallback) {
  if (state.categoriasConfig) {
    const achado = state.categoriasConfig.find((c) => c.nome === nome);
    if (achado && achado.cor) return achado.cor;
  }
  const tema = document.documentElement?.dataset?.caixaTheme;
  if (tema === "christmas") {
    const paletaNatal = [
      "#d8b45b", "#3f805b", "#b84b4f", "#78a98a", "#c98d4a",
      "#5f9077", "#d06d68", "#a6b99b", "#d9bf76", "#6c8e83"
    ];
    return paletaNatal[idxFallback % paletaNatal.length];
  }
  return PALETA_CATEGORIAS[idxFallback % PALETA_CATEGORIAS.length];
}



/* ─────────────────────────────────────────────────────────────
   MÊS DA PESSOA ATIVA
   ───────────────────────────────────────────────────────────── */
(function () {
  function formatarMesAnoPessoa(dataOuChave) {
    if (!dataOuChave) return null;
    var d = dataOuChave instanceof Date ? dataOuChave : new Date(dataOuChave);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      .replace(/^./, function (c) { return c.toUpperCase(); });
  }

  function atualizarTituloMesPessoa(mes, ano) {
    if (mes == null || ano == null) return;
    var data = new Date(Number(ano), Number(mes) - 1, 1);
    var titulo = formatarMesAnoPessoa(data);
    if (!titulo) return;

    document.querySelectorAll(
      '[data-mes-titulo], #mesTitulo, #tituloMes, .mes-titulo, .month-title'
    ).forEach(function (el) {
      el.textContent = titulo;
    });

    window.mesTituloAtual = titulo;
    window.mesAnoTituloAtual = { mes: Number(mes), ano: Number(ano) };
  }

  window.formatarMesAnoPessoa = formatarMesAnoPessoa;
  window.atualizarTituloMesPessoa = atualizarTituloMesPessoa;
})();
