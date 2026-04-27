import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export const CP_STATUSES = ['pending', 'changes_requested', 'revised', 'approved'];

export function useContentPlan() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contentPlan'), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const addItem = useCallback(async ({ dateKey, store, type, title, content, status }, author) => {
    await addDoc(collection(db, 'contentPlan'), {
      dateKey,
      store,
      type,
      title: (title || '').trim(),
      content: (content || '').trim(),
      status: status || 'pending',
      authorUid: author.uid,
      authorName: author.displayName || author.email,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }, []);

  const updateItem = useCallback(async (id, data) => {
    await updateDoc(doc(db, 'contentPlan', id), { ...data, updatedAt: Timestamp.now() });
  }, []);

  const deleteItem = useCallback(async (id) => {
    await deleteDoc(doc(db, 'contentPlan', id));
  }, []);

  return { items, addItem, updateItem, deleteItem };
}
