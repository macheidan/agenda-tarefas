# -*- coding: utf-8 -*-
"""python -m unittest discover -s scripts/clientes -p "test_*.py"

O arquivo é o último lugar onde o dado do Saipos existe depois que a coleta o
reduz. As duas propriedades que os testes protegem: nunca perder um registro que
já foi guardado, e não duplicar quando a rotina rodar de novo no mesmo dia.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import arquivo  # noqa: E402


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._raiz = arquivo.RAIZ
        arquivo.RAIZ = Path(self.tmp.name)

    def tearDown(self):
        arquivo.RAIZ = self._raiz
        self.tmp.cleanup()

    def linhas(self, rel):
        caminho = Path(self.tmp.name) / rel
        if not caminho.exists():
            return []
        return [json.loads(x) for x in caminho.read_text(encoding="utf-8").splitlines() if x.strip()]


class Cadastros(Base):
    def test_guarda_o_registro_inteiro_como_veio(self):
        cru = {
            "id_customer": 1, "full_name": "Ana Souza", "cpf_cnpj": "12345678901",
            "address": "Porto Alegre, Bela Vista - Rua X, 10", "notes": "sem cebola",
            "financial_balance": 0, "medium_ticket": 88.5,
        }
        arquivo.gravar_cadastros("dame", [cru], "2026-08-19T04:10:00")
        (linha,) = self.linhas("cadastros/dame.jsonl")
        for campo, valor in cru.items():
            self.assertEqual(linha[campo], valor, f"campo {campo} perdido no arquivo")
        self.assertEqual(linha["_visto"], "2026-08-19T04:10:00")

    def test_quem_nao_veio_hoje_continua_no_arquivo(self):
        arquivo.gravar_cadastros("dame", [{"id_customer": 1, "full_name": "Ana"}], "2026-08-18T04:10:00")
        # No dia seguinte a Ana saiu da janela de 90 dias e só o Bruno vem.
        r = arquivo.gravar_cadastros("dame", [{"id_customer": 2, "full_name": "Bruno"}], "2026-08-19T04:10:00")
        ids = sorted(x["id_customer"] for x in self.linhas("cadastros/dame.jsonl"))
        self.assertEqual(ids, [1, 2], "o backup não pode esquecer quem saiu da janela")
        self.assertEqual(r["total"], 2)
        self.assertEqual(r["novos"], 1)

    def test_registro_atualizado_sobrescreve_a_versao_velha(self):
        arquivo.gravar_cadastros("dame", [{"id_customer": 1, "qtt_sales": 3}], "2026-08-18T04:10:00")
        arquivo.gravar_cadastros("dame", [{"id_customer": 1, "qtt_sales": 4}], "2026-08-19T04:10:00")
        linhas = self.linhas("cadastros/dame.jsonl")
        self.assertEqual(len(linhas), 1)
        self.assertEqual(linhas[0]["qtt_sales"], 4)
        self.assertEqual(linhas[0]["_visto"], "2026-08-19T04:10:00")

    def test_rodar_duas_vezes_nao_duplica(self):
        cru = [{"id_customer": 1}, {"id_customer": 2}]
        arquivo.gravar_cadastros("dame", cru, "2026-08-19T04:10:00")
        r = arquivo.gravar_cadastros("dame", cru, "2026-08-19T05:00:00")
        self.assertEqual(len(self.linhas("cadastros/dame.jsonl")), 2)
        self.assertEqual(r["novos"], 0)

    def test_lojas_nao_se_misturam(self):
        arquivo.gravar_cadastros("dame", [{"id_customer": 1}], "2026-08-19T04:10:00")
        arquivo.gravar_cadastros("lov", [{"id_customer": 9}], "2026-08-19T04:10:00")
        self.assertEqual([x["id_customer"] for x in self.linhas("cadastros/dame.jsonl")], [1])
        self.assertEqual([x["id_customer"] for x in self.linhas("cadastros/lov.jsonl")], [9])


class Pedidos(Base):
    def pedido(self, id_sale, data, **extra):
        return {
            "id_sale": id_sale, "data_pedido": data, "valor_pedido": 100.0,
            "pedido": "Super 45cm", "canal": "iFood", "forma_de_pagamento": "Pago Online iFood",
            **extra,
        }

    def test_separa_em_shard_por_mes_do_pedido(self):
        arquivo.gravar_pedidos("dame", [
            self.pedido(1, "2026-07-15T20:00:00.000Z"),
            self.pedido(2, "2026-08-02T20:00:00.000Z"),
        ])
        self.assertEqual(len(self.linhas("pedidos/dame-2026-07.jsonl")), 1)
        self.assertEqual(len(self.linhas("pedidos/dame-2026-08.jsonl")), 1)

    def test_pedido_ja_guardado_nao_entra_de_novo(self):
        p = self.pedido(1, "2026-08-02T20:00:00.000Z")
        arquivo.gravar_pedidos("dame", [p])
        r = arquivo.gravar_pedidos("dame", [p, self.pedido(2, "2026-08-03T20:00:00.000Z")])
        self.assertEqual(r["novos"], 1)
        self.assertEqual(len(self.linhas("pedidos/dame-2026-08.jsonl")), 2)

    def test_guarda_de_quem_e_o_pedido(self):
        # O endpoint de vendas não diz o cliente; sem isso não dá para refazer a
        # base a partir do arquivo.
        arquivo.gravar_pedidos("dame", [self.pedido(1, "2026-08-02T20:00:00.000Z")], {1: 4242})
        (linha,) = self.linhas("pedidos/dame-2026-08.jsonl")
        self.assertEqual(linha["_id_customer"], 4242)

    def test_produto_canal_e_pagamento_sobrevivem(self):
        arquivo.gravar_pedidos("dame", [self.pedido(1, "2026-08-02T20:00:00.000Z")])
        (linha,) = self.linhas("pedidos/dame-2026-08.jsonl")
        self.assertEqual(linha["pedido"], "Super 45cm")
        self.assertEqual(linha["canal"], "iFood")
        self.assertEqual(linha["forma_de_pagamento"], "Pago Online iFood")

    def test_pedido_sem_data_nao_entra(self):
        r = arquivo.gravar_pedidos("dame", [{"id_sale": 1, "data_pedido": None}])
        self.assertEqual(r["novos"], 0)


class Robustez(Base):
    def test_linha_corrompida_nao_leva_o_arquivo_junto(self):
        caminho = Path(self.tmp.name) / "cadastros" / "dame.jsonl"
        caminho.parent.mkdir(parents=True)
        caminho.write_text(
            '{"id_customer": 1, "full_name": "Ana"}\n{lixo\n{"id_customer": 2}\n',
            encoding="utf-8",
        )
        arquivo.gravar_cadastros("dame", [{"id_customer": 3}], "2026-08-19T04:10:00")
        ids = sorted(x["id_customer"] for x in self.linhas("cadastros/dame.jsonl"))
        self.assertEqual(ids, [1, 2, 3], "os registros legíveis têm de sobreviver")

    def test_nao_sobra_temporario_depois_de_gravar(self):
        arquivo.gravar_cadastros("dame", [{"id_customer": 1}], "2026-08-19T04:10:00")
        sobras = list((Path(self.tmp.name) / "cadastros").glob("*.tmp"))
        self.assertEqual(sobras, [])


if __name__ == "__main__":
    unittest.main()
