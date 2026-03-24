import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../firebase';

function playPlim() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 830;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Audio not available
  }
}

export function useChat(currentUser, isAdmin) {
  const [conversations, setConversations] = useState({});
  const [unreadMap, setUnreadMap] = useState({});
  const prevMessagesCount = useRef({});

  // For admin: listen to all chat rooms. For user: listen to own chat room only.
  useEffect(() => {
    if (!currentUser) return;

    const chatRoomIds = isAdmin ? null : [currentUser.uid];

    if (!isAdmin) {
      // User: subscribe to their own chat room
      const roomId = currentUser.uid;
      const messagesRef = collection(db, 'chats', roomId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setConversations((prev) => ({ ...prev, [roomId]: msgs }));

        // Check for new messages and play sound
        const prevCount = prevMessagesCount.current[roomId] || 0;
        if (msgs.length > prevCount && prevCount > 0) {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg.senderUid !== currentUser.uid && document.visibilityState === 'visible') {
            playPlim();
          }
        }
        prevMessagesCount.current[roomId] = msgs.length;

        // Count unread (messages from admin that are after user's lastRead)
        const unread = msgs.filter(
          (m) => m.senderUid !== currentUser.uid && !m.readBy?.includes(currentUser.uid)
        ).length;
        setUnreadMap((prev) => ({ ...prev, [roomId]: unread }));
      });

      return unsubscribe;
    }

    // Admin: we need to listen to the users collection to know which chat rooms exist
    // Then listen to each room
    const usersRef = collection(db, 'users');
    let roomUnsubscribes = [];

    const unsubUsers = onSnapshot(usersRef, (usersSnapshot) => {
      // Clean up previous room listeners
      roomUnsubscribes.forEach((unsub) => unsub());
      roomUnsubscribes = [];

      const userDocs = usersSnapshot.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => u.uid !== currentUser.uid);

      userDocs.forEach((u) => {
        const roomId = u.uid;
        const messagesRef = collection(db, 'chats', roomId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsub = onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          setConversations((prev) => ({ ...prev, [roomId]: msgs }));

          const prevCount = prevMessagesCount.current[roomId] || 0;
          if (msgs.length > prevCount && prevCount > 0) {
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg.senderUid !== currentUser.uid && document.visibilityState === 'visible') {
              playPlim();
            }
          }
          prevMessagesCount.current[roomId] = msgs.length;

          const unread = msgs.filter(
            (m) => m.senderUid !== currentUser.uid && !m.readBy?.includes(currentUser.uid)
          ).length;
          setUnreadMap((prev) => ({ ...prev, [roomId]: unread }));
        });

        roomUnsubscribes.push(unsub);
      });
    });

    return () => {
      unsubUsers();
      roomUnsubscribes.forEach((unsub) => unsub());
    };
  }, [currentUser, isAdmin]);

  const sendMessage = useCallback(
    async (roomId, text) => {
      if (!text.trim() || !currentUser) return;
      const messagesRef = collection(db, 'chats', roomId, 'messages');
      await addDoc(messagesRef, {
        text: text.trim(),
        senderUid: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email,
        senderPhoto: currentUser.photoURL || '',
        timestamp: Timestamp.now(),
        readBy: [currentUser.uid],
      });
    },
    [currentUser]
  );

  const markAsRead = useCallback(
    async (roomId) => {
      if (!currentUser) return;
      const msgs = conversations[roomId] || [];
      const unreadMsgs = msgs.filter(
        (m) => m.senderUid !== currentUser.uid && !m.readBy?.includes(currentUser.uid)
      );
      await Promise.all(
        unreadMsgs.map((m) => {
          const msgRef = doc(db, 'chats', roomId, 'messages', m.id);
          return updateDoc(msgRef, { readBy: [...(m.readBy || []), currentUser.uid] });
        })
      );
    },
    [currentUser, conversations]
  );

  const clearChat = useCallback(async (roomId) => {
    const messagesRef = collection(db, 'chats', roomId, 'messages');
    const snapshot = await getDocs(messagesRef);
    await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
  }, []);

  const clearAllChats = useCallback(async () => {
    const roomIds = Object.keys(conversations);
    await Promise.all(
      roomIds.map(async (roomId) => {
        const messagesRef = collection(db, 'chats', roomId, 'messages');
        const snapshot = await getDocs(messagesRef);
        await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
      })
    );
  }, [conversations]);

  const totalUnread = Object.values(unreadMap).reduce((sum, n) => sum + n, 0);

  return { conversations, unreadMap, totalUnread, sendMessage, markAsRead, clearChat, clearAllChats };
}
