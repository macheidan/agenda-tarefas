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
 * clientes em `itens: [{t,n,p,u}]` (telefone, nome, pedidos, última compra) e
 * `clientes/{loja}_meta` guarda o resumo da última coleta. Assim a tela custa
 * ~10 leituras em vez de ~10 mil.
 *
 * O hook devolve a lista já achatada e desmontada em campos com nome inteiro.
 */
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
        if (!item?.t) continue;
        lista.push({
          loja: d.loja,
          telefone: item.t,
          nome: item.n || '',
          pedidos: item.p || 0,
          ultimaCompra: item.u || '',
        });
      }
    }
    return lista;
  }, [docs]);

  return { clientes, meta, loading, error };
}
