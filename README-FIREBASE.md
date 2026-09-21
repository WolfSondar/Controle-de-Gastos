# Caixa — migração para Firebase / Firestore

Esta versão prepara o Caixa para trocar o Google Sheets como banco principal por Cloud Firestore.

## O que foi alterado

- Dados de Davi e Gabriel passam a ser lidos/escritos no Firestore.
- Fechamento individual de mês passa a ser feito em uma transação do Firestore.
- Transferências Davi ↔ Gabriel passam a usar transação.
- O Firestore usa cache persistente no navegador para deixar o app rápido e funcionar offline.
- Foi adicionado login com Google via Firebase Authentication.
- As regras de Firestore ficam em `firestore.rules`.
- O Apps Script continua somente para a IA nesta primeira etapa. Não apague o `Code.gs` ainda.
- `firebase-config.js` é o único arquivo que você precisa preencher com o `firebaseConfig` do seu projeto.

## Configuração no Firebase

1. Acesse https://console.firebase.google.com/ e crie um projeto.
2. No projeto, adicione um aplicativo Web (`</>`).
3. Copie o objeto `firebaseConfig` e cole em `firebase-config.js`.
4. Em Authentication → Sign-in method, habilite Google.
5. Em Authentication → Settings → Authorized domains, adicione o domínio do GitHub Pages do Caixa.
6. Em Firestore Database, crie o banco em modo de produção.
7. Em Firestore → Rules, cole o conteúdo de `firestore.rules` e publique.
8. Envie os arquivos atualizados para o GitHub.
9. Abra o Caixa e entre com a mesma conta Google que você quer usar para o banco.

## Migração da planilha atual

NÃO apague a planilha antiga antes de conferir a migração.

Depois de configurar o Firebase e entrar no Caixa, abra o DevTools do navegador (F12 → Console) e execute:

    await window.CAIXA_MIGRAR_PLANILHA_FIREBASE()

A rotina lê Davi, Gabriel, histórico e configuração pela API antiga e grava tudo no Firestore do usuário autenticado.

Depois recarregue o Caixa. Os dados deverão vir do Firestore.

## Observação sobre a IA

As ações `gerarInsightIA` e `gerarRespostaGastarIA` ainda usam o Apps Script nesta primeira etapa. Isso é intencional: as chaves da IA não devem ser colocadas no JavaScript público do GitHub Pages.

Na segunda etapa podemos migrar essas chamadas para Cloud Functions/Cloud Run e retirar o `Code.gs` completamente.

## Estrutura do banco

    users/{UID}/profiles/davi
    users/{UID}/profiles/gabriel
    users/{UID}/config/app
    users/{UID}/historico/principal

Cada perfil mantém os mesmos arrays que o Caixa já usa (`ganhos`, `gastosFixos`, `gastosVariaveis`, `caixinhas`), reduzindo a quantidade de alterações necessárias no restante do aplicativo.
