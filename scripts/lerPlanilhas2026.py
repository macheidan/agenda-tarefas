#!/usr/bin/env python3
"""Lê as planilhas Google de salário 2026 (LOV e DAME) e gera um JSON com os
lançamentos por funcionário/mês (Dia 5 / Dia 20 / Extra), pra alimentar o
importador Node (importPlanilhas2026.mjs → Firestore dpSalarios).

Usa o token existente da skill de salários (escopo spreadsheets).
Saída: JSON no stdout (ou --out arquivo). Colunas lidas: B=Salário, C=Transporte,
D=Feriado, E=Entrada, F=Adianta, G=Empréstimo, I=Banco, J=Flash. (H=Dinheiro e
K=Total são fórmulas — recalculadas no app, não são importadas.)
"""
import pickle
import json
import sys

from googleapiclient.discovery import build
from google.auth.transport.requests import Request

TOKEN = r"G:\Meu Drive\02 Pizzarias\05 AI\dre-ai\token_sheets_ro.pickle"
YEAR = 2026
SHEETS = {
    "lov": "1zgDmTMzfyuDwA1PJL5rJ6fiaQAveDS-qcL7u5pLHxsg",
    "dame": "1wfZefdp5DcJNdMN0cFszp_Q7kjyd89sq1mldRgVy848",
}
# Colunas (0-index) A..K
COLS = {"salario": 1, "transporte": 2, "feriado": 3, "entrada": 4,
        "adianta": 5, "empres": 6, "banco": 8, "flash": 9}


def to_num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v).strip().replace("R$", "").replace(" ", "")
    if not s or s == "-":
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def month_rows(mi):  # mi 0..11 → linhas 1-indexadas na planilha
    base = 3 + mi * 4  # Jan: Dia5=3, Dia20=4, Extra=5
    return {"dia5": base, "dia20": base + 1, "extra": base + 2}


def cell(rows, r, col):  # r = linha 1-index; rows = lista 0-index
    idx = r - 1
    if idx < 0 or idx >= len(rows):
        return None
    row = rows[idx]
    return row[col] if col < len(row) else None


def line_values(rows, r):
    out = {}
    for k, c in COLS.items():
        n = to_num(cell(rows, r, c))
        if n is not None and n != 0:
            out[k] = n
    return out


def main():
    with open(TOKEN, "rb") as f:
        creds = pickle.load(f)
    if getattr(creds, "expired", False) and getattr(creds, "refresh_token", None):
        creds.refresh(Request())
    svc = build("sheets", "v4", credentials=creds)

    result = []
    summary = {}
    for loja, sid in SHEETS.items():
        meta = svc.spreadsheets().get(spreadsheetId=sid).execute()
        titles = [s["properties"]["title"] for s in meta["sheets"]]
        if "TOTAIS" in titles:
            active_tabs = titles[: titles.index("TOTAIS")]
        else:
            active_tabs = titles
        summary[loja] = {"todas_abas": titles, "importar": active_tabs}
        for tab in active_tabs:
            rng = f"'{tab}'!A1:K49"
            vals = (
                svc.spreadsheets().values()
                .get(spreadsheetId=sid, range=rng, valueRenderOption="UNFORMATTED_VALUE")
                .execute()
                .get("values", [])
            )
            for mi in range(12):
                mr = month_rows(mi)
                rec = {"loja": loja, "aba": tab, "year": YEAR, "month": mi}
                has = False
                for line, r in mr.items():
                    lv = line_values(vals, r)
                    if lv:
                        rec[line] = lv
                        has = True
                if has:
                    result.append(rec)

    out_arg = None
    if "--out" in sys.argv:
        out_arg = sys.argv[sys.argv.index("--out") + 1]
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if out_arg:
        with open(out_arg, "w", encoding="utf-8") as f:
            f.write(payload)
    # resumo pro stderr (não polui o JSON do stdout)
    print("=== ABAS ===", file=sys.stderr)
    for loja, s in summary.items():
        print(f"[{loja}] importar: {s['importar']}", file=sys.stderr)
        print(f"[{loja}] todas:    {s['todas_abas']}", file=sys.stderr)
    print(f"=== registros (aba×mês com dados): {len(result)} ===", file=sys.stderr)
    if not out_arg:
        print(payload)


if __name__ == "__main__":
    main()
