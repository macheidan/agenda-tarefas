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
histórico inteiro do Saipos (33 mil cadastros por loja).

Entra TODO mundo que comprou na janela, com telefone ou sem. Mais da metade dos
cadastros não tem telefone: são os pedidos de marketplace, que chegam com nome,
CPF e endereço e com o telefone mascarado pelo iFood. Esses não servem para
campanha de WhatsApp, mas contam em faturamento, recência, ticket e bairro — e
parte deles reaparece com telefone quando o CPF (ou o par nome+endereço) casa
com um cadastro de balcão/site da mesma pessoa (ver `religar`). Quem pode
receber campanha é marcado com `rs` (telefone com DDD 51, 53, 54 ou 55).

Uso:
    python coletar_clientes.py                # últimos 90 dias, headless
    python coletar_clientes.py --dias 60
    python coletar_clientes.py --visivel      # browser visível (debug)
    python coletar_clientes.py --loja LOV     # só uma loja
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import unicodedata
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


def fechar_modais(page) -> None:
    """Fecha qualquer modal aberto antes de mexer no header.

    O Saipos abre modal sozinho (aviso, cadastro de cliente, sessão) e o
    backdrop cobre a tela inteira: o clique no seletor de loja vai para o
    backdrop e o Playwright fica minutos tentando, até estourar o timeout.
    """
    for _ in range(3):
        if not page.locator(".modal.in, [uib-modal-window]").count():
            return
        page.keyboard.press("Escape")
        page.wait_for_timeout(800)


def selecionar_loja(page, id_store: str) -> None:
    """Troca de loja pelo seletor do header, casando pelo ID da loja."""
    fechar_modais(page)
    atual = page.evaluate("() => (document.querySelector('a.button-header')?.innerText || '').trim()")
    # Espera o header montar (a SPA ainda pode estar carregando) e clica por JS,
    # não pelo Playwright: modal aberto cobre a tela com um backdrop, o clique
    # "de verdade" vai para o backdrop e estoura o timeout. O JS chama o elemento
    # direto, e aí o backdrop não tem como atrapalhar.
    try:
        page.wait_for_selector("a.button-header", timeout=30000)
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"Header do Saipos nao carregou (URL {page.url})") from e
    if not page.evaluate("() => { const el = document.querySelector('a.button-header'); if (!el) return false; el.click(); return true; }"):
        raise RuntimeError(f"Seletor de loja nao encontrado no header (estava em {atual!r})")
    page.wait_for_timeout(3000)
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


def limpar_cpf(v) -> str:
    """Só os 11 dígitos do CPF. CNPJ e lixo viram string vazia."""
    d = re.sub(r"\D", "", str(v or ""))
    return d if len(d) == 11 else ""


def limpar_email(v) -> str:
    e = str(v or "").split("<br>")[0].strip().lower()
    return e if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e) else ""


def normalizar(s) -> str:
    """Texto sem acento, sem pontuação e em minúsculo — para casar chaves."""
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def enderecos(r) -> list:
    """Endereços do cadastro. O Saipos junta todos num campo só, separados por
    `<br>`, no formato "Cidade, Bairro - Rua, Numero, Complemento" — o
    complemento já vem no fim da linha, então a linha inteira serve de chave."""
    return [a.strip() for a in str(r.get("address") or "").split("<br>") if a.strip()]


def partes_endereco(end: str):
    cidade, _, resto = str(end or "").partition(",")
    bairro, _, rua = resto.partition(" - ")
    return cidade.strip(), bairro.strip(), rua.strip()


def data_iso(v) -> str:
    return str(v or "")[:10]


def preparar(r: dict) -> dict:
    """Um registro do Saipos vira o dicionário que a intranet entende."""
    ends = enderecos(r)
    # O campo não tem ordem cronológica; o endereço na cidade da loja é o que
    # interessa para relatório por bairro, então Porto Alegre ganha de fora.
    poa = [e for e in ends if normalizar(partes_endereco(e)[0]) == "porto alegre"]
    principal = (poa or ends or [""])[0]
    cidade, bairro, _rua = partes_endereco(principal)
    tel = limpar_telefone(r.get("phone"))
    return {
        "id": r.get("id_customer"),
        # Um cliente costuma ter mais de um cadastro no Saipos; o histórico de
        # pedidos é pedido por cadastro, então a lista tem de sobreviver à fusão.
        "ids": [r.get("id_customer")],
        "nome": limpar_nome(r.get("full_name")),
        "telefone": tel if len(tel) >= 10 else "",
        "telefoneOrigem": "cadastro" if len(tel) >= 10 else "",
        "cpf": limpar_cpf(r.get("cpf_cnpj")),
        "email": limpar_email(r.get("email")),
        "aniversario": data_iso(r.get("birth_date"))[5:],
        "cidade": cidade,
        "bairro": bairro,
        "endereco": principal,
        "enderecos": [normalizar(e) for e in ends],
        "pedidos": int(r.get("qtt_sales") or 0),
        "valorTotal": round(float(r.get("value_total_sales") or 0), 2),
        "cancelados": int(float(r.get("count_canceled") or 0)),
        "ultimaCompra": data_iso(r.get("last_sale_date")),
    }


def indices_de_telefone(itens: list):
    """CPF -> telefone e nome+endereço -> telefone, a partir de quem TEM telefone.

    É o que permite religar o cadastro de marketplace (nome, CPF e endereço,
    telefone nenhum) ao cadastro de balcão/site da mesma pessoa. Guarda o
    conjunto de telefones de cada chave: chave que aponta para dois telefones
    diferentes é ambígua e não religa ninguém.
    """
    por_cpf: dict = {}
    por_nome_end: dict = {}
    for it in itens:
        if not it["telefone"]:
            continue
        if it["cpf"]:
            por_cpf.setdefault(it["cpf"], set()).add(it["telefone"])
        nome = normalizar(it["nome"])
        if nome:
            for e in it["enderecos"]:
                por_nome_end.setdefault((nome, e), set()).add(it["telefone"])
    return por_cpf, por_nome_end


def religar(itens: list) -> dict:
    """Empresta telefone para quem não tem, quando a identidade é inequívoca.

    Só religa em 1 para 1: se o CPF (ou o par nome+endereço) aparece com dois
    telefones diferentes, não dá para saber qual é o da pessoa e o cadastro
    fica sem telefone mesmo.
    """
    por_cpf, por_nome_end = indices_de_telefone(itens)
    contas = {"cpf": 0, "nome_endereco": 0}
    for it in itens:
        if it["telefone"]:
            continue
        achados = por_cpf.get(it["cpf"]) if it["cpf"] else None
        origem = "cpf"
        if not achados or len(achados) != 1:
            nome = normalizar(it["nome"])
            achados = set()
            if nome:
                for e in it["enderecos"]:
                    achados |= por_nome_end.get((nome, e), set())
            origem = "nome_endereco"
        if achados and len(achados) == 1:
            it["telefone"] = next(iter(achados))
            it["telefoneOrigem"] = origem
            contas[origem] += 1
    return contas


def digerir(valor: str) -> str:
    """Hash curto de um identificador. O CPF é a melhor chave que temos para
    reconhecer o mesmo cliente entre cadastros, mas não tem por que existir em
    claro na intranet: só o hash sobe para o Firestore."""
    return hashlib.sha1(valor.encode("utf-8")).hexdigest()[:16]


def chave(it: dict) -> str:
    """Identidade do cliente, na ordem de confiança: telefone > CPF > nome+endereço.

    Sem nenhuma das três o cadastro fica sozinho (chave pelo id do Saipos) — é
    o caso do cadastro anônimo de balcão, que não dá para fundir com nada.
    """
    if it["telefone"]:
        return "t:" + it["telefone"]
    if it["cpf"]:
        return "c:" + digerir(it["cpf"])
    nome = normalizar(it["nome"])
    if nome and it["enderecos"]:
        # sorted() porque a chave precisa ser a mesma amanha: a ordem em que o
        # Saipos devolve os enderecos do cadastro nao e garantida.
        return "e:" + digerir(nome + "|" + sorted(it["enderecos"])[0])
    return "i:" + str(it["id"])


def fundir(a: dict, b: dict) -> dict:
    """Funde dois cadastros do mesmo cliente (o Saipos duplica bastante).

    Pedidos e valor SOMAM: cada cadastro tem o seu próprio histórico. Contato e
    endereço vêm do cadastro com a compra mais recente.
    """
    novo, velho = (a, b) if (a["ultimaCompra"] or "") >= (b["ultimaCompra"] or "") else (b, a)
    saida = dict(novo)
    saida["pedidos"] = a["pedidos"] + b["pedidos"]
    saida["valorTotal"] = round(a["valorTotal"] + b["valorTotal"], 2)
    saida["cancelados"] = a["cancelados"] + b["cancelados"]
    saida["enderecos"] = list(dict.fromkeys(a["enderecos"] + b["enderecos"]))
    saida["ids"] = list(dict.fromkeys(a["ids"] + b["ids"]))
    for campo in ("nome", "cpf", "email", "aniversario", "telefone", "bairro", "cidade", "endereco"):
        if not saida.get(campo):
            saida[campo] = velho.get(campo) or ""
    if not novo["telefone"] and velho["telefone"]:
        saida["telefoneOrigem"] = velho["telefoneOrigem"]
    return saida


def agregar(registros: list) -> list:
    """Um cliente por identidade, com TODO mundo que comprou na janela.

    Esta função descartava quem não tinha telefone — mais da metade da base:
    são os pedidos de marketplace, que chegam com nome, CPF e endereço, mas com
    o telefone mascarado pelo iFood. Agora todo mundo entra e o telefone virou
    atributo: quem tem, é público de campanha; quem não tem, ainda conta em
    faturamento, recência, bairro e ticket.
    """
    itens = [preparar(r) for r in registros]
    contas = religar(itens)

    agregados: dict = {}
    for it in itens:
        k = chave(it)
        agregados[k] = fundir(agregados[k], it) if k in agregados else it

    saida = []
    for k, it in agregados.items():
        it = dict(it)
        it["chave"] = k
        it["ticket"] = round(it["valorTotal"] / it["pedidos"], 2) if it["pedidos"] else 0.0
        it["rs"] = bool(it["telefone"]) and ddd(it["telefone"]) in DDD_RS
        it["cpfHash"] = digerir(it["cpf"]) if it["cpf"] else ""
        it.pop("enderecos", None)
        saida.append(it)

    com_tel = sum(1 for c in saida if c["telefone"])
    com_rs = sum(1 for c in saida if c["rs"])
    print(
        "  %d clientes (%d cadastros) - %d com telefone (%d com DDD do RS) - "
        "religados: %d por CPF, %d por nome+endereco"
        % (len(saida), len(registros), com_tel, com_rs, contas["cpf"], contas["nome_endereco"])
    )
    return sorted(saida, key=lambda c: c["ultimaCompra"] or "", reverse=True)


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
