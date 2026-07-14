# Constituição de Design e Código — Intranet Dáme & Lov

> Padrão obrigatório para TODA seção nova e para o retrofit das existentes.
> Referências canônicas (escolhidas pelo Fábio): **InfluencersView**, **ReelsView** (Instagram) e **NotesView** (Anotações).
> O design system paralelo em `src/ui/` (tokens `--ds-*`, "Sereno") NÃO é usado — a convenção abaixo é a oficial.

**Versão:** 1.1.0 · **Ratificada:** 2026-07-14 · **1.1.0:** header com linha divisória + submenu no estilo do Calendário (Dia/Semana/Mês), sem cores por marca em abas

---

## Princípio 1 — Shell de cartão único

Toda view é UM cartão que envolve todo o conteúdo:

```css
.container {
  background: var(--card);
  border-radius: var(--radius-lg);   /* 12px */
  box-shadow: var(--shadow-sm);
  padding: 24px;                     /* 16px @768px, 12px @480px */
  max-width: 100%;
  box-sizing: border-box;
}
```

Proibido: view transparente/full-bleed sem cartão (era o erro da MotoboysView original).

## Princípio 2 — Header da seção

`display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap`, com **linha divisória cinza embaixo**: `padding-bottom:14px; border-bottom:1px solid var(--border-light)` (ou `padding:16px 0; margin-bottom:8px` quando o container tem `padding-top:0`).
Esquerda: `<h2>` **18px / 700** (emoji opcional: `📱 Instagram`). Direita: `.headerActions` com `gap:8px`.
Blocos abaixo do header, nesta ordem: **abas de loja (se houver) → stats → filtros → conteúdo**.

## Princípio 3 — Sub-navegação horizontal fixa no topo (estilo Calendário)

Conteúdos/visões secundárias da seção ficam num **submenu horizontal fixo dentro do cartão, na linha do título** (em `.headerActions`), nunca escondidos. Estilo canônico = botões **Dia/Semana/Mês do Calendário** (`CalendarView .viewBtn`):

```css
.sectionTab {
  background: none;
  border: 1px solid var(--border-light);
  color: var(--text-muted);
  font-size: 13px;              /* 12px @768px */
  padding: 5px 12px;            /* 4px 10px @768px */
  border-radius: var(--radius-md);
  transition: background 0.15s, color 0.15s;
}
.sectionTab:hover { background: var(--card-hover); color: var(--text); }
.sectionTabActive { background: var(--accent); border-color: var(--accent); color: #fff; }
```

- **Sem cor por marca/loja**: abas Dáme/Lov (e equivalentes) usam o MESMO estilo neutro; ativo sempre preenche com `--accent`. Cores de marca ficam pra badges e conteúdo, não pra navegação.
- Abas de loja, quando existirem, ficam numa `.storeBar` logo abaixo do header, no mesmo estilo.
- Rótulo com contador é permitido: `Reels (12)`.
- Implementação: estado `secao` + fallback por permissão; seções trocam o conteúdo inline (sem modal).

**Janelas modais** são reservadas a cadastros e configurações pontuais: componente separado (`XModal.jsx`) ou overlay com painel, abertos por botão no `.headerActions`.

## Princípio 4 — Botões

| Variante | Regra |
|---|---|
| Primário | `padding:8px 16px; border:none; radius-md; background:var(--accent); color:#fff; font 14px/500`; hover `--accent-hover` |
| Ghost | `border:1px solid var(--input-border); background:var(--card); color:var(--text-secondary); font 12-13px`; hover `--bg-secondary` |
| Sub-nav / abas | estilo Calendário, borda cinza 1px, ativo preenche accent (Princípio 3) |
| Perigo | `border:1px solid var(--danger); background:none; color:var(--danger)`; hover `--danger-bg` |
| Ícone | quadrado 28px (36px no mobile), radius-md, flex-center |

Radius de botão é **sempre `--radius-md` (8px)**. Pílula `999px` só em chips/badges informativos, nunca em botões ou navegação.

## Princípio 5 — Inputs e forms

Input: `padding:8-10px 12px; border:1px solid var(--input-border); radius-md; font 14px; background:var(--input-bg); :focus → border-color:var(--input-focus)`. Sem wrapper em pílula.
Form container: `background:var(--bg-secondary); border:1px solid var(--border); radius 8-12px; padding:12-20px; coluna com gap`.
Campo = label (13px/600) + hint (12px `--text-muted`) + input. Rodapé `flex-end; gap:14px`. Submit desabilitado: `opacity:.5`.
Commit de valores no blur/Enter (padrão `MoneyInput`).

## Princípio 6 — Tipografia (escala fechada)

**18 / 15 / 14 / 13 / 12 / 11 px** — nada fora disso (sem 12.5px, 10.5px etc.).
h2 da view 18/700 · título de card 15/600 · corpo e inputs 14 · tabela e descrições 13 · labels 13/600 · TH e section-title **11px uppercase, letter-spacing .4-.5px, `--text-muted`** · badges 10-11px/700 · metadados 11-12px `--text-muted`. Colunas numéricas: `font-variant-numeric: tabular-nums`.

## Princípio 7 — Cores e badges

Só CSS vars de `global.css`: `--card --bg-secondary --border --border-light --text --text-secondary --text-muted --accent --accent-hover --accent-light --input-* --danger --danger-bg --success --badge-bg --radius-sm/md/lg --shadow*`.
Badge/chip/link: fundo `--accent-light`, borda `--accent`, texto `--accent`, radius-md, uppercase 11px/700; hover inverte.
Destaque de linha/estado: `rgba()` suave (ex.: `rgba(50,213,131,.06)`), não `box-shadow inset`.
Cores de marca aceitas em badges/sub-nav: laranja `#ff9800`, roxo `#9c27b0`, verde `#4caf50`; nunca como cor base de controle principal.

## Princípio 8 — Densidade: tabela no desktop, cards no mobile

Conteúdo denso vive em `<table>` compacta (TH 11px uppercase). Breakpoints **768px** e **480px**:

- `@768px`: `thead{display:none}`; cada `tr` vira card (`border:1px solid var(--border); radius-lg; padding:10-12px`), com labels injetados por CSS: `td[data-label]::before { content: attr(data-label) }` (sem JS). Padding do container 24→16px; ícones 28→36px.
- `@480px`: padding →12px; h2 18→16px; **inputs com `font-size:16px`** (evita zoom no iOS); botões `min-height:38-40px`; `.headerActions` quebra linha com botões `flex:1 1 auto`.

## Princípio 9 — Estados e feedback

Empty state: centrado, `--bg-secondary`, **borda tracejada**, radius 8px, texto contextual (diferencia "nada cadastrado" de "nada nos filtros").
Card hover: `box-shadow: 0 2px 8px var(--shadow)` e/ou borda acende `--accent`, transition .15s.
Ação destrutiva: `window.confirm` antes.

## Princípio 10 — Código

- 1 seção = `components/XView.jsx` + `hooks/useX.js` + `styles/XView.module.css` (+ `XModal.jsx` se houver modal).
- Hook: `onSnapshot` → `{ dados, mutations }`; upsert idempotente `setDoc(..., {merge:true})` com ID determinístico; `Timestamp.now()` em `createdAt`; `createdBy: author?.uid`.
- Derivações com `useMemo`; filtros/ordenação como dicionários de config no topo do módulo (`SORT_KEYS`, `STATUS_LABELS`), não `if` espalhado.
- Datas Firestore: helper `formatDate(ts.seconds)` → `toLocaleDateString('pt-BR')`.
- Wiring de aba nova (checklist): lazy import + flag + render em `Dashboard.jsx`; prop + `TABS_DEF` em `Header.jsx`; ícone em `tabIcons.jsx`; `DEFAULT_TABS_ORDER` em `useTabsOrder.js`; `TAB_LABELS` + `SECTIONS` (+ permissões) em `SettingsView.jsx`; bloco em `firestore.rules` + publicar.
- Permissões: seção nova nasce **default OFF** (`xEnabled === true`); flags `xVer*` (default ON) e `xEdit*` (default OFF) por sub-recurso, espelhadas nas rules via `hasSettingFlag`.

---

## Anexo — Retrofit das telas existentes

Retrofit 1.0 (cartão, sem pílulas) e 1.1 (linha no header, submenu estilo Calendário, abas de loja sem cor por marca) aplicados em: Motoboys, Depto Pessoal, Salários, Compras, Influencers, Anotações, Ideias, Conhecimento, Arquivadas, Preços. Telas novas já nascem no padrão 1.1.
