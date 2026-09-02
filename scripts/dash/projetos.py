#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Coletor de "projetos em andamento": lê as sessões do Claude Code em
~/.claude/projects e lista os projetos trabalhados na última semana, ordenados
pela atividade mais recente. O nome vem do cwd real registrado na sessão.

Grava data/projetos.json.

Uso:  python projetos.py [--dias 7]
"""

import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta

PROJECTS_DIR = Path.home() / ".claude" / "projects"
DATA_DIR = Path(__file__).resolve().parent / "data"


def ultimo_jsonl(pasta):
    js = list(pasta.glob("*.jsonl"))
    return max(js, key=lambda f: f.stat().st_mtime) if js else None


def achar_cwd(jsonl, limite=400):
    """Procura o primeiro evento com 'cwd' (varre até `limite` linhas)."""
    try:
        with jsonl.open(encoding="utf-8", errors="ignore") as fh:
            for i, line in enumerate(fh):
                if i >= limite:
                    break
                if '"cwd"' not in line:
                    continue
                try:
                    cwd = json.loads(line).get("cwd")
                    if cwd:
                        return cwd
                except Exception:
                    continue
    except Exception:
        pass
    return None


def rotulo(dt):
    dias = (datetime.now().date() - dt.date()).days
    if dias <= 0:
        return "hoje"
    if dias == 1:
        return "ontem"
    return f"há {dias} dias"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=7)
    args = ap.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    itens = []
    if PROJECTS_DIR.exists():
        for pasta in PROJECTS_DIR.iterdir():
            if not pasta.is_dir():
                continue
            jl = ultimo_jsonl(pasta)
            if not jl:
                continue
            dt = datetime.fromtimestamp(jl.stat().st_mtime)
            cwd = achar_cwd(jl) or ""
            nome = Path(cwd).name if cwd else ""
            if not nome and cwd:
                nome = Path(cwd).parent.name
            if not nome:
                continue
            itens.append({"nome": nome, "cwd": cwd, "_dt": dt})

    itens.sort(key=lambda p: p["_dt"], reverse=True)
    corte = datetime.now() - timedelta(days=args.dias)
    recentes = [p for p in itens if p["_dt"] >= corte] or itens[:8]

    projetos = [{
        "nome": p["nome"],
        "cwd": p["cwd"],
        "ts": p["_dt"].isoformat(timespec="seconds"),
        "quando": rotulo(p["_dt"]),
    } for p in recentes]

    out = {"projetos": projetos, "gerado_em": datetime.now().isoformat(timespec="seconds")}
    (DATA_DIR / "projetos.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(projetos)} projetos (últimos {args.dias} dias):")
    for p in projetos:
        print(f"  {p['quando']:>10}  {p['nome']}")


if __name__ == "__main__":
    main()
