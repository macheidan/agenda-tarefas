import { useState, useEffect, useCallback } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Escala 5x2 do Depto Pessoal, por loja:
//   dpEscala5x2Config/{storeId}           → { regras, emps: { [empId]: { jr, ini, cor } } }
//   dpEscala5x2Semanas/{storeId}_{segunda} → { store, week, days: { 'YYYY-MM-DD': [{ e, ini, mins, pi }] } }
// Um doc por semana (e não por turno) porque a tela sempre lê/grava a semana
// inteira e a conferência olha ~8 semanas para trás (domingos, dias seguidos).
export const semanaDocId = (storeId, week) => `${storeId}_${week}`;

export function useEscala5x2(storeId) {
  // Cada snapshot leva a loja de origem: ao trocar de loja, o dado da anterior
  // deixa de valer na hora, sem precisar zerar estado dentro do efeito.
  const [cfg, setCfg] = useState({ store: null, data: null });
  const [sem, setSem] = useState({ store: null, data: {} });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!storeId) return undefined;
    const unsubCfg = onSnapshot(
      doc(db, 'dpEscala5x2Config', storeId),
      (snap) => setCfg({ store: storeId, data: snap.exists() ? snap.data() : {} }),
      (err) => setError(err?.message || String(err))
    );
    const unsubSem = onSnapshot(
      query(collection(db, 'dpEscala5x2Semanas'), where('store', '==', storeId)),
      (snap) => {
        const m = {};
        snap.docs.forEach((d) => { const x = d.data(); m[x.week] = x.days || {}; });
        setSem({ store: storeId, data: m });
        setError(null);
      },
      (err) => setError(err?.message || String(err))
    );
    return () => { unsubCfg(); unsubSem(); };
  }, [storeId]);

  const config = cfg.store === storeId ? cfg.data : null;
  const semanas = sem.store === storeId ? sem.data : EMPTY;
  const loading = !!storeId && sem.store !== storeId && !error;

  // Grava a semana inteira (days já no formato enxuto { e, ini, mins, pi }).
  const saveSemana = useCallback(async (week, days, author) => {
    await setDoc(doc(db, 'dpEscala5x2Semanas', semanaDocId(storeId, week)), {
      store: storeId,
      week,
      days,
      updatedAt: Timestamp.now(),
      updatedBy: author?.uid || '',
    });
  }, [storeId]);

  // Várias semanas de uma vez (Repetir semana).
  const saveSemanas = useCallback(async (entries, author) => {
    const batch = writeBatch(db);
    entries.forEach(({ week, days }) => {
      batch.set(doc(db, 'dpEscala5x2Semanas', semanaDocId(storeId, week)), {
        store: storeId,
        week,
        days,
        updatedAt: Timestamp.now(),
        updatedBy: author?.uid || '',
      });
    });
    await batch.commit();
  }, [storeId]);

  // patch parcial: { regras: {...} } ou { emps: { [id]: {...} } } — merge profundo.
  const saveConfig = useCallback(async (patch, author) => {
    await setDoc(
      doc(db, 'dpEscala5x2Config', storeId),
      { ...patch, updatedAt: Timestamp.now(), updatedBy: author?.uid || '' },
      { merge: true }
    );
  }, [storeId]);

  return { config, semanas, loading, error, saveSemana, saveSemanas, saveConfig };
}

const EMPTY = {};
