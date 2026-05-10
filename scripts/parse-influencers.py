#!/usr/bin/env python3
"""Extract Lista 2026 rows from Google Drive markdown export."""
import json
import re
import sys
import os
from collections import Counter

INPUT = r'C:/Users/PICHAU/.claude/projects/C--claude-project-Pizzarias-intranet-pizzarias/deda7978-553b-491f-84dc-5aea1e34d553/tool-results/mcp-claude_ai_Google_Drive-read_file_content-1778381256883.txt'
OUTPUT = r'C:/claude_project/Pizzarias/intranet-pizzarias/src/data/influencers-import.json'

EMAIL_RE = re.compile(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}')
PHONE_RE = re.compile(r'(\+?\d[\d\s().\-]{6,}\d)')


def clean(s: str) -> str:
    if s is None:
        return ''
    # Decode common HTML entities
    s = s.replace('&#13;', '').replace('&#10;', ' ').replace('&amp;', '&')
    s = s.replace('&nbsp;', ' ')
    # Markdown escaped chars
    s = s.replace('\\!', '!').replace('\\_', '_').replace('\\*', '*')
    s = s.replace('\\.', '.').replace('\\-', '-').replace('\\(', '(').replace('\\)', ')')
    # collapse whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def parse_bool(s: str) -> bool:
    return clean(s).upper() == 'SIM'


def parse_divulgou(s: str) -> str:
    v = clean(s).lower()
    if not v:
        return ''
    if v in ('lov', 'dame', 'ambas'):
        return v
    if 'lov' in v and 'dame' in v:
        return 'ambas'
    if 'lov' in v:
        return 'lov'
    if 'dame' in v or 'dáme' in v:
        return 'dame'
    return ''


def parse_contato(s: str):
    v = clean(s)
    if not v:
        return []
    upper = v.upper()
    if upper == 'INSTA':
        return [{'tipo': 'insta', 'valor': ''}]
    # email?
    m = EMAIL_RE.search(v)
    if m:
        return [{'tipo': 'email', 'valor': m.group(0)}]
    # phone? require at least 8 digits
    digits = re.sub(r'\D', '', v)
    if len(digits) >= 8:
        # treat as whatsapp
        return [{'tipo': 'whatsapp', 'valor': v}]
    return [{'tipo': 'outro', 'valor': v}]


def split_row(line: str):
    # Markdown row: "| a | b | c |"
    line = line.strip()
    if not line.startswith('|'):
        return None
    # remove leading/trailing pipe
    inner = line.strip()
    if inner.startswith('|'):
        inner = inner[1:]
    if inner.endswith('|'):
        inner = inner[:-1]
    cells = inner.split('|')
    return [c.strip() for c in cells]


def main():
    with open(INPUT, 'r', encoding='utf-8') as f:
        data = json.load(f)
    content = data['fileContent']
    lines = content.split('\n')

    # Find header line
    header_idx = None
    for i, ln in enumerate(lines):
        if 'MÊS' in ln and 'CONTATADO' in ln and 'TEXTO CONVITE' in ln:
            header_idx = i
            break
    if header_idx is None:
        sys.exit('Header not found')

    # Data starts header_idx + 2 (skip separator)
    start = header_idx + 2
    rows = []
    valid_meses = {'FEV', 'MAR', 'ABR'}
    for i in range(start, len(lines)):
        ln = lines[i]
        if not ln.strip():
            break
        cells = split_row(ln)
        if not cells:
            break
        # Expect 12 columns
        if len(cells) < 12:
            # pad
            cells = cells + [''] * (12 - len(cells))
        elif len(cells) > 12:
            # join trailing into texto convite
            cells = cells[:11] + [' | '.join(cells[11:])]

        mes_raw = clean(cells[0]).upper()
        # Stop if we hit a different table
        if mes_raw and mes_raw not in valid_meses and not any(m in mes_raw for m in valid_meses):
            # If first row has unexpected mes value, still keep but flag
            pass
        nome = clean(cells[1])
        if not nome:
            # skip empty rows
            continue
        mes = mes_raw if mes_raw in valid_meses else ''

        record = {
            'mes': mes,
            'ano': 2026,
            'nome': nome,
            'handle': '',
            'alcance': clean(cells[5]),
            'txEngaj': clean(cells[6]),
            'segmento': clean(cells[7]),
            'midiaKitUrl': clean(cells[8]),
            'contatos': parse_contato(cells[9]),
            'contatado': parse_bool(cells[2]),
            'retornou': parse_bool(cells[3]),
            'divulgouEm': parse_divulgou(cells[4]),
            'observacoes': clean(cells[10]),
            'textoConvite': clean(cells[11]),
        }
        rows.append(record)

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    # Stats
    total = len(rows)
    contatados = sum(1 for r in rows if r['contatado'])
    retornaram = sum(1 for r in rows if r['retornou'])
    divulg_breakdown = Counter(r['divulgouEm'] for r in rows if r['divulgouEm'])
    divulgaram = sum(divulg_breakdown.values())
    mes_breakdown = Counter(r['mes'] for r in rows)

    print(f'Total registros: {total}')
    print(f'Contatados: {contatados}')
    print(f'Retornaram: {retornaram}')
    print(f'Divulgaram: {divulgaram} -> {dict(divulg_breakdown)}')
    print(f'Por mês: {dict(mes_breakdown)}')
    print('Amostra (3 nomes):')
    for r in rows[:3]:
        print(f'  - [{r["mes"]}] {r["nome"]} | alcance={r["alcance"]} | contato={r["contatos"]}')
    print(f'Arquivo: {OUTPUT}')


if __name__ == '__main__':
    main()
