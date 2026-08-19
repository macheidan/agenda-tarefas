# -*- coding: utf-8 -*-
"""Puxa o histórico de pedidos de cada cliente e escreve a contagem por mês no
JSON da coleta (campo `meses` e `primeiraCompra`).

Por que existe: o `qtt_sales` da tela de clientes é o total do cadastro desde
sempre — ele NÃO respeita o filtro de período (medido: um cliente com 86 pedidos
aparece com 86 tanto na janela de 7 dias quanto na de 90). Sem saber em quanto
tempo os pedidos aconteceram não dá para falar em frequência, e coletar mês a mês
só diria QUEM comprou em cada mês, nunca quantas vezes.

O modal do cliente no Saipos ("Histórico de pedidos") usa dois endpoints, e são
esses que este script chama:

  customers/search/{id_customer}   -> o cadastro + `id_store_customer` da loja
  store_customers/list-customer-sales/{id_store_customer}  -> os pedidos, com data

Diferente do `find-all-customers`, esses aceitam URL montada na mão — desde que a
chamada saia de dentro da página, pelo `$http` do Angular, que já leva a sessão.

Custo medido: ~170 ms por cliente com CONCORRENCIA=8. A base inteira (6,5 mil)
leva de 18 a 37 min; o dia a dia leva segundos, porque só quem comprou desde a
última rodada precisa ser relido (`--novos-de`).

Uso:
    python coletar_historico.py data/clientes-2026-08-19.json
    python coletar_historico.py data/clientes-2026-08-19.json --novos-de data/clientes-2026-08-18.json
    python coletar_historico.py data/clientes-2026-08-19.json --limite 50   # teste
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coletar_clientes as cc  # noqa: E402  (login, troca de loja e abertura da tela)

sys.path.insert(0, r"C:\claude_project\Pizzarias\caixas-conferencia\coletores")
import saipos_acesso as sa  # noqa: E402

# 8 chamadas em voo foi o que rendeu melhor sem nenhum erro no piloto. Subir mais
# é bater na API do Saipos sem necessidade: a rodada diária é curta de qualquer jeito.
CONCORRENCIA = 8
MESES_GUARDADOS = 12

# Roda dentro da página: para cada cadastro, acha o vínculo com a loja e lista os
# pedidos. Devolve só as datas — é tudo o que a frequência precisa.
JS_LOTE = """async ([ids, idStore, concorrencia]) => {
  const $http = angular.element(document.body).injector().get('$http');
  const out = [];
  let i = 0;
  async function trabalhar() {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const busca = await $http.get(
          `https://api.saipos.com/v1/stores/${idStore}/customers/search/${id}?filter=${encodeURIComponent(
            JSON.stringify({ start_date: null, end_date: null })
          )}`
        );
        const cli = busca.data[0] || {};
        const vinculo = (cli.stores_customer || []).find((v) => v.id_store === idStore);
        if (!vinculo) { out.push({ id, datas: [] }); continue; }
        const vendas = await $http.get(
          `https://api.saipos.com/v1/store_customers/list-customer-sales/${vinculo.id_store_customer}` +
            `?data=${encodeURIComponent(JSON.stringify({ page: 1, rowsLimit: 1000 }))}&id_store=${idStore}`
        );
        out.push({ id, datas: (vendas.data || []).map((v) => v.data_pedido).filter(Boolean) });
      } catch (e) {
        out.push({ id, erro: String(e.status || e.message || e) });
      }
    }
  }
  await Promise.all(Array.from({ length: concorrencia }, trabalhar));
  return out;
}"""


def meses_recentes(hoje: date) -> list[str]:
    """Os MESES_GUARDADOS últimos meses, do atual para trás ("2026-08", ...)."""
    saida = []
    ano, mes = hoje.year, hoje.month
    for _ in range(MESES_GUARDADOS):
        saida.append(f"{ano:04d}-{mes:02d}")
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    return saida


def resumir(datas: list[str], janela: set[str]) -> dict:
    """Datas de pedido viram contagem por mês (só os meses guardados) + a data do
    primeiro pedido de todos, que é o que diz há quanto tempo o cliente é cliente."""
    por_mes = Counter(d[:7] for d in datas if d)
    return {
        "meses": {m: por_mes[m] for m in janela if por_mes.get(m)},
        "primeiraCompra": min((d[:10] for d in datas if d), default=""),
        "pedidosTotais": len(datas),
    }


def coletar_loja(page, id_store: str, clientes: list[dict], janela: set[str]) -> tuple[int, int]:
    """Preenche `meses`/`primeiraCompra` em cada cliente da lista. Devolve
    (clientes lidos, erros)."""
    # Um cliente pode ter vários cadastros: todos os ids vão juntos numa fila só,
    # e no fim as datas são somadas de volta no cliente.
    fila: list[int] = []
    dono: dict[int, list[dict]] = {}
    for c in clientes:
        for cid in c.get("ids") or ([c["id"]] if c.get("id") else []):
            if cid is None:
                continue
            fila.append(cid)
            dono.setdefault(cid, []).append(c)

    lidos = 0
    erros = 0
    t0 = time.time()
    LOTE = 200
    for i in range(0, len(fila), LOTE):
        pedaco = fila[i : i + LOTE]
        resposta = page.evaluate(JS_LOTE, [pedaco, int(id_store), CONCORRENCIA])
        for r in resposta:
            if r.get("erro"):
                erros += 1
                continue
            for c in dono.get(r["id"], ()):
                c.setdefault("_datas", []).extend(r.get("datas") or [])
        lidos += len(pedaco)
        feito = min(i + LOTE, len(fila))
        ritmo = (time.time() - t0) / max(1, feito)
        print(
            f"  {feito}/{len(fila)} cadastros · {ritmo * 1000:.0f} ms cada · "
            f"faltam ~{(len(fila) - feito) * ritmo / 60:.0f} min",
            flush=True,
        )

    for c in clientes:
        c.update(resumir(c.pop("_datas", []), janela))
    return lidos, erros


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("arquivo", help="JSON da coleta (data/clientes-*.json)")
    ap.add_argument("--novos-de", help="JSON da coleta anterior: relê só quem comprou desde então")
    ap.add_argument("--limite", type=int, help="teto de clientes por loja (teste)")
    ap.add_argument("--visivel", action="store_true", help="browser visivel (debug)")
    args = ap.parse_args()

    caminho = Path(args.arquivo)
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    janela = set(meses_recentes(date.today()))

    anterior: dict[str, dict] = {}
    if args.novos_de:
        antigo = json.loads(Path(args.novos_de).read_text(encoding="utf-8"))
        for loja, lista in antigo.get("lojas", {}).items():
            for c in lista:
                anterior[f"{loja}|{c['chave']}"] = c

    def salvar():
        """Grava o que já foi lido. Chamado depois de cada loja: são ~10 min de
        leitura por marca, e uma falha na segunda não pode apagar a primeira."""
        dados["historicoEm"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")

    sa.BROWSER_PROFILE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(sa.BROWSER_PROFILE),
            headless=not args.visivel,
            slow_mo=0,
            args=["--start-maximized"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            sa.garantir_login(page)
            for loja, lista in dados.get("lojas", {}).items():
                id_store = cc.LOJAS.get(loja)
                if not id_store:
                    continue
                # Quem não comprou nada desde a rodada anterior mantém o histórico
                # que já tinha: só o mês corrente muda, e ele muda sozinho.
                pendentes = []
                for c in lista:
                    velho = anterior.get(f"{loja}|{c['chave']}")
                    if velho and velho.get("meses") is not None and velho.get("ultimaCompra") == c.get("ultimaCompra"):
                        c["meses"] = {m: n for m, n in (velho.get("meses") or {}).items() if m in janela}
                        c["primeiraCompra"] = velho.get("primeiraCompra", "")
                        c["pedidosTotais"] = velho.get("pedidosTotais", 0)
                        continue
                    pendentes.append(c)
                if args.limite:
                    pendentes = pendentes[: args.limite]
                print(f"== {loja.upper()} (loja {id_store}) · {len(pendentes)} de {len(lista)} clientes a ler ==")
                if not pendentes:
                    continue
                cc.selecionar_loja(page, id_store)
                cc.abrir_tela_clientes(page)
                lidos, erros = coletar_loja(page, id_store, pendentes, janela)
                com_hist = sum(1 for c in lista if c.get("meses"))
                print(f"  {lidos} cadastros lidos, {erros} erros · {com_hist} clientes com histórico")
                salvar()
        finally:
            ctx.close()

    salvar()
    print(f"OK: {caminho}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
