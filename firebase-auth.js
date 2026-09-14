import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const gate = document.getElementById("caixaAuthGate");
const form = document.getElementById("caixaLoginForm");
const emailEl = document.getElementById("caixaAuthEmail");
const passwordEl = document.getElementById("caixaAuthPassword");
const submitEl = document.getElementById("caixaLoginSubmit");
const messageEl = document.getElementById("caixaAuthMessage");
const forgotEl = document.getElementById("caixaForgotPassword");
const createEl = document.getElementById("caixaCreateAccount");

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

function setBusy(busy, label = "Entrar") {
  if (!submitEl) return;
  submitEl.disabled = busy;
  submitEl.textContent = busy ? "Aguarde…" : label;
  form?.classList.toggle("is-busy", busy);
}

function isConfigured(config) {
  return config && config.apiKey && config.apiKey !== "COLE_AQUI" && config.projectId && config.projectId !== "COLE_AQUI";
}

function authError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-login-credentials": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Esse e-mail já possui uma conta.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Não foi possível conectar. Verifique sua internet.",
    "auth/user-disabled": "Esta conta está desativada."
  };
  return messages[code] || "Não foi possível concluir a operação agora. Tente novamente.";
}

if (!isConfigured(window.CAIXA_FIREBASE_CONFIG)) {
  showMessage("O Firebase ainda não foi configurado. Insira o firebaseConfig fornecido pelo Firebase Console.", "setup");
  submitEl?.setAttribute("disabled", "disabled");
  createEl?.setAttribute("disabled", "disabled");
  forgotEl?.setAttribute("disabled", "disabled");
  window.CAIXA_AUTH_READY = Promise.resolve(null);
} else {
  const firebaseApp = initializeApp(window.CAIXA_FIREBASE_CONFIG);
  const auth = getAuth(firebaseApp);

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

  await setPersistence(auth, browserLocalPersistence);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    if (!email || !password) {
      showMessage("Preencha seu e-mail e sua senha.");
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showMessage(authError(error));
      setBusy(false);
    }
  });

  createEl?.addEventListener("click", async () => {
    clearMessage();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    if (!email || !password) {
      showMessage("Digite o e-mail e uma senha para criar sua conta.");
      return;
    }
    setBusy(true, "Criar minha conta");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showMessage(authError(error));
      setBusy(false, "Entrar");
    }
  });

  forgotEl?.addEventListener("click", async () => {
    clearMessage();
    const email = emailEl.value.trim();
    if (!email) {
      showMessage("Digite seu e-mail primeiro para receber o link de recuperação.");
      emailEl.focus();
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
