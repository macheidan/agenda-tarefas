import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useContentPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contentPlans'), (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.brand || '').localeCompare(b.brand || ''));
      setPlans(docs);
      setLoading(false);
    });
    return unsub;
  }, []);

  const uploadPlan = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const html = ev.target.result;
          const name = file.name.toLowerCase();
          // Extract brand from filename pattern: plano-BRAND-month-year.html
          const match = name.match(/plano-(\w+)-/);
          const slug = match ? match[1] : name.replace(/\.html?$/, '');
          const brand = slug.charAt(0).toUpperCase() + slug.slice(1);

          const ref = doc(db, 'contentPlans', slug);
          await setDoc(ref, {
            brand,
            html,
            fileName: file.name,
            updatedAt: serverTimestamp(),
          });
          resolve(true);
        } catch (err) {
          console.error('[ContentPlans] Erro ao salvar:', err);
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

  const deletePlan = async (slug) => {
    await deleteDoc(doc(db, 'contentPlans', slug));
  };

  return { plans, loading, uploadPlan, deletePlan };
}
