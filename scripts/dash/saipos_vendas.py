#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Coletor de vendas diárias do Saipos para o dashboard pessoal.

Enxuto e autocontido: reusa a SESSÃO já logada do dre-ai (browser profile),
extrai do dia anterior por marca o valor vendido, total de pizzas e total de
pedidos, e grava em data/vendas.json. Sem Google Sheets, sem export Excel.

Valor e pedidos: relatório sales-by-period.
Pizzas: relatório store-item-sold, lido direto do scope AngularJS (vm.itemsResult
e vm.choicesResult), aplicando as regras do Fábio:
  - soma a quantidade dos produtos, desconsiderando bebidas (por categoria);
  - promoções de 2 pizzas / pizza em dobro contam x2;
  - soma a opção "Pequena Combo" pelos filhos, descontando "Nenhum".

Uso:
  python saipos_vendas.py                       # ontem, grava vendas.json
  python saipos_vendas.py --dia 2026-06-21
  python saipos_vendas.py --descobrir           # dump do sales-by-period (DAME)
  python saipos_vendas.py --descobrir-itens --loja LOV   # dump do scope -> data/_scope_LOV.json
  python saipos_vendas.py --testar-pizzas --loja DAME    # calcula pizzas do _scope salvo (offline)

Config: copie config.example.json para config.json. Por padrão aponta para o
profile já logado do dre-ai. Se cair no login, reusa o saipos_config.json do
dre-ai via "creds_from".
"""

import sys
import re
import os
import json
import argparse
import urllib.parse
from pathlib import Path
from datetime import date, datetime, timedelta

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

sys.path.insert(0, r"C:\claude_project\Hub\creds")
from otp_email import marco_zero  # noqa: E402
from saipos_2fa import tratar_2fa  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT     = Path(__file__).resolve().parent      # scripts/dash
DATA_DIR = ROOT / "data"
CFG_FILE = Path(__file__).parent / "config.json"

SAIPOS_URL    = "https://conta.saipos.com"
SAIPOS_REPORT = "https://conta.saipos.com/#/app/report/sales-by-period"
SAIPOS_ITENS  = "https://conta.saipos.com/#/app/report/store-item-sold"

DOW_PT = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]

# Rótulos do sales-by-period (confirmados via --descobrir 2026-06-21)
LBL_VALOR   = ["Total dos pedidos"]                # != "Qtde total de pedidos"
LBL_PEDIDOS = ["Qtde total de pedidos", "Quantidade total de pedidos"]

# Regras de contagem de pizzas (configuráveis no config.json)
DEF_BEBIDAS_CAT = ["bebidas", "vinhos"]            # categorias desconsideradas
DEF_BEBIDAS_KW  = ["coca", "fruki", "água", "agua", "guaran", "sprite", "fanta",
                   "suco", "heineken", "corona", "stella", "brahma", "skol",
                   "cerveja", "vinho", "red bull", "monster", "h2o"]  # fallback s/ categoria
DEF_OPCOES_PIZZA  = ["pequena combo"]              # opções cujos filhos (≠ Nenhum) são pizzas
DEF_IGNORAR_FILHO = ["nenhum"]
DEF_DOBRO = ["em dobro", "2 pizzas", "pizza em dobro"]


def load_cfg():
    if not CFG_FILE.exists():
        print("[ERRO] config.json não encontrado. Copie config.example.json.")
        sys.exit(1)
    cfg = json.loads(CFG_FILE.read_text(encoding="utf-8"))
    cfg["profile_dir"] = os.path.expandvars(cfg.get("profile_dir", ""))
    # fallback de credenciais: reusa o saipos_config.json do dre-ai (não duplica a senha)
    if not cfg.get("senha") and cfg.get("creds_from"):
        f = Path(os.path.expandvars(cfg["creds_from"]))
        if f.exists():
            c = json.loads(f.read_text(encoding="utf-8"))
            cfg["email"] = cfg.get("email") or c.get("email", "")
            cfg["senha"] = c.get("senha", "")
    # lojas = {"DAME": "10677", "LOV": "11377"} — ID da loja no Saipos, nunca o
    # índice na lista: a conta ganhou uma 3ª loja (testes) e a ordem mudou.
    lojas = {}
    for nome, v in (cfg.get("lojas") or {}).items():
        sv = str(v).strip()
        if not sv.isdigit() or len(sv) < 4:
            print(f"[ERRO] config.json: lojas.{nome} = {v!r} não é um id_store do Saipos "
                  f"(era índice na lista?). Use o ID que aparece no seletor de lojas.")
            sys.exit(1)
        lojas[nome] = sv
    cfg["lojas"] = lojas
    return cfg


# ── sales-by-period: valor e pedidos ─────────────────────────────────────────
def parse_valor_brl(t):
    if not t:
        return None
    s = re.sub(r"[R$\s]", "", str(t)).replace(".", "").replace(",", ".")
    try:
        return float(s)
    except Exception:
        return None


def extrair_valor(page):
    try:
        page.wait_for_function(
            "() => /R\\$\\s*[\\d.,]+/.test(document.body.innerText)", timeout=20000)
    except PWTimeout:
        pass
    texto = page.locator("body").inner_text(timeout=5000)
    for lbl in LBL_VALOR:
        m = re.search(rf"{lbl}[^R$]{{0,80}}(R\$\s*[\d.,]+)", texto, re.IGNORECASE)
        if m:
            return parse_valor_brl(m.group(1))
    vals = re.findall(r"R\$\s*[\d.]+,\d{2}", texto)
    return max((parse_valor_brl(v) for v in vals), default=None)


def extrair_inteiro(page, labels):
    texto = page.locator("body").inner_text(timeout=5000)
    for lbl in labels:
        m = re.search(rf"{lbl}\D{{0,40}}(\d[\d.]*)", texto, re.IGNORECASE)
        if m:
            try:
                return int(m.group(1).replace(".", ""))
            except Exception:
                continue
    return None


def extrair_canais(page):
    """Tabelas CANAL | QTDE | VALOR do sales-by-period (Delivery Direto, iFood,
    Telefone, WhatsApp...). Retorna {nome: {"pedidos": int, "valor": float}}.
    Método do DRE: Site = Delivery Direto, iFood = iFood, Saipos = resto
    (o resto é calculado no front: total - ifood - site)."""
    try:
        texto = page.locator("body").inner_text(timeout=5000)
    except Exception:
        return {}
    i = texto.find("CANAL")
    if i < 0:
        return {}
    j = texto.find("PEDIDO", i)
    trecho = texto[i:j] if j > i else texto[i:]
    canais = {}
    for m in re.finditer(r"^([^\t\n]+)\t(\d[\d.]*)\tR\$\s*([\d.,]+)", trecho, re.MULTILINE):
        nome = m.group(1).strip()
        if not nome or nome.upper() == "CANAL":
            continue
        try:
            canais[nome] = {"pedidos": int(m.group(2).replace(".", "")),
                            "valor": parse_valor_brl(m.group(3))}
        except Exception:
            continue
    return canais


# ── store-item-sold: pizzas via scope AngularJS ──────────────────────────────
JS_SCOPE = r"""() => {
  const el = document.querySelector('[ng-repeat*="choicesResult"]') ||
             document.querySelector('[ng-repeat*="itemsResult"]');
  if (!el) return null;
  const vm = angular.element(el).scope().vm;
  const norm = s => (s || '').trim().toLowerCase();
  const catById = {};
  (vm.categories || []).forEach(c => catById[c.id_store_category_item] = c.desc_store_category_item);
  const catByName = {};
  (vm.storeItems || []).forEach(it => catByName[norm(it.desc_store_item)] = catById[it.id_store_category_item] || '');
  const produtos = (vm.itemsResult || []).map(it => ({
    nome: it.desc_item, qtd: it.total_qtt, cat: catByName[norm(it.desc_item)] || '' }));
  const opcoes = (vm.choicesResult || []).map(c => ({
    nome: c.desc_store_choice, qtd: c.total_qtt,
    filhos: (c.choiceItems || []).map(ci => ({ nome: ci.desc_store_choice_item, qtd: ci.total_qtt })) }));
  return { produtos, opcoes };
}"""


def extrair_scope(page):
    return page.evaluate(JS_SCOPE)


def pizzas_from_scope(d, cfg):
    """Aplica as regras de contagem. Retorna (total, detalhe)."""
    beb_cat = [c.lower() for c in cfg.get("bebidas_cat", DEF_BEBIDAS_CAT)]
    beb_kw  = [k.lower() for k in cfg.get("bebidas_kw", DEF_BEBIDAS_KW)]
    opz     = [o.lower() for o in cfg.get("opcoes_pizza", DEF_OPCOES_PIZZA)]
    ign     = [i.lower() for i in cfg.get("ignorar_filho", DEF_IGNORAR_FILHO)]
    dob     = [x.lower() for x in cfg.get("dobro_kw", DEF_DOBRO)]
    produtos = (d or {}).get("produtos", [])
    opcoes   = (d or {}).get("opcoes", [])

    def eh_bebida(p):
        cat = (p.get("cat") or "").lower()
        if cat:
            return any(b in cat for b in beb_cat)
        return any(k in p["nome"].lower() for k in beb_kw)

    def fator(nome):
        return 2 if any(x in nome.lower() for x in dob) else 1

    det = {"produtos": 0, "combo": 0}
    for p in produtos:
        if not eh_bebida(p):
            det["produtos"] += round(p["qtd"]) * fator(p["nome"])
    for o in opcoes:
        if o["nome"].strip().lower() in opz:
            det["combo"] += sum(round(f["qtd"]) for f in o["filhos"]
                                if f["nome"].strip().lower() not in ign)
    return det["produtos"] + det["combo"], det


def extrair_pizzas(page, cfg, dia, id_store=None):
    abrir_relatorio(page, dia, SAIPOS_ITENS, "store-item-sold", id_store=id_store)
    page.wait_for_timeout(1500)
    total, _ = pizzas_from_scope(extrair_scope(page), cfg)
    return total


# ── login / loja (reaproveitado do dre-ai, validado) ─────────────────────────
def garantir_login(page, cfg):
    page.goto(SAIPOS_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)
    html = page.content().lower()
    if not ("login" in page.url.lower() or 'type="password"' in html or "esqueceu" in html):
        print("  Já estava logado ✓")
        return
    if not cfg.get("senha"):
        print("  [ERRO] Caiu no login e não há senha (config.json / creds_from).")
        sys.exit(1)
    page.evaluate(f"""(function() {{
        var e=document.querySelector('input[ng-model*="email"], input[type="text"]');
        var s=document.querySelector('input[ng-model*="password"], input[type="password"]');
        if(!e||!s) return;
        function inj(el,v){{el.value=v;el.dispatchEvent(new Event('input',{{bubbles:true}}));el.dispatchEvent(new Event('change',{{bubbles:true}}));}}
        inj(e,{json.dumps(cfg['email'])}); inj(s,{json.dumps(cfg['senha'])});
    }})();""")
    page.wait_for_timeout(600)
    marco = marco_zero()   # antes do submit: só aceita código de email posterior
    page.locator("button[type='submit']").first.click()
    page.wait_for_timeout(2500)
    try:
        page.wait_for_selector(".confirm", timeout=4000)
        page.evaluate("document.querySelector('.confirm').click()")
        page.wait_for_timeout(2000)
    except PWTimeout:
        pass
    # 2FA por email; depois do diálogo de sessão — com ele na frente o Saipos
    # nem chega a mandar o código. No-op quando não é pedido.
    tratar_2fa(page, marco)
    print(f"  Login OK ✓  ({page.url})")


def selecionar_loja(page, loja, id_store):
    """Troca de loja casando pelo ID da loja no seletor do header.

    NUNCA por posição: em 2026-08 a conta ganhou a loja de testes "DAME - HML"
    (94387), que entrou ANTES da Dáme real na lista — o índice 0 virou a loja
    de testes (vendas zeradas) e o 1 virou a Dáme. Também não dá pra casar por
    nome: "DAME" bate nas duas, e o header vem truncado ("DAME PIZ...").
    """
    id_store = str(id_store)
    page.wait_for_timeout(1000)
    if loja_atual(page) == id_store:
        print(f"  Já na loja {loja} ({id_store}) ✓")
        return

    def clicar():
        # Sobe do botão até a maior linha que ainda contém só ELE: é a linha da
        # loja (subir nível fixo pegaria o container das 3, que casa com qualquer ID).
        # A linha começa pelo ID ("10677 DAME PIZZA RS Porto Alegre ...").
        return page.evaluate(r"""(id) => {
          const btns = [...document.querySelectorAll('.btn-primary.m-b-0')]
            .filter(b => b.offsetWidth || b.offsetHeight);
          for (const b of btns) {
            let linha = b;
            while (linha.parentElement &&
                   linha.parentElement.querySelectorAll('.btn-primary.m-b-0').length === 1) {
              linha = linha.parentElement;
            }
            const txt = (linha.innerText || '').trim();
            if (txt.split(/\s+/)[0] === id) { b.click(); return true; }
          }
          return false;
        }""", id_store)

    for tentativa in range(3):
        fechar_modais(page)
        if not [b for b in page.locator(".btn-primary.m-b-0").all() if b.is_visible()]:
            # não está na tela de seleção: abre o seletor pelo header (clique por
            # JS — backdrop de modal engole o clique "de verdade" e estoura timeout)
            try:
                page.wait_for_selector("a.button-header", timeout=15000)
                page.evaluate("() => { const e = document.querySelector('a.button-header'); if (e) e.click(); }")
                page.wait_for_timeout(1500)
            except Exception:
                pass
        if clicar() and _esperar_loja(page, id_store):
            print(f"  Loja {loja} ({id_store}) ✓")
            return
        page.wait_for_timeout(1500)
    raise RuntimeError(f"Loja {loja} (id {id_store}) não encontrada no seletor do Saipos")


def loja_atual(page):
    """ID da loja selecionada agora.

    Vem do `ngStorage-currentStore` (o Saipos guarda a loja escolhida lá) e, se
    faltar, do tooltip do header ("DAME PIZZA [10677]"). O texto visível do
    header não serve: vem truncado ("DAME PI...") e não distingue a Dáme real da
    loja de testes "DAME - HML".
    """
    try:
        return page.evaluate(
            r"""() => {
              try {
                const raw = localStorage.getItem('ngStorage-currentStore');
                if (raw) {
                  const v = JSON.parse(raw);
                  if (v && v.id_store) return String(v.id_store);
                }
              } catch (e) { /* storage indisponível */ }
              const el = document.querySelector('a.button-header [uib-tooltip]');
              const m = (el && el.getAttribute('uib-tooltip') || '').match(/\[(\d+)\]/);
              return m ? m[1] : null;
            }"""
        )
    except Exception:
        return None


def _esperar_loja(page, id_store, timeout_ms=10000):
    """Espera o Saipos confirmar a troca de loja (a SPA leva um tempo)."""
    for _ in range(timeout_ms // 500):
        if loja_atual(page) == str(id_store):
            return True
        page.wait_for_timeout(500)
    return False


# ── conferência da busca: loja + período de fato consultados ─────────────────
# O relatório vem de /v1/stores/<id>/<rel>?filter={"start_date":...,"end_date":...}.
# Espiar essa chamada é o único jeito barato de saber que o número na tela é da
# loja e do dia pedidos: a tela sozinha mente quando o clique em "Buscar" é
# engolido por um overlay — ela segue mostrando o resultado da busca anterior.
_BUSCAS = []


def monitorar(page):
    """Liga a espionagem das buscas e bloqueia o Pendo (guia in-app do Saipos).

    O Pendo cobre a tela com um backdrop que intercepta o clique nos campos de
    data e no botão Buscar (foi ele que quebrou a coleta de 17–19/08). Bloqueado
    na rede, ele nunca chega a montar."""
    try:
        page.context.route(re.compile(r"pendo"), lambda rota: rota.abort())
    except Exception:
        pass
    page.on("request", _anotar_busca)


def _anotar_busca(req):
    m = re.search(r"/stores/(\d+)/", req.url)
    if not m:
        return
    dt = re.search(r'"start_date":"([\d/]+)".*?"end_date":"([\d/]+)"',
                   urllib.parse.unquote(req.url))
    if dt:
        _BUSCAS.append({"loja": m.group(1), "de": dt.group(1), "ate": dt.group(2)})


def _esperar_busca(page, desde, d, d2, id_store, timeout_ms=25000):
    """Espera a API responder pelo período pedido; confere a loja da chamada."""
    for _ in range(timeout_ms // 500):
        for b in _BUSCAS[desde:]:
            if b["de"] == d and b["ate"] == d2:
                if id_store and b["loja"] != str(id_store):
                    raise RuntimeError(
                        f"relatório veio da loja {b['loja']}, esperado {id_store}")
                page.wait_for_timeout(2500)      # deixa o Angular pintar o resultado
                return True
        page.wait_for_timeout(500)
    return False


def fechar_modais(page):
    """Fecha pop-ups do Saipos (novidades/avisos) que aparecem ao navegar e
    interceptam cliques nos campos do relatório. Best-effort, não derruba nada."""
    for _ in range(4):
        try:
            modal = page.locator("[uib-modal-window], .modal.in, .modal.show").first
            if not modal.is_visible(timeout=600):
                break
        except Exception:
            break
        clicou = False
        for sel in ("[uib-modal-window] button[ng-click*='close']",
                    "[uib-modal-window] button[ng-click*='cancel']",
                    "[uib-modal-window] button[ng-click*='dismiss']",
                    "[uib-modal-window] .close",
                    "[uib-modal-window] button:has-text('Fechar')",
                    "[uib-modal-window] button:has-text('Entendi')",
                    "[uib-modal-window] button:has-text('OK')"):
            try:
                b = page.locator(sel).first
                if b.is_visible(timeout=400):
                    b.click(timeout=2500)
                    clicou = True
                    break
            except Exception:
                continue
        if not clicou:
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
        page.wait_for_timeout(600)
    # remove backdrops órfãos que sobram e continuam bloqueando o ponteiro.
    # O Pendo (guia in-app do Saipos) é o pior: cobre a tela com
    # ._pendo-backdrop, não tem botão de fechar no DOM e faz o clique no campo
    # de data estourar timeout — foi ele que quebrou a coleta de 18/08.
    try:
        page.evaluate("""() => {
          document.querySelectorAll('.modal-backdrop').forEach(e => e.remove());
          document.body.classList.remove('modal-open');
          document.querySelectorAll('#pendo-base, ._pendo-backdrop, [class*="_pendo-step"], [id^="pendo-backdrop"]')
            .forEach(e => e.remove());
        }""")
    except Exception:
        pass


def abrir_relatorio(page, dia, url=SAIPOS_REPORT, slug="sales-by-period",
                    dia_fim=None, id_store=None):
    """Abre o relatório no período pedido e só volta quando a busca aconteceu.

    Sem essa conferência o erro é mudo e caro: se o clique falha, o Saipos segue
    exibindo o período padrão (ontem→hoje) e o número lido vai para o JSON como
    se fosse o do dia pedido — foi o que corrompeu 17 a 19/08."""
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)
    if slug not in page.url:
        page.evaluate(f"window.location.hash = '#/app/report/{slug}'")
        page.wait_for_timeout(500)
        page.reload(wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)
    d = dia.strftime("%d/%m/%Y")
    d2 = (dia_fim or dia).strftime("%d/%m/%Y")

    def campos():
        for sel in ["input[ng-model='dateString']", "input[placeholder*='data']",
                    "input[placeholder*='Data']"]:
            try:
                page.wait_for_selector(sel, timeout=5000)
                achados = page.locator(sel).all()
                if len(achados) >= 2:
                    return achados[:2]
            except PWTimeout:
                continue
        return []

    def buscar():
        for sel in ["button[ng-click*='search']", "button[ng-click*='Search']",
                    "button[ng-click*='filter']"]:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=1000):
                    el.click(timeout=8000)
                    return True
            except Exception:
                continue
        return False

    erro = None
    for _ in range(3):
        fechar_modais(page)
        inputs = campos()
        if len(inputs) < 2:
            erro = "campos de data não apareceram"
            page.wait_for_timeout(2000)
            continue
        marco = len(_BUSCAS)
        try:
            for inp, val in zip(inputs, [d, d2]):
                inp.click(click_count=3, timeout=8000)
                inp.type(val, delay=70)
                inp.press("Tab")
        except PWTimeout:
            erro = "campo de data não aceitou clique"
            continue
        page.wait_for_timeout(400)
        buscar()
        if _esperar_busca(page, marco, d, d2, id_store):
            return
        erro = "a busca não chegou na API (clique engolido?)"
    raise RuntimeError(f"{slug}: {erro} (período {d}–{d2})")


def coletar_loja(page, loja, id_store, dia, cfg):
    selecionar_loja(page, loja, id_store)
    abrir_relatorio(page, dia, SAIPOS_REPORT, "sales-by-period", id_store=id_store)
    valor   = extrair_valor(page)
    pedidos = extrair_inteiro(page, LBL_PEDIDOS)
    pizzas  = extrair_pizzas(page, cfg, dia, id_store)
    if valor is None:
        raise RuntimeError(f"{loja}: sales-by-period não rendeu valor em {dia.isoformat()}")
    return {"valor": valor, "pizzas": pizzas, "pedidos": pedidos}


def coletar_loja_periodo(page, loja, id_store, d1, d2, cfg):
    """Mesma coleta, mas para um intervalo (ex.: mês até hoje)."""
    selecionar_loja(page, loja, id_store)
    abrir_relatorio(page, d1, SAIPOS_REPORT, "sales-by-period", dia_fim=d2, id_store=id_store)
    valor   = extrair_valor(page)
    pedidos = extrair_inteiro(page, LBL_PEDIDOS)
    canais  = extrair_canais(page)
    abrir_relatorio(page, d1, SAIPOS_ITENS, "store-item-sold", dia_fim=d2, id_store=id_store)
    page.wait_for_timeout(1500)
    pizzas, _ = pizzas_from_scope(extrair_scope(page), cfg)
    return {"valor": valor, "pizzas": pizzas, "pedidos": pedidos, "canais": canais}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dia", help="YYYY-MM-DD (padrão: ontem)")
    ap.add_argument("--descobrir", action="store_true",
                    help="dump do sales-by-period (screenshot+texto)")
    ap.add_argument("--descobrir-itens", dest="descobrir_itens", action="store_true",
                    help="dump do scope do store-item-sold -> data/_scope_<loja>.json")
    ap.add_argument("--testar-pizzas", dest="testar_pizzas", action="store_true",
                    help="calcula pizzas do _scope salvo (sem abrir browser)")
    ap.add_argument("--loja", default="DAME", help="loja para os modos --descobrir*/--testar")
    ap.add_argument("--so-mes", dest="so_mes", action="store_true", help="coleta só o mês até hoje")
    ap.add_argument("--sem-mes", dest="sem_mes", action="store_true", help="pula o resumo do mês")
    ap.add_argument("--headless", action="store_true")
    args = ap.parse_args()

    cfg = load_cfg()
    dia = (date.fromisoformat(args.dia) if args.dia else date.today() - timedelta(days=1))
    DATA_DIR.mkdir(exist_ok=True)

    if args.testar_pizzas:
        d = json.loads((DATA_DIR / f"_scope_{args.loja.upper()}.json").read_text(encoding="utf-8"))
        total, det = pizzas_from_scope(d, cfg)
        print("PRODUTOS (qtd | categoria | nome):")
        for p in d.get("produtos", []):
            print(f"  {round(p['qtd']):>5}  [{p.get('cat','')}]  {p['nome']}")
        print("\nOPÇÕES (qtd | nome):")
        for o in d.get("opcoes", []):
            print(f"  {round(o['qtd']):>5}  {o['nome']}")
        print(f"\n  pizzas de produtos = {det['produtos']}")
        print(f"  pizzas de combo    = {det['combo']}  (Pequena Combo sem 'Nenhum')")
        print(f"  PIZZAS = {total}")
        return

    print(f"\n=== Vendas Saipos — {dia.isoformat()} ===\n")
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=cfg["profile_dir"],
            headless=args.headless,
            slow_mo=250,
            args=["--start-maximized"],
        )
        page = ctx.new_page()
        monitorar(page)
        garantir_login(page, cfg)

        if args.descobrir:
            selecionar_loja(page, args.loja.upper(), cfg["lojas"][args.loja.upper()])
            abrir_relatorio(page, dia)
            png = DATA_DIR / f"_descoberta_{args.loja.upper()}.png"
            txt = DATA_DIR / f"_descoberta_{args.loja.upper()}.txt"
            page.screenshot(path=str(png), full_page=True)
            txt.write_text(page.locator("body").inner_text(timeout=5000), encoding="utf-8")
            print(f"  Salvos {png.name} e {txt.name}")
            ctx.close()
            return

        if args.descobrir_itens:
            loja = args.loja.upper()
            selecionar_loja(page, loja, cfg["lojas"][loja])
            abrir_relatorio(page, dia, SAIPOS_ITENS, "store-item-sold")
            page.wait_for_timeout(2000)
            d = extrair_scope(page)
            out = DATA_DIR / f"_scope_{loja}.json"
            out.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
            np_, no_ = (len(d.get("produtos", [])), len(d.get("opcoes", []))) if d else (0, 0)
            print(f"  Salvo {out.name} ({np_} produtos, {no_} opções)")
            ctx.close()
            return

        # ── diário (grava JÁ, pra não perder se o mês falhar) ──
        if not args.so_mes:
            lojas = {}
            for loja, id_store in cfg["lojas"].items():
                print(f"── {loja} ──")
                lojas[loja] = coletar_loja(page, loja, id_store, dia, cfg)
                print(f"   {lojas[loja]}")
            saida = {"data": dia.isoformat(), "dow": DOW_PT[dia.weekday()],
                     "lojas": lojas,
                     "gerado_em": datetime.now().isoformat(timespec="seconds")}
            (DATA_DIR / "vendas.json").write_text(
                json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"\n✓ vendas.json ({dia.isoformat()})")

        # ── mês até hoje (best-effort; não derruba o diário) ──
        if not args.sem_mes:
            try:
                d1 = date.today().replace(day=1)
                d2 = date.today()
                mes = {}
                for loja, id_store in cfg["lojas"].items():
                    print(f"── {loja} (mês {d1.day:02d}–{d2.day:02d}/{d2.month:02d}) ──")
                    mes[loja] = coletar_loja_periodo(page, loja, id_store, d1, d2, cfg)
                    print(f"   {mes[loja]}")
                if all(v.get("valor") is None for v in mes.values()):
                    # Saipos rendeu em branco (acontece fora da madrugada):
                    # não sobrescreve o vendas_mes.json bom da última coleta.
                    print("\n  [mês] coleta vazia — vendas_mes.json mantido")
                else:
                    (DATA_DIR / "vendas_mes.json").write_text(json.dumps(
                        {"mes": d1.strftime("%Y-%m"), "de": d1.isoformat(), "ate": d2.isoformat(),
                         "lojas": mes, "gerado_em": datetime.now().isoformat(timespec="seconds")},
                        ensure_ascii=False, indent=2), encoding="utf-8")
                    print("\n✓ vendas_mes.json")
            except Exception as e:
                print(f"  [mês] falhou: {type(e).__name__} {e}")

        ctx.close()


if __name__ == "__main__":
    main()
