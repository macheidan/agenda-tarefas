import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { pedidoId } from '../lib/suprimentos';

// Pedidos congelados no clique de "+ Copiar" (`comprasPedidos`).
//
// POR QUE ISSO EXISTE: a quantidade do pedido mora no próprio item do catálogo
// (`comprasItens.qty`), que é um campo VIVO — sem histórico, sem loja, e que o
// botão Zerar apaga. Sem congelar no momento do Copiar, o pedido que o gerente
// mandou pro vendedor simplesmente não existe em lugar nenhum, e não há o que
// conferir contra a nota fiscal.
//
// Um doc por dia × loja × fornecedor. Recopiar o mesmo pedido no mesmo dia
// sobrescreve — é correção, não pedido novo.

/**
 * Grava (ou sobrescreve) os pedidos de um clique de Copiar. Um clique em
 * "Todos" gera um pedido por fornecedor que tinha item marcado.
 *
 * Falha aqui NÃO pode atrapalhar o Copiar: quem chama trata o erro em silêncio,
 * porque copiar o texto pro WhatsApp é a função principal da tela.
 */
export async function salvarPedidos(pedidos) {
  if (!pedidos?.length) return 0;
  const batch = writeBatch(db);
  for (const p of pedidos) {
    const id = pedidoId(p.data, p.lojaId, p.fornecedorId);
    batch.set(doc(db, 'comprasPedidos', id), { ...p, createdAt: Timestamp.now() });
  }
  await batch.commit();
  return pedidos.length;
}

/**
 * Pedidos a partir de uma data ('YYYY-MM-DD'), mais novos primeiro.
 *
 * A janela é obrigatória de propósito: a coleção cresce ~17 docs por semana e
 * ouvir tudo queimaria leitura à toa (o projeto vive no free tier do Firestore).
 * `desde` vazio não abre listener nenhum.
 */
export function useComprasPedidos(desde) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!desde) return undefined;
    const ref = collection(db, 'comprasPedidos');
    const trata = (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => String(b.data).localeCompare(String(a.data)));
      setPedidos(docs);
      setLoading(false);
      setError(null);
    };
    // Fallback de índice: `where` + `orderBy` no mesmo campo não exige índice
    // composto, mas se o Firestore reclamar, refaz sem ordenar (a ordenação
    // client-side acima já cobre).
    const unsub = onSnapshot(
      query(ref, where('data', '>=', desde), orderBy('data', 'desc')),
      trata,
      (err) => {
        console.error('[compras-pedidos] erro ao ouvir pedidos:', err);
        setError(err?.message || String(err));
        setLoading(false);
      }
    );
    return unsub;
  }, [desde]);

  // Sem janela não há listener — a resposta vazia é derivada, não estado (evita
  // setState dentro do efeito e o flash de "carregando" ao trocar de período).
  return desde ? { pedidos, loading, error } : { pedidos: [], loading: false, error: null };
}
