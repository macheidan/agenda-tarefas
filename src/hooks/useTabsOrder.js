import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DEFAULT_TABS_ORDER = [
  'calendar',
  'reels',
  'contentPlan',
  'influencers',
  'notes',
  'shopping',
  'ideas',
  'reviews',
  'knowledge',
  'precosInsumos',
  'departamentoPessoal',
];

export function useTabsOrder() {
  const [order, setOrder] = useState(DEFAULT_TABS_ORDER);

  useEffect(() => {
    const ref = doc(db, 'settings', 'global');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const saved = Array.isArray(data?.tabsOrder) ? data.tabsOrder : null;
        if (!saved) {
          setOrder(DEFAULT_TABS_ORDER);
          return;
        }
        const known = saved.filter((k) => DEFAULT_TABS_ORDER.includes(k));
        const missing = DEFAULT_TABS_ORDER.filter((k) => !known.includes(k));
        setOrder([...known, ...missing]);
      },
      () => setOrder(DEFAULT_TABS_ORDER)
    );
    return unsub;
  }, []);

  const updateOrder = useCallback(async (newOrder) => {
    const ref = doc(db, 'settings', 'global');
    await setDoc(ref, { tabsOrder: newOrder }, { merge: true });
  }, []);

  return { order, updateOrder };
}
