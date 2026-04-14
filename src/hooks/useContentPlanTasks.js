import { useState, useEffect } from 'react';
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

export function useContentPlanTasks(uid) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const colRef = collection(db, 'contentPlanTasks', uid, 'items');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [uid]);

  const addPost = async (data, currentUser) => {
    const colRef = collection(db, 'contentPlanTasks', uid, 'items');
    return addDoc(colRef, {
      title: data.title,
      date: data.date,
      format: data.format || 'STORY',
      pillar: data.pillar || '',
      pillarColor: data.pillarColor || 'red',
      tool: data.tool || '',
      textoVisual: data.textoVisual || '',
      comoProduzir: data.comoProduzir || '',
      createdAt: Timestamp.now(),
      createdBy: currentUser.uid,
    });
  };

  const updatePost = async (postId, updates) => {
    const ref = doc(db, 'contentPlanTasks', uid, 'items', postId);
    return updateDoc(ref, updates);
  };

  const deletePost = async (postId) => {
    const ref = doc(db, 'contentPlanTasks', uid, 'items', postId);
    return deleteDoc(ref);
  };

  return { posts, loading, addPost, updatePost, deletePost };
}
