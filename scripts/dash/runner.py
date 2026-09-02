#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Runner do dashboard. Roda os coletores, consolida tudo em dashboard-data.json
(no formato que o front consome) e publica via FTPS no HostGator.

A coleta roda na máquina de casa (Task Scheduler, tarefa "DashboardColeta3h", 03h)
por run_dash.cmd. Vive em scripts/dash/ da intranet desde 2026-09-02 (antes em
machado-labs/_ferramentas/dashboard). O JSON tem faturamento, então NUNCA vai pro
git — sobe direto por FTPS: /dashboard (front antigo, basic auth) e
/pizzas/data/dashboard-data-<token>.json (o que a intranet lê, via useDashFeed).

Uso:
  python runner.py                 # coleta tudo, consolida e envia
  python runner.py --so-consolida  # não roda coletores, só junta os .json e envia
  python runner.py --sem-envio     # roda e consolida, mas não envia (debug)
  python runner.py --headless      # vendas (Saipos) em modo headless
"""

import sys
import json
import ssl
import argparse
import subprocess
import urllib.parse
import urllib.request
from ftplib import FTP_TLS
from pathlib import Path
from datetime import datetime, date, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent      # scripts/dash
COL  = Path(__file__).parent                         # coletores
DATA = ROOT / "data"
CFG  = COL / "config.json"

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]
MES3  = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
SEM   = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def log(m):
    print(m, flush=True)


def run(script, *extra, timeout=900):
    # -u: sem buffer, senão a saída do coletor se perde quando o timeout mata o processo
    cmd = [sys.executable, "-u", str(COL / script), *extra]
    log(f"\n▶ {script} {' '.join(extra)}".rstrip())
    try:
        r = subprocess.run(cmd, cwd=str(COL), timeout=timeout)
        ok = r.returncode == 0
        log(f"  {'✓' if ok else '✗ rc=' + str(r.returncode)} {script}")
        return ok
    except Exception as e:
        log(f"  ✗ {script}: {type(e).__name__} {e}")
        return False


# ── vendas (Saipos): retry + limpeza de browser órfão + backfill ─────────────
def matar_chromium_orfao():
    """Mata Chromium/driver do Playwright que sobrou de um run anterior morto
    por timeout — ele fica vivo segurando o lock do browser profile e faz a
    tentativa seguinte travar de novo. Só mata processos do ms-playwright;
    o Chrome do usuário não é tocado."""
    ps = ("Get-Process chrome,headless_shell,node -ErrorAction SilentlyContinue | "
          "Where-Object { $_.Path -like '*ms-playwright*' -or "
          "$_.Path -like '*playwright*driver*' } | Stop-Process -Force")
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                       capture_output=True, timeout=60)
    except Exception:
        pass


def coletar_vendas(headless, *extra, tentativas=3):
    """saipos_vendas.py com retry. O browser às vezes não sobe às 3h (lock do
    profile / carga da madrugada); antes era 1 tentativa e o dia se perdia.
    Última tentativa cai pro modo visível (historicamente sobe quando o
    headless trava; às 3h não atrapalha ninguém)."""
    for t in range(1, tentativas + 1):
        if t > 1:
            log(f"  ↻ vendas: tentativa {t}/{tentativas}"
                + (" (modo visível)" if t == tentativas else ""))
        matar_chromium_orfao()
        flags = [] if (t == tentativas) else (["--headless"] if headless else [])
        if run("saipos_vendas.py", *flags, *extra, timeout=300):
            return True
    return False


def dias_sem_venda():
    """Dias dos últimos 7 (ontem pra trás) que faltam no histórico de vendas."""
    tem = {h.get("data") for h in (jload("vendas_hist.json", []) or [])}
    tem.add((jload("vendas.json") or {}).get("data"))
    return sorted(d for d in ((date.today() - timedelta(days=i)).isoformat()
                              for i in range(1, 8)) if d not in tem)


def coletar_vendas_completo(headless):
    """Coleta ontem+mês com retry e, se o browser está funcionando, faz
    backfill dos dias que ficaram faltando em coletas anteriores (assim uma
    noite que falhe é recuperada sozinha na noite seguinte)."""
    ok = coletar_vendas(headless)
    if ok:
        atualizar_vendas()                      # solidifica ontem no histórico já
        for d in dias_sem_venda():
            log(f"\n▶ backfill vendas {d}")
            if coletar_vendas(headless, "--dia", d, "--sem-mes", tentativas=2):
                atualizar_vendas()
    else:
        log("  ✗ vendas: todas as tentativas falharam; backfill fica pro próximo run")
    return ok


def dias_faltando_mes():
    """Dias do mês corrente (do dia 1 até ontem) ainda ausentes em vendas_dias.json."""
    mes = date.today().strftime("%Y-%m")
    acc = jload("vendas_dias.json", {}) or {}
    tem = set(acc.get("dias", {})) if acc.get("mes") == mes else set()
    hoje = date.today()
    return [date(hoje.year, hoje.month, d).isoformat()
            for d in range(1, hoje.day)
            if date(hoje.year, hoje.month, d).isoformat() not in tem]


def backfill_mes(headless):
    """Coleta cada dia faltante do mês corrente (uso pontual pra popular a tabela
    diária do mês na primeira vez). Cada dia é uma coleta Saipos (~30s)."""
    faltam = dias_faltando_mes()
    if not faltam:
        log("  mês já completo em vendas_dias.json")
        return
    log(f"\n▶ backfill do mês: {len(faltam)} dia(s) — {faltam[0]}..{faltam[-1]}")
    for d in faltam:
        log(f"\n▶ backfill mês {d}")
        if coletar_vendas(headless, "--dia", d, "--sem-mes", tentativas=2):
            atualizar_vendas()
            atualizar_dias_mes()


def jload(name, default=None):
    f = DATA / name
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return default


# ── tradução pt-BR (cache em disco; best-effort, mantém original se falhar) ────
TRAD_CACHE_F = DATA / "_trad_cache.json"
_trad = None


def _trad_load():
    global _trad
    if _trad is None:
        _trad = jload("_trad_cache.json", {}) or {}
    return _trad


def _trad_save():
    if _trad is not None:
        try:
            TRAD_CACHE_F.write_text(json.dumps(_trad, ensure_ascii=False),
                                    encoding="utf-8")
        except Exception:
            pass


def traduzir(txt):
    """en→pt-BR via endpoint público do Google Translate (sem key)."""
    txt = (txt or "").strip()
    if not txt:
        return txt
    cache = _trad_load()
    if txt in cache:
        return cache[txt]
    try:
        q = urllib.parse.quote(txt)
        url = ("https://translate.googleapis.com/translate_a/single"
               f"?client=gtx&sl=auto&tl=pt-BR&dt=t&q={q}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = json.loads(urllib.request.urlopen(req, timeout=15).read())
        out = "".join(seg[0] for seg in data[0] if seg and seg[0]).strip()
        if out:
            cache[txt] = out
            return out
    except Exception as e:
        log(f"  [trad] {type(e).__name__} em: {txt[:40]}")
    return txt


def encurtar(t, n=200):
    """Corta no limite de palavra, ~n caracteres."""
    t = (t or "").strip()
    if len(t) <= n:
        return t
    corte = t[:n].rsplit(" ", 1)[0].rstrip(",.;:- ")
    return corte + "…"


# ── consolidação ─────────────────────────────────────────────────────────────
def topbar(extras):
    hoje = date.today()
    dia = f"{SEM[hoje.weekday()].capitalize()}, {hoje.day} de {MESES[hoje.month - 1]}"
    cot = (extras or {}).get("cotacoes", {})
    return {
        "dia": dia,
        "clima": (extras or {}).get("clima"),
        "usd": cot.get("usd"),
        "btc": cot.get("btc"),
    }


def fmt_dow(data_iso, dow):
    try:
        d = date.fromisoformat(data_iso)
        return f"{dow}, {d.day} {MES3[d.month - 1]}"
    except Exception:
        return dow


def atualizar_vendas():
    """Mantém histórico de 7 dias em vendas_hist.json e devolve no formato do front."""
    hist = jload("vendas_hist.json", []) or []
    hoje = jload("vendas.json")
    if hoje and hoje.get("lojas"):
        hist = [h for h in hist if h.get("data") != hoje.get("data")]
        hist.append({"data": hoje["data"], "dow": hoje.get("dow", ""), "lojas": hoje["lojas"]})
    hist.sort(key=lambda h: h.get("data", ""), reverse=True)
    hist = hist[:7]
    (DATA / "vendas_hist.json").write_text(
        json.dumps(hist, ensure_ascii=False, indent=2), encoding="utf-8")

    def arr(lj):
        return [round(lj.get("valor") or 0), lj.get("pizzas") or 0, lj.get("pedidos") or 0]

    sales = []
    for h in hist:
        lojas = h.get("lojas", {})
        sales.append({
            "dow":  fmt_dow(h.get("data", ""), h.get("dow", "")),
            "dame": arr(lojas.get("DAME", {})),
            "lov":  arr(lojas.get("LOV", {})),
        })
    return sales


def map_mes(m):
    """Resumo do mês até hoje (vendas_mes.json) no formato do front."""
    if not m or not m.get("lojas"):
        return None
    lj = m["lojas"]

    def arr(x):
        return [round(x.get("valor") or 0), x.get("pizzas") or 0, x.get("pedidos") or 0]

    def canal_arr(x):
        """Agrupa a tabela CANAL do Saipos em ifood/site ([valor, pedidos]).
        Site = Delivery Direto (método do DRE); o front calcula
        saipos = total - ifood - site."""
        out = {"ifood": [0, 0], "site": [0, 0]}
        for nome, d in (x.get("canais") or {}).items():
            low = nome.lower()
            key = "ifood" if "ifood" in low else ("site" if "delivery direto" in low else None)
            if key:
                out[key][0] += round(d.get("valor") or 0)
                out[key][1] += d.get("pedidos") or 0
        return out

    saida = {"mes": m.get("mes", ""), "de": m.get("de", ""), "ate": m.get("ate", ""),
             "dame": arr(lj.get("DAME", {})), "lov": arr(lj.get("LOV", {}))}
    if any((x or {}).get("canais") for x in lj.values()):
        saida["canais"] = {"dame": canal_arr(lj.get("DAME", {})),
                           "lov": canal_arr(lj.get("LOV", {}))}
    return saida


DOW3 = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def atualizar_dias_mes():
    """Acumula vendas por dia do MÊS corrente em vendas_dias.json e devolve a
    série no formato do front (sales_days). O vendas_hist.json só guarda 7 dias,
    então este acumulador é o que permite a tabela com o mês inteiro. Reseta ao
    virar o mês; alimenta-se de vendas.json (ontem) e vendas_hist.json (7 dias),
    e o backfill do mês (--backfill-mes) preenche os dias antigos que faltarem."""
    mes = date.today().strftime("%Y-%m")
    acc = jload("vendas_dias.json", {}) or {}
    if acc.get("mes") != mes:
        acc = {"mes": mes, "dias": {}}
    dias = acc.get("dias", {})

    fontes = []
    hoje = jload("vendas.json")
    if hoje:
        fontes.append(hoje)
    fontes += (jload("vendas_hist.json", []) or [])
    for r in fontes:
        dt = r.get("data", "")
        if dt.startswith(mes) and r.get("lojas"):
            dias[dt] = {"dow": r.get("dow", ""), "lojas": r["lojas"]}

    acc["dias"] = dias
    acc["gerado_em"] = datetime.now().isoformat(timespec="seconds")
    (DATA / "vendas_dias.json").write_text(
        json.dumps(acc, ensure_ascii=False, indent=2), encoding="utf-8")

    def arr(lj):
        return [round(lj.get("valor") or 0), lj.get("pizzas") or 0, lj.get("pedidos") or 0]

    out = []
    for dt in sorted(dias):
        try:
            d = date.fromisoformat(dt)
        except Exception:
            continue
        lojas = dias[dt].get("lojas", {})
        out.append({
            "data": dt, "dia": d.day, "dow": DOW3[d.weekday()],
            "dame": arr(lojas.get("DAME", {})),
            "lov":  arr(lojas.get("LOV", {})),
        })
    return out


def cls_ia(cat):
    c = (cat or "").lower()
    if "claude" in c:  return "claude"
    if "gpt" in c:     return "gpt"
    if "gemini" in c:  return "gemini"
    if "open" in c:    return "open"
    return "gen"


def map_news(itens, cls):
    out = []
    for x in itens or []:
        cat = x.get("cat", "")
        out.append({
            "resumo": encurtar(traduzir(x.get("resumo_raw", "")[:900]), 600),
            "t":    traduzir(x.get("titulo", "")),
            "url":  x.get("url", "#"),
            "img":  x.get("img", ""),
            "src":  x.get("fonte", ""),
            "data": x.get("data", ""),
            "cat":  cat,
            "c":    cls(cat),
        })
    return out


def map_agenda(ag):
    return [{"data": e.get("data", ""), "h": e.get("h", ""), "d": e.get("d", "")}
            for e in (ag or {}).get("eventos", [])]


def map_proj(pj):
    return [{"n": p.get("nome", ""), "quando": p.get("quando", "")}
            for p in (pj or {}).get("projetos", [])]


def map_gh(news):
    gh = (news or {}).get("github", {})

    def lista(per):
        return [{"r": g.get("repo", ""), "d": encurtar(traduzir(g.get("desc", "")), 135),
                 "lang": g.get("lang", ""), "s": g.get("stars", "")}
                for g in gh.get(per, [])]

    return {"day": lista("day"), "week": lista("week"), "month": lista("month")}


def map_newsletters(nl):
    """Newsletters de IA lidas do Gmail (uma linha por edição)."""
    out = []
    for x in (nl or {}).get("itens", []):
        out.append({
            "i":      "ti-mail",
            "n":      x.get("fonte", ""),
            "s":      "newsletter",
            "h":      traduzir(x.get("titulo", "")),
            "resumo": encurtar(traduzir(x.get("resumo_raw", "")[:900]), 600),
            "url":    x.get("url", "#"),
            "data":   x.get("data", ""),
            "b":      "",
        })
    return out


def map_feeds(fd):
    """Fila priorizada do harvester (painel Fontes & feeds de IA)."""
    campos = ("url", "n", "s", "i", "cat", "data", "b", "img")
    out = []
    for x in (fd or {}).get("itens", []):
        item = {k: x.get(k, "") for k in campos}
        item["h"] = traduzir(x.get("h", ""))
        item["resumo"] = encurtar(traduzir(x.get("resumo_raw", "")[:900]), 600)
        out.append(item)
    return out


def map_yt(yt):
    """Vídeos do YouTube (youtube.py). Título mantido no original (voz do criador)."""
    out = []
    for x in (yt or {}).get("itens", []):
        out.append({"canal": x.get("canal", ""), "cat": x.get("cat", ""),
                    "t": x.get("titulo", ""), "url": x.get("url", "#"),
                    "img": x.get("thumb", ""), "data": x.get("data", ""),
                    "vid": x.get("vid", "")})
    return out


def map_ph(news):
    """Product Hunt (lançamentos). Nome do produto mantido; resumo traduzido."""
    out = []
    for x in (news or {}).get("producthunt", []):
        out.append({"t": x.get("titulo", ""), "url": x.get("url", "#"),
                    "img": x.get("img", ""), "src": "Product Hunt",
                    "cat": x.get("cat", "Launch"), "data": x.get("data", ""),
                    "resumo": encurtar(traduzir(x.get("resumo_raw", "")[:600]), 360)})
    return out


def consolidar():
    extras = jload("extras.json", {})
    news   = jload("news.json", {})
    data = {
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "topbar":   topbar(extras),
        "sales":    atualizar_vendas(),
        "sales_month": map_mes(jload("vendas_mes.json", {})),
        "sales_days":  atualizar_dias_mes(),
        "agenda":   map_agenda(jload("agenda.json", {})),
        "projects": map_proj(jload("projetos.json", {})),
        "ai":       map_news(news.get("ia"), cls_ia),
        "global":   map_news(news.get("global"), lambda c: "pos"),
        "biz":      map_news(news.get("biz"), lambda c: "biz"),
        "github":   map_gh(news),
        "feeds":    map_feeds(jload("feeds.json", {})),
        "newsletters": map_newsletters(jload("newsletters.json", {})),
        # /v3 (público): YouTube, Product Hunt e Instagram (lista de posts p/ embed)
        "youtube":     map_yt(jload("youtube.json", {})),
        "producthunt": map_ph(news),
        "instagram":   (jload("instagram.json", {}) or {}).get("itens", []),
    }
    _trad_save()
    out = DATA / "dashboard-data.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"\n✓ {out.name}  ({out.stat().st_size} bytes) — "
        f"{len(data['ai'])} IA · {len(data['youtube'])} yt · "
        f"{len(data['producthunt'])} PH · {len(data['biz'])} mercado · "
        f"{len(data['sales'])} dias de venda")
    return out


# ── envio FTPS ───────────────────────────────────────────────────────────────
def enviar(arquivo, cfg, dst=None, remote_name=None):
    srv = cfg.get("ftp_server")
    usr = cfg.get("ftp_user")
    pwd = cfg.get("ftp_pass")
    dst = dst or cfg.get("ftp_dir", "/dashboard")
    remote_name = remote_name or arquivo.name
    if not (srv and usr and pwd):
        log("\n[AVISO] credenciais FTP ausentes no config.json "
            "(ftp_server / ftp_user / ftp_pass). JSON gravado local, não enviado.")
        return False
    ctx = ssl._create_unverified_context()        # security: loose (igual ao deploy)
    log(f"\n▶ FTPS {usr}@{srv}  ->  {dst}/{remote_name}")
    try:
        ftps = FTP_TLS(context=ctx)
        ftps.connect(srv, int(cfg.get("ftp_port", 21)), timeout=40)
        ftps.login(usr, pwd)
        ftps.prot_p()
        try:
            ftps.cwd(dst)
        except Exception:
            # cria a árvore de diretórios parte a parte (dst pode ser aninhado,
            # ex.: .../pizzas/data, com 'data' ainda inexistente)
            base = "/" if dst.startswith("/") else ""
            ftps.cwd(base or ".")
            for part in dst.strip("/").split("/"):
                try:
                    ftps.cwd(part)
                except Exception:
                    ftps.mkd(part)
                    ftps.cwd(part)
        with open(arquivo, "rb") as f:
            ftps.storbinary(f"STOR {remote_name}", f)
        ftps.quit()
        log("  ✓ enviado")
        return True
    except Exception as e:
        log(f"  ✗ falha no envio: {type(e).__name__} {e}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--so-consolida", dest="so_consolida", action="store_true")
    ap.add_argument("--so-vendas", dest="so_vendas", action="store_true",
                    help="só coleta vendas (com retry/backfill), consolida e envia")
    ap.add_argument("--backfill-mes", dest="backfill_mes", action="store_true",
                    help="coleta os dias faltantes do mês corrente (popula a tabela diária)")
    ap.add_argument("--sem-envio", dest="sem_envio", action="store_true")
    ap.add_argument("--headless", action="store_true")
    a = ap.parse_args()

    DATA.mkdir(exist_ok=True)
    cfg = json.loads(CFG.read_text(encoding="utf-8")) if CFG.exists() else {}

    log(f"=== runner do dashboard — {datetime.now():%Y-%m-%d %H:%M} ===")
    if not (a.so_consolida or a.so_vendas):
        run("extras.py")
        run("projetos.py")
        run("agenda.py")
        run("news.py")
        run("youtube.py")
        run("instagram.py")
        run("harvester.py")
        run("newsletters.py")
    if not a.so_consolida:
        # Saipos é o único que abre browser e pode travar; timeout curto por
        # tentativa (5 min) + retry/backfill em coletar_vendas_completo.
        coletar_vendas_completo(a.headless)
        if a.backfill_mes:
            backfill_mes(a.headless)

    arq = consolidar()
    if not a.sem_envio:
        ftp_dir = cfg.get("ftp_dir", "/dashboard")
        enviar(arq, cfg, ftp_dir)                            # /dashboard (com basic auth)
        # publica também no /pizzas (mesmo domínio, servido junto do app React;
        # o Dash lê same-origin). Nome carrega token secreto porque /pizzas não
        # tem auth nos estáticos — URL não-adivinhável (dash_token no config.json,
        # espelhado em VITE_DASH_TOKEN no .env do app).
        dst_pizzas = cfg.get("ftp_dir_pizzas") or (
            ftp_dir.rsplit("/", 1)[0] + "/pizzas/data")
        token = cfg.get("dash_token")
        remote = f"dashboard-data-{token}.json" if token else arq.name
        enviar(arq, cfg, dst_pizzas, remote_name=remote)
    log("\n== fim ==")


if __name__ == "__main__":
    main()
