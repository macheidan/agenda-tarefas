import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// Ordenação dos post-its: quem tem `order` (definido ao arrastar) manda, em
// ordem crescente. Notas legadas/novas sem `order` vão ao fim, entre si por
// createdAt asc (comportamento antigo: nova entra embaixo). Depois do primeiro
// reorder de um lado, todas ganham `order` e a lista fica estável.
const sortStickyNotes = (docs) =>
  docs.slice().sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : null;
    const bo = typeof b.order === 'number' ? b.order : null;
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1; // a ordenada vem antes da sem order
    if (bo != null) return 1;
    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  });

// Post-its (estilo Microsoft Sticky Notes) fixados ao lado do calendário.
// Coleção flat `stickyNotes/{id}` escopada por `uid` (o dono da agenda —
// respeita o "viewing as" do admin, que recebe selectedUid). Ordenação é
// client-side (mistura `order` do arraste com createdAt), então a query só
// filtra por uid — sem índice composto.
export function useStickyNotes(uid) {
  const [stickyNotes, setStickyNotes] = useState([]);

  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(db, 'stickyNotes'), where('uid', '==', uid));
    const unsub = onSnapshot(q, (snap) => {
      setStickyNotes(sortStickyNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    });
    return unsub;
  }, [uid]);

  const addStickyNote = async (color, side) => {
    const ref = await addDoc(collection(db, 'stickyNotes'), {
      uid,
      text: '',
      color: color || 'yellow',
      side: side || 'right',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  };

  const updateStickyNote = async (noteId, data) => {
    await updateDoc(doc(db, 'stickyNotes', noteId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteStickyNote = async (noteId) => {
    await deleteDoc(doc(db, 'stickyNotes', noteId));
  };

  // Persiste a nova ordem de um lado: grava `order` = índice para cada nota
  // cujo valor mudou (na 1ª vez todas mudam; depois só as afetadas pelo
  // arraste). O espaço de `order` é por lado, mas não colide porque o painel
  // filtra por `side` antes de ordenar.
  const reorderStickyNotes = async (orderedIds) => {
    await Promise.all(
      orderedIds.map((id, i) => {
        const cur = stickyNotes.find((n) => n.id === id);
        if (cur && cur.order === i) return null; // já na posição certa
        return updateDoc(doc(db, 'stickyNotes', id), { order: i });
      })
    );
  };

  return {
    stickyNotes,
    addStickyNote,
    updateStickyNote,
    deleteStickyNote,
    reorderStickyNotes,
  };
}
