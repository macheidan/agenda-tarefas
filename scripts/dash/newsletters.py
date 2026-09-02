#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Coletor das newsletters de IA que chegam numa caixa dedicada (via IMAP). Lê SÓ
os remetentes de uma allowlist (nunca varre tudo), uma linha por edição, e grava
data/newsletters.json.

Usa imaplib (biblioteca padrão) — sem dependência nova, sem OAuth. Pensado pra
uma caixa só de newsletters (ex: AOL), separada do email pessoal.

Config (config.json):
  "newsletters_imap_host": "imap.aol.com",
  "newsletters_imap_user": "macheidan@aol.com",
  "newsletters_imap_pass": "<senha-de-app>",   # NÃO a senha normal da conta
  "newsletters_imap_port": 993,
  "newsletters_remetentes": ["evolvingai", "therundown", "theneurondaily",
                             "tldr", "deeplearning"]

AOL/Yahoo: a senha tem que ser uma "app password" gerada em
login.aol.com -> Segurança da conta -> Gerar senha de app (o login normal de
apps de terceiros é bloqueado). Fica só no config local (gitignored).

Uso:  python newsletters.py
"""

import sys
import re
import json
import imaplib
import email
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime
from pathlib import Path
from datetime import datetime, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT     = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CFG_FILE = Path(__file__).parent / "config.json"

DIAS = 10     # janela de busca
TETO = 24     # máximo de itens na coluna

REMETENTES_DEFAULT = [
    "evolvingai",                                            # já assinada
    "therundown", "theneurondaily", "tldr", "deeplearning",  # recomendadas
]

# rótulos amigáveis por trecho de remetente (fallback: nome de exibição do From)
NOMES = {
    "evolvingai":     "Evolving AI Insights",
    "therundown":     "The Rundown AI",
    "theneurondaily": "The Neuron",
    "tldr":           "TLDR AI",
    "deeplearning":   "The Batch",
}

# âncora "ver no navegador" da newsletter: pega o href de qualquer <a> cujo
# texto (sem tags aninhadas) bata num desses rótulos.
ANCORA_RE = re.compile(r'<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>', re.I | re.S)
LINK_WEB_TXT = re.compile(
    r"view\s+(?:online|in\s+browser|this\s+email)|read\s+online|"
    r"web\s+version|ver\s+(?:no\s+navegador|online)|browser", re.I)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE  = re.compile(r"\s+")
# descarta e-mails de serviço (confirmação/boas-vindas), não são edições
SUBJ_IGNORAR = re.compile(
    r"confirm|subscri|unsubscrib|welcome|bem-?vind|you'?re all set|"
    r"verify|verifi|opt[- ]?in|sign(?:ed)?[- ]?up", re.I)
MESES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def cfg_load():
    return json.loads(CFG_FILE.read_text(encoding="utf-8")) if CFG_FILE.exists() else {}


def dec(v):
    try:
        return str(make_header(decode_header(v or "")))
    except Exception:
        return v or ""


def fonte_de(remetente):
    low = (remetente or "").lower()
    for trecho, nome in NOMES.items():
        if trecho in low:
            return nome
    m = re.match(r'\s*"?([^"<]+?)"?\s*<', remetente or "")
    return (m.group(1).strip() if m else remetente or "").strip()


def partes(msg):
    """Devolve (texto_plain, html) da mensagem."""
    plain = html = ""
    parts = msg.walk() if msg.is_multipart() else [msg]
    for p in parts:
        ct = p.get_content_type()
        if ct not in ("text/plain", "text/html"):
            continue
        try:
            raw = p.get_payload(decode=True) or b""
            txt = raw.decode(p.get_content_charset() or "utf-8", "replace")
        except Exception:
            continue
        if ct == "text/plain" and not plain:
            plain = txt
        elif ct == "text/html" and not html:
            html = txt
    return plain, html


def snippet_de(plain, html):
    base = plain or TAG_RE.sub(" ", html)
    return WS_RE.sub(" ", base).strip()[:300]


def link_web(html):
    """href da âncora 'ver no navegador', tolerante a tags aninhadas no texto."""
    for m in ANCORA_RE.finditer(html or ""):
        txt = WS_RE.sub(" ", TAG_RE.sub(" ", m.group(2))).strip()
        if LINK_WEB_TXT.search(txt):
            return m.group(1)
    return ""


def data_iso(msg):
    try:
        return parsedate_to_datetime(msg.get("Date")).astimezone().isoformat(timespec="seconds")
    except Exception:
        return ""


def main():
    DATA_DIR.mkdir(exist_ok=True)
    cfg = cfg_load()
    host = cfg.get("newsletters_imap_host", "imap.aol.com")
    user = cfg.get("newsletters_imap_user", "")
    pwd  = cfg.get("newsletters_imap_pass", "")
    port = int(cfg.get("newsletters_imap_port", 993))
    remetentes = cfg.get("newsletters_remetentes") or REMETENTES_DEFAULT

    if not (user and pwd):
        print("[ERRO] newsletters_imap_user / newsletters_imap_pass ausentes no config.json.")
        sys.exit(1)

    desde = datetime.now() - timedelta(days=DIAS)
    since = f"{desde.day:02d}-{MESES_EN[desde.month - 1]}-{desde.year}"

    remet_low = [r.lower() for r in remetentes]

    M = imaplib.IMAP4_SSL(host, port)
    M.login(user, pwd)
    M.select("INBOX", readonly=True)   # readonly: não marca como lido

    # A busca FROM da AOL não faz substring confiável (ex.: "therundown" não acha
    # news@daily.therundown.ai). Então busca SÓ por data, lê o cabeçalho de cada
    # e filtra a allowlist por substring no Python.
    typ, data = M.search(None, "SINCE", since)
    uids = data[0].split() if typ == "OK" else []

    candidatos = []   # (uid, From) que batem na allowlist
    for uid in uids:
        try:
            typ, d = M.fetch(uid, "(BODY.PEEK[HEADER.FIELDS (FROM)])")
            if typ != "OK" or not d or not d[0]:
                continue
            frm = dec(email.message_from_bytes(d[0][1]).get("From"))
        except Exception:
            continue
        if any(r in frm.lower() for r in remet_low):
            candidatos.append(uid)

    itens, vistos = [], set()
    for uid in candidatos:
        try:
            typ, data = M.fetch(uid, "(BODY.PEEK[])")
            if typ != "OK" or not data or not data[0]:
                continue
            msg = email.message_from_bytes(data[0][1])
        except Exception:
            continue
        assunto = dec(msg.get("Subject")).strip()
        remetente = dec(msg.get("From"))
        if not assunto or SUBJ_IGNORAR.search(assunto):
            continue
        fonte = fonte_de(remetente)
        chave = (fonte, assunto.lower())
        if chave in vistos:
            continue
        vistos.add(chave)
        plain, html = partes(msg)
        itens.append({
            "titulo":     assunto,
            "resumo_raw": snippet_de(plain, html),
            "fonte":      fonte,
            "url":        link_web(html) or "#",
            "data":       data_iso(msg),
        })

    try:
        M.close(); M.logout()
    except Exception:
        pass

    itens.sort(key=lambda x: x.get("data", ""), reverse=True)
    itens = itens[:TETO]

    out = {"itens": itens, "gerado_em": datetime.now().isoformat(timespec="seconds")}
    (DATA_DIR / "newsletters.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(itens)} edições de {len(remetentes)} remetentes na allowlist:")
    for it in itens:
        print(f"  {it['fonte']:>22}  {it['titulo'][:60]}")


if __name__ == "__main__":
    main()
