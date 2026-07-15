# TailAdmin — valores medidos direto do demo

Estilos **computados** extraídos de https://demo.tailadmin.com/ (eCommerce) em
2026-07-15. Esta é a fonte da verdade do goal "igual ao demo" — acima do
`docs/design/` do dashboard, que é spec de segunda mão e **diverge em pontos
reais** (marcados com ⚠️ abaixo).

## Card

```
overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 sm:px-6 sm:pt-6
                                                    dark:border-gray-800 dark:bg-white/[0.03]
```
| | valor |
|---|---|
| radius | 16px |
| borda | 1px `#e4e7ec` (gray-200) |
| sombra | **none** ⚠️ |
| padding | 24px 24px 0 (px-6 pt-6 @sm) |
| título (h3) | 18px / 600 / `#1d2939` / lh 28px ⚠️ |

⚠️ O kit do dashboard diz `shadow-theme-sm` no card. **O demo não tem sombra
nenhuma** — é borda 1px e pronto. O intranet faz o oposto: sombra e nenhuma
borda.

## Tabela

| | valor |
|---|---|
| `th` (texto interno) | `font-medium text-gray-500 text-theme-xs` → 12px / 500 / `#667085` / lh 18px |
| `th` text-transform | **none** ⚠️ · letter-spacing **normal** ⚠️ |
| `thead` | border-bottom 1px `#f2f4f7` (gray-100) |
| `td` (texto interno) | `font-medium text-gray-800 text-theme-sm` → 14px / 500 / `#1d2939` |
| `td` padding | 12px 24px 12px 0 |

⚠️ O kit diz `uppercase tracking-wider` no `th`. **O demo não usa uppercase nem
tracking** — "Products", "Category", "Price" em caixa normal. A constituição do
intranet (TH 11px uppercase letter-spacing) também diverge do demo.

Obs: o TailAdmin não estiliza o `th`/`td` direto — põe um `<p>`/`<span>` dentro
com a tipografia. O `th` em si fica quase sem estilo.

## Badge

```
bg-success-50 text-theme-xs text-success-600 rounded-full px-2 py-0.5 font-medium
                                            dark:bg-success-500/15 dark:text-success-500
```
12px / 500 · radius full · padding 2px 8px · bg `#ecfdf3` · texto `#039855` (success-**600**)

## Botão outline (secundário)

```
text-theme-sm shadow-theme-xs inline-flex items-center gap-2 rounded-lg
border border-gray-300 bg-white px-4 py-2.5 font-medium
```
14px / 500 · radius 8px · padding 10px 16px · borda 1px `#d0d5dd` (gray-300) · shadow-theme-xs

## Sidebar

| | valor |
|---|---|
| container | `w-[290px] border-r border-gray-200 bg-white px-5` |
| label de seção ("MENU") | 12px / **400** ⚠️ / uppercase / letter-spacing **normal** ⚠️ / `#98a2b3` (gray-400) / mb-4 |
| item ativo | 14px / 500 · `#465fff` · bg `#ecf3ff` · radius 8px · padding 10px 12px |
| item inativo | 14px / 500 · `#344054` (gray-**700**) ⚠️ · bg transparent |

⚠️ O kit diz label `font-semibold tracking-wider` e item inativo
`text-muted-foreground` (gray-500). O demo usa **peso 400 sem tracking** e
inativo em **gray-700**.

## Divergências aplicadas por engano no port (a corrigir)

1. `th` com `uppercase` + `letter-spacing: .05em` → o demo não tem nenhum dos dois
2. Label da sidebar em 600 + tracking `.05em` + gray-500 → demo: 400, sem tracking, gray-400
3. Item inativo da sidebar em gray-500 → demo: gray-700
4. Card com sombra e sem borda → demo: borda 1px gray-200, sombra none
5. `h2` de view em 20/600 → título de card no demo é 18/600
