# Arquitetura JavaScript — Caixa

## Camadas

- `index.html` — esqueleto/markup.
- `app.js` — bootstrap e orquestração; não deve conter regra de negócio.
- `js/core/` — infraestrutura compartilhada: namespace, eventos, carregador e API pública.
- `js/modules/` — funcionalidades do sistema.
- `themes/` — identidade e comportamento específico dos temas.

## Regra para novos códigos

1. Não coloque funções de negócio em `app.js`.
2. Não crie novas variáveis globais quando puder usar `window.CAIXA`.
3. Estado compartilhado deve ficar em `window.CAIXA.state`.
4. Comunicação entre partes novas deve preferir `CAIXA.on()` / `CAIXA.emit()`.
5. Código visual específico de tema pertence a `themes/`.
6. O Firebase continua isolado atrás de `window.CAIXA_FIREBASE`.

## Compatibilidade

Os módulos atuais ainda são scripts clássicos para preservar as funções globais
existentes. A camada `CAIXA` é a ponte de migração. Novos módulos podem ser
convertidos gradualmente para APIs explícitas sem reescrever o sistema inteiro
de uma vez.

### Eventos disponíveis

- `core:ready`
- `module:loaded`
- `module:ready`
- `app:modules-ready`
- `api:ready`
- `app:ready`
