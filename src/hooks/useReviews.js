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

export function useReviews(targetUid, currentUser, fetchAll = false) {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    if (!fetchAll && !targetUid) return;

    const ref = collection(db, 'reviews');
    const q = fetchAll
      ? query(ref, orderBy('createdAt', 'desc'))
      : query(ref, where('targetUid', '==', targetUid), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => !r.archived);
      setReviews(items);
    }, (error) => {
      console.error('Firestore reviews query error:', error);
      const fallbackQ = fetchAll
        ? query(ref)
        : query(ref, where('targetUid', '==', targetUid));
      onSnapshot(fallbackQ, (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setReviews(items);
      });
    });

    return unsub;
  }, [targetUid, fetchAll]);

  const addReview = useCallback(async (title, description, author, overrideTargetUid) => {
    const uid = overrideTargetUid || targetUid;
    if (!uid) return;
    const ref = collection(db, 'reviews');
    await addDoc(ref, {
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

  const addComment = useCallback(async (reviewId, currentComments, text, author, parentIndex) => {
    const ref = doc(db, 'reviews', reviewId);
    const comment = {
      text,
      authorUid: author.uid,
      authorName: author.displayName || author.email,
      authorPhoto: author.photoURL || '',
      createdAt: Timestamp.now(),
      parentIndex: parentIndex ?? null,
    };
    const updated = [...currentComments, comment];
    await updateDoc(ref, { comments: updated, readBy: [author.uid] });
  }, []);

  const deleteComment = useCallback(async (reviewId, currentComments, commentIndex) => {
    const ref = doc(db, 'reviews', reviewId);
    const updated = currentComments.filter((_, i) => i !== commentIndex);
    const fixed = updated.map((c) => {
      if (c.parentIndex === null || c.parentIndex === undefined) return c;
      if (c.parentIndex === commentIndex) return { ...c, parentIndex: null };
      if (c.parentIndex > commentIndex) return { ...c, parentIndex: c.parentIndex - 1 };
      return c;
    });
    await updateDoc(ref, { comments: fixed });
  }, []);

  const deleteReview = useCallback(async (reviewId) => {
    await deleteDoc(doc(db, 'reviews', reviewId));
  }, []);

  const archiveReview = useCallback(async (reviewId) => {
    const ref = doc(db, 'reviews', reviewId);
    await updateDoc(ref, { archived: true });
  }, []);

  const markAsRead = useCallback(async (reviewId) => {
    if (!currentUser) return;
    const review = reviews.find((r) => r.id === reviewId);
    if (!review) return;
    if (review.readBy?.includes(currentUser.uid)) return;
    const ref = doc(db, 'reviews', reviewId);
    await updateDoc(ref, { readBy: [...(review.readBy || []), currentUser.uid] });
  }, [currentUser, reviews]);

  const unreadCount = currentUser
    ? reviews.filter((r) => !r.readBy?.includes(currentUser.uid)).length
    : 0;

  return { reviews, unreadCount, addReview, addComment, deleteComment, deleteReview, archiveReview, markAsRead };
}
