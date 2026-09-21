CAIXA — FECHAMENTO INDIVIDUAL v22

Cerimônia de fechamento reconstruída como uma sequência de acontecimentos reais do mês.

- Davi e Gabriel fecham separadamente; Juntos não fecha.
- Mês/ano atual permanecem separados na configuração (P/Q).
- A cerimônia não depende de cookie/localStorage para aparecer.
- A confirmação do servidor apenas libera a sequência; não pula etapas.
- Abertura curta: “Só um instante”.
- “Olha o que você construiu” mostra os números e aguarda a animação.
- Em seguida são exibidos, quando existirem: última parcela paga, mês mais leve,
  meta atingida, categoria com suspense, comparação com mês anterior, maior aporte,
  dinheiro construído, rendimento, caixinha que mais cresceu, conquista silenciosa,
  maior movimento, quantidade de lançamentos, pendências e virada do ano.
- Eventos inexistentes são pulados, sem telas vazias.
- A cerimônia termina com uma frase sem números e uma transição suave para o próximo mês.


Correção v22 — arquitetura do fechamento:
- Salvamento no Apps Script e cerimônia visual agora rodam em paralelo.
- A cerimônia não fica esperando o retorno do servidor para sair de “Só um instante”.
- O resultado do salvamento é consultado somente na última tela.
- Sucesso: a última tela usa a frase final variável do mês.
- Falha: a última tela informa que não foi possível fechar o mês agora e que nada foi alterado.
- As etapas narrativas continuam sendo selecionadas conforme os acontecimentos do mês.
