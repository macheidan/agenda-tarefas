import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useUsers() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map((d) => ({ uid: d.id, ...d.data() })));
    }, (err) => {
      console.error('[useUsers] Erro ao carregar usuários:', err);
    });
    return unsubscribe;
  }, []);

  return users;
}
