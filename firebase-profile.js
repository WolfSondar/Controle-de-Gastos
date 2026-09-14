import { getFirestore, doc, getDoc, getDocs, collection, serverTimestamp, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const gate = document.getElementById("caixaOnboardingGate");
const form = document.getElementById("caixaOnboardingForm");
const message = document.getElementById("caixaOnboardingMessage");
const peopleFields = document.getElementById("caixaPeopleFields");
const toneFields = document.getElementById("caixaToneFields");
const immersionFields = document.getElementById("caixaImmersionFields");
const progress = document.getElementById("caixaOnboardingProgress");

const LIFETIME_EMAIL = "daviris0508@gmail.com";
let accessGate = null;
let peopleCount = 1;
let currentStep = 1;
let onboardingData = { pessoas: [] };

function setMessage(text = "", type = "error") {
  if (!message) return;
  message.textContent = text;
  message.className = text ? `caixa-auth-message ${type}` : "caixa-auth-message is-hidden";
}

function setGate(open) {
  document.body.classList.toggle("caixa-onboarding-open", open);
  gate?.classList.toggle("is-hidden", !open);
  gate?.setAttribute("aria-hidden", open ? "false" : "true");
}

function removeAccessGate() {
  accessGate?.remove();
  accessGate = null;
}

function createAccessGate(title, text, detail = "") {
  removeAccessGate();
  accessGate = document.createElement("div");
  accessGate.className = "caixa-access-gate";
  accessGate.setAttribute("role", "dialog");
  accessGate.setAttribute("aria-modal", "true");
  accessGate.innerHTML = `
    <div class="caixa-auth-backdrop"></div>
    <main class="caixa-access-card" aria-labelledby="caixaAccessTitle">
      <div class="caixa-login-brand">Caixa</div>
      <div class="caixa-login-kicker">Acesso reservado</div>
      <div class="caixa-access-icon" aria-hidden="true">⌁</div>
      <h1 id="caixaAccessTitle">${escapeHtml(title)}</h1>
      <p class="caixa-login-subtitle">${escapeHtml(text)}</p>
      ${detail ? `<p class="caixa-access-detail">${escapeHtml(detail)}</p>` : ""}
      <button type="button" class="caixa-auth-submit" id="caixaAccessLogout">Sair da conta</button>
    </main>`;
  document.body.appendChild(accessGate);
  document.body.classList.add("caixa-access-open");
  accessGate.querySelector("#caixaAccessLogout")?.addEventListener("click", async () => {
    try { await signOut(window.CAIXA_AUTH); } catch (error) { console.error("Caixa: falha ao sair", error); }
  });
}

function clearAccessGate() {
  document.body.classList.remove("caixa-access-open");
  removeAccessGate();
}

function isLifetimeUser(user) {
  return String(user?.email || "").trim().toLowerCase() === LIFETIME_EMAIL;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value?.toDate === "function") return value;
  if (value?.seconds != null) return new Timestamp(Number(value.seconds), Number(value.nanoseconds || 0));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function evaluateAccess(user, data) {
  if (isLifetimeUser(user)) {
    return { allowed: true, tipo: "vitalicio", needsBootstrap: !data?.acesso };
  }

  const acesso = data?.acesso;
  if (!acesso || acesso.status !== "ativo") {
    return { allowed: false, reason: "inactive" };
  }

  if (acesso.tipo === "vitalicio") {
    // Somente a conta vitalícia definida pelo proprietário pode ter acesso vitalício.
    return { allowed: false, reason: "invalid-lifetime" };
  }

  if (acesso.tipo !== "mensal") {
    return { allowed: false, reason: "invalid-plan" };
  }

  const vencimento = normalizeTimestamp(acesso.vencimento);
  if (!vencimento) return { allowed: false, reason: "missing-expiration" };

  const vencimentoDate = vencimento.toDate();
  const agora = new Date();
  if (vencimentoDate.getTime() <= agora.getTime()) {
    return { allowed: false, reason: "expired", vencimento: vencimentoDate };
  }

  return { allowed: true, tipo: "mensal", vencimento: vencimentoDate };
}

function formatarDataAcesso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function showAccessBlocked(result) {
  setGate(false);
  document.body.classList.remove("caixa-auth-pending", "caixa-onboarding-open");
  if (result.reason === "expired") {
    createAccessGate(
      "Seu acesso venceu.",
      `Seu acesso ao Caixa terminou em ${formatarDataAcesso(result.vencimento)}.`,
      "Faça o pagamento da próxima mensalidade para que o acesso possa ser renovado."
    );
  } else if (result.reason === "inactive") {
    createAccessGate(
      "Acesso ainda não liberado.",
      "Esta conta ainda não possui uma assinatura ativa no Caixa.",
      "Se você já fez o pagamento, aguarde a liberação do acesso."
    );
  } else {
    createAccessGate(
      "Não foi possível liberar seu acesso.",
      "A assinatura desta conta não está configurada corretamente.",
      "Entre em contato com o responsável pelo Caixa para regularizar o acesso."
    );
  }
}

function renderStep(step) {
  currentStep = step;
  form?.querySelectorAll(".caixa-onboarding-step").forEach((el) => {
    el.classList.toggle("is-hidden", Number(el.dataset.step) !== step);
  });
  if (progress) progress.style.setProperty("--progress", `${(step / 4) * 100}%`);
  setMessage();
  gate?.querySelector(".caixa-onboarding")?.scrollTo({ top: 0, behavior: "smooth" });
}

function optionButton(label, sublabel, value, selected, group, index) {
  return `<button type="button" class="caixa-onboarding-option ${selected ? "is-selected" : ""}" data-${group}="${value}" aria-pressed="${selected}" data-index="${index}">${label}<span>${sublabel}</span></button>`;
}

function renderPeopleFields() {
  if (!peopleFields) return;
  const current = onboardingData.pessoas || [];
  peopleFields.innerHTML = Array.from({ length: peopleCount }, (_, i) => `
    <label class="caixa-auth-label" for="caixaPersonName${i}">${peopleCount === 1 ? "Seu nome" : `Nome da pessoa ${i + 1}`}</label>
    <input class="caixa-auth-input caixa-onboarding-name" id="caixaPersonName${i}" data-person-index="${i}" type="text" autocomplete="name" maxlength="80" placeholder="Como você quer aparecer no Caixa?" value="${escapeHtml(current[i]?.nome || "")}" />
  `).join("");
}

function renderToneFields() {
  if (!toneFields) return;
  toneFields.innerHTML = Array.from({ length: peopleCount }, (_, i) => {
    const person = onboardingData.pessoas[i] || {};
    const label = peopleCount === 1 ? "Seu tom" : `Tom de ${person.nome || `pessoa ${i + 1}`}`;
    return `<div class="caixa-onboarding-person-block">
      <div class="caixa-onboarding-mini-title">${escapeHtml(label)}</div>
      <div class="caixa-onboarding-options caixa-onboarding-options-compact" role="radiogroup" aria-label="Tom da IA">
        ${optionButton("Tranquila e de boa", "Leve, natural e próxima", "tranquila", person.tom === "tranquila" || !person.tom, "tone", i)}
        ${optionButton("Formal e elegante", "Polida, organizada e refinada", "formal", person.tom === "formal", "tone", i)}
      </div>
    </div>`;
  }).join("");
}

function renderImmersionFields() {
  if (!immersionFields) return;
  immersionFields.innerHTML = Array.from({ length: peopleCount }, (_, i) => {
    const person = onboardingData.pessoas[i] || {};
    const label = peopleCount === 1 ? "Sua imersão" : `Imersão de ${person.nome || `pessoa ${i + 1}`}`;
    return `<div class="caixa-onboarding-person-block">
      <label class="caixa-auth-label" for="caixaImmersion${i}">${escapeHtml(label)}</label>
      <textarea class="caixa-auth-input caixa-onboarding-textarea" id="caixaImmersion${i}" data-immersion-index="${i}" maxlength="1200" placeholder="Ex.: sou objetivo, gosto de números e quero economizar para viajar.">${escapeHtml(person.immersao || "")}</textarea>
    </div>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function readPeople() {
  const inputs = [...document.querySelectorAll(".caixa-onboarding-name")];
  const pessoas = inputs.map((input, index) => ({
    id: `pessoa${index + 1}`,
    nome: input.value.trim(),
    tom: onboardingData.pessoas[index]?.tom || "tranquila",
    immersao: onboardingData.pessoas[index]?.immersao || ""
  }));
  if (pessoas.some((p) => !p.nome)) {
    setMessage("Preencha o nome de cada pessoa.");
    inputs.find((input) => !input.value.trim())?.focus();
    return false;
  }
  onboardingData.pessoas = pessoas;
  return true;
}

function readTone(index, value) {
  onboardingData.pessoas[index].tom = value;
}

function readImmersion() {
  const inputs = [...document.querySelectorAll(".caixa-onboarding-textarea")];
  inputs.forEach((input) => {
    onboardingData.pessoas[Number(input.dataset.immersionIndex)].immersao = input.value.trim();
  });
}

function setupInteractions() {
  document.querySelectorAll("[data-people]").forEach((btn) => btn.addEventListener("click", () => {
    peopleCount = Number(btn.dataset.people) === 2 ? 2 : 1;
    document.querySelectorAll("[data-people]").forEach((b) => {
      const selected = b === btn;
      b.classList.toggle("is-selected", selected);
      b.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    onboardingData.pessoas = onboardingData.pessoas.slice(0, peopleCount);
  }));

  document.getElementById("caixaOnboardingNext1")?.addEventListener("click", () => {
    renderPeopleFields();
    renderStep(2);
  });
  document.getElementById("caixaOnboardingBack2")?.addEventListener("click", () => renderStep(1));
  document.getElementById("caixaOnboardingNext2")?.addEventListener("click", () => {
    if (!readPeople()) return;
    renderToneFields();
    renderStep(3);
  });
  document.getElementById("caixaOnboardingBack3")?.addEventListener("click", () => renderStep(2));
  document.getElementById("caixaOnboardingNext3")?.addEventListener("click", () => {
    renderImmersionFields();
    renderStep(4);
  });
  document.getElementById("caixaOnboardingBack4")?.addEventListener("click", () => renderStep(3));

  toneFields?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-tone]");
    if (!btn) return;
    const index = Number(btn.dataset.index);
    const value = btn.dataset.tone;
    readTone(index, value);
    toneFields.querySelectorAll(`[data-index="${index}"]`).forEach((b) => {
      const selected = b === btn;
      b.classList.toggle("is-selected", selected);
      b.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  });

  document.getElementById("caixaOnboardingFinish")?.addEventListener("click", finalizarOnboarding);
}

async function finalizarOnboarding() {
  const user = window.CAIXA_CURRENT_USER;
  if (!user) return;
  readImmersion();
  const finish = document.getElementById("caixaOnboardingFinish");
  finish.disabled = true;
  finish.textContent = "Preparando…";
  setMessage();
  try {
    const db = getFirestore(window.CAIXA_FIREBASE_APP);
    const userRef = doc(db, "users", user.uid);
    const batch = writeBatch(db);
    const baseData = {
      setupComplete: true,
      profileMode: peopleCount === 2 ? "juntos" : "individual",
      updatedAt: serverTimestamp()
    };

    // A conta vitalícia recebe sua autorização inicial automaticamente.
    // Contas mensais precisam ter sido liberadas previamente pelo responsável.
    const currentSnap = await getDoc(userRef);
    if (!currentSnap.exists()) {
      if (!isLifetimeUser(user)) throw new Error("ACCOUNT_NOT_AUTHORIZED");
      batch.set(userRef, {
        email: user.email || LIFETIME_EMAIL,
        ...baseData,
        acesso: { tipo: "vitalicio", status: "ativo", vencimento: null },
        createdAt: serverTimestamp()
      });
    } else {
      batch.set(userRef, baseData, { merge: true });
    }

    onboardingData.pessoas.forEach((person) => {
      batch.set(doc(collection(userRef, "pessoas"), person.id), {
        nome: person.nome,
        tomIA: person.tom,
        immersaoIA: person.immersao,
        ativo: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
    window.CAIXA_USER_PROFILE = {
      uid: user.uid,
      email: user.email || "",
      setupComplete: true,
      profileMode: peopleCount === 2 ? "juntos" : "individual",
      acesso: isLifetimeUser(user) ? { tipo: "vitalicio", status: "ativo", vencimento: null } : (currentSnap.data()?.acesso || null),
      pessoas: onboardingData.pessoas
    };
    setGate(false);
    document.body.classList.remove("caixa-auth-pending", "caixa-onboarding-open");
    window.dispatchEvent(new CustomEvent("caixa:perfil-carregado", { detail: window.CAIXA_USER_PROFILE }));
    window.CAIXA_PROFILE_READY_RESOLVE?.(window.CAIXA_USER_PROFILE);
  } catch (error) {
    console.error("Falha ao salvar perfil do Caixa", error);
    if (error?.message === "ACCOUNT_NOT_AUTHORIZED") {
      setGate(false);
      showAccessBlocked({ reason: "inactive" });
    } else {
      setMessage("Não consegui salvar sua configuração. Confira sua conexão e tente novamente.");
    }
    finish.disabled = false;
    finish.textContent = "Entrar no Caixa";
  }
}

setupInteractions();

window.CAIXA_PROFILE_READY = new Promise(async (resolve) => {
  window.CAIXA_PROFILE_READY_RESOLVE = resolve;
  const user = await (window.CAIXA_AUTH_READY || Promise.resolve(null));
  if (!user) {
    resolve(null);
    return;
  }

  try {
    const db = getFirestore(window.CAIXA_FIREBASE_APP);
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    const access = evaluateAccess(user, snap.exists() ? snap.data() : null);

    if (!access.allowed) {
      showAccessBlocked(access);
      resolve(null);
      return;
    }

    clearAccessGate();

    if (access.needsBootstrap) {
      // Não bloqueia o primeiro acesso do proprietário; o documento será criado
      // pelo onboarding com acesso vitalício protegido pelas Rules.
      setGate(true);
      document.body.classList.remove("caixa-auth-pending");
      document.body.classList.add("caixa-onboarding-open");
      renderPeopleFields();
      renderStep(1);
      return;
    }

    if (snap.exists() && snap.data()?.setupComplete) {
      const peopleSnap = await getDocs(collection(db, "users", user.uid, "pessoas"));
      const pessoas = peopleSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
      const profile = { uid: user.uid, email: user.email || "", ...snap.data(), pessoas };
      window.CAIXA_USER_PROFILE = profile;
      setGate(false);
      document.body.classList.remove("caixa-auth-pending", "caixa-onboarding-open");
      resolve(profile);
      return;
    }

    setGate(true);
    document.body.classList.remove("caixa-auth-pending");
    document.body.classList.add("caixa-onboarding-open");
    renderPeopleFields();
    renderStep(1);
  } catch (error) {
    console.error("Falha ao carregar perfil do Caixa", error);
    setGate(false);
    document.body.classList.remove("caixa-onboarding-open");
    createAccessGate("Não consegui verificar seu acesso.", "O Caixa não conseguiu consultar sua autorização no Firebase.", "Tente novamente em alguns instantes.");
    resolve(null);
  }
});
