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
  { key: 'ferias', label: 'Férias', short: 'FE', color: '#7c3aed' },
];

// Marca especial que NÃO aparece na legenda nem no menu de tipos: existe só pra
// anular, num dia específico, a folga que a Escala desenha sozinha a partir da
// config do funcionário (folgaWeekdays / folgaMonthN). Sem ela não havia como
// apagar um FG automático — "Limpar" não tinha doc nenhum pra remover.
// Apagar o doc devolve a folga automática.
export const SEM_FOLGA = 'sem_folga';

// Lojas padrão criadas na primeira vez (IDs fixos = seed idempotente).
const DEFAULT_STORES = [
  { id: 'dame', name: 'Dáme', order: 0 },
  { id: 'lov', name: 'Lov', order: 1 },
];

const pad = (n) => String(n).padStart(2, '0');

// Campos do perfil salarial (resumo O1:P4 das planilhas) guardados no funcionário.
const SALARY_FIELDS = ['salaryMode', 'salaryBase', 'transporteRef', 'feriadoUnit', 'adiantamento'];

// ID determinístico do doc de salário (1 por funcionário/mês) → upsert idempotente.
export const salarioDocId = (employeeId, year, month) =>
  `${employeeId}_${year}-${pad(month + 1)}`;

// Transporte (aba Transp): 1 doc por perfil/mês. O perfil é a "aba" da planilha
// (rumi, patricia), não o id do funcionário — cada uma tem um cálculo próprio.
// Campos de uma linha de salário que o espelho dpSalariosBanco carrega (o que a
// Salários Folha vê e edita). Devolve null se o patch não toca nenhum deles.
export const FOLHA_FIELDS = ['banco', 'flash'];
export function folhaFieldsOf(patch) {
  if (!patch || typeof patch !== 'object') return null;
  const out = {};
  for (const f of FOLHA_FIELDS) if (f in patch) out[f] = patch[f] ?? null;
  return Object.keys(out).length ? out : null;
}

export const transporteDocId = (perfil, year, month) =>
  `${perfil}_${year}-${pad(month + 1)}`;

export function useDepartamentoPessoal() {
  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [salarios, setSalarios] = useState([]);
  // Espelho de dpSalarios com só `banco` e `flash` de cada linha (Salários Folha).
  const [salariosBanco, setSalariosBanco] = useState([]);
  const [transportes, setTransportes] = useState([]);

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

  // Lançamentos de salário (1 doc por funcionário/mês; contém dia5/dia20/extra).
  useEffect(() => {
    const ref = collection(db, 'dpSalarios');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSalarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      // Salários é exclusivo do admin nas rules: pra qualquer outro usuário o
      // snapshot estoura permission-denied — não é erro de app, é só o dado
      // não existindo pra ele (a aba nem renderiza).
      () => setSalarios([])
    );
    return unsub;
  }, []);

  // Espelho banco+flash (dpSalariosBanco): lê quem tem dpFolhaVisible (ou admin).
  // Mesmo tratamento do permission-denied: sem acesso, lista vazia.
  useEffect(() => {
    const ref = collection(db, 'dpSalariosBanco');
    const unsub = onSnapshot(
      ref,
      (snap) => setSalariosBanco(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setSalariosBanco([])
    );
    return unsub;
  }, []);

  // Transporte (1 doc por perfil/mês) — só os campos editáveis; o resto é fórmula.
  useEffect(() => {
    const ref = collection(db, 'dpTransporte');
    const unsub = onSnapshot(
      ref,
      (snap) => setTransportes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      // Sem a flag de leitura o snapshot estoura permission-denied: não é erro
      // de app, é só o usuário não tendo acesso à seção.
      () => setTransportes([])
    );
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
    const salaryExtra = {};
    SALARY_FIELDS.forEach((k) => { if (k in extra) salaryExtra[k] = extra[k]; });
    await addDoc(collection(db, 'dpEmployees'), {
      name: trimmed,
      store: storeId,
      active: true,
      createdAt: Timestamp.now(),
      createdBy: author?.uid || '',
      folgaWeekdays: extra.folgaWeekdays ?? null,
      folgaWeekday: extra.folgaWeekday ?? null,
      folgaMonthN: extra.folgaMonthN ?? null,
      // Datas de contrato (YYYY-MM-DD). Fora do intervalo (por mês) o funcionário
      // some do calendário. null = sem limite naquele lado.
      contractStart: extra.contractStart ?? null,
      contractEnd: extra.contractEnd ?? null,
      ...salaryExtra,
    });
  }, []);

  const renameEmployee = useCallback(async (employeeId, name) => {
    await updateDoc(doc(db, 'dpEmployees', employeeId), { name: (name || '').trim() });
  }, []);

  // Edita nome, loja, configuração de folga e/ou perfil salarial do funcionário.
  const updateEmployee = useCallback(async (employeeId, updates) => {
    const clean = {};
    if (typeof updates?.name === 'string') clean.name = updates.name.trim();
    if (updates?.store) clean.store = updates.store;
    if (updates && 'folgaWeekdays' in updates) clean.folgaWeekdays = updates.folgaWeekdays;
    if (updates && 'folgaWeekday' in updates) clean.folgaWeekday = updates.folgaWeekday;
    if (updates && 'folgaMonthN' in updates) clean.folgaMonthN = updates.folgaMonthN;
    if (updates && 'contractStart' in updates) clean.contractStart = updates.contractStart || null;
    if (updates && 'contractEnd' in updates) clean.contractEnd = updates.contractEnd || null;
    SALARY_FIELDS.forEach((k) => { if (updates && k in updates) clean[k] = updates[k]; });
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

  // ---- Salários ----
  // Upsert de uma linha (dia5|dia20|extra) do doc mensal do funcionário.
  // patch é um objeto parcial com as colunas (salario, banco, flash, ...).
  // Se o patch traz `banco` ou `flash`, espelha em dpSalariosBanco (o que Salários Folha lê).
  const setSalario = useCallback(
    async (employeeId, storeId, year, month, line, patch, author) => {
      const id = salarioDocId(employeeId, year, month);
      const head = {
        employeeId,
        store: storeId,
        year,
        month,
        updatedAt: Timestamp.now(),
        updatedBy: author?.uid || '',
      };
      await setDoc(doc(db, 'dpSalarios', id), { ...head, [line]: patch }, { merge: true });
      const mirror = folhaFieldsOf(patch);
      if (mirror) {
        await setDoc(doc(db, 'dpSalariosBanco', id), { ...head, [line]: mirror }, { merge: true });
      }
    },
    []
  );

  // Salários Folha: grava SÓ banco/flash de uma linha, nas duas coleções. Em
  // dpSalarios o merge preserva as outras colunas da linha; as rules só deixam
  // quem tem dpFolhaEdit tocar nesses campos. patch = { banco } ou { flash }.
  const setSalarioFolha = useCallback(
    async (employeeId, storeId, year, month, line, patch, author) => {
      const id = salarioDocId(employeeId, year, month);
      const payload = {
        employeeId,
        store: storeId,
        year,
        month,
        [line]: folhaFieldsOf(patch) || {},
        updatedAt: Timestamp.now(),
        updatedBy: author?.uid || '',
      };
      await setDoc(doc(db, 'dpSalariosBanco', id), payload, { merge: true });
      await setDoc(doc(db, 'dpSalarios', id), payload, { merge: true });
    },
    []
  );

  // ---- Transporte ----
  // Upsert de um campo editável do mês (dias, tarifas, rascunho).
  const setTransporte = useCallback(async (perfil, year, month, patch, author) => {
    await setDoc(
      doc(db, 'dpTransporte', transporteDocId(perfil, year, month)),
      {
        perfil,
        year,
        month,
        ...patch,
        updatedAt: Timestamp.now(),
        updatedBy: author?.uid || '',
      },
      { merge: true }
    );
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
    salarios,
    setSalario,
    salariosBanco,
    setSalarioFolha,
    transportes,
    setTransporte,
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
