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

export function useNotes(uid) {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notes'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {
      // Fallback if composite index missing
      const q2 = query(collection(db, 'notes'), where('uid', '==', uid));
      onSnapshot(q2, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setNotes(docs);
      });
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

  return { notes, addNote, updateNote, deleteNote };
}
