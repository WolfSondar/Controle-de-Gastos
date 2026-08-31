# Caixa — Controle Financeiro e Objetivos

PWA pessoal de controle financeiro (funciona offline e pode ser instalado
no celular) que usa a sua planilha do Google Sheets como banco de dados —
leitura e escrita, mão dupla. Pensado para uso a dois: Davi e Gabriel, com
um terceiro modo "Juntos" que soma os dois.

## Como funciona

Como o GitHub Pages só hospeda arquivos estáticos (HTML/CSS/JS), ele não
consegue escrever direto numa planilha do Google. A ponte é feita por um
**Google Apps Script** publicado como "App da Web": o site chama essa URL
para ler os dados e para salvar ganhos, gastos, metas e fechamentos de mês.

```
[Site no GitHub Pages]  <--fetch()-->  [Apps Script /exec]  <-->  [Sua planilha]
```

Um **Service Worker** (`sw.js`) cuida só do "app shell" — HTML/CSS/JS/ícone
— pra abrir instalado e funcionar offline. Os dados nunca passam pelo cache
do Service Worker: cada leitura/escrita na planilha é sempre fresca, com
uma fila offline própria (guardada no IndexedDB do navegador) que reenvia
o que não conseguiu sincronizar assim que a conexão volta.

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
2. Suba os arquivos do projeto: `index.html`, `style.css`, `app.js`,
   `config.js`, `sw.js`, `manifest.json` e a pasta `IMG/` (com o ícone).
   (`Code.gs` não precisa ir para o GitHub — ele já está na planilha.)
3. No repositório, vá em **Settings > Pages**.
4. Em "Source", escolha a branch `main` e a pasta `/ (root)`.
5. Salve e aguarde alguns minutos. O GitHub mostra a URL do site
   (algo como `https://seu-usuario.github.io/seu-repositorio/`).

Pronto — abra a URL no celular e comece a usar. Dá pra "Adicionar à Tela de
Início" no navegador do celular pra abrir instalado, como se fosse um app
nativo (é o manifest.json + o Service Worker que fazem isso funcionar).

> Toda vez que publicar uma mudança em `style.css`/`app.js`/`index.html`,
> suba também a versão do `CACHE_VERSION` lá no topo do `sw.js` — é isso
> que avisa o Service Worker que precisa baixar os arquivos novos de novo
> em vez de continuar servindo a versão antiga do cache.

## O que o site faz

- **Perfis:** alterna entre Davi, Gabriel e "Juntos" (soma dos dois),
  cada um com seus próprios ganhos, gastos e metas na mesma planilha.
- **Resumo:** saldo disponível (ganhos − fixos − variáveis), gráfico de
  gastos por categoria, últimos lançamentos e progresso das metas.
- **Ganhos:** adicionar e remover entradas de dinheiro.
- **Fixos:** adicionar e remover gastos fixos mensais.
- **Variáveis:** adicionar e remover gastos avulsos, com categoria
  opcional (a lista de categorias fica centralizada em `app.js`, na
  constante `CATEGORIAS`).
- **Metas:** criar objetivos com custo total, guardar valores aos poucos
  e ver quanto ainda falta, com barra de progresso.
- **Fechar mês:** encerra o mês corrente e guarda o resumo (saldo de cada
  um, gastos por categoria) pro **Histórico**, que mostra a evolução mês
  a mês e a soma de categorias por ano.
- **Offline:** o app abre e funciona sem internet; qualquer lançamento
  feito offline entra numa fila e é sincronizado sozinho quando a conexão
  volta (o indicador no topo mostra "Salvando…", "Sincronizado" ou a
  fila pendente).

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
- Categorias de gasto — **duas formas**:
  1. **Aba CONFIGS na planilha (recomendado):** crie uma aba chamada
     `CONFIGS` com cabeçalho `CATEGORIA` na coluna A e `COR` na coluna B
     (cor em hex, ex: `#b9862f`). A partir da primeira linha com dado,
     cada linha vira uma categoria disponível nos formulários e no
     gráfico, na cor que você escolher. Pra adicionar, editar ou remover
     uma categoria, basta editar essa aba — não precisa mexer em código
     nem reimplantar nada.
  2. **Lista fixa no código (fallback):** se a aba CONFIGS não existir
     (ou estiver vazia), o app usa a lista em `CATEGORIAS_PADRAO`, em
     `app.js`, com cores tiradas da paleta `PALETA_CATEGORIAS` logo
     abaixo, por ordem.
- Ganhos recorrentes (o que volta sozinho pro mês seguinte ao Fechar Mês,
  em vez de ser descartado): coluna `TERMO GANHO RECORRENTE` na mesma aba
  `CONFIGS` (coluna C) — um termo por linha (ex: `salario`, `refeicao`,
  `13o`). Não precisa estar alinhado com as linhas de categoria, são
  colunas independentes. Um ganho é considerado recorrente se o nome dele
  contiver qualquer um desses termos (sem diferenciar acento/maiúscula —
  "Salário" bate com o termo `salario`). Se a coluna C estiver vazia, usa
  o fallback fixo (`salario`, `refeicao`, `beneficio`) do `Code.gs`.
