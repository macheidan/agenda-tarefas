# -*- coding: utf-8 -*-
"""Coleta as vendas DIA A DIA no Saipos, mês a mês (sub-aba "Por Dia da Semana").

Fonte: relatório `revenue-per-day` ("Faturamento por dia"), uma linha por dia
com pedidos (`count_sales`) e faturamento (`total_amount`) — o mesmo critério
do "Vendas por período". Um mês inteiro sai numa busca só, ao contrário do
coletor do Dash (`scripts/dash/saipos_vendas.py`), que vai dia a dia e levaria
horas pra refazer o histórico.

Por que não o backup do Saipos (`07 Backup Saipos/pedidos/*.jsonl`): lá só
entra pedido com cliente vinculado. Medido em 23/10/2026 na Dáme: 125 pedidos
no backup contra 148 no Saipos — falta o balcão sem cadastro.

A tabela do relatório é paginada (25 linhas): os números saem do scope do
controller (`vm.sales`), e quando o mês passa de uma página a busca é refeita
com `rowsPerPage` maior, pelo próprio `vm.applyFilters()` — mesma chamada que o
botão Buscar faz, então o filtro (loja, período, canais) é o da tela.

Mesma maquinaria do coletor de bairros (login com 2FA, troca de loja por ID,
`abrir_relatorio` que só volta quando a API respondeu pelo período pedido).
~15 s por mês: o histórico jan/2025 → set/2026 (21 meses × 2 lojas) leva
~10 min; a rotina mensal, segundos.

RODAR SÓ NA MADRUGADA — ver o cabeçalho de `coletar_bairros.py` (o Saipos
aceita uma sessão por usuário e o login daqui derruba o PC da loja).

Uso:
    python coletar_diario.py                          # mês passado, as 2 lojas
    python coletar_diario.py --de 2025-01 --ate 2026-09
    python coletar_diario.py --de 2026-09 --ate 2026-09 --loja DAME --descobrir

Saída: scripts/vendas/data/diario-<AAAA-MM-DD>.json, que `importar_diario.mjs`
sobe para a coleção `vendas_diario`.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dash"))
import saipos_vendas as sv  # noqa: E402  (login, troca de loja e abrir_relatorio)
from coletar_bairros import MARCA, diagnostico, limites, mes_passado, meses  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
URL_DIARIO = "https://conta.saipos.com/#/app/report/revenue-per-day"
SLUG = "revenue-per-day"

# O vm do controller (RevenuePerDayController). A linha da tabela tem escopo
# filho, mas herda o vm; sem linha nenhuma (mês sem venda), o container do
# relatório também enxerga.
JS_VM = r"""
  const el = document.querySelector('[ng-repeat="sale in vm.sales"]')
    || document.querySelector('.report-revenue-per-day');
  const scope = el && angular.element(el).scope();
  const vm = scope && scope.vm;
"""

JS_LER = r"""() => {""" + JS_VM + r"""
  if (!vm || !Array.isArray(vm.sales)) return null;
  return {
    total: vm.pagination ? vm.pagination.totalRows : null,
    campos: vm.sales.length ? Object.keys(vm.sales[0]) : [],
    linhas: vm.sales.map((s) => ({
      dia: s.day_formatted ?? s.day ?? s.date ?? null,
      dow: s.day_of_week_name ?? null,
      pedidos: Number(s.count_sales) || 0,
      valor: Number(s.total_amount) || 0,
      cancelados: Number(s.cancelled_count_sales) || 0,
    })),
  };
}"""

# Refaz a busca com uma página que caiba o mês inteiro.
JS_PAGINA_CHEIA = r"""() => {""" + JS_VM + r"""
  if (!vm || typeof vm.applyFilters !== 'function') return false;
  scope.$apply(() => {
    vm.pagination.rowsPerPage = 62;
    vm.pagination.currentPage = 1;
    vm.applyFilters();
  });
  return true;
}"""


def data_iso(texto, ano_mes: str) -> str | None:
    """'01/09/2026', '2026-09-01T03:00:00.000Z' ou '01/09' → '2026-09-01'."""
    s = str(texto or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"(\d{2})/(\d{2})(?:/(\d{4}))?", s)
    if m:
        ano = m.group(3) or ano_mes[:4]
        return f"{ano}-{m.group(2)}-{m.group(1)}"
    return None


def coletar_mes(page, id_store: str, ano_mes: str, descobrir: bool = False):
    d1, d2 = limites(ano_mes)
    sv.abrir_relatorio(page, d1, URL_DIARIO, SLUG, dia_fim=d2, id_store=id_store)
    page.wait_for_timeout(1500)
    lido = page.evaluate(JS_LER)
    if lido is None:
        return [], diagnostico(page)

    if lido["total"] and lido["total"] > len(lido["linhas"]):
        marco = len(sv._BUSCAS)
        if not page.evaluate(JS_PAGINA_CHEIA):
            raise RuntimeError("vm.applyFilters não encontrado")
        de, ate = d1.strftime("%d/%m/%Y"), d2.strftime("%d/%m/%Y")
        if not sv._esperar_busca(page, marco, de, ate, id_store):
            raise RuntimeError("a busca da página cheia não chegou na API")
        lido = page.evaluate(JS_LER)
        if len(lido["linhas"]) < (lido["total"] or 0):
            raise RuntimeError(f"veio {len(lido['linhas'])} de {lido['total']} dias")

    if descobrir:
        print(f"   campos: {lido['campos']}", flush=True)
        print(f"   amostra: {json.dumps(lido['linhas'][:3], ensure_ascii=False)}", flush=True)

    dias = []
    for l in lido["linhas"]:
        iso = data_iso(l["dia"], ano_mes)
        # Linha sem data (rodapé de total) ou de outro mês (o Saipos devolvendo
        # a busca anterior) não entra: o mês fica curto e aparece no log.
        if not iso or not iso.startswith(ano_mes):
            continue
        dias.append({"data": iso, "pedidos": l["pedidos"],
                     "valor": round(l["valor"], 2), "cancelados": l["cancelados"]})
    dias.sort(key=lambda d: d["data"])
    return dias, (None if dias or not lido["linhas"] else diagnostico(page))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--de", help="primeiro mês (AAAA-MM); padrão: mês passado")
    ap.add_argument("--ate", help="último mês (AAAA-MM); padrão: igual ao --de")
    ap.add_argument("--loja", help="DAME ou LOV (padrão: as duas)")
    ap.add_argument("--descobrir", action="store_true",
                    help="imprime os campos lidos do scope (checagem de campo)")
    ap.add_argument("--headless", action="store_true")
    args = ap.parse_args()

    de = args.de or mes_passado(date.today())
    ate = args.ate or de
    lista = meses(de, ate)

    cfg = sv.load_cfg()
    lojas = {args.loja.upper(): cfg["lojas"][args.loja.upper()]} if args.loja else dict(cfg["lojas"])
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n=== Vendas dia a dia — {de} a {ate} ({len(lista)} meses × {len(lojas)} lojas) ===\n")
    registros, falhas, diagnosticos = [], [], []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=cfg["profile_dir"],
            headless=args.headless,
            slow_mo=200,
            args=["--start-maximized"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        sv.monitorar(page)
        sv.garantir_login(page, cfg)

        for loja, id_store in lojas.items():
            sv.selecionar_loja(page, loja, id_store)
            for ano_mes in lista:
                try:
                    dias, diag = coletar_mes(page, id_store, ano_mes, args.descobrir)
                except Exception as e:  # um mês ruim não derruba a coleta inteira
                    print(f"  {loja} {ano_mes}: FALHOU ({type(e).__name__} {e})", flush=True)
                    falhas.append(f"{loja} {ano_mes}")
                    if not diagnosticos:
                        diagnosticos.append({"loja": loja, "ano_mes": ano_mes,
                                             "erro": f"{type(e).__name__} {e}", **diagnostico(page)})
                    continue
                if diag and not diagnosticos:
                    diagnosticos.append({"loja": loja, "ano_mes": ano_mes, **diag})
                pedidos = sum(d["pedidos"] for d in dias)
                valor = sum(d["valor"] for d in dias)
                print(f"  {loja} {ano_mes}: {len(dias)} dias · {pedidos} pedidos · "
                      f"R$ {valor:,.2f}".replace(",", "."), flush=True)
                registros.append({"marca": MARCA[loja], "ano_mes": ano_mes, "dias": dias})
        ctx.close()

    saida = DATA_DIR / f"diario-{date.today().isoformat()}.json"
    saida.write_text(json.dumps({
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "de": de, "ate": ate,
        "falhas": falhas,
        "diagnostico": diagnosticos,
        "meses": registros,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n✓ {saida.name} — {len(registros)} meses"
          + (f" · {len(falhas)} falhas: {', '.join(falhas)}" if falhas else ""))
    # Falha total sai com erro pra agenda avisar; parcial fica no log e no JSON.
    if lista and not registros:
        sys.exit(1)


if __name__ == "__main__":
    main()
