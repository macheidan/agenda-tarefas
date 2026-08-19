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

// Janela da frequência: 6 meses. Menos que isso, quem pede uma vez por mês vira
// ruído; mais, e a conta demora a reagir a quem mudou de hábito.
const MESES_FREQUENCIA = 6;

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

/** Rótulos "YYYY-MM" do mês de hoje e dos 5 anteriores. */
function ultimosSeisMeses(hoje) {
  const saida = [];
  for (let i = 0; i < MESES_FREQUENCIA; i += 1) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    saida.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return saida;
}

/**
 * Frequência de compra: pedidos por mês nos últimos 6 meses.
 *
 * O denominador não é 6 fixo. O mês corrente está pela metade (conta como
 * fração) e cliente novo não pode ser punido por não ter passado: quem comprou
 * pela primeira vez há 20 dias é medido contra o tempo que ele tem de casa. O
 * piso de 1 mês existe para o cliente de ontem não aparecer com "30 pedidos por
 * mês" por ter comprado uma vez.
 *
 * Sem `hm` (histórico ainda não coletado) devolve null — a tela mostra "—" em
 * vez de inventar número.
 */
function frequencia(hm, primeiraCompra, hoje) {
  if (!hm) return { pedidos6m: null, frequencia: null, intervaloDias: null };
  const meses = ultimosSeisMeses(hoje);
  const pedidos6m = meses.reduce((s, m) => s + (hm[m] || 0), 0);

  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  let mesesObservados = MESES_FREQUENCIA - 1 + hoje.getDate() / diasNoMes;
  if (primeiraCompra) {
    const [a, m, d] = primeiraCompra.split('-').map(Number);
    const desde = (hoje - new Date(a, (m || 1) - 1, d || 1)) / 86400000 / 30.44;
    mesesObservados = Math.min(mesesObservados, desde);
  }
  mesesObservados = Math.max(1, mesesObservados);

  const freq = pedidos6m / mesesObservados;
  return {
    pedidos6m,
    frequencia: freq,
    intervaloDias: freq > 0 ? 30.44 / freq : null,
  };
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

  // Uma referência de tempo por render, não uma por cliente.
  const hoje = useMemo(() => new Date(), []);

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
          primeiraCompra: item.pc || '',
          ...frequencia(item.hm, item.pc, hoje),
        });
      }
    }
    return lista;
  }, [docs, hoje]);

  return { clientes, meta, loading, error };
}
