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

export function useReels() {
  const [reels, setReels] = useState([]);

  useEffect(() => {
    const reelsRef = collection(db, 'reels');
    const q = query(reelsRef, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReels(items);
    }, (error) => {
      console.error('Firestore reels query error:', error);
      onSnapshot(collection(db, 'reels'), (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setReels(items);
      });
    });

    return unsub;
  }, []);

  const addReel = useCallback(async (link, description, author) => {
    const reelsRef = collection(db, 'reels');
    await addDoc(reelsRef, {
      link: link.trim(),
      description: description?.trim() || '',
      status: 'pending',
      authorUid: author.uid,
      authorName: author.displayName || author.email,
      authorPhoto: author.photoURL || '',
      createdAt: Timestamp.now(),
    });
  }, []);

  const approveReel = useCallback(async (reelId) => {
    const reelRef = doc(db, 'reels', reelId);
    await updateDoc(reelRef, { status: 'approved' });
  }, []);

  const archiveReel = useCallback(async (reelId) => {
    const reelRef = doc(db, 'reels', reelId);
    await updateDoc(reelRef, { status: 'archived' });
  }, []);

  const unarchiveReel = useCallback(async (reelId) => {
    const reelRef = doc(db, 'reels', reelId);
    await updateDoc(reelRef, { status: 'pending' });
  }, []);

  const deleteReel = useCallback(async (reelId) => {
    await deleteDoc(doc(db, 'reels', reelId));
  }, []);

  const updateDescription = useCallback(async (reelId, description) => {
    const reelRef = doc(db, 'reels', reelId);
    await updateDoc(reelRef, { description: description?.trim() || '', descriptionEdited: true });
  }, []);

  return { reels, addReel, approveReel, archiveReel, unarchiveReel, deleteReel, updateDescription };
}
