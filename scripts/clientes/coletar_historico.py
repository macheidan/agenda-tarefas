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
import arquivo  # noqa: E402  (backup permanente do dado cru)
import coletar_clientes as cc  # noqa: E402  (login, troca de loja e abertura da tela)

sys.path.insert(0, r"C:\claude_project\Pizzarias\caixas-conferencia\coletores")
import saipos_acesso as sa  # noqa: E402

# 8 chamadas em voo foi o que rendeu melhor sem nenhum erro no piloto. Subir mais
# é bater na API do Saipos sem necessidade: a rodada diária é curta de qualquer jeito.
CONCORRENCIA = 8
MESES_GUARDADOS = 12

# Roda dentro da página: para cada cadastro, acha o vínculo com a loja e lista os
# pedidos. Devolve data, valor e canal de cada um: a data dá a frequência, o valor
# dá a receita do mês (que de outro jeito seria estimada por ticket x pedidos) e o
# canal e a forma de pagamento vão para o arquivo permanente (arquivo.py).
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
        // O pedido volta INTEIRO: id_sale, numero_pedido_saipos, data, valor,
        // `pedido` (o produto), canal e forma de pagamento. São 222 bytes cada,
        // e é o que o arquivo permanente guarda — a frequência usa três campos,
        // o resto some se não for salvo aqui.
        out.push({ id, pedidos: (vendas.data || []).filter((v) => v.data_pedido) });
      } catch (e) {
        out.push({ id, erro: String((e && e.status) || (e && e.message) || e) });
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


def resumir(pedidos: list[dict], janela: set[str]) -> dict:
    """Pedidos viram contagem e valor por mês (só os meses guardados) + a data do
    primeiro pedido de todos, que é o que diz há quanto tempo o cliente é cliente.

    O valor por mês existe porque `valorTotal` do cadastro é o histórico inteiro:
    sem ele, "receita de julho" só sairia como ticket x pedidos, que erra sempre
    que o cliente pede coisas de tamanhos diferentes.
    """
    por_mes: Counter = Counter()
    valor_mes: dict[str, float] = {}
    canais: Counter = Counter()
    for p in pedidos:
        d = str(p.get("data_pedido") or "")[:10]
        if not d:
            continue
        m = d[:7]
        por_mes[m] += 1
        valor_mes[m] = valor_mes.get(m, 0.0) + (float(p.get("valor_pedido") or 0))
        if p.get("canal"):
            canais[p["canal"]] += 1
    return {
        "meses": {m: por_mes[m] for m in janela if por_mes.get(m)},
        "valorMeses": {m: round(valor_mes[m], 2) for m in janela if valor_mes.get(m)},
        "canais": dict(canais),
        "primeiraCompra": min(
            (str(p.get("data_pedido"))[:10] for p in pedidos if p.get("data_pedido")), default=""
        ),
        "pedidosTotais": len(pedidos),
    }


def cadastros(c: dict) -> tuple:
    """Os ids de cadastro do cliente, como conjunto ordenado."""
    return tuple(sorted(c.get("ids") or ([c["id"]] if c.get("id") else [])))


def aproveitavel(velho: dict, novo: dict) -> bool:
    """O histórico da rodada anterior serve para este cliente?

    Não serve quando está faltando (`meses` ausente) nem quando é obviamente
    falso: cadastro que o Saipos diz ter pedido, mas cujo histórico veio com
    zero, é chamada recusada gravada como se fosse cliente sem compra.
    """
    if velho.get("meses") is None:
        return False
    # O cliente ganhou (ou perdeu) um cadastro desde ontem — é o que acontece
    # quando o coletor religa o cadastro de marketplace ao de balcão. O histórico
    # antigo cobria só um dos dois e sairia pela metade.
    if cadastros(velho) != cadastros(novo):
        return False
    # Histórico da época em que só guardávamos datas: serve para a frequência,
    # mas não para a receita do mês. Relê uma vez e nunca mais.
    if velho.get("meses") and velho.get("valorMeses") is None:
        return False
    return not (velho.get("pedidosTotais", 0) == 0 and (novo.get("pedidos") or 0) > 0)


def coletar_loja(page, loja: str, id_store: str, clientes: list[dict], janela: set[str]) -> tuple[int, int]:
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

    # Todo pedido lido, cru, indexado por id_sale — é o que vai para o backup.
    crus: dict = {}
    de_quem: dict = {}
    lidos = 0
    falhados: set = set()
    motivos: Counter = Counter()
    t0 = time.time()
    LOTE = 200

    def rodar(ids: list, concorrencia: int) -> list:
        """Uma passada na lista. Devolve os ids que deram erro."""
        nonlocal lidos
        restantes = []
        for i in range(0, len(ids), LOTE):
            pedaco = ids[i : i + LOTE]
            resposta = page.evaluate(JS_LOTE, [pedaco, int(id_store), concorrencia])
            for r in resposta:
                if r.get("erro"):
                    restantes.append(r["id"])
                    motivos[r["erro"]] += 1
                    continue
                for p in r.get("pedidos") or []:
                    if p.get("id_sale") is not None:
                        crus[p["id_sale"]] = p
                        de_quem[p["id_sale"]] = r["id"]
                for c in dono.get(r["id"], ()):
                    c.setdefault("_pedidos", []).extend(r.get("pedidos") or [])
            lidos += len(pedaco)
            feito = min(i + LOTE, len(ids))
            ritmo = (time.time() - t0) / max(1, lidos)
            print(
                f"  {feito}/{len(ids)} cadastros · {ritmo * 1000:.0f} ms cada · "
                f"faltam ~{(len(ids) - feito) * ritmo / 60:.0f} min",
                flush=True,
            )
        return restantes

    restantes = rodar(fila, CONCORRENCIA)
    # A API do Saipos começa a recusar quando a rodada é longa (a Lov, logo
    # depois da Dáme, chegou a recusar 1.7 mil chamadas). Insistir devagar
    # resolve — o que não dá é gravar "sem pedidos" para quem só levou não.
    for tentativa in range(2):
        if not restantes:
            break
        pausa = 30 * (tentativa + 1)
        print(f"  {len(restantes)} recusados · esperando {pausa}s e tentando de novo mais devagar", flush=True)
        time.sleep(pausa)
        restantes = rodar(restantes, 2)
    falhados = set(restantes)

    for c in clientes:
        pedidos = c.pop("_pedidos", [])
        ids_do_cliente = c.get("ids") or ([c["id"]] if c.get("id") else [])
        if any(cid in falhados for cid in ids_do_cliente):
            # Fica sem histórico de propósito: a próxima rodada tenta de novo.
            c.pop("meses", None)
            continue
        c.update(resumir(pedidos, janela))
    if motivos:
        print("  recusas por motivo:", dict(motivos.most_common(4)))
    if crus and arquivo.disponivel():
        r = arquivo.gravar_pedidos(loja, list(crus.values()), de_quem)
        print(f"  arquivo: {r['novos']} pedidos novos guardados ({r['total']} nos meses tocados)")
    return lidos, len(falhados)


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
                    if velho and aproveitavel(velho, c) and velho.get("ultimaCompra") == c.get("ultimaCompra"):
                        c["meses"] = {m: n for m, n in (velho.get("meses") or {}).items() if m in janela}
                        c["valorMeses"] = {m: v for m, v in (velho.get("valorMeses") or {}).items() if m in janela}
                        c["canais"] = velho.get("canais") or {}
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
                lidos, erros = coletar_loja(page, loja, id_store, pendentes, janela)
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
