# Constituição de Design — Intranet Dáme & Lov · PROPOSTA v2.0.0

> ⚠️ **PROPOSTA — não ratificada.** A vigente é `constitution.md` (v1.1.0).
> Só promover se o Fábio aprovar a v2 (`/intranet/v2`) como padrão. Enquanto as
> duas existirem, **vale a v1.1.0** — ter duas "obrigatórias" é o pior cenário.
>
> Referência: **https://demo.tailadmin.com/**, com os valores **medidos** em
> `docs/tailadmin-medido.md` (estilos computados extraídos do demo, não deduzidos).
> Quando qualquer outro documento divergir do medido, **vale o medido** — o
> spec-kit do dashboard (`dashboard_pizzarias/docs/design/`) já foi pego errando
> em 5 pontos.

---

## O que muda da v1.1.0 (resumo pra decisão)

| # | v1.1.0 (vigente) | v2.0.0 (demo, medido) |
|---|---|---|
| 1 | Card: sombra, sem borda, radius-lg 12px | **Borda 1px gray-200, SEM sombra, radius 16px** |
| 2 | h2 da view 18/**700** | 18/**600** |
| 3 | TH 11px **uppercase** + letter-spacing | 12/500 gray-500, **sem uppercase, sem tracking** |
| 4 | Sub-abas: ativa preenche accent; inativa borda colorida | **Track cinza; ativa branca elevada; inativa transparente sem borda** |
| 5 | Botões 13/600 (danger 13/700) | **14/500** (todos) |
| 6 | Borda 2px em controles | **1px** |
| 7 | Foco: só troca border-color | **`border-brand-300` + `ring-brand-500/10`** |
| 8 | Badge: accent-light + borda + uppercase 11/700, radius-md | **Soft sem borda, radius full, 12/500, `*-50`/`*-600`** |
| 9 | Escala fechada 18/15/14/13/12/11 | 12/14/16/18/20/24/30 (mantém 11-13 em tabela densa) |
| 10 | Fonte Inter · accent `#3a53d0` | **Outfit · brand `#465fff`** |

**O que NÃO muda:** Princípio 8 (denso no desktop, cards no mobile), o wiring de
aba nova, as regras de permissão e a organização 1 seção = View + hook + css.

---

## Princípio 1 — Card

```css
background: var(--card);
border: 1px solid var(--border);   /* gray-200 · #e4e7ec */
border-radius: 16px;               /* rounded-2xl */
box-shadow: none;                  /* medido: o demo NÃO tem sombra no card */
padding: 24px;                     /* px-6 pt-6 */
```
Não aninhar card em card: dentro do cartão use painel `rounded-xl` (12px).

## Princípio 2 — Header da seção

Flex space-between com divisória `1px solid var(--border-light)` embaixo.
`<h2>` **18/600** (`--text`). Ações à direita.

## Princípio 3 — Sub-navegação = segmented control

**Muda por completo em relação à v1.1.0.** Medido no demo:

```css
/* track — contém SÓ os segmentos; ações ficam fora */
.track   { display:inline-flex; width:fit-content; gap:2px; padding:2px;
           border-radius:8px; background:var(--seg-track); }
/* segmento */
.seg     { border:none; background:transparent; color:var(--text-muted);
           font:500 14px/1; padding:8px 12px; border-radius:6px; }
.segAtivo{ background:var(--seg-active-bg); color:var(--seg-active-text);
           box-shadow:var(--shadow-xs); }
```
- Sem cor por marca/loja: abas Dáme/Lov usam o mesmo estilo neutro.
- Rótulo com contador é permitido: `Reels (12)`.

## Princípio 4 — Botões

| Variante | Regra (medida) |
|---|---|
| Primário | `bg:var(--accent); color:#fff; border:none; radius:8px; font:500 14px; padding:10px 16px;` **sem sombra** |
| Outline | `border:1px solid var(--input-border)` (gray-300); `bg:var(--card)`; **`box-shadow:var(--shadow-xs)`**; 14/500 |
| Perigo | outline com `--danger` |
| Ícone | quadrado, sem borda, sem sombra |

Radius **8px** sempre. Pílula só em chip informativo.
**No mobile (≤768px) a compactação da view prevalece** (Princípio 8) — não force 14px lá.

## Princípio 5 — Campos

`radius:8px; border:1px solid var(--border); box-shadow:var(--shadow-xs); font-size:14px; height:44px`
Foco (medido): `border-color:var(--focus-border)` + `box-shadow:0 0 0 3px var(--focus-ring)`.

## Princípio 6 — Tipografia

Título de card **18/600**. Corpo/botão/campo **14/500**. `th` **12/500 `--text-muted`, sem uppercase**.
`td` **14/500 `--text`**.
**Exceção — tabela densa de operação:** Preços (205×8) e a grade de 31 dias do
Depto Pessoal mantêm 13/12/11px. O demo não tem tela equivalente; forçar 14
quebra a leitura. Ver `docs/v2-progresso.md`.

## Princípio 7 — Cores e badges

Só CSS vars. Badge (medido): `radius:999px; padding:2px 8px; font:500 12px;`
fundo `*-50` + texto `*-600` (ex.: `--success-bg`/`--success`). **Sem borda,
sem uppercase.**

## Princípios 8, 9, 10 — inalterados da v1.1.0

Densidade (tabela desktop / cards mobile, breakpoints 768/480), estados e
feedback, e organização de código seguem como estão.

---

## Nota de arquitetura (aprendida à força)

**Preços e CMV são estilizados por objetos JS inline (264 e 95).** Estilo inline
ganha de qualquer seletor: nenhuma regra CSS os alcança. Mexer no design dessas
duas é mexer nos objetos de estilo no JS, não no `.module.css`. Ver
`docs/v2-progresso.md`.

## Nota de método

Não deduza valor do demo — **meça**. Abra o demo no navegador e leia o
`getComputedStyle` do elemento (a tipografia do TailAdmin costuma estar num
`<p>`/`<span>` DENTRO do `th`/`td`, não neles). Nesta migração, 5 valores
"óbvios" estavam errados quando medidos.
