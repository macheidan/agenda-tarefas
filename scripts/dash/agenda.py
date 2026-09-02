#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Coletor da agenda do dia (Google Calendar). Lê os eventos de hoje do calendário
primário e grava data/agenda.json.

Autorização: na 1ª execução abre o navegador para você permitir o acesso de
leitura. O token fica em token_calendar.pickle (gitignored) e é reutilizado.
Reusa o OAuth client do dre-ai (config.json -> google_credentials).

Uso:  python agenda.py
"""

import sys
import json
import pickle
import os
from pathlib import Path
from datetime import datetime, timedelta, date

from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT     = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CFG_FILE = Path(__file__).parent / "config.json"
TOKEN    = Path(__file__).parent / "token_calendar.pickle"
SCOPES   = ["https://www.googleapis.com/auth/calendar.readonly"]


def cred_path():
    cfg = json.loads(CFG_FILE.read_text(encoding="utf-8"))
    p = os.path.expandvars(cfg.get("google_credentials", ""))
    if not p or not Path(p).exists():
        print("[ERRO] google_credentials não configurado/encontrado no config.json.")
        sys.exit(1)
    return p


def get_service():
    creds = None
    if TOKEN.exists():
        with open(TOKEN, "rb") as f:
            creds = pickle.load(f)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(cred_path(), SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN, "wb") as f:
            pickle.dump(creds, f)
    return build("calendar", "v3", credentials=creds)


DOW_ABBR = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
DIAS = 7   # janela: hoje + próximos dias


def rotulo_dia(d, hoje):
    n = (d - hoje).days
    if n <= 0:
        return "hoje"
    if n == 1:
        return "amanhã"
    return f"{DOW_ABBR[d.weekday()]} {d.day:02d}/{d.month:02d}"


def main():
    DATA_DIR.mkdir(exist_ok=True)
    ini = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
    fim = ini + timedelta(days=DIAS)
    hoje = ini.date()

    service = get_service()
    res = service.events().list(
        calendarId="primary",
        timeMin=ini.isoformat(), timeMax=fim.isoformat(),
        singleEvents=True, orderBy="startTime", maxResults=20,
    ).execute()

    eventos = []
    for e in res.get("items", []):
        st = e["start"]
        if "dateTime" in st:
            dt = datetime.fromisoformat(st["dateTime"])
            hora, ddate = dt.strftime("%H:%M"), dt.date()
        else:
            ddate, hora = date.fromisoformat(st["date"]), "dia todo"
        eventos.append({
            "data": ddate.isoformat(),
            "dia":  rotulo_dia(ddate, hoje),
            "h":    hora,
            "d":    e.get("summary", "(sem título)"),
        })
    eventos = eventos[:10]

    out = {
        "data": hoje.isoformat(),
        "eventos": eventos,
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
    }
    (DATA_DIR / "agenda.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(eventos)} eventos (próximos {DIAS} dias):")
    for ev in eventos:
        print(f"  {ev['dia']:>10}  {ev['h']:>8}  {ev['d']}")


if __name__ == "__main__":
    main()
