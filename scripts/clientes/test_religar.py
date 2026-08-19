# -*- coding: utf-8 -*-
"""python -m unittest discover -s scripts/clientes -p "test_*.py"

O que se testa aqui é o erro que não pode acontecer: dar a uma pessoa o telefone
de OUTRA. Um religamento errado não fica só feio na tela — o cadastro passa a
receber campanha de WhatsApp em nome de quem não é.

As duas regras novas (nome+bairro e logradouro) existem porque as antigas quase
nunca casam: só ~9% de quem tem telefone informa CPF (contra 90% de quem não
tem), e o texto do endereço vem escrito diferente em cada canal — o iFood manda
"R. Barão de Ubá", o balcão manda "Rua Barão de Ubá".
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coletar_clientes as cc  # noqa: E402


def cad(nome, telefone="", bairro="Petrópolis", endereco=None, cpf=""):
    """Um item já preparado, do jeito que `preparar()` devolve."""
    ends = [endereco] if endereco else []
    return {
        "id": abs(hash((nome, telefone, endereco))) % 10**8,
        "ids": [1],
        "nome": nome,
        "telefone": telefone,
        "telefoneOrigem": "cadastro" if telefone else "",
        "cpf": cpf,
        "bairro": bairro,
        "endereco": endereco or "",
        "enderecos": [cc.normalizar(e) for e in ends],
        "enderecos_originais": ends,
        "pedidos": 1,
        "valorTotal": 100.0,
        "cancelados": 0,
        "ultimaCompra": "2026-08-18",
    }


class Logradouro(unittest.TestCase):
    def test_abreviacao_do_tipo_nao_muda_a_chave(self):
        a = "Porto Alegre, Bela Vista - R. Barão de Ubá, 382, 1201"
        b = "Porto Alegre, Bela Vista - Rua Barão de Ubá, 382, Apt 1201"
        self.assertEqual(cc.logradouro(a), cc.logradouro(b))
        self.assertEqual(cc.logradouro(a), "barao de uba#382")

    def test_numero_diferente_e_endereco_diferente(self):
        a = "Porto Alegre, Bela Vista - R. Barão de Ubá, 382, 1201"
        b = "Porto Alegre, Bela Vista - R. Barão de Ubá, 384, 1201"
        self.assertNotEqual(cc.logradouro(a), cc.logradouro(b))

    def test_endereco_sem_numero_nao_vira_chave(self):
        self.assertEqual(cc.logradouro("Porto Alegre, Centro - Rua Sem Numero"), "")
        self.assertEqual(cc.logradouro(""), "")


class NomesCompativeis(unittest.TestCase):
    def test_primeiro_nome_isolado_casa_com_o_completo(self):
        self.assertTrue(cc.nomes_compativeis("Amanda", "Amanda Gewehr"))

    def test_mesmo_primeiro_nome_com_sobrenomes_diferentes_nao_casa(self):
        self.assertFalse(cc.nomes_compativeis("Amanda Gewehr", "Amanda Silva"))

    def test_primeiro_nome_diferente_nunca_casa(self):
        self.assertFalse(cc.nomes_compativeis("Amanda Gewehr", "Bruna Gewehr"))

    def test_acento_e_caixa_nao_atrapalham(self):
        self.assertTrue(cc.nomes_compativeis("JOÃO DA SILVA", "joao da silva"))


class ReligarPorNomeEBairro(unittest.TestCase):
    def test_mesmo_nome_completo_no_mesmo_bairro_recebe_o_telefone(self):
        itens = [
            cad("Marisiana Battistella", telefone="51999990000", bairro="Petrópolis"),
            cad("Marisiana Battistella", bairro="Petrópolis"),
        ]
        contas = cc.religar(itens)
        self.assertEqual(itens[1]["telefone"], "51999990000")
        self.assertEqual(itens[1]["telefoneOrigem"], "nome_bairro")
        self.assertEqual(contas["nome_bairro"], 1)

    def test_bairro_diferente_nao_religa(self):
        itens = [
            cad("Mauricio David", telefone="51999990000", bairro="Petrópolis"),
            cad("Mauricio David", bairro="Guarujá"),
        ]
        cc.religar(itens)
        self.assertEqual(itens[1]["telefone"], "")

    def test_nome_de_uma_palavra_nunca_religa_por_bairro(self):
        # "Amanda" em Petrópolis não identifica ninguém: são mil clientes lá.
        itens = [
            cad("Amanda", telefone="51999990000", bairro="Petrópolis"),
            cad("Amanda", bairro="Petrópolis"),
        ]
        cc.religar(itens)
        self.assertEqual(itens[1]["telefone"], "")

    def test_dois_telefones_para_o_mesmo_nome_barram_o_religamento(self):
        # Homônimos no mesmo bairro: não dá para saber de quem é o telefone.
        itens = [
            cad("Ana Silva", telefone="51999990000", bairro="Petrópolis"),
            cad("Ana Silva", telefone="51888880000", bairro="Petrópolis"),
            cad("Ana Silva", bairro="Petrópolis"),
        ]
        cc.religar(itens)
        self.assertEqual(itens[2]["telefone"], "")


class ReligarPorLogradouro(unittest.TestCase):
    BELA = "Porto Alegre, Bela Vista - Rua Barão de Ubá, 382, 1201"
    BELA_IFOOD = "Porto Alegre, Bela Vista - R. Barão de Ubá, 382, 1201"

    def test_mesma_porta_e_nome_compativel_recebe_o_telefone(self):
        itens = [
            cad("Amanda Gewehr", telefone="51999990000", endereco=self.BELA),
            cad("Amanda", endereco=self.BELA_IFOOD),
        ]
        contas = cc.religar(itens)
        self.assertEqual(itens[1]["telefone"], "51999990000")
        self.assertEqual(itens[1]["telefoneOrigem"], "logradouro")
        self.assertEqual(contas["logradouro"], 1)

    def test_vizinho_de_predio_com_outro_nome_nao_recebe_nada(self):
        # É o erro que a regra do endereço sozinho cometeria: 551 cadastros da
        # Dáme casam o logradouro e só 42 são a mesma pessoa.
        itens = [
            cad("Amanda Gewehr", telefone="51999990000", endereco=self.BELA),
            cad("Bruno Kaufmann", endereco=self.BELA_IFOOD),
        ]
        cc.religar(itens)
        self.assertEqual(itens[1]["telefone"], "")

    def test_dois_moradores_com_o_mesmo_primeiro_nome_barram(self):
        itens = [
            cad("Joao Pereira", telefone="51999990000", endereco=self.BELA),
            cad("Joao Muller", telefone="51888880000", endereco=self.BELA),
            cad("Joao", endereco=self.BELA_IFOOD),
        ]
        cc.religar(itens)
        self.assertEqual(itens[2]["telefone"], "")


class OrdemDasRegras(unittest.TestCase):
    def test_cpf_ganha_de_nome_e_bairro(self):
        itens = [
            cad("Ana Souza", telefone="51900000001", bairro="Petrópolis", cpf="11122233344"),
            cad("Ana Souza", telefone="51900000002", bairro="Bela Vista"),
            cad("Ana Souza", bairro="Bela Vista", cpf="11122233344"),
        ]
        cc.religar(itens)
        # O CPF aponta para o primeiro; o nome+bairro apontaria para o segundo.
        self.assertEqual(itens[2]["telefone"], "51900000001")
        self.assertEqual(itens[2]["telefoneOrigem"], "cpf")

    def test_quem_ja_tem_telefone_nunca_e_tocado(self):
        itens = [
            cad("Ana Souza", telefone="51900000001", bairro="Petrópolis"),
            cad("Ana Souza", telefone="51900000002", bairro="Petrópolis"),
        ]
        cc.religar(itens)
        self.assertEqual(itens[1]["telefone"], "51900000002")
        self.assertEqual(itens[1]["telefoneOrigem"], "cadastro")

    def test_ninguem_com_telefone_significa_ninguem_religado(self):
        itens = [cad("Ana Souza", bairro="Petrópolis"), cad("Ana Souza", bairro="Petrópolis")]
        contas = cc.religar(itens)
        self.assertEqual(sum(contas.values()), 0)
        self.assertTrue(all(not i["telefone"] for i in itens))


if __name__ == "__main__":
    unittest.main()
