# 💰 CAIXA — Gestão Financeira Pessoal & Compartilhada

O **CAIXA** é uma aplicação web progressiva (**PWA**) leve, intuitiva e *Offline-First* desenvolvida para o controle financeiro individual e compartilhado. O sistema utiliza uma planilha do **Google Sheets** como banco de dados através de uma API em **Google Apps Script**, permitindo total controle e persistência dos dados na nuvem sem custos de hospedagem de servidor.

---

## 🚀 O que o Sistema Faz

### 👥 1. Gestão Multiperfil (Individual e Conjunto)
* **Perfis Individuais:** Registre receitas, despesas e metas de forma isolada para cada usuário (ex: *Davi* e *Gabriel*).
* **Visão Compartilhada ("Juntos"):** Alternância rápida para um painel consolidado que combina o saldo, gastos e metas de ambas as partes, ideal para casais ou residentes da mesma casa.

### 💵 2. Controle de Entradas e Benefícios
* **Lançamento de Ganhos:** Registro de salários, extras e transferências com status de *Recebido* ou *Pendente*.
* **Identificação de Benefícios:** Separação automática de saldos provenientes de vale-refeição/alimentação ou multibenefícios para fácil visualização do saldo disponível.

### 📌 3. Gestão de Gastos Fixos e Variáveis
* **Gastos Fixos:** Acompanhamento de contas recorrentes do mês com alternância de status (*Pago* / *Pendente*).
* **Gastos Variáveis:** Registro de despesas do dia a dia, compras parceladas e gastos categorizados.
* **Alertas e Tags Visuais:** Identificação automática de lançamentos atrasados, compras adiantadas (*Lembretes*) ou referentes ao mês seguinte.

### 🤝 4. Divisão de Despesas e Acerto de Contas
* **Divisão 50/50:** Permite dividir qualquer compra no momento do lançamento em metadas iguais entre os perfis.
* **Registro de Credor/Devedor:** Se um usuário pagar o valor total de uma conta compartilhada, o sistema registra automaticamente a metade devida pelo outro (*"deve pra..."*).
* **Quitação Automática:** Quando o devedor marca a sua metade como paga, o sistema gera o crédito/ganho automaticamente na conta de quem financiou o pagamento.
* **Transferências Diretas:** Realize transferências de saldo entre perfis com ajuste imediato nos dois extratos.

### 🎯 5. Caixinhas de Objetivos e Reservas Financeiras
* **Metas e Progresso:** Criação de caixinhas para objetivos de curto/médio/longo prazo com barras de progresso percentual e indicador de meta concluída.
* **Aportes e Retiradas:** Movimentação direta entre o saldo principal e as caixinhas.
* **Gestão de Rendimentos:** Cálculo e acompanhamento de rendimentos acumulados (positivos ou negativos) sobre os valores guardados.
* **Ícones Personalizados com Suporte Offline:** Escolha de ícones por categoria carregados diretamente do repositório/pasta do projeto, organizados por busca e categorias com cache offline.

### ⚡ 6. Arquitetura *Offline-First* (PWA)
* **Funcionamento sem Internet:** Acesse e navegue por todos os dados salvos mesmo offline via **IndexedDB** e **Service Worker**.
* **Fila de Sincronização em Segundo Plano (Background Sync):** Registre alterações, pagamentos e novos lançamentos offline. Assim que a conexão for reestabelecida, o sistema sincroniza automaticamente as pendências com a planilha no Google Sheets.
* **Instalável:** Pode ser adicionado à tela inicial do celular ou desktop como um aplicativo nativo.

### 📊 7. Visualização, Gráficos e Insights
* **Resumos Dinâmicos:** Dashboard com saldo atual, total acumulado no mês, total guardado e pendências a pagar/receber.
* **Categorização Personalizável:** Distribuição visual dos gastos por categoria com suporte a cores customizadas.
* **Histórico Financeiro:** Consulta e comparativo de meses e anos anteriores.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5, CSS3 (Design System com variáveis, animações e suporte a gestos *Swipe* no mobile/PC), JavaScript Vanilla (ES6+).
* **Armazenamento Local & Offline:** IndexedDB, LocalStorage, Cache API.
* **PWA:** Service Worker (`sw.js`) com estratégias de cache *Stale-While-Revalidate* e *Background Sync*.
* **Backend & Banco de Dados:** Google Apps Script (Web App RESTful API) integrado ao **Google Sheets**.
* **Integração de Mídia:** GitHub API para listagem e cache dinâmico de ícones personalizados.

---

## 📁 Estrutura dos Arquivos Principais
