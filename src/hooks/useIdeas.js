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

export function useIdeas() {
  const [ideas, setIdeas] = useState([]);

  useEffect(() => {
    const ideasRef = collection(db, 'ideas');
    const q = query(ideasRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setIdeas(items);
    });

    return unsub;
  }, []);

  const addIdea = useCallback(async (title, description, author) => {
    const ideasRef = collection(db, 'ideas');
    await addDoc(ideasRef, {
      title: title.trim(),
      description,
      authorUid: author.uid,
      authorName: author.displayName || author.email,
      authorPhoto: author.photoURL || '',
      createdAt: Timestamp.now(),
      comments: [],
    });
  }, []);

  const addComment = useCallback(async (ideaId, currentComments, text, author, parentIndex) => {
    const ideaRef = doc(db, 'ideas', ideaId);
    const comment = {
      text,
      authorUid: author.uid,
      authorName: author.displayName || author.email,
      authorPhoto: author.photoURL || '',
      createdAt: Timestamp.now(),
      parentIndex: parentIndex ?? null,
    };
    const updated = [...currentComments, comment];
    await updateDoc(ideaRef, { comments: updated });
  }, []);

  const deleteIdea = useCallback(async (ideaId) => {
    await deleteDoc(doc(db, 'ideas', ideaId));
  }, []);

  return { ideas, addIdea, addComment, deleteIdea };
}
