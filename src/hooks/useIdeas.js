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
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useIdeas(targetUid, currentUser, fetchAll = false) {
  const [ideas, setIdeas] = useState([]);

  useEffect(() => {
    if (!fetchAll && !targetUid) return;

    const ideasRef = collection(db, 'ideas');
    const q = fetchAll
      ? query(ideasRef, orderBy('createdAt', 'desc'))
      : query(ideasRef, where('targetUid', '==', targetUid), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => !i.archived);
      setIdeas(items);
    }, (error) => {
      console.error('Firestore ideas query error:', error);
      const fallbackQ = fetchAll
        ? query(ideasRef)
        : query(ideasRef, where('targetUid', '==', targetUid));
      onSnapshot(fallbackQ, (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setIdeas(items);
      });
    });

    return unsub;
  }, [targetUid]);

  const addIdea = useCallback(async (title, description, author, overrideTargetUid) => {
    const uid = overrideTargetUid || targetUid;
    if (!uid) return;
    const ideasRef = collection(db, 'ideas');
    await addDoc(ideasRef, {
      title: title.trim(),
      description,
      authorUid: author.uid,
      authorName: author.displayName || author.email,
      authorPhoto: author.photoURL || '',
      targetUid: uid,
      createdAt: Timestamp.now(),
      comments: [],
      readBy: [author.uid],
    });
  }, [targetUid]);

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
    await updateDoc(ideaRef, { comments: updated, readBy: [author.uid] });
  }, []);

  const deleteComment = useCallback(async (ideaId, currentComments, commentIndex) => {
    const ideaRef = doc(db, 'ideas', ideaId);
    const updated = currentComments.filter((_, i) => i !== commentIndex);
    // Also fix parentIndex references
    const fixed = updated.map((c) => {
      if (c.parentIndex === null || c.parentIndex === undefined) return c;
      if (c.parentIndex === commentIndex) return { ...c, parentIndex: null };
      if (c.parentIndex > commentIndex) return { ...c, parentIndex: c.parentIndex - 1 };
      return c;
    });
    await updateDoc(ideaRef, { comments: fixed });
  }, []);

  const deleteIdea = useCallback(async (ideaId) => {
    await deleteDoc(doc(db, 'ideas', ideaId));
  }, []);

  const archiveIdea = useCallback(async (ideaId) => {
    const ideaRef = doc(db, 'ideas', ideaId);
    await updateDoc(ideaRef, { archived: true });
  }, []);

  const markAsRead = useCallback(async (ideaId) => {
    if (!currentUser) return;
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;
    if (idea.readBy?.includes(currentUser.uid)) return;
    const ideaRef = doc(db, 'ideas', ideaId);
    await updateDoc(ideaRef, { readBy: [...(idea.readBy || []), currentUser.uid] });
  }, [currentUser, ideas]);

  const unreadCount = currentUser
    ? ideas.filter((i) => !i.readBy?.includes(currentUser.uid)).length
    : 0;

  return { ideas, unreadCount, addIdea, addComment, deleteComment, deleteIdea, archiveIdea, markAsRead };
}
