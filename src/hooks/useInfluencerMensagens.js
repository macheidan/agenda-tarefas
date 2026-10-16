import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, query, orderBy, limit, doc, updateDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// Fila de aprovação do bot de influencers (influencerMensagens/{id}).
// Quem escreve o rascunho é o bot (Admin SDK, Pizzarias/bot ig influencers/intranet.py rascunho);
// aqui o aprovador só decide: pendente|erro -> aprovado | rejeitado | arquivado; arquivado -> pendente.
// Quem envia é o despachante.py.
export function useInfluencerMensagens(enabled) {
  const [mensagens, setMensagens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return undefined;
    const q = query(collection(db, 'influencerMensagens'), orderBy('criadoEm', 'desc'), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => { setMensagens(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error('influencerMensagens:', err); setLoading(false); },
    );
    return unsub;
  }, [enabled]);

  const decidir = useCallback(async (id, status, user, final = {}) => {
    await updateDoc(doc(db, 'influencerMensagens', id), {
      ...final,
      status,
      decididoPor: { uid: user.uid, nome: user.displayName || user.email },
      decididoEm: serverTimestamp(),
    });
  }, []);

  const carregarPrint = useCallback(async (id) => {
    const s = await getDoc(doc(db, 'influencerPrints', id));
    return s.exists() ? s.data().img : null;
  }, []);

  return { mensagens, loading, decidir, carregarPrint };
}
