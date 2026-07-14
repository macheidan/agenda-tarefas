# -*- coding: utf-8 -*-
"""Coleta entregas por motoboy no Saipos (delivery-man-paid), com detalhe por taxa.

Consulta o relatório "Entregadores" das duas lojas (Dáme e Lov) para a semana
alvo inteira (segunda a domingo) com status "Não pago", abre o "Ver detalhes"
de cada entregador e extrai as entregas por data × valor de comissão. O JSON
resultante traz a contagem por dia (compatível com o formato antigo) e a
quebra por taxa, consumidos pelo importar_pa.mjs.

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
    for tentativa in range(5):
        page.goto(URL_ENTREGADORES, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3500)
        if "delivery-man-paid" in page.url:
            return
        print(f"  [{tentativa + 1}/5] redirecionado para {page.url}, tentando de novo...")
    raise RuntimeError(f"Nao consegui abrir o relatorio de entregadores (URL: {page.url})")


def preencher_periodo(page, inicio: date, fim: date) -> None:
    """Preenche as datas de início e fim do período."""
    inputs = page.locator("input[ng-model='dateString']").all()
    if len(inputs) < 2:
        raise RuntimeError(f"Inputs de data nao encontrados ({len(inputs)})")
    for inp, dia in zip(inputs[:2], [inicio, fim]):
        inp.click(click_count=3)
        inp.type(dia.strftime("%d/%m/%Y"), delay=50)
        inp.press("Tab")
    page.wait_for_timeout(400)


def filtrar_nao_pago(page) -> None:
    """Seleciona status "Não pago" no select (widget chosen escondido)."""
    ok = page.evaluate(
        """() => {
          const sels = [...document.querySelectorAll('select')];
          const sel = sels.find(s => [...s.options].some(o => /n.o pago/i.test(o.label || o.text)));
          if (!sel) return false;
          const opt = [...sel.options].find(o => /n.o pago/i.test(o.label || o.text));
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', {bubbles: true}));
          if (window.angular) angular.element(sel).triggerHandler('change');
          return true;
        }"""
    )
    if not ok:
        raise RuntimeError("Select de status (Nao pago) nao encontrado")
    page.wait_for_timeout(600)


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
    page.wait_for_timeout(5000)


def listar_entregadores(page) -> list[dict]:
    """Linhas da tabela principal → [{id, nome, qtd, temDetalhes}]."""
    linhas = page.evaluate(
        """() => [...document.querySelectorAll('tr[data-qa^="delivery-man-"]')].map(tr => ({
              id: tr.getAttribute('data-qa'),
              nome: (tr.querySelector('td[data-qa=name]')?.innerText || '').trim().split('\\n')[0].trim(),
              qtd: parseInt((tr.querySelector('td[data-qa="count-deliveries"]')?.innerText || '0').trim(), 10) || 0,
              temDetalhes: !!([...tr.querySelectorAll('a')].find(a => /ver detalhes/i.test(a.innerText))),
            }))"""
    )
    return [l for l in linhas if l["nome"]]


def abrir_detalhes(page, row_id: str) -> None:
    ok = page.evaluate(
        """(rowId) => {
          const tr = document.querySelector(`tr[data-qa="${rowId}"]`);
          const a = tr && [...tr.querySelectorAll('a')].find(a => /ver detalhes/i.test(a.innerText));
          if (a) { a.click(); return true; }
          return false;
        }""",
        row_id,
    )
    if not ok:
        raise RuntimeError(f"Link Ver detalhes nao encontrado em {row_id}")
    page.wait_for_selector(".modal-content", timeout=15000)
    page.wait_for_timeout(1500)


def ler_entregas_modal(page) -> list[dict]:
    """Tabela "Entregas" do modal → [{data: 'dd/mm/aaaa', valor: float}]."""
    vendas = page.evaluate(
        """() => {
          const modal = document.querySelector('.modal-content');
          if (!modal) return null;
          const rows = [...modal.querySelectorAll('tr[ng-repeat^="sale in"]')];
          return rows.map(tr => {
            const tds = [...tr.querySelectorAll('td')];
            const data = (tds[2]?.innerText || '').trim();
            const inp = tr.querySelector('input[ng-model="sale.sale_new_value_to_pay"]');
            const bruto = inp ? inp.value : (tds[6]?.innerText || '');
            return {data, bruto};
          });
        }"""
    )
    if vendas is None:
        raise RuntimeError("Modal de detalhes nao encontrado")
    out = []
    for v in vendas:
        if not v["data"]:
            continue
        bruto = str(v["bruto"]).replace("R$", "").replace(".", "").replace(",", ".").strip()
        try:
            valor = float(bruto)
        except ValueError:
            valor = 0.0
        out.append({"data": v["data"], "valor": valor})
    return out


def fechar_modal(page) -> None:
    page.evaluate(
        """() => {
          const modal = document.querySelector('.modal-content');
          if (!modal) return;
          const btn = [...modal.querySelectorAll('button')].find(b => /cancelar/i.test(b.innerText || ''));
          if (btn) btn.click();
        }"""
    )
    try:
        page.wait_for_selector(".modal-content", state="detached", timeout=10000)
    except Exception:  # noqa: BLE001
        page.keyboard.press("Escape")
        page.wait_for_timeout(1000)
    page.wait_for_timeout(600)


def coletar_loja(page, loja: str, dias: list[date]) -> dict:
    """Uma loja → {dias: {i: {nome: qtd}}, taxas: {nome: {i: {'10.00': qtd}}}}."""
    sa.selecionar_loja(page, loja)
    navegar_relatorio(page)
    preencher_periodo(page, dias[0], dias[-1])
    filtrar_nao_pago(page)
    buscar(page)

    idx_por_data = {d.strftime("%d/%m/%Y"): str(i) for i, d in enumerate(dias)}
    entregadores = listar_entregadores(page)
    print(f"  {len(entregadores)} entregadores com status nao pago")

    dias_loja: dict[str, dict[str, int]] = {}
    taxas_loja: dict[str, dict[str, dict[str, int]]] = {}
    for ent in entregadores:
        if not ent["temDetalhes"]:
            print(f"  {ent['nome']}: sem link de detalhes, pulando")
            continue
        abrir_detalhes(page, ent["id"])
        vendas = ler_entregas_modal(page)
        fechar_modal(page)

        fora = 0
        for v in vendas:
            di = idx_por_data.get(v["data"])
            if di is None:
                fora += 1
                continue
            dias_loja.setdefault(di, {})
            dias_loja[di][ent["nome"]] = dias_loja[di].get(ent["nome"], 0) + 1
            chave = f"{v['valor']:.2f}"
            taxas_loja.setdefault(ent["nome"], {}).setdefault(di, {})
            taxas_loja[ent["nome"]][di][chave] = taxas_loja[ent["nome"]][di].get(chave, 0) + 1

        total = sum(1 for v in vendas if v["data"] in idx_por_data)
        aviso = ""
        if total != ent["qtd"]:
            aviso = f" [AVISO: tabela diz {ent['qtd']}]"
        if fora:
            aviso += f" [{fora} fora do periodo]"
        print(f"  {ent['nome']}: {total} entregas{aviso}")

    return {"dias": dias_loja, "taxas": taxas_loja}


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
                saida["lojas"][loja.lower()] = coletar_loja(page, loja, dias)
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
