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
  { key: 'quebra_caixa', label: 'Quebra de Caixa', short: 'QC', color: '#ff9800' },
  { key: 'vales', label: 'Vales', short: 'V', color: '#9c27b0' },
  { key: 'feriado_trabalhado', label: 'Feriado Trabalhado', short: 'FT', color: '#12b76a' },
];

// Lojas padrão criadas na primeira vez (IDs fixos = seed idempotente).
const DEFAULT_STORES = [
  { id: 'loja1', name: 'Loja 1', order: 0 },
  { id: 'loja2', name: 'Loja 2', order: 1 },
];

export function useDepartamentoPessoal() {
  const [stores, setStores] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [absences, setAbsences] = useState([]);

  // Lojas (com seed das duas lojas padrão se a coleção estiver vazia).
  useEffect(() => {
    let seeded = false;
    const ref = collection(db, 'dpStores');
    const unsub = onSnapshot(ref, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setStores(items);
      if (items.length === 0 && !seeded) {
        seeded = true;
        DEFAULT_STORES.forEach((s) => {
          setDoc(doc(db, 'dpStores', s.id), {
            name: s.name,
            order: s.order,
            createdAt: Timestamp.now(),
          }).catch(() => {});
        });
      }
    });
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
  const addEmployee = useCallback(async (name, storeId, author) => {
    const trimmed = (name || '').trim();
    if (!trimmed || !storeId) return;
    await addDoc(collection(db, 'dpEmployees'), {
      name: trimmed,
      store: storeId,
      active: true,
      createdAt: Timestamp.now(),
      createdBy: author?.uid || '',
    });
  }, []);

  const renameEmployee = useCallback(async (employeeId, name) => {
    await updateDoc(doc(db, 'dpEmployees', employeeId), { name: (name || '').trim() });
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
    employees,
    absences,
    addStore,
    renameStore,
    deleteStore,
    addEmployee,
    renameEmployee,
    deactivateEmployee,
    reactivateEmployee,
    deleteEmployee,
    setAbsence,
  };
}
