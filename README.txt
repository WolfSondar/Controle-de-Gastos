CAIXA — Fechamento individual por perfil

Alterações principais:
1. Davi e Gabriel agora fecham o mês separadamente.
2. O modo Juntos continua somente leitura e não pode fechar mês.
3. O mês/ano atual passou a ser individual:
   - HISTORICO!P1:P3 = Davi (nome, ano atual, mês atual)
   - HISTORICO!Q1:Q3 = Gabriel (nome, ano atual, mês atual)
4. O fechamento grava no histórico apenas os dados do perfil que fechou.
5. Apenas a aba do perfil que fechou é avançada para o próximo mês.
6. O outro perfil permanece no mês aberto dele.
7. O cache do navegador também passou a guardar mês/ano por perfil.
8. A cerimônia começa com uma mensagem mais curta e as etapas ficam mais espaçadas.
9. O frontend impede o fechamento pelo modo Juntos e envia explicitamente o perfil ao Apps Script.

Planilha:
O arquivo Controle de Gastos.xlsx incluído já está com P/Q separados por perfil e começa ambos em 09/2026, preservando o estado global anterior.

Importante:
Substitua o Code.gs no projeto do Apps Script e publique uma nova versão do Web App. Depois, use a planilha incluída ou aplique a mesma organização em HISTORICO.
