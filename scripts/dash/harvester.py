#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Harvester de IA — alimenta o painel "Fontes & feeds de IA" do dashboard.

Implementa os estágios do blueprint (fontes 🟢🟡 apenas, stdlib-only):
  fetch (RSS imprensa/labs + HN Algolia + Reddit) → normalize (schema)
  → dedup (URL canônica + similaridade de título → clusters)
  → score (viralização: velocity + cross-source + recency + authority + niche)
  → top N (teto 24) → data/feeds.json

NÃO faz enrich/draft com Claude nem SQLite — são fases 3-4 do roadmap do
blueprint; o painel só precisa da fila priorizada. A camada 🔴 (IG/X) fica de
fora por desenho (ToS/copyright); entra como curadoria manual quando for o caso.

Uso:  python harvester.py
"""

import re
import sys
import json
import math
import time
import html
import hashlib
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DATA_DIR = Path(__file__).resolve().parent / "data"
UA = "Mozilla/5.0 (machado-dashboard-harvester)"
REDDIT_UA = "content-harvester/0.1 (by u/fabiomachado)"
ATOM = "{http://www.w3.org/2005/Atom}"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}"
TETO = 24

# ── 1. 🎛️ Nicho (§1 do blueprint) — recorte IA com lente de operador de PME ──
NICHE_INCLUDE = [
    "ai", "artificial intelligence", "machine learning", "llm", "model",
    "agent", "agentic", "gpt", "claude", "gemini", "openai", "anthropic",
    "deepmind", "mistral", "llama", "automation", "automating", "copilot",
    "assistant", "chatbot", "inference", "reasoning", "multimodal", "rag",
    "fine-tun", "open source", "open-weight", "robot", "api", "neural",
]
NICHE_EXCLUDE = [
    "horoscope", "celebrity", "nft", "casino", "betting", "porn",
    "dating app", "gossip",
]

# ── 5.2 🎛️ Fontes-semente (tipo, nome, categoria, url/handle, authority) ──────
#   press = imprensa âncora · lab = blog oficial · hn/reddit = sinal de viral 🟡
SOURCES_RSS = [
    ("press", "MIT Tech Review", "IA",    "https://www.technologyreview.com/feed/",                                   0.95),
    ("press", "The Verge",       "IA",    "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",        0.85),
    ("press", "TechCrunch",      "IA",    "https://techcrunch.com/category/artificial-intelligence/feed/",            0.85),
    ("press", "VentureBeat",     "IA",    "https://venturebeat.com/category/ai/feed/",                                0.80),
    ("press", "Ars Technica",    "IA",    "https://arstechnica.com/ai/feed/",                                         0.85),
    ("lab",   "OpenAI",          "GPT",   "https://openai.com/news/rss.xml",                                          0.95),
    ("lab",   "DeepMind",        "Gemini","https://deepmind.google/blog/rss.xml",                                     0.95),
    ("lab",   "Google AI",       "Gemini","https://blog.google/technology/ai/rss/",                                   0.90),
    ("lab",   "Hugging Face",    "Open",  "https://huggingface.co/blog/feed.xml",                                     0.90),
]

# Hacker News (Algolia, oficial, sem key) — sinal de viralização + corroboração
HN_QUERIES = ["AI", "LLM", "AI agent", "OpenAI OR Anthropic OR Claude", "GPT OR Gemini"]
HN_MIN_POINTS = 30
HN_AUTHORITY = 0.55

# Reddit (endpoint .json, UA obrigatório) — sinal de viralização (best-effort)
REDDIT_SUBS = ["artificial", "LocalLLaMA", "MachineLearning", "OpenAI"]
REDDIT_MIN_SCORE = 80
REDDIT_AUTHORITY = 0.45

# ── 8. 🎛️ Pesos do score (Σ = 1.0) ───────────────────────────────────────────
#   Calibrado p/ resumo matinal: não deixar o HN (único com engajamento)
#   monopolizar; autoridade e corroboração pesam tanto quanto o viral cru.
W = {
    "engagement_velocity": 0.20,
    "cross_source":        0.25,
    "recency":             0.20,
    "source_authority":    0.25,
    "niche_match":         0.10,
}
RECENCY_HALF_LIFE_H = 24.0
JACCARD_MIN = 0.50          # similaridade de título p/ juntar no mesmo cluster
CAP_POR_FONTE = 4           # diversidade: máx. de itens da mesma fonte no top

TIPO_LABEL = {"press": "imprensa", "lab": "blog oficial", "hn": "", "reddit": ""}
TIPO_ICON = {"press": "ti-world", "lab": "ti-robot", "hn": "ti-flame", "reddit": "ti-brand-reddit"}

STOP = set("a o e de da do dos das em no na para por com que the of to in on for and a an "
           "is are be with how why what new now your you our".split())


# ── helpers ───────────────────────────────────────────────────────────────────
def _get(url, ua=UA, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def limpar(t):
    t = re.sub(r"<[^>]+>", "", t or "")
    return html.unescape(re.sub(r"\s+", " ", t)).strip()


def textof(el):
    return (el.text or "").strip() if el is not None else ""


def parse_ts(s):
    """ISO ou RFC822 → epoch (float); 0 se falhar."""
    if not s:
        return 0.0
    for fn in (parsedate_to_datetime,
               lambda x: datetime.fromisoformat(x.replace("Z", "+00:00"))):
        try:
            d = fn(s)
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d.timestamp()
        except Exception:
            continue
    return 0.0


def canonical(url):
    """Remove utm_/tracking + fragmento, host minúsculo, sem barra final."""
    try:
        p = urllib.parse.urlsplit(url)
        q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query)
             if not k.lower().startswith(("utm_", "fbclid", "gclid", "ref"))]
        netloc = p.netloc.lower()
        path = p.path.rstrip("/") or "/"
        return urllib.parse.urlunsplit((p.scheme, netloc, path,
                                        urllib.parse.urlencode(q), ""))
    except Exception:
        return (url or "").strip()


def tokens(t):
    return {w for w in re.findall(r"[a-zA-Z0-9]{3,}", (t or "").lower())
            if w not in STOP}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _meta(h, pats):
    for pat in pats:
        m = re.search(pat, h)
        if m:
            return html.unescape(m.group(1)).strip()
    return ""


def og_meta(url, timeout=8):
    """og:image + og:description da página (1 fetch). {} se falhar."""
    try:
        h = _get(url, timeout=timeout).decode("utf-8", "replace")
    except Exception:
        return {"img": "", "desc": ""}
    img = _meta(h, (r'property="og:image"[^>]+content="([^"]+)"',
                    r'content="([^"]+)"[^>]+property="og:image"',
                    r'name="twitter:image"[^>]+content="([^"]+)"'))
    desc = _meta(h, (r'property="og:description"[^>]+content="([^"]+)"',
                     r'content="([^"]+)"[^>]+property="og:description"',
                     r'name="description"[^>]+content="([^"]+)"'))
    return {"img": img, "desc": desc}


# ── fetch ──────────────────────────────────────────────────────────────────────
def fetch_rss(tipo, nome, cat, url, authority, n=8):
    out = []
    try:
        root = ET.fromstring(_get(url))
    except Exception as e:
        print(f"  [rss {nome}] {type(e).__name__}")
        return out
    items, atom = root.findall(".//item"), False
    if not items:
        items, atom = root.findall(".//" + ATOM + "entry"), True
    for it in items[:n]:
        if atom:
            titulo = textof(it.find(ATOM + "title"))
            le = it.find(ATOM + "link[@rel='alternate']")
            if le is None:
                le = it.find(ATOM + "link")
            link = le.get("href") if le is not None else ""
            data = textof(it.find(ATOM + "updated")) or textof(it.find(ATOM + "published"))
        else:
            titulo = textof(it.find("title"))
            link = textof(it.find("link"))
            data = textof(it.find("pubDate"))
        if atom:
            cand = [textof(it.find(ATOM + "content")), textof(it.find(ATOM + "summary"))]
        else:
            cand = [textof(it.find(CONTENT + "encoded")), textof(it.find("description"))]
        desc = max((limpar(c) for c in cand), key=len, default="")   # o texto mais longo
        if titulo and link:
            out.append(normalize(tipo, nome, cat, limpar(titulo), link,
                                 parse_ts(data), authority, points=0, comments=0,
                                 resumo=desc))
    return out


def fetch_hn():
    out, base = [], "http://hn.algolia.com/api/v1/search_by_date"
    for q in HN_QUERIES:
        try:
            qs = urllib.parse.urlencode({
                "tags": "story", "query": q,
                "numericFilters": f"points>={HN_MIN_POINTS}", "hitsPerPage": 20})
            data = json.loads(_get(f"{base}?{qs}"))
        except Exception as e:
            print(f"  [hn {q[:20]}] {type(e).__name__}")
            continue
        for h in data.get("hits", []):
            titulo = limpar(h.get("title") or "")
            link = h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}"
            if not titulo:
                continue
            out.append(normalize("hn", "Hacker News", "Trending", titulo, link,
                                 parse_ts(h.get("created_at")), HN_AUTHORITY,
                                 points=h.get("points") or 0,
                                 comments=h.get("num_comments") or 0))
    return out


def fetch_reddit():
    out = []
    for sub in REDDIT_SUBS:
        try:
            data = json.loads(_get(f"https://www.reddit.com/r/{sub}/hot.json?limit=20",
                                   ua=REDDIT_UA))
        except Exception as e:
            print(f"  [reddit {sub}] {type(e).__name__}")
            continue
        for c in data.get("data", {}).get("children", []):
            d = c.get("data", {})
            score = d.get("score") or 0
            if d.get("stickied") or score < REDDIT_MIN_SCORE:
                continue
            titulo = limpar(d.get("title") or "")
            link = d.get("url_overridden_by_dest") or \
                ("https://www.reddit.com" + d.get("permalink", ""))
            if not titulo:
                continue
            out.append(normalize("reddit", f"r/{sub}", "Reddit", titulo, link,
                                 d.get("created_utc") or 0, REDDIT_AUTHORITY,
                                 points=score, comments=d.get("num_comments") or 0))
    return out


# ── normalize (schema §6, subset) ─────────────────────────────────────────────
def normalize(tipo, fonte, cat, titulo, url, ts, authority, points, comments, resumo=""):
    cu = canonical(url)
    if resumo and resumo.lower() == titulo.lower():
        resumo = ""
    return {
        "id": hashlib.sha256(cu.encode("utf-8")).hexdigest()[:16],
        "tipo": tipo, "fonte": fonte, "cat": cat,
        "titulo": titulo, "url": url, "canonical": cu,
        "ts": float(ts or 0), "authority": authority,
        "points": int(points or 0), "comments": int(comments or 0),
        "resumo_raw": resumo, "_tok": tokens(titulo),
    }


# ── dedup → clusters (URL canônica + similaridade de título) ──────────────────
def cluster(itens):
    by_url = {}
    for it in itens:
        by_url.setdefault(it["canonical"], []).append(it)
    nodes = list(by_url.values())          # já dedupe exato por URL

    clusters = []
    for grp in nodes:
        rep = grp[0]
        placed = False
        for cl in clusters:
            if jaccard(rep["_tok"], cl["_tok"]) >= JACCARD_MIN:
                cl["membros"].extend(grp)
                cl["_tok"] |= rep["_tok"]
                placed = True
                break
        if not placed:
            clusters.append({"_tok": set(rep["_tok"]), "membros": list(grp)})
    return clusters


# ── score (§8) ────────────────────────────────────────────────────────────────
def score_cluster(cl, now):
    membros = cl["membros"]
    fontes = {m["fonte"] for m in membros}
    ts_recente = max((m["ts"] for m in membros), default=0)
    dh = max((now - ts_recente) / 3600.0, 0.01) if ts_recente else 999.0

    velocity = max(((m["points"] + m["comments"]) /
                    max((now - m["ts"]) / 3600.0, 1.0)) for m in membros) if membros else 0
    eng = min(1.0, velocity / 30.0)
    cross = min(1.0, (len(fontes) - 1) / 2.0)          # 1 fonte=0 · 2=0.5 · 3+=1
    rec = math.exp(-dh / RECENCY_HALF_LIFE_H)
    auth = max(m["authority"] for m in membros)

    blob = " ".join(m["titulo"].lower() for m in membros)
    if any(x in blob for x in NICHE_EXCLUDE):
        return None
    inc = sum(1 for kw in NICHE_INCLUDE if kw in blob)
    niche = min(1.0, 0.4 + 0.3 * inc)                  # fontes já são de IA

    final = (W["engagement_velocity"] * eng + W["cross_source"] * cross +
             W["recency"] * rec + W["source_authority"] * auth +
             W["niche_match"] * niche)

    rep = max(membros, key=lambda m: (m["authority"], m["ts"]))
    badge = ""
    if len(fontes) >= 3:
        badge = f"{len(fontes)} fontes"
    elif len(fontes) == 2:
        badge = "2 fontes"
    elif dh <= 4:
        badge = "novo"

    return {
        "h": rep["titulo"],
        "url": rep["url"],
        "n": rep["fonte"],
        "s": TIPO_LABEL.get(rep["tipo"], rep["tipo"]),
        "i": TIPO_ICON.get(rep["tipo"], "ti-rss"),
        "cat": rep["cat"],
        "data": (datetime.fromtimestamp(ts_recente, timezone.utc).isoformat()
                 if ts_recente else ""),
        "b": badge,
        "resumo_raw": rep.get("resumo_raw", ""),
        "score": round(final, 3),
        "fontes": sorted(fontes),
    }


def diversificar(ranked, teto, cap):
    """Top `teto` por score, no máx. `cap` por fonte; 2º passe completa se faltar."""
    sel, cont, resto = [], {}, []
    for x in ranked:
        if cont.get(x["n"], 0) < cap:
            sel.append(x)
            cont[x["n"]] = cont.get(x["n"], 0) + 1
        else:
            resto.append(x)
        if len(sel) >= teto:
            return sel
    for x in resto:                       # poucas fontes: completa ignorando o cap
        sel.append(x)
        if len(sel) >= teto:
            break
    return sel


# ── main ───────────────────────────────────────────────────────────────────────
def main():
    DATA_DIR.mkdir(exist_ok=True)
    now = time.time()

    itens = []
    for tipo, nome, cat, url, auth in SOURCES_RSS:
        itens += fetch_rss(tipo, nome, cat, url, auth)
    itens += fetch_hn()
    itens += fetch_reddit()

    clusters = cluster(itens)
    ranked = [s for s in (score_cluster(c, now) for c in clusters) if s]
    ranked.sort(key=lambda x: x["score"], reverse=True)
    ranked = diversificar(ranked, TETO, CAP_POR_FONTE)

    # enriquece SÓ os finais com og:image + og:description (1 fetch, em paralelo)
    def _enrich(x):
        m = og_meta(x["url"])
        x["img"] = m["img"]
        if not x.get("resumo_raw"):
            x["resumo_raw"] = m["desc"]
        return x
    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(_enrich, ranked))

    out = {
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "itens": ranked,
    }
    (DATA_DIR / "feeds.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nFEEDS ({len(ranked)} itens · de {len(itens)} brutos / "
          f"{len(clusters)} clusters):")
    for x in ranked:
        nf = f"{len(x['fontes'])}f" if len(x["fontes"]) > 1 else "  "
        print(f"  {x['score']:.3f} {nf} [{x['s']:>11}] {x['n']:<15} {x['h'][:54]}")


if __name__ == "__main__":
    main()
