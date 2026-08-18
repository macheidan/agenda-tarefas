import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Base de clientes das lojas (coleção `clientes`), alimentada de madrugada por
 * scripts/clientes/coletar_clientes.py + importar_clientes.mjs (Admin SDK).
 * Só leitura no cliente — as firestore.rules barram qualquer escrita.
 *
 * A coleção NÃO é um doc por cliente: são milhares e a tela precisa de todos
 * de uma vez. Cada doc `clientes/{loja}_{n}` carrega um bloco de até 800
 * clientes com campos de uma letra (`k` chave, `t` telefone, `n` nome, `p`
 * pedidos, `u` última compra, `v` valor total, `b` bairro, `c` cidade, `x`
 * cancelados, `o` origem do telefone, `a` aniversário, `e` e-mail) e
 * `clientes/{loja}_meta` guarda o resumo da última coleta. Assim a tela custa
 * ~10 leituras em vez de ~10 mil.
 *
 * O hook devolve a lista já achatada e desmontada em campos com nome inteiro.
 *
 * Nem todo cliente tem telefone: mais da metade da base vem de marketplace, que
 * entrega nome, endereço e CPF mas mascara o telefone. Esses contam em
 * faturamento, recência e bairro, e `podeReceber` é o que separa quem dá para
 * incluir numa campanha de WhatsApp.
 */
// Campanha só para telefone do Rio Grande do Sul: as duas lojas entregam em
// Porto Alegre, então DDD de fora é turista, pedido de viagem ou erro de
// digitação. Espelha DDD_RS de scripts/clientes/coletar_clientes.py.
const DDD_RS = new Set(['51', '53', '54', '55']);

/** DDD do número, tirando o 55 do país quando ele vem junto. O DDD 55 (Santa
 *  Maria) é o caso ambíguo — por isso a decisão é pelo comprimento. */
function ddd(tel) {
  const t = String(tel || '');
  return (t.length >= 12 && t.startsWith('55') ? t.slice(2) : t).slice(0, 2);
}
// Conectivos que ficam minúsculos no meio do nome ("Maria da Silva").
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'la']);

/**
 * Arruma a caixa do nome vindo do Saipos — lá o cadastro é digitado no balcão e
 * vem "ADEMAR" ou "joão da silva". Só mexe em quem está TODO em maiúsculo ou
 * TODO em minúsculo: nome já digitado com caixa mista fica como está, senão a
 * regra estragaria coisas como "Ana McDonald".
 *
 * É correção de exibição, não de dado: o Firestore continua guardando o nome
 * como o Saipos mandou.
 */
export function arrumarCaixa(nome) {
  const n = String(nome || '').trim();
  if (!n || !/\p{L}/u.test(n)) return n;
  const soMaiuscula = n === n.toUpperCase();
  const soMinuscula = n === n.toLowerCase();
  if (!soMaiuscula && !soMinuscula) return n;
  return n
    .toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, antes, letra) => antes + letra.toUpperCase())
    .replace(/\s(\p{L}+)/gu, (todo, palavra) =>
      CONECTIVOS.has(palavra.toLowerCase()) ? ` ${palavra.toLowerCase()}` : todo
    );
}

/** Só o primeiro nome — é assim que a mensagem chama a pessoa ("Oi, Mauro").
 *  A vírgula sai antes do corte: o Saipos tem nome cadastrado como "Silva,
 *  João", e sem isso o primeiro pedaço iria com vírgula colada. */
export function primeiroNome(nome) {
  return String(nome || '').replace(/,/g, ' ').trim().split(/\s+/)[0] || '';
}

export function useClientes() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'clientes'),
      (snapshot) => {
        setDocs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore clientes error:', err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // Um doc de meta por loja: quando a coleta rodou e quantos clientes tem.
  const meta = useMemo(() => {
    const out = {};
    for (const d of docs) {
      if (d.meta === true && d.loja) out[d.loja] = d;
    }
    return out;
  }, [docs]);

  const clientes = useMemo(() => {
    const lista = [];
    for (const d of docs) {
      if (d.meta === true || !Array.isArray(d.itens)) continue;
      for (const item of d.itens) {
        if (!item) continue;
        const telefone = item.t || '';
        const pedidos = item.p || 0;
        const valorTotal = item.v || 0;
        lista.push({
          loja: d.loja,
          chave: item.k || `t:${telefone}`,
          telefone,
          nome: arrumarCaixa(item.n),
          pedidos,
          ultimaCompra: item.u || '',
          valorTotal,
          // Ticket é derivado, não gravado: v/p muda sozinho a cada coleta.
          ticket: pedidos ? valorTotal / pedidos : 0,
          bairro: item.b || '',
          cidade: item.c || '',
          cancelados: item.x || 0,
          aniversario: item.a || '',
          email: item.e || '',
          telefoneOrigem: item.o || '',
          podeReceber: !!telefone && DDD_RS.has(ddd(telefone)),
        });
      }
    }
    return lista;
  }, [docs]);

  return { clientes, meta, loading, error };
}
