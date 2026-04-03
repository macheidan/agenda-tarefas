import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useAllSettings(users) {
  const [allSettings, setAllSettings] = useState({});

  useEffect(() => {
    if (!users || users.length === 0) return;

    const unsubscribes = users.map((u) => {
      const ref = doc(db, 'settings', u.uid);
      return onSnapshot(ref, (snap) => {
        setAllSettings((prev) => ({
          ...prev,
          [u.uid]: snap.exists() ? snap.data() : {},
        }));
      });
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [users]);

  return allSettings;
}
