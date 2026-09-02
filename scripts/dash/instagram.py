#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Coletor de Instagram do dashboard (SEM token, SEM Apify, SEM login).

Fonte: API pública de perfil `web_profile_info` (header x-ig-app-id), que traz
os posts recentes com shortcode, timestamp e flag de fixado (pinned_for_users).

Regra: os ÚLTIMOS 10 posts de cada conta, DESCONSIDERANDO os fixados, em ordem
cronológica (mais novo primeiro). Fallback: se a API falhar, usa o embed de
perfil (teto ~6, sem detectar fixado).

Grava data/instagram.json: {itens:[{conta, posts:[{code}]}]}

🎛️ Edite CONTAS abaixo.
Uso:  python instagram.py
"""

import re
import sys
import json
import urllib.request
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DATA_DIR = Path(__file__).resolve().parent / "data"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
IG_APP_ID = "936619743392459"   # app-id público do site do Instagram

# 🎛️ CONTAS do Instagram (sem @). Troque pelas suas.
CONTAS = ["myhub.ia", "evolving.ai", "theaifield",
          "therundownai", "design.deb", "metav3rse",
          "rowancheung", "theresanaiforthat", "godofprompt", "aibreakfast"]
ALVO = 10          # quantos posts por conta


def _get(url, extra=None, timeout=20):
    headers = {"User-Agent": UA, "Accept": "*/*"}
    if extra:
        headers.update(extra)
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers),
                                  timeout=timeout).read().decode("utf-8", "replace")


def via_api(user, n):
    """Últimos n posts (mais novos primeiro), sem fixados, pela web_profile_info."""
    url = f"https://www.instagram.com/api/v1/users/web_profile_info/?username={user}"
    raw = _get(url, {"x-ig-app-id": IG_APP_ID, "Referer": f"https://www.instagram.com/{user}/"})
    d = json.loads(raw)
    user_obj = (d.get("data") or {}).get("user") or {}
    edges = (user_obj.get("edge_owner_to_timeline_media") or {}).get("edges") or []
    posts = []
    for e in edges:
        node = e.get("node") or {}
        code = node.get("shortcode")
        if not code:
            continue
        if node.get("pinned_for_users"):          # ignora fixados
            continue
        posts.append((node.get("taken_at_timestamp") or 0, code))
    posts.sort(key=lambda x: x[0], reverse=True)   # mais novo primeiro
    return [c for _, c in posts[:n]]


def via_embed(user, n):
    """Fallback: parseia o embed de perfil (teto ~6, sem detectar fixado)."""
    s = _get(f"https://www.instagram.com/{user}/embed/").replace('\\"', '"').replace('\\/', '/')
    pos = [(m.start(), m.group(1)) for m in re.finditer(r'"shortcode":"([A-Za-z0-9_-]{6,})"', s)]
    out, seen = [], set()
    for m in re.finditer(r'"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"', s):
        cand = [c for (p, c) in pos if p < m.start()]
        if cand and cand[-1] not in seen:
            seen.add(cand[-1])
            out.append(cand[-1])
            if len(out) >= n:
                break
    return out


def codes_da_conta(user, n):
    try:
        c = via_api(user, n)
        if c:
            return c
    except Exception as e:
        print(f"    (api falhou: {type(e).__name__}; tentando embed)")
    return via_embed(user, n)


def main():
    DATA_DIR.mkdir(exist_ok=True)
    itens = []
    for u in CONTAS:
        try:
            codes = codes_da_conta(u, ALVO)
        except Exception as e:
            print(f"  [@{u}] {type(e).__name__} {e}")
            continue
        if codes:
            itens.append({"conta": u, "posts": [{"code": c} for c in codes]})
        print(f"  [@{u}] {len(codes)} posts")
    out = DATA_DIR / "instagram.json"
    out.write_text(json.dumps({"gerado_em": datetime.now().isoformat(timespec="seconds"),
                               "itens": itens}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ instagram.json — {len(itens)} contas")


if __name__ == "__main__":
    main()
