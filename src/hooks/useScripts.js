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

export function useScripts() {
  const [scripts, setScripts] = useState([]);

  useEffect(() => {
    const ref = collection(db, 'scripts');
    const q = query(ref, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, (snapshot) => {
      setScripts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {
      onSnapshot(collection(db, 'scripts'), (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setScripts(items);
      });
    });

    return unsub;
  }, []);

  const addScript = useCallback(async (data, author) => {
    await addDoc(collection(db, 'scripts'), {
      title: data.title.trim(),
      type: data.type || 'reel',
      music: data.music?.trim() || '',
      callText: data.callText?.trim() || '',
      script: data.script.trim(),
      dialogues: data.dialogues?.trim() || '',
      camera: data.camera?.trim() || '',
      references: data.references?.trim() || '',
      status: 'draft',
      authorUid: author.uid,
      authorName: author.displayName || author.email,
      createdAt: Timestamp.now(),
    });
  }, []);

  const updateScript = useCallback(async (id, data) => {
    await updateDoc(doc(db, 'scripts', id), data);
  }, []);

  const deleteScript = useCallback(async (id) => {
    await deleteDoc(doc(db, 'scripts', id));
  }, []);

  return { scripts, addScript, updateScript, deleteScript };
}
