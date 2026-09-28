# Caixa — Controle de Gastos

Aplicativo pessoal para controle de ganhos, gastos, caixinhas e fechamento mensal.

## Arquitetura atual

O Caixa não usa mais Google Sheets nem Google Apps Script como banco ou backend.

- **Firebase Authentication** — login com Google.
- **Cloud Firestore** — dados financeiros, configurações, histórico e backups.
- **Firebase AI Logic + Gemini** — recursos de IA do aplicativo.
- **Service Worker / IndexedDB** — cache e fila offline.
- **GitHub Pages** — publicação do aplicativo, sem etapa de build.

### Arquivos principais

- `index.html` — estrutura da aplicação.
- `style.css` — aparência e componentes visuais.
- `app.js` — regras da interface, cálculos e operações do aplicativo.
- `firebase-config.js` — configuração pública do projeto Firebase.
- `firebase-client.js` — autenticação, Firestore, backups e Firebase AI Logic.
- `firestore.rules` — regras de segurança do Firestore.
- `firebase-migration-data.js` — snapshot usado na migração inicial dos dados antigos; pode ser removido depois de confirmar que a migração está concluída.
- `sw.js` — funcionamento offline e atualização do app.
- `manifest.json` — configuração do PWA.
- `IMG/` — ícones utilizados pelo aplicativo.

## O que foi removido

Os arquivos abaixo não fazem mais parte do projeto:

- `Code.gs`
- `config.js`

Não é necessário manter um Web App do Apps Script para o aplicativo funcionar.

## IA sem Code.gs

A IA agora usa o **Firebase AI Logic**, que fornece um SDK próprio para aplicações web e faz a comunicação com os modelos Gemini através do Firebase. O aplicativo não guarda uma chave do Gemini dentro do código-fonte.

O modelo usado pelo Caixa é `gemini-3.8-flash`.

### Configuração da IA no Firebase

No console do Firebase do projeto:

1. Abra o projeto `caixa-controle-financeir-6c7bd`.
2. Ative o **Firebase AI Logic** e o provedor **Gemini Developer API**, se ainda não estiver ativado.
3. Confirme que a API do Firebase AI Logic está habilitada.
4. Configure o **Firebase App Check** para a aplicação Web usando **reCAPTCHA Enterprise**.
5. Copie a chave pública do reCAPTCHA Enterprise para `firebase-config.js`:

```js
appCheckRecaptchaKey: "SUA_CHAVE_PUBLICA_DO_RECAPTCHA"
```

A chave do reCAPTCHA é pública e pode ficar no código do aplicativo. A chave secreta não deve ser colocada neste repositório.

O App Check é importante porque a IA é chamada diretamente pelo navegador. O Firebase informa que a aplicação do App Check para Firebase AI Logic será obrigatória a partir de **2 de novembro de 2026**.

## Configuração do Firebase

`firebase-config.js` contém apenas a configuração pública do aplicativo Web do Firebase. Ela identifica o projeto, mas não substitui as regras de segurança do Firestore.

A proteção dos dados depende de:

- Firebase Authentication;
- Firestore Security Rules;
- App Check, quando configurado;
- acesso aos documentos limitado ao usuário autenticado.

## Dados e estrutura do Firestore

O aplicativo trabalha principalmente com estes documentos por usuário:

```text
users/{uid}/profiles/davi
users/{uid}/profiles/gabriel
users/{uid}/config/app
users/{uid}/historico/principal
users/{uid}/backups/*
```

As informações de Davi e Gabriel são mantidas separadas. O modo **Juntos** combina os dados para visualização e permanece somente leitura.

## Offline

O aplicativo mantém dados locais para permitir consulta sem internet e possui uma fila de operações para sincronizar alterações quando a conexão voltar.

O Service Worker não depende de Apps Script e não precisa mais armazenar `config.js`.

## Migração antiga

`firebase-migration-data.js` é um snapshot criado durante a migração da antiga planilha para o Firebase.

Depois de conferir que todos os dados importantes estão corretos no Firebase, esse arquivo também pode ser removido. Antes de apagar, é recomendável manter um backup do projeto.

## Publicação

O projeto pode continuar sendo publicado como site estático, por exemplo no GitHub Pages.

Não é necessário executar servidor Node, instalar dependências ou publicar um Apps Script para a aplicação funcionar.

## Manutenção

Ao alterar arquivos importantes do app, atualize a versão do cache em `sw.js`:

```js
const CACHE_VERSION = "caixa-vXX";
```

Isso faz o Service Worker descartar os caches antigos e carregar a nova versão.

## Segurança

Nunca coloque neste projeto:

- chaves secretas de APIs;
- senhas;
- tokens privados;
- credenciais de servidor.

A configuração pública do Firebase Web pode permanecer no projeto. As permissões reais dos dados são controladas pelas regras do Firestore.

## Resumo

O Caixa agora é essencialmente:

```text
Navegador
   │
   ├── Firebase Authentication
   ├── Cloud Firestore
   └── Firebase AI Logic → Gemini
```

**Google Sheets e Google Apps Script não são mais necessários para o funcionamento do sistema.**
