# -*- coding: utf-8 -*-
"""Coleta entregas por motoboy no Saipos (delivery-man-paid), dia a dia.

Consulta o relatório "Entregadores" das duas lojas (Dáme e Lov) para cada dia
da semana alvo (segunda a domingo) e grava um JSON com a quantidade de
entregas por entregador por dia. O JSON é consumido pelo importar_pa.mjs,
que casa os nomes e grava no Firestore da intranet.

Uso:
    python coletar_saipos.py                      # semana passada (seg-dom)
    python coletar_saipos.py --semana 2026-07-06  # segunda-feira específica
    python coletar_saipos.py --visivel            # browser visível (debug)

Reaproveita o perfil de browser logado do dre-ai
(%LOCALAPPDATA%/dre_ai/browser_profile_saipos) e as credenciais do
saipos_config.json do dre-ai — mesmo padrão dos demais coletores.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, r"C:\claude_project\Pizzarias\caixas-conferencia\coletores")
import saipos_acesso as sa  # noqa: E402  (login + seleção de loja compartilhados)

URL_ENTREGADORES = "https://conta.saipos.com/#/app/store/delivery-man-paid"
LOJAS = ["DAME", "LOV"]
DATA_DIR = Path(__file__).resolve().parent / "data"


def segunda_da_semana_passada() -> date:
    hoje = date.today()
    segunda_atual = hoje - timedelta(days=(hoje.weekday()))
    return segunda_atual - timedelta(days=7)


def login_robusto(page) -> None:
    """garantir_login com retry — o redirect do Angular pro login às vezes demora."""
    for _ in range(3):
        page.goto(sa.SAIPOS_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(4000)
        if "login" in page.url.lower() or "access" in page.url.lower():
            sa.garantir_login(page)
            page.wait_for_timeout(3000)
        if "login" not in page.url.lower() and "access" not in page.url.lower():
            return
    raise RuntimeError(f"Nao consegui logar no Saipos (URL: {page.url})")


def navegar_relatorio(page) -> None:
    for tentativa in range(3):
        page.goto(URL_ENTREGADORES, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3500)
        if "delivery-man-paid" in page.url:
            return
        print(f"  [{tentativa + 1}/3] redirecionado para {page.url}, tentando de novo...")
    raise RuntimeError(f"Nao consegui abrir o relatorio de entregadores (URL: {page.url})")


def preencher_dia(page, dia: date) -> None:
    """Preenche as duas datas (início e fim) com o mesmo dia."""
    valor = dia.strftime("%d/%m/%Y")
    inputs = page.locator("input[ng-model='dateString']").all()
    if len(inputs) < 2:
        raise RuntimeError(f"Inputs de data nao encontrados ({len(inputs)})")
    for inp in inputs[:2]:
        inp.click(click_count=3)
        inp.type(valor, delay=50)
        inp.press("Tab")
    page.wait_for_timeout(400)


def buscar(page) -> None:
    clicado = page.evaluate(
        """() => {
          const vis = el => !!(el.offsetWidth || el.offsetHeight);
          const btns = [...document.querySelectorAll('button')].filter(vis);
          const alvo = btns.find(b => /buscar/i.test(b.innerText || ''));
          if (alvo) { alvo.click(); return true; }
          return false;
        }"""
    )
    if not clicado:
        raise RuntimeError("Botao BUSCAR nao encontrado")
    page.wait_for_timeout(4500)


def ler_tabela(page) -> dict[str, int]:
    """Lê a tabela de entregadores → { NOME: qtde_entregas } (só qtde > 0)."""
    linhas = page.evaluate(
        """() => {
          const tables = [...document.querySelectorAll('table')].filter(t => t.offsetHeight);
          for (const t of tables) {
            const head = (t.querySelector('thead') || t).innerText || '';
            if (!/ENTREGADOR/i.test(head)) continue;
            return [...t.querySelectorAll('tbody tr')].map(tr =>
              [...tr.querySelectorAll('td')].map(c => (c.innerText || '').trim()));
          }
          return null;
        }"""
    )
    if linhas is None:
        raise RuntimeError("Tabela de entregadores nao encontrada")
    resultado: dict[str, int] = {}
    for cels in linhas:
        # Layout observado: [ '', 'NOME\nDiária', 'QTDE', 'VALOR TAXAS', ... ]
        texto = [c for c in cels if c]
        if len(texto) < 2:
            continue
        nome = texto[0].split("\n")[0].strip()
        try:
            qtd = int(texto[1].split("\n")[0].strip())
        except (ValueError, IndexError):
            continue
        if nome and qtd > 0:
            resultado[nome] = resultado.get(nome, 0) + qtd
    return resultado


def coletar(segunda: date, headless: bool) -> dict:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    dias = [segunda + timedelta(days=i) for i in range(7)]
    saida = {
        "semana": segunda.isoformat(),
        "geradoEm": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "lojas": {},
    }
    sa.BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(sa.BROWSER_PROFILE),
            headless=headless,
            slow_mo=100,
            args=["--start-maximized"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            login_robusto(page)
            for loja in LOJAS:
                print(f"== {loja} ==")
                sa.selecionar_loja(page, loja)
                navegar_relatorio(page)
                dias_loja: dict[str, dict[str, int]] = {}
                for i, dia in enumerate(dias):
                    preencher_dia(page, dia)
                    buscar(page)
                    contagem = ler_tabela(page)
                    if contagem:
                        dias_loja[str(i)] = contagem
                    total = sum(contagem.values())
                    print(f"  {dia.strftime('%a %d/%m')}: {total} entregas, {len(contagem)} motoboys")
                saida["lojas"][loja.lower()] = {"dias": dias_loja}
        finally:
            ctx.close()
    return saida


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--semana", help="segunda-feira da semana alvo (YYYY-MM-DD); default: semana passada")
    ap.add_argument("--visivel", action="store_true", help="browser visível (debug)")
    ap.add_argument("--out", help="arquivo de saída (default: data/pa-<semana>.json)")
    args = ap.parse_args()

    segunda = date.fromisoformat(args.semana) if args.semana else segunda_da_semana_passada()
    if segunda.weekday() != 0:
        print(f"[ERRO] {segunda} nao e segunda-feira")
        return 2

    # Até 3 tentativas — o browser às vezes não sobe de madrugada (lock do perfil).
    ultimo_erro = None
    for tentativa in range(3):
        try:
            dados = coletar(segunda, headless=not args.visivel and tentativa < 2)
            break
        except Exception as e:  # noqa: BLE001
            ultimo_erro = e
            print(f"[{tentativa + 1}/3] falhou: {e}")
            time.sleep(20)
    else:
        print(f"[ERRO] coleta falhou apos 3 tentativas: {ultimo_erro}")
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = Path(args.out) if args.out else DATA_DIR / f"pa-{segunda.isoformat()}.json"
    out.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
