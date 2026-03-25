import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function useSettings(uid) {
  const [settings, setSettings] = useState({ ideasEnabled: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'settings', uid);
    getDoc(ref).then((snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      }
      setLoading(false);
    });
  }, [uid]);

  const updateSettings = useCallback(
    async (updates) => {
      if (!uid) return;
      const ref = doc(db, 'settings', uid);
      const merged = { ...settings, ...updates };
      await setDoc(ref, merged, { merge: true });
      setSettings(merged);
    },
    [uid, settings]
  );

  return { settings, loading, updateSettings };
}
