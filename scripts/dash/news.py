#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Coletor de news do dashboard. Em construção, por partes:
  [x] GitHub Trending (day/week/month) — scraping, sem IA
  [x] IA News — RSS de blogs oficiais + Hacker News (categoria vem da fonte)
  [ ] Global News (positivas) / Biz News (Brasil) + cascata IA

Grava data/news.json (mescla as seções já implementadas).

Uso:  python news.py
"""

import re
import sys
import json
import html
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DATA_DIR = Path(__file__).resolve().parent / "data"
UA = {"User-Agent": "Mozilla/5.0 (machado-dashboard)"}
ATOM = "{http://www.w3.org/2005/Atom}"
MEDIA = "{http://search.yahoo.com/mrss/}"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}"

# Fonte, categoria (já vem da fonte), URL do feed
FONTES_IA = [
    ("OpenAI",       "GPT",    "https://openai.com/news/rss.xml"),
    ("DeepMind",     "Gemini", "https://deepmind.google/blog/rss.xml"),
    ("Google AI",    "Gemini", "https://blog.google/technology/ai/rss/"),
    ("Hugging Face", "Open",   "https://huggingface.co/blog/feed.xml"),
    ("Hacker News",  "Claude", "https://hnrss.org/newest?q=Claude+OR+Anthropic&points=20"),
    ("The Verge",    "IA",     "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"),
    ("TechCrunch",   "IA",     "https://techcrunch.com/category/artificial-intelligence/feed/"),
]

# Global: fontes já curadas como positivas (ciência, futurismo, boas notícias)
FONTES_GLOBAL = [
    ("Positive News", "Good",     "https://www.positive.news/feed/"),
    ("Good News",     "Good",     "https://www.goodnewsnetwork.org/feed/"),
    ("Science Daily",   "Science",  "https://www.sciencedaily.com/rss/top/science.xml"),
    ("New Scientist",   "Science",  "https://www.newscientist.com/feed/home/"),
    ("Singularity Hub", "Futurism", "https://singularityhub.com/feed/"),
]

# Mercado (chave "biz"): food-service, delivery, foodtech e negócios BR, o radar
# do projeto de IA do Fábio (consultoria pra restaurantes/PME). Curado p/ os
# interesses dele: iFood/delivery, restaurant tech, varejo de consumo, startups.
# Títulos são traduzidos pra pt-BR no runner (The Spoon vem em inglês).
FONTES_BIZ = [
    ("Mercado&Consumo", "Mercado",  "https://mercadoeconsumo.com.br/feed/"),
    ("The Spoon",       "Foodtech", "https://thespoon.tech/feed/"),
    ("NeoFeed",         "Negócios", "https://neofeed.com.br/feed/"),
    ("Startups",        "Startups", "https://startups.com.br/feed/"),
    ("Brazil Journal",  "Mercado",  "https://braziljournal.com/feed/"),
]


def get_bytes(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def textof(el):
    return (el.text or "").strip() if el is not None else ""


def limpar(t):
    t = re.sub(r"<[^>]+>", "", t or "")
    return html.unescape(re.sub(r"\s+", " ", t)).strip()


def parse_date(s):
    if not s:
        return None
    try:
        return parsedate_to_datetime(s)
    except Exception:
        pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def ts(s):
    d = parse_date(s)
    if not d:
        return 0
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()


def extrair_img(it):
    for tag in (MEDIA + "content", MEDIA + "thumbnail"):
        el = it.find(tag)
        if el is not None and el.get("url"):
            return el.get("url")
    enc = it.find("enclosure")
    if enc is not None and "image" in (enc.get("type") or "") and enc.get("url"):
        return enc.get("url")
    for tag in (CONTENT + "encoded", "description", ATOM + "content", ATOM + "summary"):
        el = it.find(tag)
        if el is not None and el.text:
            m = re.search(r'<img[^>]+src="([^"]+)"', el.text)
            if m:
                return m.group(1)
    return ""


def parse_feed(url, n=4):
    root = ET.fromstring(get_bytes(url))
    items = root.findall(".//item")
    atom = False
    if not items:
        items = root.findall(".//" + ATOM + "entry")
        atom = True
    out = []
    for it in items[:n]:
        if atom:
            titulo = textof(it.find(ATOM + "title"))
            le = it.find(ATOM + "link[@rel='alternate']")
            if le is None:
                le = it.find(ATOM + "link")
            url_i = le.get("href") if le is not None else ""
            data = textof(it.find(ATOM + "updated")) or textof(it.find(ATOM + "published"))
            cand = [textof(it.find(ATOM + "content")), textof(it.find(ATOM + "summary"))]
        else:
            titulo = textof(it.find("title"))
            url_i = textof(it.find("link"))
            data = textof(it.find("pubDate"))
            cand = [textof(it.find(CONTENT + "encoded")), textof(it.find("description"))]
        if titulo:
            resumo = max((limpar(c) for c in cand), key=len, default="")  # o texto mais longo
            if resumo.lower() == limpar(titulo).lower():
                resumo = ""
            out.append({"titulo": limpar(titulo), "url": url_i, "data": data,
                        "img": extrair_img(it), "resumo_raw": resumo})
    return out


def coletar_secao(fontes, por_fonte=4, total=12):
    itens = []
    for nome, cat, url in fontes:
        try:
            for x in parse_feed(url, por_fonte):
                x["fonte"], x["cat"] = nome, cat
                itens.append(x)
        except Exception as e:
            print(f"  [{nome}] {type(e).__name__}")
    itens.sort(key=lambda x: ts(x.get("data")), reverse=True)
    return itens[:total]


# ── GitHub Trending ──────────────────────────────────────────────────────────
def github_trending(since="daily", n=6):
    htmltxt = get_bytes(f"https://github.com/trending?since={since}").decode("utf-8", "replace")
    blocos = re.split(r'<article class="Box-row">', htmltxt)[1:]
    out = []
    for b in blocos[:n]:
        mrepo = re.search(r'<h2[^>]*>\s*<a[^>]*href="/([^"]+)"', b)
        if not mrepo:
            continue
        repo = mrepo.group(1).strip().rstrip("/")
        mdesc = re.search(r'<p[^>]*class="col-9[^"]*"[^>]*>(.*?)</p>', b, re.S)
        desc = limpar(mdesc.group(1)) if mdesc else ""
        mlang = re.search(r'itemprop="programmingLanguage">([^<]+)<', b)
        lang = mlang.group(1).strip() if mlang else ""
        mstars = re.search(r'([\d,]+)\s*stars? (?:today|this week|this month)', b)
        stars = mstars.group(1).replace(",", "") if mstars else ""
        out.append({"repo": repo, "desc": desc, "lang": lang, "stars": stars})
    return out


def og_image(url, timeout=8):
    try:
        h = get_bytes(url, timeout).decode("utf-8", "replace")
    except Exception:
        return ""
    for pat in (r'property="og:image"[^>]+content="([^"]+)"',
                r'content="([^"]+)"[^>]+property="og:image"',
                r'name="twitter:image"[^>]+content="([^"]+)"'):
        m = re.search(pat, h)
        if m:
            return html.unescape(m.group(1))
    return ""


def enriquecer_imagens(itens):
    for x in itens:
        if not x.get("img") and x.get("url"):
            x["img"] = og_image(x["url"])
    return itens


def main():
    DATA_DIR.mkdir(exist_ok=True)
    f = DATA_DIR / "news.json"
    data = {}
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            data = {}

    data["ia"]     = enriquecer_imagens(coletar_secao(FONTES_IA, total=12))
    data["global"] = enriquecer_imagens(coletar_secao(FONTES_GLOBAL, total=10))
    data["biz"]    = enriquecer_imagens(coletar_secao(FONTES_BIZ, total=10))
    # Product Hunt (lançamentos de ferramentas novas) — para o /v3, painel builder
    data["producthunt"] = enriquecer_imagens(coletar_secao(
        [("Product Hunt", "Launch", "https://www.producthunt.com/feed")],
        por_fonte=12, total=12))
    data["github"] = {
        "day":   github_trending("daily", 10),
        "week":  github_trending("weekly", 10),
        "month": github_trending("monthly", 10),
    }
    data["gerado_em"] = datetime.now().isoformat(timespec="seconds")
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    for sec in ("ia", "global", "biz"):
        print(f"\n{sec.upper()} ({len(data[sec])} itens):")
        for x in data[sec]:
            print(f"  [{x['cat']:>8}] {x['fonte']:<13} {('img' if x['img'] else '   ')} {x['titulo'][:58]}")


if __name__ == "__main__":
    main()
