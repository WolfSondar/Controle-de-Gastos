CAIXA — Fechamento individual v20

Correção da cerimônia de fechamento:
- sequência única, sem timers concorrentes;
- título, texto e conteúdo de cada tela são trocados juntos;
- abertura “Só um instante” curta;
- a cerimônia aguarda a confirmação real do Apps Script sem travar a tela;
- a etapa de números permanece visível por tempo controlado;
- a etapa de caixinhas só aparece quando existe conteúdo;
- a tela final só aparece depois das etapas anteriores;
- exceções na cerimônia não deixam o overlay preso indefinidamente.

Mantida a arquitetura de fechamento individual Davi/Gabriel e mês/ano separados em P/Q.
