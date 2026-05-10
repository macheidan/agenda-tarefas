import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useInfluencers() {
  const [influencers, setInfluencers] = useState([]);

  useEffect(() => {
    const ref = collection(db, 'influencers');
    const q = query(ref, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setInfluencers(items);
      },
      (error) => {
        console.error('Firestore influencers query error:', error);
        onSnapshot(collection(db, 'influencers'), (snapshot) => {
          const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          items.sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
          });
          setInfluencers(items);
        });
      }
    );

    return unsub;
  }, []);

  const addInfluencer = useCallback(async (data, author) => {
    const ref = collection(db, 'influencers');
    const contatos = Array.isArray(data.contatos)
      ? data.contatos
          .map((c) => ({ tipo: c.tipo || 'outro', valor: (c.valor || '').trim() }))
          .filter((c) => c.valor)
      : [];
    await addDoc(ref, {
      mes: data.mes || '',
      ano: data.ano || new Date().getFullYear(),
      nome: (data.nome || '').trim(),
      handle: (data.handle || '').trim(),
      alcance: (data.alcance || '').trim(),
      txEngaj: (data.txEngaj || '').trim(),
      segmento: (data.segmento || '').trim(),
      midiaKitUrl: (data.midiaKitUrl || '').trim(),
      contatos,
      contatado: !!data.contatado,
      retornou: !!data.retornou,
      divulgouEm: data.divulgouEm || '',
      observacoes: (data.observacoes || '').trim(),
      textoConvite: (data.textoConvite || '').trim(),
      authorUid: author.uid,
      authorName: author.displayName || author.email,
      authorPhoto: author.photoURL || '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }, []);

  const updateInfluencer = useCallback(async (id, updates) => {
    const ref = doc(db, 'influencers', id);
    await updateDoc(ref, { ...updates, updatedAt: Timestamp.now() });
  }, []);

  const deleteInfluencer = useCallback(async (id) => {
    await deleteDoc(doc(db, 'influencers', id));
  }, []);

  const archiveInfluencer = useCallback(async (id) => {
    await updateDoc(doc(db, 'influencers', id), { archived: true, updatedAt: Timestamp.now() });
  }, []);

  const unarchiveInfluencer = useCallback(async (id) => {
    await updateDoc(doc(db, 'influencers', id), { archived: false, updatedAt: Timestamp.now() });
  }, []);

  return {
    influencers,
    addInfluencer,
    updateInfluencer,
    deleteInfluencer,
    archiveInfluencer,
    unarchiveInfluencer,
  };
}
