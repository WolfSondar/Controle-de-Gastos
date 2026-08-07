# Caixa — Controle Financeiro e Objetivos

Site pessoal de controle financeiro que usa a sua planilha do Google Sheets
como banco de dados (leitura e escrita — mão dupla).

## Como funciona

Como o GitHub Pages só hospeda arquivos estáticos (HTML/CSS/JS), ele não
consegue escrever direto numa planilha do Google. A ponte é feita por um
**Google Apps Script** publicado como "App da Web": o site chama essa URL
para ler os dados e para salvar novos ganhos, gastos e objetivos.

```
[Site no GitHub Pages]  <--fetch()-->  [Apps Script /exec]  <-->  [Sua planilha]
```

## Passo 1 — Preparar a planilha

Sua planilha já está no formato certo:

| GANHOS | VALOR GANHO | GASTOS FIXOS | VALOR FIXO | GASTOS VARIÁVEIS | VALOR VARIÁVEL | OBJETIVOS | CUSTO | VALOR ADICIONADO |

Confira o **nome da aba** (a abinha lá embaixo da planilha). Você vai usar
esse nome no Passo 2.

## Passo 2 — Publicar o Apps Script

1. Abra sua planilha no navegador.
2. Vá em **Extensões > Apps Script**.
3. Apague o conteúdo do arquivo `Code.gs` que abrir.
4. Abra o arquivo `Code.gs` deste projeto, copie tudo e cole lá.
5. Na primeira linha de código, ajuste se precisar:
   ```js
   const SHEET_NAME = "Sistema de Controle Financeiro";
   ```
   Troque pelo nome exato da sua aba (se não encontrar, o script usa a
   primeira aba automaticamente).
6. Clique em **Salvar** (ícone de disquete).
7. Clique em **Implantar** (Deploy) → **Nova implantação**.
8. Em "Selecionar tipo", escolha **App da Web**.
9. Configure:
   - **Executar como:** Eu (seu e-mail)
   - **Quem pode acessar:** Qualquer pessoa
10. Clique em **Implantar**. O Google vai pedir autorização — aceite
    (é o seu próprio script acessando sua própria planilha).
11. Copie a **URL do app da Web** (termina em `/exec`).

> ⚠️ Qualquer pessoa que tiver essa URL consegue ler e alterar a planilha.
> Não publique essa URL em lugar nenhum público, nem mesmo no código do
> GitHub — o `config.js` é o único lugar onde ela deve aparecer, e mesmo
> assim, saiba que ela fica visível para quem abrir o site (isso é uma
> limitação de sites 100% estáticos sem login). Para um controle financeiro
> pessoal isso costuma ser aceitável, mas vale saber.

## Passo 3 — Configurar o site

1. Abra o arquivo `config.js`.
2. Troque `COLE_AQUI_A_URL_DO_SEU_APPS_SCRIPT` pela URL que você copiou:
   ```js
   const API_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   ```
3. Salve.

## Passo 4 — Publicar no GitHub Pages

1. Crie um repositório novo no GitHub (pode ser privado ou público).
2. Suba os arquivos: `index.html`, `style.css`, `app.js`, `config.js`.
   (`Code.gs` não precisa ir para o GitHub — ele já está na planilha.)
3. No repositório, vá em **Settings > Pages**.
4. Em "Source", escolha a branch `main` e a pasta `/ (root)`.
5. Salve e aguarde alguns minutos. O GitHub mostra a URL do site
   (algo como `https://seu-usuario.github.io/seu-repositorio/`).

Pronto — abra a URL no celular e comece a usar. Dá pra "Adicionar à Tela de
Início" no navegador do celular pra abrir como se fosse um app.

## O que o site faz

- **Resumo:** saldo disponível (ganhos − fixos − variáveis), totais por
  categoria, últimos lançamentos e progresso das metas.
- **Ganhos:** adicionar e remover entradas de dinheiro.
- **Fixos:** adicionar e remover gastos fixos mensais.
- **Variáveis:** adicionar e remover gastos avulsos.
- **Metas:** criar objetivos com custo total, guardar valores aos poucos
  e ver quanto ainda falta, com barra de progresso.

Toda alteração é salva na planilha automaticamente (sem precisar clicar em
"salvar" — o indicador no topo mostra "Salvando…" e depois "Sincronizado").

## Testando localmente antes de publicar

Você pode abrir o `index.html` direto no navegador para testar, mas alguns
navegadores bloqueiam `fetch()` em arquivos abertos com `file://`. Se isso
acontecer, use uma extensão tipo "Live Server" ou rode:
```
python3 -m http.server 8000
```
na pasta do site e acesse `http://localhost:8000`.

## Personalizando

- Cores e fontes: tudo centralizado no topo do `style.css`, nas variáveis
  `:root` (verde-tinta, dourado dos objetivos, vermelho dos gastos).
- Se quiser editar ou remover valores individuais (não só adicionar/tirar),
  me chame que eu adiciono.
