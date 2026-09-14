import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const gate = document.getElementById("caixaAuthGate");
const form = document.getElementById("caixaLoginForm");
const emailEl = document.getElementById("caixaAuthEmail");
const passwordEl = document.getElementById("caixaAuthPassword");
const submitEl = document.getElementById("caixaLoginSubmit");
const messageEl = document.getElementById("caixaAuthMessage");
const forgotEl = document.getElementById("caixaForgotPassword");
const googleEl = document.getElementById("caixaGoogleLogin");
const legacyToggle = document.getElementById("caixaLegacyToggle");

function showMessage(text, type = "error") {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.className = `caixa-auth-message ${type}`;
}
function clearMessage() {
  if (!messageEl) return;
  messageEl.textContent = "";
  messageEl.className = "caixa-auth-message is-hidden";
}
function setGoogleBusy(busy) {
  if (!googleEl) return;
  googleEl.disabled = busy;
  googleEl.classList.toggle("is-busy", busy);
  googleEl.querySelector("span:last-child")?.replaceChildren(document.createTextNode(busy ? "Abrindo Google…" : "Continuar com Google"));
}
function setLegacyBusy(busy) {
  if (!submitEl) return;
  submitEl.disabled = busy;
  submitEl.textContent = busy ? "Aguarde…" : "Entrar";
}
function isConfigured(config) {
  return config && config.apiKey && config.apiKey !== "COLE_AQUI" && config.projectId && config.projectId !== "COLE_AQUI";
}
function authError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/popup-closed-by-user": "A janela do Google foi fechada. Tente novamente.",
    "auth/popup-blocked": "O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente novamente.",
    "auth/cancelled-popup-request": "O login foi cancelado. Tente novamente.",
    "auth/account-exists-with-different-credential": "Esta conta já existe com outro método de login. Use o acesso por e-mail e senha uma vez para continuar.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-login-credentials": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Não foi possível conectar. Verifique sua internet.",
    "auth/user-disabled": "Esta conta está desativada."
  };
  return messages[code] || "Não foi possível concluir o login agora. Tente novamente.";
}

if (!isConfigured(window.CAIXA_FIREBASE_CONFIG)) {
  showMessage("O Firebase ainda não foi configurado.", "setup");
  window.CAIXA_AUTH_READY = Promise.resolve(null);
} else {
  const firebaseApp = initializeApp(window.CAIXA_FIREBASE_CONFIG);
  const auth = getAuth(firebaseApp);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });

  window.CAIXA_FIREBASE_APP = firebaseApp;
  window.CAIXA_AUTH = auth;
  window.CAIXA_AUTH_READY = new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      document.body.classList.toggle("caixa-authenticated", !!user);
      document.body.classList.toggle("caixa-auth-pending", !user);
      gate?.setAttribute("aria-hidden", user ? "true" : "false");
      window.CAIXA_CURRENT_USER = user || null;
      resolve(user || null);
    });
  });

  // A persistência é configurada antes do primeiro login, mas não bloqueia os listeners.
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn("Caixa: não foi possível ativar a persistência local da sessão.", error);
  });

  googleEl?.addEventListener("click", async (event) => {
    event.preventDefault();
    clearMessage();
    setGoogleBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Caixa: login Google", error);
      showMessage(authError(error));
      setGoogleBusy(false);
    }
  });

  legacyToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    clearMessage();
    form?.classList.toggle("is-hidden");
    legacyToggle.textContent = form?.classList.contains("is-hidden") ? "Entrar com e-mail e senha" : "Ocultar acesso por e-mail";
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearMessage();
    const email = emailEl?.value.trim() || "";
    const password = passwordEl?.value || "";
    if (!email || !password) {
      showMessage("Preencha seu e-mail e sua senha.");
      return;
    }
    setLegacyBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showMessage(authError(error));
      setLegacyBusy(false);
    }
  });

  forgotEl?.addEventListener("click", async (event) => {
    event.preventDefault();
    clearMessage();
    const email = emailEl?.value.trim() || "";
    if (!email) {
      showMessage("Digite seu e-mail primeiro para receber o link de recuperação.");
      emailEl?.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showMessage("Enviamos um link de recuperação para seu e-mail.", "success");
    } catch (error) {
      showMessage(authError(error));
    }
  });
}
