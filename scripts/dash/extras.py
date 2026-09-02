#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Coletor de extras do dashboard: cotações (USD/BRL, BTC/USD com variação %) e
clima de Porto Alegre. Tudo via APIs públicas grátis, sem chave. Sem browser.

Grava data/extras.json.

Uso:  python extras.py
"""

import json
import urllib.request
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"

WMO = {
    0: "céu limpo", 1: "poucas nuvens", 2: "parcial", 3: "nublado",
    45: "névoa", 48: "névoa", 51: "garoa", 53: "garoa", 55: "garoa",
    56: "garoa", 57: "garoa", 61: "chuva fraca", 63: "chuva", 65: "chuva forte",
    66: "chuva", 67: "chuva", 71: "neve", 73: "neve", 75: "neve",
    80: "pancadas", 81: "pancadas", 82: "temporal", 95: "tempestade",
    96: "tempestade", 99: "tempestade",
}


def get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "machado-dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def cotacoes():
    out = {"usd": None, "btc": None}
    try:
        u = get_json("https://economia.awesomeapi.com.br/json/last/USD-BRL")["USDBRL"]
        out["usd"] = {"valor": round(float(u["bid"]), 2), "pct": round(float(u["pctChange"]), 2)}
    except Exception as e:
        print(f"  [usd] {e}")
    try:
        b = get_json("https://api.coingecko.com/api/v3/simple/price"
                     "?ids=bitcoin&vs_currencies=usd&include_24hr_change=true")["bitcoin"]
        out["btc"] = {"valor": round(float(b["usd"])), "pct": round(float(b["usd_24h_change"]), 2)}
    except Exception as e:
        print(f"  [btc] {e}")
    return out


def clima():
    try:
        c = get_json("https://api.open-meteo.com/v1/forecast"
                     "?latitude=-30.0331&longitude=-51.2300"
                     "&current=temperature_2m,weather_code&timezone=America/Sao_Paulo")["current"]
        return {"temp": round(c["temperature_2m"]), "desc": WMO.get(c["weather_code"], "")}
    except Exception as e:
        print(f"  [clima] {e}")
        return None


def main():
    DATA_DIR.mkdir(exist_ok=True)
    out = {
        "cotacoes": cotacoes(),
        "clima": clima(),
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
    }
    (DATA_DIR / "extras.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
