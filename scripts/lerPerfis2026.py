#!/usr/bin/env python3
"""Lê o resumo O1:P4 de cada aba (funcionário) das planilhas de salário 2026 e
gera um JSON de perfis salariais, pra alimentar o cadastro (dpEmployees).

Rótulos em O, valores em P: Salário, Transporte, Feriado, Adiantamento.
Salário = "folha" → recebe tudo na folha (salaryMode='folha'); senão, valor por fora.
Casa por rótulo (não por posição fixa) pra ser robusto.

Saída: JSON [{loja, aba, salaryMode, salaryBase, transporteRef, feriadoUnit, adiantamento}]
"""
import pickle
import json
import sys
import unicodedata

from googleapiclient.discovery import build

TOKEN = r"G:\Meu Drive\02 Pizzarias\05 AI\dre-ai\token_sheets_ro.pickle"
SHEETS = {
    "lov": "1zgDmTMzfyuDwA1PJL5rJ6fiaQAveDS-qcL7u5pLHxsg",
    "dame": "1wfZefdp5DcJNdMN0cFszp_Q7kjyd89sq1mldRgVy848",
}


def norm(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.strip().lower()


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


def main():
    creds = pickle.load(open(TOKEN, "rb"))
    svc = build("sheets", "v4", credentials=creds)
    out = []
    for loja, sid in SHEETS.items():
        meta = svc.spreadsheets().get(spreadsheetId=sid).execute()
        titles = [s["properties"]["title"] for s in meta["sheets"]]
        tabs = titles[: titles.index("TOTAIS")] if "TOTAIS" in titles else titles
        for tab in tabs:
            rng = f"'{tab}'!O1:P6"
            rows = (
                svc.spreadsheets().values()
                .get(spreadsheetId=sid, range=rng, valueRenderOption="UNFORMATTED_VALUE")
                .execute()
                .get("values", [])
            )
            prof = {"loja": loja, "aba": tab}
            # O resumo O1:P4 só é válido no formato da LOV (O1 = "Salário"). A DAME
            # usa O/P pra outra coisa (dias de transporte/alimentação) — ignora.
            o1 = norm(rows[0][0]) if rows and len(rows[0]) > 0 else ""
            if not o1.startswith("salario"):
                out.append(prof)
                continue
            for row in rows:
                label = norm(row[0]) if len(row) > 0 else ""
                raw = row[1] if len(row) > 1 else None
                if label.startswith("salario"):
                    if isinstance(raw, str) and norm(raw) == "folha":
                        prof["salaryMode"] = "folha"
                    else:
                        n = to_num(raw)
                        if n is not None:
                            prof["salaryMode"] = "fora"
                            prof["salaryBase"] = n
                elif label.startswith("transporte"):
                    n = to_num(raw)
                    if n is not None:
                        prof["transporteRef"] = n
                elif label.startswith("feriado"):
                    n = to_num(raw)
                    if n is not None:
                        prof["feriadoUnit"] = n
                elif label.startswith("adiant"):
                    n = to_num(raw)
                    if n is not None:
                        prof["adiantamento"] = n
                    elif isinstance(raw, str) and norm(raw) == "folha":
                        prof["adiantamento"] = "folha"
            out.append(prof)

    payload = json.dumps(out, ensure_ascii=False, indent=2)
    if "--out" in sys.argv:
        with open(sys.argv[sys.argv.index("--out") + 1], "w", encoding="utf-8") as f:
            f.write(payload)
    # resumo legível no stderr
    for p in out:
        print(
            f"[{p['loja']:4}] {p['aba']:12} modo={p.get('salaryMode','-'):5} "
            f"base={p.get('salaryBase','-')} transp={p.get('transporteRef','-')} "
            f"feriado={p.get('feriadoUnit','-')} adiant={p.get('adiantamento','-')}",
            file=sys.stderr,
        )
    if "--out" not in sys.argv:
        print(payload)


if __name__ == "__main__":
    main()
