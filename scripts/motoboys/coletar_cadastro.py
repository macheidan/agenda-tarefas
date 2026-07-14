# -*- coding: utf-8 -*-
"""Coleta o cadastro de entregadores do Saipos (delivery-man) das duas lojas.

Lê nome + ativo (checkbox) de todos os entregadores cadastrados e grava um
JSON consumido pelo importar_roster.mjs, que mescla no roster da intranet.

Uso:
    python coletar_cadastro.py [--visivel] [--out data/cadastro.json]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, r"C:\claude_project\Pizzarias\caixas-conferencia\coletores")
import saipos_acesso as sa  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coletar_saipos import login_robusto  # noqa: E402

URL_CADASTRO = "https://conta.saipos.com/#/app/store/delivery-man"
LOJAS = ["DAME", "LOV"]
DATA_DIR = Path(__file__).resolve().parent / "data"


def navegar(page) -> None:
    for _ in range(3):
        page.goto(URL_CADASTRO, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3500)
        if page.url.endswith("delivery-man"):
            return
    raise RuntimeError(f"Nao consegui abrir o cadastro de entregadores (URL: {page.url})")


def ler_pagina(page) -> list[dict]:
    """Lê as linhas via scope do AngularJS (objeto `w` do ng-repeat), com
    fallback pro texto da célula quando o scope não estiver acessível."""
    return page.evaluate(
        """() => {
          const tables = [...document.querySelectorAll('table')].filter(t => t.offsetHeight);
          for (const t of tables) {
            const head = (t.querySelector('thead') || t).innerText || '';
            if (!/NOME/i.test(head)) continue;
            return [...t.querySelectorAll('tbody tr')].map(tr => {
              try {
                const w = angular.element(tr).scope().w;
                if (w && w.delivery_man_name) {
                  return {
                    nome: String(w.delivery_man_name).trim(),
                    ativo: w.enabled === 'Y',
                    idSaipos: w.id_store_delivery_man || null,
                  };
                }
              } catch (e) { /* cai no fallback */ }
              const nome = (tr.querySelector('td')?.innerText || '').trim();
              return { nome, ativo: true, idSaipos: null };
            }).filter(r => r.nome);
          }
          return [];
        }"""
    )


def coletar_loja(page) -> list[dict]:
    """Lê todas as páginas (se houver paginação)."""
    todos: dict[str, dict] = {}
    for pagina in range(1, 30):
        for r in ler_pagina(page):
            todos[r["nome"]] = r
        # Próxima página, se existir e estiver habilitada.
        tem_proxima = page.evaluate(
            """() => {
              const els = [...document.querySelectorAll('ul.pagination li, .pagination li')];
              const next = els.find(li => /›|»|next|próx/i.test(li.innerText || ''));
              if (!next || next.className.includes('disabled')) return false;
              const a = next.querySelector('a, button');
              if (!a) return false;
              a.click();
              return true;
            }"""
        )
        if not tem_proxima:
            break
        page.wait_for_timeout(1500)
    return list(todos.values())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--visivel", action="store_true")
    ap.add_argument("--out", help="arquivo de saída (default: data/cadastro.json)")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    saida = {"geradoEm": time.strftime("%Y-%m-%dT%H:%M:%S"), "lojas": {}}
    sa.BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(sa.BROWSER_PROFILE),
            headless=not args.visivel,
            slow_mo=100,
            args=["--start-maximized"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            login_robusto(page)
            for loja in LOJAS:
                sa.selecionar_loja(page, loja)
                navegar(page)
                lista = coletar_loja(page)
                ativos = sum(1 for r in lista if r["ativo"])
                print(f"{loja}: {len(lista)} cadastrados ({ativos} ativos)")
                saida["lojas"][loja.lower()] = lista
        finally:
            ctx.close()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = Path(args.out) if args.out else DATA_DIR / "cadastro.json"
    out.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
