import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// Tipos de ocorrência da escala (legenda da planilha de RH).
export const ABSENCE_TYPES = [
  { key: 'falta_justificada', label: 'Falta Justificada', short: 'FJ', color: '#3949ab' },
  { key: 'falta_injustificada', label: 'Falta NÃO Justificada', short: 'F', color: '#f04438' },
  { key: 'feriado_trabalhado', label: 'Feriado Trabalhado', short: 'FT', color: '#12b76a' },
  { key: 'folga', label: 'Folga', short: 'FG', color: '#0d9488' },
];

// Lojas padrão criadas na primeira vez (IDs fixos = seed idempotente).
const DEFAULT_STORES = [
  { id: 'dame', name: 'Dáme', order: 0 },
  { id: 'lov', name: 'Lov', order: 1 },
];

export function useDepartamentoPessoal() {
  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [absences, setAbsences] = useState([]);

  // Lojas (com seed das duas lojas padrão se a coleção estiver vazia).
  useEffect(() => {
    let seeded = false;
    const ref = collection(db, 'dpStores');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setStores(items);
        setLoadingStores(false);
        setStoresError(null);
        if (items.length === 0 && !seeded) {
          seeded = true;
          DEFAULT_STORES.forEach((s) => {
            setDoc(doc(db, 'dpStores', s.id), {
              name: s.name,
              order: s.order,
              createdAt: Timestamp.now(),
            }).catch((e) => setStoresError(e?.message || String(e)));
          });
        }
      },
      (err) => {
        setLoadingStores(false);
        setStoresError(err?.message || String(err));
      }
    );
    return unsub;
  }, []);

  // Funcionários.
  useEffect(() => {
    const ref = collection(db, 'dpEmployees');
    const unsub = onSnapshot(ref, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => {
        const an = (a.name || '').toLowerCase();
        const bn = (b.name || '').toLowerCase();
        return an.localeCompare(bn);
      });
      setEmployees(items);
    });
    return unsub;
  }, []);

  // Faltas / ocorrências.
  useEffect(() => {
    const ref = collection(db, 'dpAbsences');
    const unsub = onSnapshot(ref, (snap) => {
      setAbsences(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // ---- Lojas ----
  // Cria as duas lojas padrão (botão manual de fallback).
  const seedDefaultStores = useCallback(async () => {
    await Promise.all(
      DEFAULT_STORES.map((s) =>
        setDoc(doc(db, 'dpStores', s.id), {
          name: s.name,
          order: s.order,
          createdAt: Timestamp.now(),
        })
      )
    );
  }, []);

  const addStore = useCallback(async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    await addDoc(collection(db, 'dpStores'), {
      name: trimmed,
      order: Date.now(),
      createdAt: Timestamp.now(),
    });
  }, []);

  const renameStore = useCallback(async (storeId, name) => {
    await updateDoc(doc(db, 'dpStores', storeId), { name: (name || '').trim() });
  }, []);

  const deleteStore = useCallback(async (storeId) => {
    await deleteDoc(doc(db, 'dpStores', storeId));
  }, []);

  // ---- Funcionários ----
  const addEmployee = useCallback(async (name, storeId, author, extra = {}) => {
    const trimmed = (name || '').trim();
    if (!trimmed || !storeId) return;
    await addDoc(collection(db, 'dpEmployees'), {
      name: trimmed,
      store: storeId,
      active: true,
      createdAt: Timestamp.now(),
      createdBy: author?.uid || '',
      folgaWeekdays: extra.folgaWeekdays ?? null,
      folgaWeekday: extra.folgaWeekday ?? null,
      folgaMonthN: extra.folgaMonthN ?? null,
    });
  }, []);

  const renameEmployee = useCallback(async (employeeId, name) => {
    await updateDoc(doc(db, 'dpEmployees', employeeId), { name: (name || '').trim() });
  }, []);

  // Edita nome, loja e/ou configuração de folga do funcionário.
  const updateEmployee = useCallback(async (employeeId, updates) => {
    const clean = {};
    if (typeof updates?.name === 'string') clean.name = updates.name.trim();
    if (updates?.store) clean.store = updates.store;
    if (updates && 'folgaWeekdays' in updates) clean.folgaWeekdays = updates.folgaWeekdays;
    if (updates && 'folgaWeekday' in updates) clean.folgaWeekday = updates.folgaWeekday;
    if (updates && 'folgaMonthN' in updates) clean.folgaMonthN = updates.folgaMonthN;
    if (Object.keys(clean).length) {
      await updateDoc(doc(db, 'dpEmployees', employeeId), clean);
    }
  }, []);

  // "Remover" = desativar (preserva histórico de faltas).
  const deactivateEmployee = useCallback(async (employeeId) => {
    await updateDoc(doc(db, 'dpEmployees', employeeId), { active: false });
  }, []);

  const reactivateEmployee = useCallback(async (employeeId) => {
    await updateDoc(doc(db, 'dpEmployees', employeeId), { active: true });
  }, []);

  // Exclusão definitiva: remove o funcionário e todas as suas ocorrências.
  const deleteEmployee = useCallback(async (employeeId) => {
    await deleteDoc(doc(db, 'dpEmployees', employeeId));
  }, []);

  // ---- Faltas ----
  // type === null limpa a célula; senão cria/atualiza a ocorrência do dia.
  const setAbsence = useCallback(
    async (employeeId, storeId, date, type, existingId, author) => {
      if (!type) {
        if (existingId) await deleteDoc(doc(db, 'dpAbsences', existingId));
        return;
      }
      if (existingId) {
        await updateDoc(doc(db, 'dpAbsences', existingId), { type });
      } else {
        await addDoc(collection(db, 'dpAbsences'), {
          employeeId,
          store: storeId,
          date,
          type,
          createdAt: Timestamp.now(),
          createdBy: author?.uid || '',
        });
      }
    },
    []
  );

  return {
    stores,
    loadingStores,
    storesError,
    seedDefaultStores,
    employees,
    absences,
    addStore,
    renameStore,
    deleteStore,
    addEmployee,
    renameEmployee,
    updateEmployee,
    deactivateEmployee,
    reactivateEmployee,
    deleteEmployee,
    setAbsence,
  };
}
