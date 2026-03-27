import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useAdminMessages(user) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'adminMessages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {
      // Fallback if index missing
      const q2 = collection(db, 'adminMessages');
      onSnapshot(q2, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMessages(docs);
      });
    });
    return unsub;
  }, [user]);

  const sendMessage = async (text, targetUids) => {
    await addDoc(collection(db, 'adminMessages'), {
      text,
      targetUids,
      readBy: [],
      createdAt: serverTimestamp(),
    });
  };

  const markAsRead = async (messageId, uid) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    const readBy = msg.readBy || [];
    if (readBy.includes(uid)) return;
    await updateDoc(doc(db, 'adminMessages', messageId), {
      readBy: [...readBy, uid],
    });
  };

  // Get unread message for a specific user
  const getUnreadForUser = (uid) => {
    return messages.find(
      (m) => m.targetUids.includes(uid) && !(m.readBy || []).includes(uid)
    );
  };

  const deleteMessage = async (messageId) => {
    await deleteDoc(doc(db, 'adminMessages', messageId));
  };

  return { messages, sendMessage, markAsRead, getUnreadForUser, deleteMessage };
}
