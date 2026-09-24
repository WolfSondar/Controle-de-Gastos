const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

setGlobalOptions({
  region: "southamerica-east1",
  maxInstances: 2,
  timeoutSeconds: 60,
  memory: "256MiB",
});

const ALLOWED_UIDS = new Set([
  "rMURmjHzuVdfaQyeikEAAYdAJxi1",
  "r5yVCCMatXPVsCiiJcMKWM613gq1",
]);
const MODEL = "gemini-3.8-flash";
const SYSTEM_CONFIG_PATH = "system/config";
initializeApp();
const adminDb = getFirestore();

function bad(message) {
  throw new HttpsError("invalid-argument", message);
}

function sanitizeGenerationConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  const allowed = {};
  if (source.responseMimeType === "application/json") allowed.responseMimeType = "application/json";
  if (source.responseSchema && typeof source.responseSchema === "object") {
    const raw = JSON.stringify(source.responseSchema);
    if (raw.length > 20000) bad("Configuração de resposta muito grande.");
    allowed.responseSchema = source.responseSchema;
  }
  // O cliente não pode escolher parâmetros de custo/latência livremente.
  // O limite abaixo é suficiente para os insights e respostas curtas do Caixa.
  allowed.maxOutputTokens = 1200;
  allowed.thinkingConfig = { thinkingLevel: "low" };
  return allowed;
}

exports.geminiGenerate = onCall(
  {
    cors: ["https://wolfsondar.github.io"],
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Faça login para usar a IA.");
    }

    if (!ALLOWED_UIDS.has(request.auth.uid)) {
      throw new HttpsError("permission-denied", "Usuário não autorizado.");
    }

    const data = request.data && typeof request.data === "object" ? request.data : {};
    const configSnap = await adminDb.doc(SYSTEM_CONFIG_PATH).get();
    const geminiApiKey = String(configSnap.data()?.geminiApiKey || "").trim();
    if (!geminiApiKey) {
      throw new HttpsError("failed-precondition", "A chave da Gemini API ainda não foi configurada no Admin.");
    }
    const prompt = typeof data.prompt === "string" ? data.prompt : "";
    if (!prompt.trim()) bad("Prompt vazio.");
    if (prompt.length > 120000) bad("Prompt muito grande.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const payload = {
      contents: [{
        role: "user",
        parts: [{ text: prompt }],
      }],
      generationConfig: sanitizeGenerationConfig(data.generationConfig),
    };

    let response;
    let body;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiApiKey,
          },
          body: JSON.stringify(payload),
        });
        body = await response.json().catch(() => ({}));
        if (response.ok) break;
      } catch (err) {
        if (attempt === 2) {
          console.error("Gemini network error", err);
          throw new HttpsError("unavailable", "Não foi possível conectar à IA.");
        }
      }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }

    if (!response?.ok) {
      console.error("Gemini API error", response?.status, body?.error?.message || body);
      if (response?.status === 429) throw new HttpsError("resource-exhausted", "A IA atingiu o limite de uso. Tente novamente em instantes.");
      if (response?.status === 401 || response?.status === 403) throw new HttpsError("failed-precondition", "A credencial da Gemini API não está válida ou autorizada.");
      throw new HttpsError("internal", "A Gemini API não conseguiu processar a solicitação.");
    }

    const text = body?.candidates?.[0]?.content?.parts?.map(part => part?.text || "").join("").trim();
    if (!text) {
      console.error("Gemini returned no text", body);
      throw new HttpsError("internal", "A IA não devolveu uma resposta válida.");
    }

    return { ok: true, text };
  }
);


exports.getGeminiKeyStatus = onCall(
  { cors: ["https://wolfsondar.github.io"], enforceAppCheck: false },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login.");
    if (request.auth.uid !== "rMURmjHzuVdfaQyeikEAAYdAJxi1") {
      throw new HttpsError("permission-denied", "Somente o administrador pode consultar este estado.");
    }
    const snap = await adminDb.doc(SYSTEM_CONFIG_PATH).get();
    return { configured: Boolean(String(snap.data()?.geminiApiKey || "").trim()) };
  }
);

exports.saveGeminiApiKey = onCall(
  { cors: ["https://wolfsondar.github.io"], enforceAppCheck: false },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login.");
    if (request.auth.uid !== "rMURmjHzuVdfaQyeikEAAYdAJxi1") {
      throw new HttpsError("permission-denied", "Somente o administrador pode alterar a chave da Gemini API.");
    }
    const key = String(request.data?.apiKey || "").trim();
    if (key.length < 20 || key.length > 512) {
      throw new HttpsError("invalid-argument", "Chave Gemini inválida.");
    }
    await adminDb.doc(SYSTEM_CONFIG_PATH).set({
      geminiApiKey: key,
      updatedBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, configured: true };
  }
);
