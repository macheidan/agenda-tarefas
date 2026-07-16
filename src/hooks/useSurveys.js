import { useState, useEffect, useCallback } from 'react';
import { collection, doc, onSnapshot, query, orderBy, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Pesquisas de satisfação (NPS) importadas do Delivery Direto.
 * Coleção `surveys` — o conteúdo da pesquisa é escrito só pelo script
 * scripts/importSurveys.mjs (Admin SDK); leitura em tempo real aqui. Ver
 * useReviews (removido) no git para as avaliações internas que esta seção
 * substituiu.
 *
 * `archived` é o ÚNICO campo que o cliente escreve (as firestore.rules barram
 * o resto do documento) — é o "já tratei essa avaliação", e vale pra todo
 * mundo, não por usuário.
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

  // deleteField ao desarquivar: o doc volta ao shape que o import grava, então
  // o `archived` não fica como lixo `false` em todas as pesquisas.
  const setArchived = useCallback(async (surveyId, archived) => {
    await updateDoc(doc(db, 'surveys', surveyId), {
      archived: archived ? true : deleteField(),
    });
  }, []);

  return { surveys, loading, error, setArchived };
}
