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

const SIZE_KEYS = ['qtdP', 'qtdM', 'qtdG', 'qtdS'];

// Replica o peso dos ingredientes da BASE nas linhas de um sabor: linha com o
// mesmo ingrediente (ref + tipo) de uma linha da base tem os 4 tamanhos
// forçados aos valores da base — a base é a fonte única do peso.
function applyBaseToLines(lines, baseLines) {
  if (!Array.isArray(baseLines) || !baseLines.length) return { lines: lines || [], changed: false };
  let changed = false;
  const out = (lines || []).map((l) => {
    const b = baseLines.find((bl) => bl.ref === l.ref && (bl.tipo || 'base') === (l.tipo || 'base'));
    if (!b) return l;
    const upd = { ...l };
    for (const k of SIZE_KEYS) {
      const v = Number(b[k]) || 0;
      if ((Number(l[k]) || 0) !== v) { upd[k] = v; changed = true; }
    }
    return upd;
  });
  return { lines: out, changed };
}
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
    const bs = { salgada: next.salgada || [], doce: next.doce || [] };
    await setDoc(doc(db, 'cmvConfig', 'bases'), bs);
    // Replica o peso dos ingredientes da base para todo sabor da categoria
    // que contém o ingrediente na própria ficha (doces e salgadas separadas).
    await Promise.all(sabores.map(async (s) => {
      const cat = s.categoria || 'salgada';
      const { lines, changed } = applyBaseToLines(s.lines, bs[cat]);
      if (changed) await updateDoc(doc(db, 'cmvSabores', s.id), { lines });
    }));
  }, [sabores]);

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
    const next = { ...updates };
    // Mexeu nas linhas ou na categoria? Reaplica o peso da base da categoria
    // resultante — inclusive quando um ingrediente da base acabou de entrar
    // na ficha (o peso já chega preenchido).
    if (next.lines || next.categoria) {
      const cur = sabores.find((s) => s.id === id);
      const cat = next.categoria || cur?.categoria || 'salgada';
      const { lines, changed } = applyBaseToLines(next.lines || cur?.lines || [], bases[cat]);
      if (next.lines || changed) next.lines = lines;
    }
    await updateDoc(doc(db, 'cmvSabores', id), next);
  }, [sabores, bases]);

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
