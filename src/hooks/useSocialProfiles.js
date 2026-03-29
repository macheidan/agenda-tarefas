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

export function useSocialProfiles(uid) {
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'socialProfiles'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {
      const q2 = collection(db, 'socialProfiles');
      onSnapshot(q2, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setProfiles(docs);
      });
    });
    return unsub;
  }, [uid]);

  const addProfile = async (data) => {
    await addDoc(collection(db, 'socialProfiles'), {
      ...data,
      createdAt: serverTimestamp(),
    });
  };

  const updateProfile = async (id, data) => {
    await updateDoc(doc(db, 'socialProfiles', id), data);
  };

  const deleteProfile = async (id) => {
    await deleteDoc(doc(db, 'socialProfiles', id));
  };

  return { profiles, addProfile, updateProfile, deleteProfile };
}
