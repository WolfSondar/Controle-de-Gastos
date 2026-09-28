// =====================================================================
// MÓDULO: 02-dates-and-selects
// Datas e inicialização de selects
// Código extraído do app.js original; preservar a ordem de carregamento.
// =====================================================================

function dataHojeISO() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Data de lançamento: mantém o dia escolhido e, quando o usuário escolhe
// apenas uma data, acrescenta o horário LOCAL do navegador.
// Não usamos toISOString()/UTC aqui, pois isso deslocaria o horário em 3h.
function dataHoraAgoraISO() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  const hora = String(d.getHours()).padStart(2, "0");
  const minuto = String(d.getMinutes()).padStart(2, "0");
  const segundo = String(d.getSeconds()).padStart(2, "0");
  // O offset identifica o fuso do navegador no instante do lançamento.
  // Assim o Firebase não precisa adivinhar o horário local do usuário.
  const offsetEmMinutos = -d.getTimezoneOffset();
  const sinal = offsetEmMinutos >= 0 ? "+" : "-";
  const offsetAbsoluto = Math.abs(offsetEmMinutos);
  const offsetHora = String(Math.floor(offsetAbsoluto / 60)).padStart(2, "0");
  const offsetMinuto = String(offsetAbsoluto % 60).padStart(2, "0");
  return `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}${sinal}${offsetHora}:${offsetMinuto}`;
}

function dataDoLancamento(data) {
  const dataLimpa = String(data || "").trim();
  if (!dataLimpa) return "";

  const isoData = dataLimpa.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoData) return `${isoData[1]}-${isoData[2]}-${isoData[3]}T${dataHoraAgoraISO().slice(11)}`;

  const isoDataHora = dataLimpa.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:?\d{2})?$/);
  if (isoDataHora) {
    const hora = isoDataHora[2].length === 5 ? isoDataHora[2] + ":00" : isoDataHora[2];
    return `${isoDataHora[1]}T${hora}${isoDataHora[3] || ""}`;
  }

  const br = dataLimpa.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/);
  if (br) {
    const hora = br[4] ? (br[4].length === 5 ? br[4] + ":00" : br[4]) : dataHoraAgoraISO().slice(11);
    return `${br[3]}-${br[2]}-${br[1]}T${hora}`;
  }

  return dataLimpa;
}

function dataBrasileira(data) {
  const valor = String(data || "").trim();
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = valor.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  return valor;
}

function preencherDatasComHoje() {
  document.querySelectorAll('.add-form input[type="date"].input-data').forEach((el) => {
    if (!el.value) el.value = dataHojeISO();
  });
}

function popularSelectsDeCategoria() {
  document.querySelectorAll("select.input-categoria").forEach((select) => {
    const opcaoVazia = select.querySelector('option[value=""]');
    select.innerHTML = "";
    select.appendChild(opcaoVazia || new Option("Categoria (opcional)", ""));
    categoriasAtuais().forEach((cat) => select.appendChild(new Option(cat, cat)));
  });
}
