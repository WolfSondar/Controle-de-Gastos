# Arquitetura JavaScript

O `app.js` agora é apenas o **orquestrador**. As regras da aplicação ficam em `js/modules/`.

## Regra principal

- `index.html` → estrutura da interface.
- `app.js` → carregamento dos módulos.
- `js/modules/` → comportamento e regras do sistema.
- `themes/` → identidade e comportamento específico de cada tema.

## Ordem dos módulos

Os arquivos são carregados sequencialmente. A ordem atual foi preservada para manter compatibilidade com o código existente, que utiliza funções e variáveis globais entre módulos.

- `00-bootstrap.js` — Bootstrap global e constantes compartilhadas (linhas originais 1–60)
- `01-caixinha-icons.js` — Ícones, busca, cache e picker das caixinhas (linhas originais 61–470)
- `02-dates-and-selects.js` — Datas e inicialização de selects (linhas originais 471–544)
- `03-indexeddb-cache.js` — IndexedDB e cache local (linhas originais 545–668)
- `04-state-and-backend.js` — Estado da aplicação, API e helpers de backend (linhas originais 669–1011)
- `05-theme-music.js` — Tema sazonal e música (linhas originais 1012–1228)
- `06-data-sync.js` — Carregamento, cache, salvamento e sincronização (linhas originais 1229–1608)
- `07-people.js` — Troca de pessoa e operações de listas (linhas originais 1609–1786)
- `08-caixinhas.js` — Criação, edição e movimentação de caixinhas (linhas originais 1787–1928)
- `09-divisions.js` — Divisões, transferências e vínculos entre pessoas (linhas originais 1929–2120)
- `10-status-and-payments.js` — Status de gastos/ganhos e animações de pagamento (linhas originais 2121–2533)
- `11-calculations.js` — Cálculos, totais e utilitários de resumo (linhas originais 2534–2748)
- `12-caixinhas-render.js` — Renderização das caixinhas e componentes relacionados (linhas originais 2749–3522)
- `13-dashboard.js` — Dashboard, gráficos e resumo mensal (linhas originais 3523–4305)
- `14-annual-categories.js` — Categorias no histórico anual (linhas originais 4306–4636)
- `15-history.js` — Histórico e visualizações históricas (linhas originais 4637–5560)
- `16-feedback-and-month-close.js` — Feedback visual, fechamento de mês e confirmação (linhas originais 5561–6558)
- `17-init-and-tooltips.js` — Inicialização, listeners e tooltips (linhas originais 6559–6743)
- `18-chat.js` — Assistente Caixa e fluxos conversacionais (linhas originais 6744–7806)
- `19-theme-preference.js` — Preferência claro/escuro/dispositivo (linhas originais 7807–7862)
- `20-settings.js` — Configurações do usuário (linhas originais 7863–8689)

## Como continuar a refatoração

Os módulos ainda preservam funções globais para evitar alterações de comportamento. A próxima etapa pode transformar grupos internos em APIs explícitas (`window.CAIXA_*`) e depois migrar para ES Modules (`import`/`export`) gradualmente.

### Onde mexer

- Lançamentos/status: `07-people.js`, `09-divisions.js`, `10-status-and-payments.js`
- Caixinhas: `01-caixinha-icons.js`, `08-caixinhas.js`, `12-caixinhas-render.js`
- Cálculos: `11-calculations.js`
- Dashboard/gráficos: `13-dashboard.js`
- Histórico: `14-annual-categories.js`, `15-history.js`
- Chat: `18-chat.js`
- Configurações: `20-settings.js`
- Temas: `themes/`
