import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Pesquisas de satisfação (NPS) importadas do Delivery Direto.
 * Coleção `surveys` — escrita só pelo script scripts/importSurveys.mjs
 * (Admin SDK), leitura em tempo real aqui. Ver useReviews (removido) no git
 * para as avaliações internas que esta seção substituiu.
 */
export function useSurveys() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ref = collection(db, 'surveys');
    let fallbackUnsub = null;

    const unsub = onSnapshot(
      query(ref, orderBy('respondedAt', 'desc')),
      (snapshot) => {
        setSurveys(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore surveys query error:', err);
        // Índice composto faltando: refaz sem orderBy e ordena client-side.
        // Se o erro for outro (ex.: permission-denied por rules não publicadas),
        // o fallback também falha — aí o hook precisa sair de "carregando" e
        // dizer o motivo, senão a tela fica presa pra sempre.
        fallbackUnsub = onSnapshot(
          ref,
          (snapshot) => {
            const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            items.sort(
              (a, b) => (b.respondedAt?.toMillis?.() || 0) - (a.respondedAt?.toMillis?.() || 0)
            );
            setSurveys(items);
            setError(null);
            setLoading(false);
          },
          (fallbackErr) => {
            console.error('Firestore surveys fallback error:', fallbackErr);
            setError(fallbackErr);
            setLoading(false);
          }
        );
      }
    );

    return () => {
      unsub();
      if (fallbackUnsub) fallbackUnsub();
    };
  }, []);

  return { surveys, loading, error };
}
