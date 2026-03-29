import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useSocialPosts() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'socialPosts'), orderBy('scheduledAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {
      const q2 = collection(db, 'socialPosts');
      onSnapshot(q2, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''));
        setPosts(docs);
      });
    });
    return unsub;
  }, []);

  const addPost = async (data) => {
    await addDoc(collection(db, 'socialPosts'), {
      ...data,
      status: 'scheduled',
      createdAt: serverTimestamp(),
    });
  };

  const updatePost = async (id, data) => {
    await updateDoc(doc(db, 'socialPosts', id), data);
  };

  const deletePost = async (id) => {
    await deleteDoc(doc(db, 'socialPosts', id));
  };

  return { posts, addPost, updatePost, deletePost };
}
