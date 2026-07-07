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
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// Post-its (estilo Microsoft Sticky Notes) fixados ao lado do calendário.
// Coleção flat `stickyNotes/{id}` escopada por `uid` (o dono da agenda —
// respeita o "viewing as" do admin, que recebe selectedUid). Segue o mesmo
// padrão de fallback sem índice composto de useNotes.
export function useStickyNotes(uid) {
  const [stickyNotes, setStickyNotes] = useState([]);

  useEffect(() => {
    if (!uid) return undefined;
    const q = query(
      collection(db, 'stickyNotes'),
      where('uid', '==', uid),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setStickyNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => {
        // Fallback se faltar índice composto
        const q2 = query(collection(db, 'stickyNotes'), where('uid', '==', uid));
        onSnapshot(q2, (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          docs.sort(
            (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
          );
          setStickyNotes(docs);
        });
      }
    );
    return unsub;
  }, [uid]);

  const addStickyNote = async (color) => {
    const ref = await addDoc(collection(db, 'stickyNotes'), {
      uid,
      text: '',
      color: color || 'yellow',
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

  return { stickyNotes, addStickyNote, updateStickyNote, deleteStickyNote };
}
