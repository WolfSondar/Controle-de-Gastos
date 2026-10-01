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


// Data automática do salário para o mês aberto de cada perfil.
// Davi recebe no 5º dia útil; Gabriel recebe no 1º dia do mês.
function pascoaLocal(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function chaveDataLocal(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function feriadosLocal(ano) {
  const set = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map(x => `${ano}-${x}`));
  const pascoa = pascoaLocal(ano);
  for (const dias of [-2, 60, -9]) {
    const d = new Date(pascoa);
    d.setUTCDate(d.getUTCDate() + dias);
    set.add(chaveDataLocal(d));
  }
  return set;
}

function quintoDiaUtilLocal(ano, mes) {
  const feriados = feriadosLocal(ano);
  let uteis = 0;
  for (let dia = 1; dia <= 31; dia++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1) break;
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6 || feriados.has(chaveDataLocal(d))) continue;
    if (++uteis === 5) return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  return "";
}

function dataSalarioPessoa(pessoa, mes, ano) {
  const m = Number(mes);
  const a = Number(ano);
  if (!(m >= 1 && m <= 12) || !(a > 0)) return "";
  if (String(pessoa || "davi").toLowerCase() === "gabriel") {
    return `${a}-${String(m).padStart(2, "0")}-01`;
  }
  return quintoDiaUtilLocal(a, m);
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
