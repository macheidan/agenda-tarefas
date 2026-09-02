#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Coletor de YouTube do /v3. Usa o RSS público de cada canal (SEM API key):
  https://www.youtube.com/feeds/videos.xml?channel_id=UC...
Pega os últimos vídeos (título, link, thumbnail estável i.ytimg.com, data).

Grava data/youtube.json: [{canal, cat, titulo, url, vid, thumb, data}]

Config: edite CANAIS abaixo. Aceita channel_id (UC...) direto OU "@handle"
(resolvido na hora pela página do canal). channel_id é mais rápido/robusto.

Uso:  python youtube.py
"""

import re
import sys
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DATA_DIR = Path(__file__).resolve().parent / "data"
UA = {"User-Agent": "Mozilla/5.0 (machado-dashboard)"}
YT = "{http://www.youtube.com/xml/schemas/2015}"
MEDIA = "{http://search.yahoo.com/mrss/}"
ATOM = "{http://www.w3.org/2005/Atom}"

# 🎛️ CANAIS — troque pelos seus. (nome exibido, channel_id ou @handle, categoria)
CANAIS = [
    ("Fala João Branco",  "UCwPLKgrUOvoBttsFCiNGRew", "Marketing"),
    ("Inteligência Ltda", "UCWZoPPW7u2I4gZfhJBZ6NqQ", "Podcast"),
    ("ROI Hunters",       "UCI88YBkUa1nA8u2U1TfG-PQ", "Marketing"),
    ("Flow Podcast",      "UC4ncvgh5hFr5O83MH7-jRJg", "Podcast"),
    ("Dwarkesh Patel",    "UCXl4i9dYBrFOabk0xGmbkRA", "IA"),
    ("Lex Fridman",       "UCSHZKyawb77ixDdsGog4iWA", "Podcast"),
    ("Joe Rogan",         "UCzQUP1qoWDoEbmsQxvdjxgQ", "Podcast"),
    ("Deborah Folloni",   "UCta1sF9e9YzzNG4OlQgIlXw", "Podcast"),
]

POR_CANAL = 5      # quantos vídeos por canal (RSS traz ~15)
TOTAL = 40         # teto final (frontend pagina de 10 em 10)



def get(url, timeout=20):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


# ── shorts ───────────────────────────────────────────────────────────────────
# O RSS não marca shorts. Teste: youtube.com/shorts/<vid> mantém a URL para
# shorts e redireciona para /watch em vídeo normal. Cache para não re-testar.
_SHORTS_CACHE = DATA_DIR / "_yt_shorts_cache.json"


def _cache_load():
    try:
        return json.loads(_SHORTS_CACHE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def is_short(vid, cache):
    if vid in cache:
        return cache[vid]
    short = False
    try:
        req = urllib.request.Request(
            f"https://www.youtube.com/shorts/{vid}", headers=UA, method="HEAD")
        with urllib.request.urlopen(req, timeout=15) as r:
            short = "/shorts/" in r.geturl()
    except Exception:
        pass  # na dúvida, deixa passar
    cache[vid] = short
    return short


def resolve_id(handle):
    """@handle/URL -> channel_id (UC...). Best-effort pela página do canal."""
    if handle.startswith("UC") and len(handle) >= 22:
        return handle
    url = handle if handle.startswith("http") else f"https://www.youtube.com/{handle.lstrip('/')}"
    try:
        html = get(url).decode("utf-8", "replace")
    except Exception:
        return ""
    m = re.search(r'"externalId":"(UC[\w-]{20,26})"', html) or \
        re.search(r'youtube\.com/channel/(UC[\w-]{20,26})', html)
    return m.group(1) if m else ""


def feed(channel_id, n):
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    root = ET.fromstring(get(url))
    out = []
    for e in root.findall(ATOM + "entry")[:n]:
        vid = (e.findtext(YT + "videoId") or "").strip()
        titulo = (e.findtext(ATOM + "title") or "").strip()
        data = (e.findtext(ATOM + "published") or "").strip()
        thumb = ""
        grp = e.find(MEDIA + "group")
        if grp is not None:
            th = grp.find(MEDIA + "thumbnail")
            if th is not None:
                thumb = th.get("url", "")
        if vid and titulo:
            out.append({
                "vid": vid,
                "titulo": titulo,
                "url": f"https://www.youtube.com/watch?v={vid}",
                # thumb estável e hotlinkável (não expira):
                "thumb": thumb or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "data": data,
            })
    return out


def main():
    DATA_DIR.mkdir(exist_ok=True)
    cache = _cache_load()
    itens = []
    for nome, ref, cat in CANAIS:
        cid = resolve_id(ref)
        if not cid:
            print(f"  [{nome}] não resolveu '{ref}'")
            continue
        try:
            n_shorts = n_ok = 0
            # varre o RSS inteiro (~15) até juntar POR_CANAL vídeos de verdade;
            # canal pesado em shorts não fica sem representação
            for v in feed(cid, 15):
                if "#short" in v["titulo"].lower() or is_short(v["vid"], cache):
                    n_shorts += 1
                    continue
                v["canal"], v["cat"] = nome, cat
                itens.append(v)
                n_ok += 1
                if n_ok >= POR_CANAL:
                    break
            print(f"  [{nome}] ok ({cid})" + (f" — {n_shorts} shorts fora" if n_shorts else ""))
        except Exception as e:
            print(f"  [{nome}] {type(e).__name__}")
    try:
        _SHORTS_CACHE.write_text(json.dumps(cache), encoding="utf-8")
    except Exception:
        pass
    # mais recente primeiro (canais escolhidos a dedo, sem ranking por palavra-chave)
    itens.sort(key=lambda x: x.get("data", ""), reverse=True)
    itens = itens[:TOTAL]
    out = DATA_DIR / "youtube.json"
    out.write_text(json.dumps({"gerado_em": datetime.now().isoformat(timespec="seconds"),
                               "itens": itens}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ youtube.json — {len(itens)} vídeos")
    for x in itens[:8]:
        print(f"  [{x['canal']:<18}] {x['titulo'][:54]}")


if __name__ == "__main__":
    main()
