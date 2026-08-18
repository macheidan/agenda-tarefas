import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Campanhas de WhatsApp e o que voltou delas.
 *
 * As três coleções são escritas SÓ pelo servidor (o proxy na Vercel e o webhook
 * da Meta); aqui é leitura. Os contadores de cada campanha (enviados, entregues,
 * lidos, falhas) sobem por `increment` no webhook, então nunca são recalculados
 * no cliente — quem lê aqui vê o que a Meta confirmou.
 *
 * `campanhaEnvios` (1 doc por mensagem) NÃO é carregada: são centenas por
 * campanha e a tela mostra totais. Quem precisa do detalhe abre a campanha.
 */
export function useCampanhas(ativo) {
  const [campanhas, setCampanhas] = useState([]);
  const [respostas, setRespostas] = useState([]);
  const [optOuts, setOptOuts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ativo) return undefined;
    const assinar = (nome, campo, n, set) =>
      onSnapshot(
        query(collection(db, nome), orderBy(campo, 'desc'), limit(n)),
        (snap) => {
          set(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (err) => {
          console.error(`Firestore ${nome} error:`, err);
          setLoading(false);
        }
      );
    const unsubs = [
      assinar('campanhas', 'criadoEm', 30, setCampanhas),
      assinar('campanhaRespostas', 'recebidoEm', 100, setRespostas),
      assinar('clientesOptOut', 'criadoEm', 500, setOptOuts),
    ];
    return () => unsubs.forEach((u) => u());
  }, [ativo]);

  return { campanhas, respostas, optOuts, loading };
}
