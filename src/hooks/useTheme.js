import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const THEMES = {
  notion: 'notion',
  dark: 'dark',
  clean: 'clean',
};

export function useTheme(uid) {
  const [theme, setTheme] = useState('notion');

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'themes', uid);
    getDoc(ref).then((snap) => {
      if (snap.exists()) {
        const t = snap.data().theme || 'notion';
        setTheme(t);
        document.documentElement.setAttribute('data-theme', t);
      } else {
        document.documentElement.setAttribute('data-theme', 'notion');
      }
    });
  }, [uid]);

  const changeTheme = useCallback(
    async (newTheme) => {
      if (!uid) return;
      const ref = doc(db, 'themes', uid);
      await setDoc(ref, { theme: newTheme });
      setTheme(newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
    },
    [uid]
  );

  return { theme, changeTheme, THEMES };
}
