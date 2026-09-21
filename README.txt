CAIXA — FECHAMENTO INDIVIDUAL v24

Correção e diagnóstico do erro 404 do Apps Script.

ANÁLISE:
- A v23 não alterou Code.gs nem a URL da API em relação à v22.
- Portanto, o 404 em script.googleusercontent.com/macros/echo não foi causado pela mudança visual da cerimônia.
- Esse 404 é gerado pelo Web App do Google Apps Script quando o endpoint/implantação usado pela API_URL não consegue atender a requisição.

ALTERAÇÕES v24:
- GETs da API agora validam HTTP status antes de tentar ler JSON.
- Erros 404 recebem diagnóstico específico no app: verificar implantação do Web App e API_URL.
- A configuração opcional da IA não interfere na inicialização do app se o endpoint estiver indisponível.
- Nenhuma chamada nova ao Apps Script foi criada pela cerimônia.
- Code.gs foi mantido igual à v23 para não mascarar o problema de implantação.
- A cerimônia da v23 e o fechamento individual Davi/Gabriel foram preservados.

IMPORTANTE:
Se a mensagem 404 continuar, o próximo ponto a conferir é a implantação do Web App no Apps Script. A API_URL deve apontar para a URL /exec da implantação ativa. O endereço script.googleusercontent.com/macros/echo é um redirecionamento interno do Google e não deve ser usado como API_URL.
