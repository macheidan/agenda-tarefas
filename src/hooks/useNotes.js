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

// Ordenação das anotações: quem tem `order` (definido ao arrastar) manda, em
// ordem crescente. Notas legadas/novas sem `order` caem no topo, entre si por
// createdAt desc (comportamento antigo: mais nova primeiro). Depois do primeiro
// reorder, todas ganham `order` e a lista fica estável.
const sortNotes = (docs) =>
  docs.slice().sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : null;
    const bo = typeof b.order === 'number' ? b.order : null;
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return 1; // b sem order vem antes (topo)
    if (bo != null) return -1;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

export function useNotes(uid) {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!uid) return;
    // Ordenação final é client-side (sortNotes) porque mistura `order` e
    // createdAt; a query só filtra por uid.
    const q = query(collection(db, 'notes'), where('uid', '==', uid));
    const unsub = onSnapshot(q, (snap) => {
      setNotes(sortNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    });
    return unsub;
  }, [uid]);

  const addNote = async (data) => {
    await addDoc(collection(db, 'notes'), {
      ...data,
      uid,
      createdAt: serverTimestamp(),
    });
  };

  const updateNote = async (noteId, data) => {
    await updateDoc(doc(db, 'notes', noteId), data);
  };

  const deleteNote = async (noteId) => {
    await deleteDoc(doc(db, 'notes', noteId));
  };

  // Persiste a nova ordem: grava `order` = índice para cada nota cujo valor
  // mudou (na 1ª vez todas mudam; depois só as afetadas pelo arraste).
  const reorderNotes = async (orderedIds) => {
    await Promise.all(
      orderedIds.map((id, i) => {
        const cur = notes.find((n) => n.id === id);
        if (cur && cur.order === i) return null; // já na posição certa
        return updateDoc(doc(db, 'notes', id), { order: i });
      })
    );
  };

  return { notes, addNote, updateNote, deleteNote, reorderNotes };
}
