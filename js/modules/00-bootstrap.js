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

