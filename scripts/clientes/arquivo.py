# -*- coding: utf-8 -*-
"""Arquivo permanente do que o Saipos devolve — o backup da base de clientes.

POR QUE EXISTE
--------------
O que a intranet guarda é uma redução: nome, telefone, bairro, contagens. Fica
de fora o CPF (só o hash sobe), o endereço completo, o e-mail, o aniversário e
TODO o detalhe de pedido — produto, canal e forma de pagamento. Os JSONs de
coleta em `data/` têm tudo isso, mas vivem 7 dias e só nesta máquina.

Aqui o dado bruto é guardado inteiro e para sempre. Duas propriedades:

  nunca perde   — é merge, nunca sobrescrita. Cadastro que sumir do Saipos, ou
                  cliente que envelhecer para fora da janela de 90 dias,
                  continua aqui. Isso torna o arquivo estritamente mais completo
                  que o Firestore, que por sua vez já é mais completo que a
                  coleta do dia.
  idempotente   — rodar duas vezes não duplica nada.

ONDE MORA
---------
`G:\\Meu Drive\\02 Pizzarias\\07 Backup Saipos` por padrão (a variável de
ambiente SAIPOS_BACKUP sobrepõe). É pasta do Drive, então o Google versiona e
replica; e NÃO é repositório git — o vault em `03 Pessoal` é, e sobe para o
GitHub, então dado pessoal não pode encostar nele.

FORMATO
-------
JSONL, uma linha por registro:

  cadastros/{loja}.jsonl          1 linha por id_customer (reescrito a cada coleta)
  pedidos/{loja}-{AAAA-MM}.jsonl  1 linha por id_sale, no mês do pedido

Pedido é imutável, então o shard mensal fecha e nunca mais muda — o que evita
o Drive re-subir o arquivo inteiro todo dia. JSONL e não JSON porque uma linha
corrompida custa um registro, não o arquivo.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

RAIZ = Path(os.environ.get("SAIPOS_BACKUP") or r"G:\Meu Drive\02 Pizzarias\07 Backup Saipos")

# Chave natural de cada tipo de registro no Saipos.
CHAVE_CADASTRO = "id_customer"
CHAVE_PEDIDO = "id_sale"


def _ler(caminho: Path, chave: str) -> dict:
    """As linhas de um .jsonl indexadas pela chave. Linha ilegível é pulada com
    aviso — um arquivo meio corrompido ainda é melhor que nenhum."""
    if not caminho.exists():
        return {}
    fora = {}
    with caminho.open(encoding="utf-8") as f:
        for n, linha in enumerate(f, 1):
            linha = linha.strip()
            if not linha:
                continue
            try:
                reg = json.loads(linha)
            except json.JSONDecodeError:
                print(f"  [aviso] {caminho.name} linha {n} ilegivel, pulando")
                continue
            k = reg.get(chave)
            if k is not None:
                fora[k] = reg
    return fora


def _escrever(caminho: Path, registros: dict) -> None:
    """Grava pelo temporário e só então troca o arquivo bom pelo novo.

    Sem isso, uma queda no meio da escrita deixaria o arquivo pela metade — e
    como este é o backup, seria a pior hora possível para perder dado.
    """
    caminho.parent.mkdir(parents=True, exist_ok=True)
    tmp = caminho.with_suffix(caminho.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="\n") as f:
        for k in sorted(registros, key=lambda x: (str(type(x)), x)):
            f.write(json.dumps(registros[k], ensure_ascii=False) + "\n")
    tmp.replace(caminho)


def gravar_cadastros(loja: str, registros: list[dict], coletado_em: str) -> dict:
    """Funde os cadastros crus da coleta de hoje no arquivo da loja.

    O registro mais novo ganha, mas quem não veio hoje continua lá — é o que faz
    o arquivo lembrar de cliente que saiu da janela de 90 dias.
    """
    caminho = RAIZ / "cadastros" / f"{loja}.jsonl"
    antes = _ler(caminho, CHAVE_CADASTRO)
    novos = 0
    for r in registros:
        k = r.get(CHAVE_CADASTRO)
        if k is None:
            continue
        if k not in antes:
            novos += 1
        # `_visto` é nosso, não do Saipos: diz quando aquele cadastro apareceu
        # pela última vez numa coleta.
        antes[k] = {**r, "_visto": coletado_em}
    _escrever(caminho, antes)
    return {"total": len(antes), "novos": novos, "arquivo": caminho}


def gravar_pedidos(loja: str, pedidos: list[dict], por_cadastro: dict | None = None) -> dict:
    """Guarda os pedidos crus, um shard por mês de `data_pedido`.

    `por_cadastro` mapeia id_sale -> id_customer: o endpoint de vendas não diz de
    quem é o pedido, e sem isso o arquivo não permitiria refazer a base.
    """
    por_mes: dict[str, list] = {}
    for p in pedidos:
        data = str(p.get("data_pedido") or "")[:7]
        if len(data) != 7:
            continue
        por_mes.setdefault(data, []).append(p)

    novos = 0
    total = 0
    for mes, lote in sorted(por_mes.items()):
        caminho = RAIZ / "pedidos" / f"{loja}-{mes}.jsonl"
        antes = _ler(caminho, CHAVE_PEDIDO)
        mudou = False
        for p in lote:
            k = p.get(CHAVE_PEDIDO)
            if k is None or k in antes:
                continue
            reg = dict(p)
            if por_cadastro and k in por_cadastro:
                reg["_id_customer"] = por_cadastro[k]
            antes[k] = reg
            novos += 1
            mudou = True
        if mudou:
            _escrever(caminho, antes)
        total += len(antes)
    return {"total": total, "novos": novos, "meses": len(por_mes)}


def disponivel() -> bool:
    """A pasta do backup dá para escrever agora?

    O Drive pode estar desmontado (G: some quando o Drive não subiu). Nesse caso
    a coleta segue sem arquivar em vez de morrer — perder o backup de um dia é
    ruim, derrubar a coleta diária é pior.
    """
    try:
        RAIZ.mkdir(parents=True, exist_ok=True)
        return True
    except OSError as e:
        print(f"  [aviso] backup indisponivel ({RAIZ}): {e}")
        return False
