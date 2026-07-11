import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { CMV_SEED } from '../data/cmvSeed';

// Hook do CMV (fichas técnicas). Duas coleções flat no Firestore:
//   cmvBeneficiados/{id} — { nome, rendimento, lines: [{ ref, qtd }], order }
//   cmvSabores/{id}      — { nome, lines: [{ ref, tipo, qtdP, qtdM, qtdG, qtdS }], order }
// O CUSTO não é gravado: é calculado no cliente a partir do Resultado (custo/kg)
// de cada Produto (planilha), vindo da seção Preços. Ver CmvView.
export function useCmv() {
  const [beneficiados, setBeneficiados] = useState([]);
  const [sabores, setSabores] = useState([]);
  // Base que entra em TODAS as pizzas, por categoria. cmvConfig/bases.
  const [bases, setBases] = useState({ salgada: [], doce: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cmvConfig', 'bases'), (snap) => {
      const d = snap.data() || {};
      setBases({
        salgada: Array.isArray(d.salgada) ? d.salgada : [],
        doce: Array.isArray(d.doce) ? d.doce : [],
      });
    }, () => {});
    return unsub;
  }, []);

  const updateBases = useCallback(async (next) => {
    await setDoc(doc(db, 'cmvConfig', 'bases'), {
      salgada: next.salgada || [], doce: next.doce || [],
    });
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cmvBeneficiados'),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setBeneficiados(items);
        setLoading(false);
        setError(null);
      },
      (err) => { setLoading(false); setError(err?.message || String(err)); }
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cmvSabores'),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setSabores(items);
      },
      (err) => setError(err?.message || String(err))
    );
    return unsub;
  }, []);

  // ---- Beneficiados ----
  const addBeneficiado = useCallback(async (nome) => {
    const t = (nome || '').trim();
    if (!t) return null;
    const ref = await addDoc(collection(db, 'cmvBeneficiados'), {
      nome: t, rendimento: null, lines: [], order: Date.now(), createdAt: Timestamp.now(),
    });
    return ref.id;
  }, []);

  const updateBeneficiado = useCallback(async (id, updates) => {
    await updateDoc(doc(db, 'cmvBeneficiados', id), updates);
  }, []);

  const deleteBeneficiado = useCallback(async (id) => {
    await deleteDoc(doc(db, 'cmvBeneficiados', id));
  }, []);

  // ---- Sabores ----
  const addSabor = useCallback(async (nome) => {
    const t = (nome || '').trim();
    if (!t) return null;
    const ref = await addDoc(collection(db, 'cmvSabores'), {
      nome: t, lines: [], order: Date.now(), createdAt: Timestamp.now(),
    });
    return ref.id;
  }, []);

  const updateSabor = useCallback(async (id, updates) => {
    await updateDoc(doc(db, 'cmvSabores', id), updates);
  }, []);

  const deleteSabor = useCallback(async (id) => {
    await deleteDoc(doc(db, 'cmvSabores', id));
  }, []);

  // Importação única a partir do seed (planilha FICHAS CMV). Só faz sentido com a
  // seção vazia — o botão que chama isto some depois. Grava tudo no Firestore.
  const seedInitialData = useCallback(async () => {
    const bs = CMV_SEED?.beneficiados || [];
    const ss = CMV_SEED?.sabores || [];
    if (!bs.length && !ss.length) throw new Error('Nenhum dado de importação disponível (cmvSeed vazio).');
    let nb = 0, ns = 0;
    for (let i = 0; i < bs.length; i++) {
      await addDoc(collection(db, 'cmvBeneficiados'), {
        nome: bs[i].nome, rendimento: bs[i].rendimento ?? null, lines: bs[i].lines || [],
        order: i, createdAt: Timestamp.now(),
      });
      nb++;
    }
    for (let i = 0; i < ss.length; i++) {
      await addDoc(collection(db, 'cmvSabores'), {
        nome: ss[i].nome, lines: ss[i].lines || [],
        order: i, createdAt: Timestamp.now(),
      });
      ns++;
    }
    return { beneficiados: nb, sabores: ns };
  }, []);

  return {
    beneficiados, sabores, bases, loading, error,
    addBeneficiado, updateBeneficiado, deleteBeneficiado,
    addSabor, updateSabor, deleteSabor, updateBases,
    seedInitialData,
  };
}
