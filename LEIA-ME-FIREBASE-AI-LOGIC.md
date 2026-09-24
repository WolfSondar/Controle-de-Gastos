# Caixa — v47 Firebase AI Logic (Spark)

Esta versão remove a arquitetura de Cloud Functions e usa o Firebase AI Logic com o Gemini Developer API pelo SDK web oficial.

## Arquivos removidos da arquitetura anterior

Remova do projeto:

- `functions/` (pasta inteira)
- `firebase.json` (era usado para deploy das Functions/Rules; GitHub Pages não precisa dele)
- `.firebaserc` (era usado pelo Firebase CLI para deploy; não é necessário para GitHub Pages)

Podem permanecer, embora não sejam necessários para o funcionamento do GitHub Pages:

- `firestore.rules` — é a fonte das regras do Firestore. Não é carregado pelo navegador.

Não há mais dependência de:

- `firebase-functions.js`
- `httpsCallable`
- `geminiGenerate`
- `getGeminiKeyStatus`
- `saveGeminiApiKey`
- Cloud Functions / Cloud Build / Artifact Registry

## Configuração no Firebase Console

1. Abra o projeto `caixa-controle-financeir-6c7bd`.
2. Vá em **AI Services > AI Logic**.
3. Clique em **Get started**.
4. Escolha **Gemini Developer API**.
5. Não escolha o Agent Platform Gemini API/Vertex AI, pois esse caminho pode exigir billing.
6. Em **Security > App Check > Apps**, confirme que o app web está registrado.
7. Use o provedor **reCAPTCHA Enterprise** para o app web.
8. Em **Security > App Check > APIs**, confirme a proteção do **Firebase AI Logic**.

A chave Gemini não deve ser adicionada ao código do GitHub nem ao Firestore. O Firebase AI Logic usa o próprio proxy do Firebase para manter a chave do Gemini fora do código público.

## App Check

O `firebase-client.js` já inicializa o App Check com o site key reCAPTCHA Enterprise configurado anteriormente para `wolfsondar.github.io` e ativa renovação automática e tokens de uso limitado.

Se o console continuar mostrando erro `400` do reCAPTCHA, não altere a chave Gemini nem coloque uma chave no código. Nesse caso, o próximo passo é conferir no Firebase Console o registro do app web, o site key reCAPTCHA Enterprise e o domínio autorizado `wolfsondar.github.io`.

## Publicação

Depois de testar, envie os arquivos do projeto normalmente para o GitHub Pages. Não é necessário executar `firebase deploy`, instalar Firebase CLI ou ativar Blaze para publicar o site no GitHub Pages.
