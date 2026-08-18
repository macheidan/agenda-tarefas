# -*- coding: utf-8 -*-
"""Coleta os clientes que compraram nos últimos N dias (default 90) no Saipos.

A tela "Clientes" (`#/app/store/customers`) é AngularJS e busca a lista no
endpoint `find-all-customers`. Replicar esse GET por fora NÃO funciona: a
requisição leva um header de assinatura ligado à URL, e qualquer URL montada
na mão volta `{"customers":[],"customers_count":0}` com status 200 — some sem
erro. Por isso a coleta aqui é feita DIRIGINDO o próprio controller da tela
(`vm.filter`, `vm.number_pages`, `vm.actual_page`, `vm.findAll()`) e lendo as
respostas que o app dispara. 100 é o teto de registros por página que o
servidor aceita (500 volta vazio).

Janela de 90 dias por decisão de produto: a base de "91+ dias sem pedir" da
intranet se forma pelo envelhecimento da nossa própria lista, não pelo
histórico inteiro do Saipos (33 mil cadastros por loja, metade sem telefone).
Entra só quem tem telefone com DDD do RS (51, 53, 54, 55).

Uso:
    python coletar_clientes.py                # últimos 90 dias, headless
    python coletar_clientes.py --dias 60
    python coletar_clientes.py --visivel      # browser visível (debug)
    python coletar_clientes.py --loja LOV     # só uma loja
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, r"C:\claude_project\Pizzarias\caixas-conferencia\coletores")
import saipos_acesso as sa  # noqa: E402  (login compartilhado com os outros coletores)

URL_CLIENTES = "https://conta.saipos.com/#/app/store/customers"
# A conta tem 3 lojas (a 94387 é a "DAME - HML", de testes). Selecionar por ID,
# nunca por posição: o índice de sa.selecionar_loja assume 2 lojas e hoje cairia
# na loja de testes.
LOJAS = {"dame": "10677", "lov": "11377"}
# Só cliente do Rio Grande do Sul entra na lista: as duas lojas entregam em
# Porto Alegre, então DDD de fora é turista, pedido de viagem ou telefone
# digitado errado — ninguém para quem mandar campanha.
DDD_RS = {"51", "53", "54", "55"}
PAGE_SIZE = 100
DATA_DIR = Path(__file__).resolve().parent / "data"

# Pega o vm (controller) da tela de clientes a partir de uma linha da tabela.
JS_PEGAR_VM = """() => {
  const el = document.querySelector('[ng-repeat="customer in vm.customers"]');
  if (!el) return false;
  const s = angular.element(el).scope();
  window.__vm = s.vm || s.$parent.vm;
  return !!window.__vm;
}"""


def limpar_nome(nome) -> str:
    """Saipos guarda lixo em full_name ("-", ",", ", ,"). Vira string vazia."""
    n = re.sub(r"\s+", " ", str(nome or "")).strip()
    return "" if not re.search(r"[A-Za-zÀ-ÿ0-9]", n) else n


def limpar_telefone(tel) -> str:
    """Só os dígitos do primeiro telefone (o campo pode vir "a<br>b")."""
    if not tel:
        return ""
    return re.sub(r"\D", "", str(tel).split("<br>")[0])


def ddd(tel: str) -> str:
    """DDD do número, tirando o 55 do país quando ele vem junto.

    "5551999998888" (13) e "555199999888" (12) trazem o DDI; "51999998888"
    (11) e "5133334444" (10) não. O DDD 55 (Santa Maria) é justamente o caso
    ambíguo — por isso a decisão é pelo comprimento, não pelo prefixo.
    """
    t = str(tel or "")
    if len(t) >= 12 and t.startswith("55"):
        t = t[2:]
    return t[:2]


def selecionar_loja(page, id_store: str) -> None:
    """Troca de loja pelo seletor do header, casando pelo ID da loja."""
    atual = page.evaluate("() => (document.querySelector('a.button-header')?.innerText || '').trim()")
    page.locator("a.button-header").first.click(timeout=15000)
    page.wait_for_timeout(2500)
    # Subir no DOM até o maior ancestral que ainda contém só ESTE botão: é a
    # linha da loja. Subir por número fixo de níveis pegaria o container das
    # três lojas, cujo texto casa com qualquer ID (e cai sempre na primeira).
    ok = page.evaluate(
        """(idStore) => {
          const btns = [...document.querySelectorAll('.btn-primary.m-b-0')]
            .filter((b) => b.offsetWidth || b.offsetHeight);
          for (const b of btns) {
            let linha = b;
            while (
              linha.parentElement &&
              linha.parentElement.querySelectorAll('.btn-primary.m-b-0').length === 1
            ) {
              linha = linha.parentElement;
            }
            if ((linha.innerText || '').includes(idStore)) { b.click(); return true; }
          }
          return false;
        }""",
        id_store,
    )
    if not ok:
        raise RuntimeError(f"Loja {id_store} nao encontrada no seletor (estava em {atual!r})")
    page.wait_for_timeout(4000)


def abrir_tela_clientes(page) -> None:
    """Abre a tela de clientes e prende o controller em window.__vm."""
    for tentativa in range(6):
        page.goto(URL_CLIENTES, wait_until="domcontentloaded", timeout=60000)
        # A SPA já está carregada: trocar só o hash não remonta a tela. O reload
        # garante que a rota seja montada de novo com a loja recém-selecionada.
        page.reload(wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(4000)
        if "customers" not in page.url:
            print(f"  [{tentativa + 1}/6] redirecionado para {page.url}")
            continue
        for _ in range(20):
            if page.evaluate(JS_PEGAR_VM):
                return
            page.wait_for_timeout(1000)
    raise RuntimeError(f"Nao consegui abrir a tela de clientes (URL: {page.url})")


def coletar_loja(page, loja: str, id_store: str, inicio: date, fim: date) -> list[dict]:
    """Pagina a tela toda e devolve os clientes agregados por telefone."""
    respostas: dict[int, list] = {}
    store_vistos: set[str] = set()

    def on_resp(resp):
        if "find-all-customers" not in resp.url:
            return
        try:
            store_vistos.add(resp.url.split("/stores/")[1].split("/")[0])
            bruto = urllib.parse.parse_qs(urllib.parse.urlparse(resp.url).query)["filter"][0]
            ini = int(json.loads(bruto).get("rownum_initial") or 0)
            respostas[ini] = json.loads(resp.text()).get("customers", [])
        except Exception as e:  # noqa: BLE001
            print(f"  [aviso] resposta ilegivel: {e}")

    page.on("response", on_resp)
    try:
        selecionar_loja(page, id_store)
        abrir_tela_clientes(page)

        registros: list[dict] = []
        total = None
        pagina = 1
        while True:
            esperado = (pagina - 1) * PAGE_SIZE + 1
            respostas.pop(esperado, None)
            page.evaluate(
                """([ini, fim, size, pag, primeira]) => {
                  const vm = window.__vm;
                  vm.filter.start_date = ini;
                  vm.filter.end_date = fim;
                  vm.number_pages = size;
                  vm.actual_page = pag;
                  vm.findAll(primeira);
                }""",
                [inicio.isoformat(), fim.isoformat(), PAGE_SIZE, pagina, pagina == 1],
            )
            for _ in range(60):
                page.wait_for_timeout(1000)
                if esperado in respostas:
                    break
            else:
                raise RuntimeError(f"Sem resposta para a pagina {pagina} ({loja})")

            lote = respostas.pop(esperado)
            registros.extend(lote)
            if total is None:
                total = int(page.evaluate("() => window.__vm.total_customers") or 0)
                print(f"  {total} clientes no periodo · {max(1, -(-total // PAGE_SIZE))} paginas")
            if pagina % 10 == 0 or len(lote) < PAGE_SIZE:
                print(f"  pagina {pagina}: +{len(lote)} (acumulado {len(registros)})")
            if len(lote) < PAGE_SIZE or pagina * PAGE_SIZE >= (total or 0):
                break
            pagina += 1

        # A troca de loja é o ponto frágil do fluxo (o app é uma SPA e mantém a
        # loja atual): se qualquer resposta veio de outra loja, é dado errado.
        if store_vistos != {id_store}:
            raise RuntimeError(
                f"A tela respondeu pelas lojas {sorted(store_vistos)}, esperado {id_store} — "
                "troca de loja falhou, abortando para nao gravar dado da loja errada"
            )
        return agregar(registros)
    finally:
        page.remove_listener("response", on_resp)


def agregar(registros: list[dict]) -> list[dict]:
    """Um cliente por telefone.

    O Saipos tem cadastros duplicados do mesmo telefone (cada um com o seu
    `qtt_sales`): somamos os pedidos e ficamos com a compra mais recente. Quem
    não tem telefone, ou tem DDD de fora do RS, fica de fora — a lista existe
    para mandar WhatsApp para quem as lojas conseguem entregar.
    """
    por_tel: dict[str, dict] = {}
    sem_tel = 0
    fora_rs = 0
    for r in registros:
        tel = limpar_telefone(r.get("phone"))
        if len(tel) < 10:
            sem_tel += 1
            continue
        if ddd(tel) not in DDD_RS:
            fora_rs += 1
            continue
        ult = (r.get("last_sale_date") or "")[:10]
        atual = por_tel.get(tel)
        if not atual:
            por_tel[tel] = {
                "id": r.get("id_customer"),
                "nome": limpar_nome(r.get("full_name")),
                "telefone": tel,
                "pedidos": int(r.get("qtt_sales") or 0),
                "ultimaCompra": ult,
            }
            continue
        atual["pedidos"] += int(r.get("qtt_sales") or 0)
        if ult > (atual["ultimaCompra"] or ""):
            atual["ultimaCompra"] = ult
            atual["id"] = r.get("id_customer")
        if not atual["nome"]:
            atual["nome"] = limpar_nome(r.get("full_name"))
    # Sem data de última compra não dá para calcular "dias sem pedir" — e a
    # janela de 90 dias garante que quem entrou aqui comprou. Se vier vazio é
    # cadastro solto do Saipos, que não serve para campanha.
    com_data = [c for c in por_tel.values() if c["ultimaCompra"]]
    print(
        f"  {len(com_data)} telefones unicos ({sem_tel} sem telefone, "
        f"{fora_rs} com DDD fora do RS e {len(por_tel) - len(com_data)} sem data descartados)"
    )
    return sorted(com_data, key=lambda c: c["ultimaCompra"], reverse=True)


def coletar(lojas: dict[str, str], dias: int, headless: bool) -> dict:
    fim = date.today()
    inicio = fim - timedelta(days=dias)
    saida = {
        "geradoEm": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "janelaDias": dias,
        "inicio": inicio.isoformat(),
        "fim": fim.isoformat(),
        "lojas": {},
    }
    sa.BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(sa.BROWSER_PROFILE),
            headless=headless,
            slow_mo=60,
            args=["--start-maximized"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            sa.garantir_login(page)
            for loja, id_store in lojas.items():
                print(f"== {loja.upper()} (loja {id_store}) ==")
                saida["lojas"][loja] = coletar_loja(page, loja, id_store, inicio, fim)
        finally:
            ctx.close()
    return saida


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=90, help="janela de dias (default 90)")
    ap.add_argument("--loja", help="DAME ou LOV (default: as duas)")
    ap.add_argument("--visivel", action="store_true", help="browser visivel (debug)")
    ap.add_argument("--out", help="arquivo de saida (default: data/clientes-<data>.json)")
    args = ap.parse_args()

    lojas = LOJAS
    if args.loja:
        chave = args.loja.lower()
        if chave not in LOJAS:
            print(f"[ERRO] loja desconhecida: {args.loja}")
            return 2
        lojas = {chave: LOJAS[chave]}

    # Até 3 tentativas — de madrugada o browser às vezes não sobe (lock do perfil).
    ultimo_erro = None
    for tentativa in range(3):
        try:
            dados = coletar(lojas, args.dias, headless=not args.visivel and tentativa < 2)
            break
        except Exception as e:  # noqa: BLE001
            ultimo_erro = e
            print(f"[{tentativa + 1}/3] falhou: {e}")
            time.sleep(20)
    else:
        print(f"[ERRO] coleta falhou apos 3 tentativas: {ultimo_erro}")
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = Path(args.out) if args.out else DATA_DIR / f"clientes-{date.today().isoformat()}.json"
    out.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(v) for v in dados["lojas"].values())
    print(f"OK: {out} ({total} clientes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
