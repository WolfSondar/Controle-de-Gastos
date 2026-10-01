# Caixa — Controle Financeiro

Aplicativo web pessoal para organizar ganhos, gastos, faturas, parcelas, caixinhas e fechamento mensal. O projeto foi pensado para funcionar como site estático e também pode ser instalado como PWA.

## Recursos

- Cadastro e acompanhamento de ganhos e despesas.
- Organização por perfis individuais e modo **Juntos** para visualização compartilhada.
- Caixinhas para acompanhar valores reservados e objetivos.
- Gastos à vista ou parcelados, com associação a faturas cadastradas.
- Controle de pagamento de contas e itens pendentes.
- Histórico mensal, evolução financeira e fechamento de mês.
- Assistente no chat para orientar consultas e o cadastro de lançamentos.
- Temas claro/escuro, temas sazonais e trilhas sonoras correspondentes.
- Cache local e suporte a uso offline, com sincronização quando a conexão retorna.

## Tecnologias e arquitetura

- **HTML, CSS e JavaScript:** interface e lógica do aplicativo.
- **Firebase Authentication:** autenticação com conta Google.
- **Cloud Firestore:** persistência de dados, configurações, histórico e backups.
- **Firebase AI Logic / Gemini:** funcionalidades de IA do chat.
- **IndexedDB e Service Worker:** cache local e suporte offline.
- **GitHub Pages:** hospedagem estática, sem etapa de build.

O aplicativo não depende de Google Sheets nem de Google Apps Script para operar.

## Estrutura do projeto

```text
index.html                    Estrutura da aplicação
style.css                     Estilos gerais, quando utilizado
app.js                        Ponto de entrada e integração dos módulos
firebase-config.js            Configuração pública do Firebase
firebase-client.js            Autenticação, Firestore, IA e sincronização
firestore.rules               Regras de acesso aos dados
firebase-migration-data.js    Snapshot auxiliar da migração inicial
sw.js                         Service Worker e versão do cache
manifest*.json                Configurações do PWA e temas
js/core/                      Inicialização, namespace e API pública
js/modules/                   Módulos de funcionalidades do aplicativo
themes/                       Temas padrão e sazonais
IMG/                          Ícones e imagens
music/                        Trilhas sonoras dos temas
```

> A organização interna pode evoluir. Ao alterar arquivos, confira as referências de scripts e estilos em `index.html` e mantenha os módulos carregados na ordem esperada pelo projeto.

## Configuração do Firebase

1. Abra o projeto Firebase vinculado ao aplicativo.
2. Confira se **Authentication** está habilitado e se o provedor Google está configurado.
3. Verifique se o **Cloud Firestore** está criado e com as regras de `firestore.rules` publicadas.
4. Confira as configurações públicas do aplicativo em `firebase-config.js`.
5. Para recursos de IA, habilite e configure o **Firebase AI Logic** e o App Check conforme as opções disponíveis no console Firebase.

A configuração Web do Firebase identifica o projeto, mas não substitui as regras de segurança. Os documentos financeiros devem permanecer acessíveis somente ao usuário autorizado pelas regras.

### Organização dos dados

O aplicativo separa os dados dos perfis e mantém configurações, histórico e backups associados ao usuário autenticado. O modo **Juntos** reúne informações para consulta; não deve ser tratado como um perfil independente de gravação.

## Publicação no GitHub Pages

1. Envie os arquivos do projeto para o repositório.
2. Nas configurações do GitHub, habilite Pages para a branch e pasta que contêm `index.html`.
3. Aguarde a publicação e abra a URL fornecida pelo GitHub.
4. Após atualizar o aplicativo, valide a versão publicada e a instalação PWA.

Não é necessário instalar Node.js, executar um servidor próprio ou publicar um Apps Script para a versão estática.

## Atualização do cache e PWA

Quando modificar arquivos que o Service Worker armazena em cache, atualize a constante de versão em `sw.js` (por exemplo, `CACHE_VERSION`) para que os clientes descartem os recursos antigos e busquem os novos. Mantenha os arquivos `manifest*.json` e os ícones referenciados alinhados ao tema ativo.

## Migração antiga

`firebase-migration-data.js` é um arquivo auxiliar da migração dos dados legados para o Firebase. Só o remova depois de confirmar que os dados necessários foram importados e que existe um backup independente e válido.

## Segurança e privacidade

- Nunca inclua senhas, tokens privados ou chaves secretas no repositório.
- A configuração pública do Firebase para Web pode estar no código; a proteção efetiva depende de Authentication, regras do Firestore e App Check quando aplicável.
- Revise as regras de segurança antes de publicar alterações.
- Faça backup antes de executar migrações ou mudanças estruturais nos dados.

## Manutenção

- Preserve a separação entre núcleo, módulos de funcionalidades e temas.
- Ao adicionar campos financeiros, confira cadastro, edição, cálculos, histórico, sincronização e exportação/backup.
- Ao alterar o fluxo de gastos parcelados ou faturas, teste tanto o cenário com uma fatura quanto com várias, além dos estados pago e pendente.
- Valide JavaScript e teste a aplicação em desktop e dispositivos móveis após mudanças relevantes.

---

**Caixa — organização financeira com ganhos, gastos e objetivos em um só lugar.**
