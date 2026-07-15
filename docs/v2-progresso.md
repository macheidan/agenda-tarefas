# v2 → paridade com demo.tailadmin.com — progresso do loop

> **Status (2026-07-15, 9 iterações): o que eu conseguia fazer e VERIFICAR
> sozinho está feito.** O loop parou por dois bloqueios que dependem do Fábio:
> (1) 6 das 12 views estão desligadas nas settings dele e não renderizam;
> (2) a constituição precisa ser decidida (proposta pronta em
> `.specify/memory/constitution-v2-proposta.md`).
> Cauda que sobra, toda em views invisíveis ou de baixo valor: badges, empty
> states, borda gray-300 em outline.

Goal: `/intranet/v2` seguir toda a especificação do demo.
Fonte da verdade: **`docs/tailadmin-medido.md`** (valores computados extraídos
do demo). O `dashboard_pizzarias/docs/design/` é spec de segunda mão e **já
provou divergir** — quando conflitar, vale o medido.

## Feito e verificado (valores computados batendo com o demo)

- [x] Tokens: Outfit, brand `#465fff`, cinzas, semântica, radius, dark
- [x] Shell: sidebar 290px + topbar 72px + drawer no mobile
- [x] Card = borda 1px `#e4e7ec` + sombra **none** (via `--shadow-sm` virar anel
      de 1px — a var tem 1 só consumidor, o `.container` das views)
- [x] `th` = 12/500 gray-500, **sem uppercase, sem tracking** (o kit dizia
      uppercase+tracking; o demo não usa — era erro do port)
- [x] `h2` de view = 18/600 (kit dizia 20/600; demo: 18/600)
- [x] Sidebar label = 12/**400** uppercase sem tracking gray-400 (kit: 600+tracking)
- [x] Sidebar item inativo = gray-**700** (kit: gray-500) · ativo = 500 (kit: 600)
- [x] Borda 2px→1px em botões/campos · hover de linha · `tabular-nums`
- [x] Anel de foco = `border-brand-300` + `ring-brand-500/10` (medido; eu tinha
      chutado brand-500 + 20%)
- [x] `td` = 14/500 gray-800 (a casa usava 13px) — verificado: não estourou a
      grade de 31 colunas
- [x] **Segmented control** (sub-abas) = track `bg-gray-100` r8 p2 + ativa
      branca r6 com `shadow-theme-xs` + inativa transparente gray-500, **sem
      borda**. A casa fazia o oposto (ativa preenchia com accent, inativa tinha
      borda colorida). Aplicado em **DepartamentoPessoal** (sectionTab +
      storeTab), batendo valor por valor com o demo.

### Como o segmented control foi aplicado (repetir nas outras views)

As abas usam os MESMOS nomes de classe em todos os modules (`sectionTab`,
`storeTab`, `viewBtn`, `fornecTab`) — a constituição forçou isso. Então:

1. No module, adicionar bloco `:global(:root[data-v2]) .xTab { … }` — escopa na
   v2 sem tocar na v1 e sem acoplar ao formato de classe do build.
2. O track precisa de um wrapper que contenha **só** os segmentos. Onde não
   existe (ex.: `sectionTabs`), criar um `<div>` com CSS **neutro na v1**
   (`display:flex; gap:8px` = o que o `.headerActions` já dava) — senão os
   botões desempilham na v1.
3. Tirar ações de dentro do track (foi o caso do "⚙ Lojas", que estava dentro
   do `.storeTabs`) e compensar com `gap` no pai.

- [x] **Segmented control em TODAS as views** — Depto Pessoal (`sectionTab` +
      `storeTab`), Salários (`storeTabs` + `viewToggle`), Motoboys
      (`headerActions` + `storeTabs`), Calendar e ContentPlan (`viewToggle` novo,
      v1-neutro com gap 4px). Verificado v1×v2 nos dois lados.
      **Compras não tem abas** — usa um `<select>`; o CSS `.fornecTab`/
      `.fornecTabs` é código morto (candidato a limpeza).

- [x] **Tipografia de botão = 14/500** em todos (a casa usava 13/600, e 13/700
      no danger). Só `@media (min-width:769px)`: no mobile as views compactam pra
      caber (Princípio 8) e minha regra (0,2,1) ganharia das delas (0,2,0),
      estourando a toolbar. Verificado: sem overflow de toolbar nem de página.

## ⚠️ Conflito de fonte da verdade: a DRE do Fábio ≠ demo TailAdmin

Em 2026-07-15 o Fábio apontou **https://fabiomachado.com.br/pizzas/dre** (o
`dashboard_pizzarias` publicado) como o estilo a seguir na planilha dos
motoboys. Medi a página viva — e ela **contradiz o demo em dois pontos** que
este doc já tinha registrado como "port errado":

| | demo TailAdmin (medido, it. 1-9) | DRE do Fábio (medido) |
|---|---|---|
| `th` | 12/**500**, sem uppercase, sem tracking | 12/**600** uppercase tracking .6px |
| `td` | 14/500 | **13px** + secundário 10px |

Ou seja: a DRE **é** a "tabela densa de operação" que este doc dizia que o
TailAdmin não tem — e o Fábio já resolveu esse caso, do jeito dele. Ela não
segue o demo, segue a necessidade da tela.

**O que a DRE resolve e vale copiar:** a célula de dois níveis —
`<span text-[13px]>valor</span>` + `<span text-[10px] text-muted-foreground>`
secundário`</span>` empilhados num `flex flex-col items-center leading-tight`,
com `tabular-nums` no `td`. É o mesmo problema do "lançado × Saipos" dos
motoboys e do "valor × %" da DRE: dois números por célula sem dobrar a largura.

**Decisão pendente do Fábio:** qual é a referência para tabela densa — o demo
TailAdmin ou a DRE dele? Enquanto não decidir, a grade dos motoboys na v2 segue
a DRE (medida) e o resto das views segue o demo. **Não dá pra servir aos dois.**

### Aplicado (teste, 2026-07-15): grade dos motoboys no estilo DRE

Só `[data-v2]`; v1 conferida e intacta (`/ 12` inline 13/700 accent).
- célula empilha lançado 13px + Saipos 10px `--text-muted` — o `/` da v1 virou
  um `<span class="paSlash">` próprio, escondido na v2 (`display:none`)
- `th`: `.diaNome` 12/600 uppercase .6px + `.diaData` 10/400 muted
- `.colHoje` = dia de hoje em brand/5 (th brand/10 + texto brand), análogo ao
  mês corrente da DRE. **Ordem importa:** `.colPend` (amarelo) empata em
  especificidade e vem depois no arquivo pra ganhar; `.cellDiff` usa `!important`
  e ganha dos dois.

## A fazer
- [ ] **Botão outline**: borda gray-**300** + `shadow-theme-xs`. Hoje quem usa
      `--input-border` já está certo (gray-300); quem usa `--border` está em
      gray-200. Bloqueio da sombra: seletor de elemento não distingue outline de
      ícone transparente (sombra viraria caixa) → por view.
- [ ] **Campo** (medido): h 44px · borda 1px gray-**200** · `shadow-theme-xs`.
      Altura global é arriscada (`qtyInput` tem 72px de largura) → por view.
- [ ] **Badge**: 12/500 · radius full · px-2 py-0.5 · `bg-success-50` +
      `text-success-600` (#039855). Hoje a casa usa `--accent-light`/`--accent`
      uppercase 11/700.
- [ ] **Empty state** com ícone (§9).
- [ ] **Padding de célula** `12px 24px 12px 0` — por view, respeitando as densas.
- [ ] **Varrer as ~22 views restantes** (só Compras, Depto Pessoal e Preços
      foram olhadas).
- [ ] **Aposentar a constituição** (`.specify/memory/constitution.md` v1.1.0) —
      ela prescreve as formas antigas (TH uppercase, borda 2px, 18/700). Enquanto
      valer, view nova nasce fora do padrão e desfaz o port.

## Como conferir a v1 (dívida RESOLVIDA)

`npm run deploy:ftp -- --subdir v1check` publica o código atual em
`/intranet/v1check`. Como o path não casa `/intranet/v2`, o `[data-v2]` não liga
e o build renderiza o **caminho da v1** — e por ser a mesma origem, a sessão do
Firebase vem junto (o que o `localhost` não dá). Comparar contra a `/intranet`
publicada, que ainda é o build antigo.

Feito em 2026-07-15: v1check × /intranet bateram em tudo (shell horizontal,
gaps 8px de Escala↔Salários e Ambas↔⚙ Lojas, mesma linha, aba ativa
`#3a53d0`). No Calendar, o `.viewToggle` novo também ficou neutro (gaps
4/4/4 Dia↔Semana↔Mês↔Hoje, centros alinhados). **Repetir esta conferência a
cada view que ganhar wrapper novo.**

Dois detectores que me enganaram — usar estes:
- **NÃO** use `querySelector('aside')` pra detectar o shell v2: o StickyNotes
  ("Lembretes", no Calendário) também renderiza `<aside>`. Use
  `aside[class*="sidebar"]` (do AppShellV2) vs `header[class*="header"]` (v1).
- **NÃO** compare `getBoundingClientRect().top` pra ver se os botões estão na
  mesma linha: no track os segmentos ficam 2px abaixo por causa do padding.
  Compare o CENTRO vertical.

⚠️ `/intranet/v1check` é uma cópia publicada — apagar do FTP ao fim do trabalho.

## Divergência CONSCIENTE do demo: densidade de tabela

O demo usa `td` 14/500. **O Preços não pode.** A `<table>` roda em 13px, o nome
do produto em 11px e as colunas numéricas em 12px (spreads
`{...tdS, fontSize: 11|12}`) — são **205 produtos × 8 colunas**. O demo não tem
tela equivalente: o "Recent Orders" dele tem 4 colunas e 5 linhas.

Tentei subir o `tdS` pra 14 e **o resultado foi pior**: só as células sem
override subiam, deixando 11/12/14 misturados na mesma linha (antes era
11/12/13, coerente). Revertido — o tamanho fica com a escala densa da view
(Princípio 8 da constituição) e só a cor segue o v2.

Mesma lógica vale pro padding de célula (`px-5 py-3` do demo) e pra grade de 31
colunas do Depto Pessoal. **"Igual ao demo" não se aplica a tabela densa de
operação** — é uma tela que o TailAdmin não tem.

## Ponto cego RESOLVIDO: Preços e CMV são estilizados em JS, não em CSS

Descoberto na iteração 6 medindo; convertido nas iterações 7-8.
**A camada de CSS não alcança essas duas** — o que vale é o JS.

| view | estilos inline |
|---|---|
| `PrecosInsumosView.jsx` | **264** |
| `CmvView.jsx` | **95** |

O componente de Preços tem 100 KB e o CSS module só 4,6 KB — porque ele é
estilizado por objetos JS (`tabBtnS`, `thS`, `tdS`, `btnS`, `inputS`…,
centralizados no fim do arquivo, ~linha 2048).

O que isso quer dizer:
- Os objetos **leem os tokens** (`var(--accent)`, `var(--border)`) → as CORES
  seguem o tema v2. Foi por isso que a tela "pareceu certa".
- Mas as **formas são literais** (`fontSize: 13`, `padding: '5px 12px'`,
  `borderRadius: 8`) e **estilo inline ganha de qualquer seletor**. Então
  `:root[data-v2] thead th {…}` e a regra global de botão 14/500 **NÃO se
  aplicam ao Preços**. Lá o `th` é 12/**600** e os botões são 12-13px.
- As sub-abas (Produtos|Lista|Fornecedores|Cadastrar|Subiram|CMV) **não viraram
  segmented control** — meu grep da iteração 2 não as achou porque não têm classe.

**Feito (it. 7-8):** os objetos viraram `IS_V2 ? {…v2} : {…v1}` (são
compartilhados com a v1, não dá pra trocar direto). Convertidos: `headerTitleS`,
`tabBtnS`/`subTabBtnS` → `segBtnS` + `tabTrackS`, `inputS`, `thS`, `btnS`
(Preços) e `inputS`, `btnS`, `thS`, `cardS`, abas Beneficiados/Sabores (CMV).
Batendo exato com o demo; v1 conferida no `v1check` (aba `#3a53d0` 13/600,
`th` 11/600, gaps 8/8).

Truque útil: onde o wrapper do track tinha conteúdo não-aba junto (CMV), o
track usa `display:contents` na v1 — assim os botões seguem filhos diretos do
flex de cima e o layout v1 não muda.

## 🚧 Bloqueio: metade das views é invisível pra mim

As settings do Fábio (`settings/{uid}`) deixam **6 das 12 seções desligadas**:
Instagram (Reels), Content Plan, Influencers, Ideias, Avaliações, Conhecimento.
O `Dashboard.jsx` só monta a view se `xEnabled` — então elas **não renderizam**
e não há como verificar o design nelas. Virar as flags mudaria o que o Fábio e a
equipe veem: é config dele, não faço sem pedir.

Isso importa porque **a ReelsView é a mais provável de estar errada**: 24 KB de
CSS e 47 cores hardcoded (o maior número do projeto), além de 4 sub-seções num
componente só. InfluencersView (9,3 KB) e ContentPlanView (8,3 KB) também são
grandes.

Editar esses 6 modules às cegas seria péssima ideia: nesta sessão, **5 suposições
minhas sobre o design foram desmentidas ao medir** (th uppercase, sombra do card,
h2 20/600, label da sidebar, item inativo). Sem ver, o erro é a regra.

**Para destravar:** habilitar as 6 seções (Configurações → Visibilidade e
Permissões) ou autorizar que eu habilite temporariamente e devolva ao estado
original.

## Verificação pendente

- v2 em viewport mobile real (o zoom do perfil do Chrome de teste não reseta;
  drawer foi verificado via DOM/CSS)

## Como medir o demo

Abrir https://demo.tailadmin.com/ no Chrome e extrair `getComputedStyle` do
elemento (não do `th`/`td`, que ficam sem estilo — a tipografia está no `<p>`
interno).
