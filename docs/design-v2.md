# Design v2 — port do spec-kit do dashboard (TailAdmin)

Versão de teste em **https://damepizza.com.br/intranet/v2** com o design do
spec-kit do dashboard (`dashboard_pizzarias/docs/design/`, modelado no
[TailAdmin](https://demo.tailadmin.com/)). A `/intranet` atual e a Vercel
seguem intactas.

## Como funciona

Duas camadas, ambas ligadas pelo MESMO sinal: o atributo `[data-v2]` no
`<html>`, setado pelo script inline do `index.html` quando a URL é
`/intranet/v2` (ou `?v2=1` em dev), antes do paint. Sem `[data-v2]`, as duas
camadas são inertes — `/intranet` e a Vercel não mudam.

**1. Tema (token).** O intranet usa CSS Modules + CSS vars, e ~90% do CSS
consome `var(--x)` do `global.css` (1661 usos contra 180 hex hardcoded). Então
o port foi feito como um bloco de tema novo, não como reescrita de componentes:

- `src/styles/theme-v2.css` — remapeia as vars pros tokens do TailAdmin
  (light + dark). As ~30 views trocam de cara sem nenhuma alteração.

**2. Componentes (interno das views).** Port do `03-componentes.md`, em
`src/styles/components-v2.css`. Por **seletor de elemento**, não de classe: as
28 views repetem os mesmos padrões em 28 CSS modules com classes scopeadas
próprias — classe não alcança as 28, elemento alcança.
`:root[data-v2] elemento` (0,2,1) ganha de `.classe elemento` (0,1,1) mesmo com
o CSS lazy da view sendo injetado depois.

O que faz: borda 2px→1px em botões/campos (a casa usava 2px em accent), anel de
foco `ring-2` (a casa usa `outline:none`), `th` uppercase 12/500 tracking muted
com `border-bottom`, hover de linha, `tabular-nums` em `td`, título de view
20/600 (a casa usa 18/700).

**3. Shell (estrutura).** Port do `02-layout.md`: sidebar 290px + topbar 72px.

- `src/components/v2/AppShellV2.jsx` + `src/styles/AppShellV2.module.css`
- `src/lib/v2.js` — `IS_V2` lê o mesmo `[data-v2]`.
- `Dashboard.jsx` monta `AppShellV2` quando `IS_V2`, senão o `Header` de sempre.
  As props do shell são as MESMAS nos dois caminhos (`shellProps`).
- Foi possível sem tocar nas views porque a navegação é centralizada em
  `Header.jsx` + `Dashboard.jsx` (`activeTab`), não espalhada.

```bash
npm run build:v2     # vite build --base=/intranet/v2/
npm run deploy:v2    # build + FTP pra <FTP_DIR>/v2 (deploy-ftp.mjs --v2)
npm run deploy:ftp   # a v1 de sempre, inalterada
```

## O que mudou

| | v1 (Sereno) | v2 (TailAdmin) |
|---|---|---|
| Fonte | Inter | **Outfit** (já estava carregada no index.html) |
| Accent | `#3a53d0` / dark `#6d82ff` | **brand-500 `#465fff`** / dark brand-400 `#7592ff` |
| Cinzas | escala própria | escala TailAdmin (`#101828`…`#f9fafb`) |
| Card | `--radius-lg` 12px | **16px** (`rounded-2xl`) |
| Botão | `--radius-md` 8px | 8px (`rounded-lg`) — igual |
| Sombras | já eram `rgba(16,24,40,.05)` | `shadow-theme-xs/sm/md/lg` |
| Card dark | `#171b23` | `#171f2f` |
| Semântica | verde/vermelho próprios | success `#12b76a` · warning `#f79009` · error `#f04438` |

A escala tipográfica (12/14/16/18/20/24/30) **já batia** com a do TailAdmin
(theme-xs 12 · theme-sm 14 · theme-xl 20 · title-xs 24 · title-sm 30) — nada a
remapear. As sombras do Sereno também já eram as do TailAdmin.

## Mudanças de navegação na v2

- **Menu horizontal → sidebar agrupada.** Os 12 itens viraram grupos rotulados
  (Operação · Equipe · Marketing · Ferramentas), conforme o kit. A ordem custom
  do usuário (`useTabsOrder`/SettingsView) é respeitada **dentro** de cada
  grupo. Aba nova que não caia num grupo conhecido entra em "Outros" — nunca
  some do menu.
- **Mobile: BottomNav → drawer.** O kit especifica sidebar virando drawer com
  overlay; a v2 segue isso e não monta a `BottomNav`. É a diferença de UX mais
  discutível do port — se a equipe usa muito no celular, vale reavaliar (dá pra
  ter os dois).
- **Sumiu o auto-fit de fonte do menu** (o `Header` encolhia a fonte de 14px até
  10.5px pra caber os itens). Na sidebar vertical não é necessário.

## O que NÃO dá pra alcançar globalmente (fica por view)

Escala do que resta: **28 CSS modules, 201 KB**, com 39 blocos `.container`
(o "1 cartão por view"), 45 botões com fundo accent e 23 regras de padding em
`th`/`td`.

- **Padding de célula** (kit: `px-5 py-3`). 23 regras já definem o seu, e a
  escala do Depto Pessoal tem 31 colunas de dia — um padding global explodiria
  a tela. Decisão por view.
- **Card `p-0` + tabela edge-to-edge com header `px-5 pt-5 pb-3`** (§6). Hoje é
  1 cartão com padding 24px e a tabela dentro. Muda a marcação, não só o CSS.
- **Variantes de botão** (§5: solid / outline / ghost). Não dá pra distinguir
  por seletor de elemento qual botão é qual — por isso nem sombra global entrou
  (ficaria errado em botão de ícone transparente). Precisa de decisão por botão.
- **Sub-abas com borda cinza quando inativas.** A constituição manda borda
  colorida; o kit manda cinza + preenche no ativo. Não é detectável por seletor.
- **Badges soft por variante** (§4) e **empty state com ícone** (§9).
- **Os ~10% de cor hardcoded** (ReelsView 47 hex, DepartamentoPessoal 21,
  StickyNotes 19, MobileCalendar 18). São chips de categoria (laranja Stories,
  roxo Roteiros, verde folga) que a própria constituição permite fora dos
  tokens.
- **`04-paginas.md` / `05-novas-secoes.md`** — spec das telas do dashboard
  (DRE, CMV, iFood). Não se aplicam aqui.

**O nó real não é técnico, é de governança:** a constituição *prescreve* as
formas atuais (borda 2px colorida, escala 18/15/14/13/12/11, 1 cartão por view)
e as 28 views a seguem. Levar o kit ao interior das views = aposentar a
constituição e retrofitar as 28. Enquanto as duas forem "obrigatórias", cada
view nova nasce no padrão antigo e desfaz o port.

## O que foi verificado (e o que não)

Verificado no navegador, logado, em `/intranet/v2`: sidebar + topbar em
Calendário e Depto Pessoal, light e dark, tokens resolvendo (Outfit, `#465fff`,
card 16px). Drawer: hamburger alterna a classe, overlay fecha, sidebar vira
`position:fixed` no `@media(max-width:768px)`.

**Não verificado:** (1) a v2 num viewport mobile real — o zoom do perfil do
Chrome usado no teste não reseta, então a checagem do drawer foi via DOM/CSS,
não visual; (2) o caminho da **v1** com o `Dashboard.jsx` refatorado rodando
logado — `localhost` é outra origem e não herda a sessão do Firebase. O
refactor é estruturalmente equivalente (mesmas props, mesma ordem de filhos) e
passa build + lint, mas **só será exercitado de fato no próximo
`npm run deploy:ftp`** — vale abrir e conferir antes de confiar.

## Conflito com a constituição atual

`.specify/memory/constitution.md` (v1.1.0) diverge do kit em pontos concretos:

| Constituição | Spec-kit |
|---|---|
| Card `--radius-lg` **12px** | `rounded-2xl` **16px** |
| h2 da view **18/700** | título de página `text-theme-xl` **20/600** |
| Escala fechada 18/15/14/13/12/11 | 12/14/16/18/20/24/30 |
| Sub-nav = submenu horizontal na linha do título | sidebar + PageHeader |
| Accent `#3a53d0` | brand `#465fff` |

O tema v2 resolve só a camada de token (radius e cor). Os pontos de **anatomia**
(h2 18 vs 20, escala fechada, submenu vs sidebar) continuam seguindo a
constituição — o v2 não os toca.

**Se a v2 for promovida a padrão**, a constituição precisa ser reconciliada:
ou ela absorve os tokens do kit (mantendo a anatomia própria do intranet), ou
vira um fork explícito. Não dá pra ter as duas como "obrigatórias".

## Promover ou reverter

- **Promover:** mover o conteúdo de `:root[data-v2]` / `:root[data-v2][data-theme="dark"]`
  pra dentro dos blocos equivalentes do `global.css`; trocar o `IS_V2 ? AppShellV2 : Header`
  do `Dashboard.jsx` por `AppShellV2` fixo e apagar `Header.jsx` + `Header.module.css`;
  apagar `theme-v2.css`, `lib/v2.js`, o script `data-v2` do `index.html` e os
  scripts `*:v2`. Decidir o que fazer com a `BottomNav`. Depois reconciliar a
  constituição (ver acima).
- **Reverter:** apagar `theme-v2.css`, `lib/v2.js`, `components/v2/`,
  `AppShellV2.module.css`, o bloco `.mainV2` do `Dashboard.module.css`, os
  imports e o `if (IS_V2)` do `Dashboard.jsx`, o import no `App.jsx`, o script do
  `index.html`, os scripts `*:v2` do `package.json`, o bloco `--v2` do
  `deploy-ftp.mjs` e a pasta remota `/intranet/v2`.
