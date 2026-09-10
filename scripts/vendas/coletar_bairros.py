# -*- coding: utf-8 -*-
"""Coleta as vendas por área de entrega (bairro) no Saipos, mês a mês.

Fonte: relatório `sales-by-store-district` ("Vendas por bairro"), que é o ÚNICO
lugar com essa quebra por período — a coleção `clientes` tem bairro mas só
enxerga 90 dias e conta cliente, não pedido; e o backup do Saipos guarda o
pedido sem o bairro.

O relatório é AngularJS: os números saem do scope do controller (`vm`), não do
texto da tela — a tabela é paginada e o texto viria truncado. A navegação
reusa a maquinaria já validada do coletor do Dash (`scripts/dash/saipos_vendas.py`):
login com 2FA, seleção de loja por ID e `abrir_relatorio`, que só volta quando
a API respondeu pelo período pedido (sem isso o Saipos segue mostrando o
resultado da busca anterior e o número entra no JSON como se fosse do mês certo).

Um mês por busca, as duas lojas na mesma sessão de browser: ~15 s por mês, então
o histórico inteiro (jan/2024 → ago/2026, 32 meses × 2 lojas) leva ~20 min. A
rotina mensal roda um mês só e leva segundos.

RODAR SÓ NA MADRUGADA — como todo coletor de Saipos daqui. O Saipos aceita uma
sessão por usuário: com o PC da loja aberto (a partir das 18h), o login daqui
pergunta "este usuário já está conectado em outro computador, deseja
desconectá-lo?", derruba a loja, a loja reconecta sozinha e derruba a gente. O
sintoma não é erro de login: o app carrega pela metade (`mactrl.firebaseReady`
fica falso, a tela do relatório nunca monta) e a coleta morre em "campos de
data não apareceram". Medido em 09/09/2026, ~21h.

Uso:
    python coletar_bairros.py                          # mês passado, as 2 lojas
    python coletar_bairros.py --de 2024-01 --ate 2026-08
    python coletar_bairros.py --de 2026-08 --ate 2026-08 --loja DAME
    python coletar_bairros.py --de 2026-08 --ate 2026-08 --descobrir  # dump do scope

Saída: scripts/vendas/data/bairros-<AAAA-MM-DD>.json, que
`importar_bairros.mjs` sobe para a coleção `vendas_bairros`.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from calendar import monthrange
from datetime import date, datetime
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dash"))
import saipos_vendas as sv  # noqa: E402  (login, troca de loja e abrir_relatorio)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
URL_DISTRITOS = "https://conta.saipos.com/#/app/report/sales-by-store-district"
SLUG = "sales-by-store-district"

# Nome da loja no config do Dash (DAME/LOV) → marca na intranet (dame/lov).
MARCA = {"DAME": "dame", "LOV": "lov"}

# Lê o resultado do relatório direto do scope do Angular. O controller guarda a
# lista em uma propriedade de `vm` cujo nome muda entre versões do Saipos, então
# a busca é pelo FORMATO: um array de objetos com um campo de bairro (district /
# neighborhood / bairro) e algum total. Assim uma renomeação do Saipos não
# quebra a coleta em silêncio — ou casa, ou o mês vem vazio e aparece no log.
JS_RESULTADO = r"""() => {
  const norm = (s) => (s || '').toString().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').toLowerCase();
  const ehBairro = (k) => /district|neighborhood|bairro/i.test(k);
  const ehQtd    = (k) => /(qtt|qty|quantidade|count|total_sales|sales|pedidos|orders)/i.test(k);
  const ehValor  = (k) => /(value|valor|amount|total_value|revenue)/i.test(k);

  const candidatos = [];
  for (const el of document.querySelectorAll('[ng-repeat]')) {
    let vm;
    try { vm = angular.element(el).scope().vm; } catch (e) { continue; }
    if (!vm) continue;
    for (const chave of Object.keys(vm)) {
      const v = vm[chave];
      if (!Array.isArray(v) || !v.length || typeof v[0] !== 'object' || v[0] === null) continue;
      const campos = Object.keys(v[0]);
      if (!campos.some(ehBairro)) continue;
      candidatos.push({ chave, campos, linhas: v });
    }
    if (candidatos.length) break;
  }
  if (!candidatos.length) return null;

  // O maior array com campo de bairro é a tabela do relatório (os outros são
  // filtros: lista de bairros cadastrados, seleção de lojas...).
  candidatos.sort((a, b) => b.linhas.length - a.linhas.length);
  const alvo = candidatos[0];
  const cBairro = alvo.campos.find(ehBairro);
  const cQtd    = alvo.campos.find(ehQtd);
  const cValor  = alvo.campos.find(ehValor);

  return {
    chave: alvo.chave, campos: alvo.campos,
    usando: { bairro: cBairro, qtd: cQtd, valor: cValor },
    linhas: alvo.linhas.map((l) => ({
      bairro: (l[cBairro] || '').toString().trim(),
      pedidos: Number(cQtd ? l[cQtd] : 0) || 0,
      valor: Number(cValor ? l[cValor] : 0) || 0,
    })).filter((l) => l.bairro),
  };
}"""


def meses(de: str, ate: str) -> list[str]:
    """['2024-01', '2024-02', ...] inclusive nas duas pontas."""
    ano, mes = (int(x) for x in de.split("-"))
    fim_ano, fim_mes = (int(x) for x in ate.split("-"))
    saida = []
    while (ano, mes) <= (fim_ano, fim_mes):
        saida.append(f"{ano:04d}-{mes:02d}")
        mes += 1
        if mes == 13:
            ano, mes = ano + 1, 1
    return saida


def mes_passado(hoje: date) -> str:
    ano, mes = (hoje.year, hoje.month - 1) if hoje.month > 1 else (hoje.year - 1, 12)
    return f"{ano:04d}-{mes:02d}"


def limites(ano_mes: str) -> tuple[date, date]:
    ano, mes = (int(x) for x in ano_mes.split("-"))
    return date(ano, mes, 1), date(ano, mes, monthrange(ano, mes)[1])


def linhas_do_texto(texto: str) -> list[dict]:
    """Fallback: lê a tabela pelo texto da tela quando o scope não casou.

    Vale como rede de segurança (o Saipos renomeia campo do controller sem
    avisar), não como caminho principal: a tabela é paginada, então o texto só
    traz a primeira página. Formato de linha: "Bairro<TAB>12<TAB>R$ 1.234,56".
    """
    linhas = []
    for m in re.finditer(r"^([^\t\n]+)\t(\d[\d.]*)\tR\$\s*([\d.,]+)", texto, re.MULTILINE):
        nome = m.group(1).strip()
        if not nome or nome.upper() in ("BAIRRO", "TOTAL"):
            continue
        try:
            linhas.append({
                "bairro": nome,
                "pedidos": int(m.group(2).replace(".", "")),
                "valor": float(m.group(3).replace(".", "").replace(",", ".")),
            })
        except ValueError:
            continue
    return linhas


# Quando nada casa, o mês guarda no JSON o que a tela tinha — é o que evita
# gastar outra madrugada só pra descobrir o nome do campo.
def diagnostico(page) -> dict:
    try:
        chaves = page.evaluate(r"""() => {
          const out = [];
          for (const el of document.querySelectorAll('[ng-repeat]')) {
            let vm; try { vm = angular.element(el).scope().vm; } catch (e) { continue; }
            if (!vm) continue;
            for (const k of Object.keys(vm)) {
              const v = vm[k];
              if (Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0])
                out.push({ chave: k, n: v.length, campos: Object.keys(v[0]) });
            }
            if (out.length) break;
          }
          return out;
        }""")
    except Exception as e:
        chaves = f"ERRO {e}"
    try:
        texto = page.locator("body").inner_text(timeout=5000)[:3000]
    except Exception as e:
        texto = f"ERRO {e}"
    # Os campos da tela entram junto porque a outra falha possível é o filtro
    # deste relatório não ser o par de inputs `dateString` que o `abrir_relatorio`
    # sabe preencher — e aí o log só diria "campos de data não apareceram".
    try:
        campos = page.evaluate(
            """() => ({
              inputs: [...document.querySelectorAll('input')].map(
                (i) => `${i.getAttribute('ng-model') || '?'}|${i.getAttribute('placeholder') || ''}`),
              selects: [...document.querySelectorAll('select')].map((s) => s.getAttribute('ng-model')),
              botoes: [...document.querySelectorAll('button')].map(
                (b) => `${(b.innerText || '').trim()}|${b.getAttribute('ng-click') || ''}`).slice(0, 30),
            })"""
        )
    except Exception as e:
        campos = f"ERRO {e}"
    return {"scope": chaves, "texto": texto, "tela": campos}


def coletar_mes(page, id_store: str, ano_mes: str, descobrir: bool = False) -> tuple[list[dict], dict | None]:
    d1, d2 = limites(ano_mes)
    sv.abrir_relatorio(page, d1, URL_DISTRITOS, SLUG, dia_fim=d2, id_store=id_store)
    page.wait_for_timeout(1500)
    resultado = page.evaluate(JS_RESULTADO)
    if descobrir:
        print(f"   scope: {json.dumps(resultado, ensure_ascii=False)[:1200]}", flush=True)
    if resultado and resultado["linhas"]:
        return resultado["linhas"], None

    texto = page.locator("body").inner_text(timeout=5000)
    linhas = linhas_do_texto(texto)
    if linhas:
        print("   (scope não casou — lido do texto da tela, pode faltar página)", flush=True)
        return linhas, None
    return [], diagnostico(page)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--de", help="primeiro mês (AAAA-MM); padrão: mês passado")
    ap.add_argument("--ate", help="último mês (AAAA-MM); padrão: igual ao --de")
    ap.add_argument("--loja", help="DAME ou LOV (padrão: as duas)")
    ap.add_argument("--descobrir", action="store_true",
                    help="imprime o que foi lido do scope (checagem de campo)")
    ap.add_argument("--headless", action="store_true")
    args = ap.parse_args()

    de = args.de or mes_passado(date.today())
    ate = args.ate or de
    lista = meses(de, ate)

    cfg = sv.load_cfg()
    lojas = {args.loja.upper(): cfg["lojas"][args.loja.upper()]} if args.loja else dict(cfg["lojas"])
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n=== Vendas por bairro — {de} a {ate} ({len(lista)} meses × {len(lojas)} lojas) ===\n")
    registros = []
    falhas = []
    diagnosticos = []
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=cfg["profile_dir"],
            headless=args.headless,
            slow_mo=200,
            args=["--start-maximized"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        sv.monitorar(page)
        sv.garantir_login(page, cfg)

        for loja, id_store in lojas.items():
            sv.selecionar_loja(page, loja, id_store)
            for ano_mes in lista:
                try:
                    linhas, diag = coletar_mes(page, id_store, ano_mes, args.descobrir)
                except Exception as e:  # um mês ruim não derruba a coleta inteira
                    print(f"  {loja} {ano_mes}: FALHOU ({type(e).__name__} {e})", flush=True)
                    falhas.append(f"{loja} {ano_mes}")
                    if not diagnosticos:
                        diagnosticos.append({"loja": loja, "ano_mes": ano_mes,
                                             "erro": f"{type(e).__name__} {e}", **diagnostico(page)})
                    continue
                if diag and not diagnosticos:
                    # Só o primeiro: são 64 meses e o diagnóstico é o mesmo.
                    diagnosticos.append({"loja": loja, "ano_mes": ano_mes, **diag})
                pedidos = sum(l["pedidos"] for l in linhas)
                valor = sum(l["valor"] for l in linhas)
                print(f"  {loja} {ano_mes}: {len(linhas)} bairros · {pedidos} pedidos · "
                      f"R$ {valor:,.2f}".replace(",", "."), flush=True)
                registros.append({"marca": MARCA[loja], "ano_mes": ano_mes, "bairros": linhas})
        ctx.close()

    saida = DATA_DIR / f"bairros-{date.today().isoformat()}.json"
    saida.write_text(json.dumps({
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "de": de, "ate": ate,
        "falhas": falhas,
        "diagnostico": diagnosticos,
        "meses": registros,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n✓ {saida.name} — {len(registros)} meses"
          + (f" · {len(falhas)} falhas: {', '.join(falhas)}" if falhas else ""))


if __name__ == "__main__":
    main()
