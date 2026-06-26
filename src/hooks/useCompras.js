import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { COMPRAS_SEED } from '../data/comprasSeed';

export function useCompras() {
  const [fornecedores, setFornecedores] = useState([]);
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Ref para acessar a lista de itens mais recente dentro de callbacks estáveis.
  const itensRef = useRef([]);

  // Fornecedores.
  useEffect(() => {
    const ref = collection(db, 'comprasFornecedores');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setFornecedores(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setLoading(false);
        setError(err?.message || String(err));
      }
    );
    return unsub;
  }, []);

  // Itens.
  useEffect(() => {
    const ref = collection(db, 'comprasItens');
    const unsub = onSnapshot(ref, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      itensRef.current = items;
      setItens(items);
    });
    return unsub;
  }, []);

  // ---- Fornecedores ----
  const addFornecedor = useCallback(async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const ref = await addDoc(collection(db, 'comprasFornecedores'), {
      name: trimmed,
      order: Date.now(),
      createdAt: Timestamp.now(),
    });
    return ref.id;
  }, []);

  const renameFornecedor = useCallback(async (id, name) => {
    await updateDoc(doc(db, 'comprasFornecedores', id), { name: (name || '').trim() });
  }, []);

  // Remove o fornecedor e todos os seus itens.
  const deleteFornecedor = useCallback(async (id) => {
    const childIds = itensRef.current.filter((i) => i.fornecedorId === id).map((i) => i.id);
    await Promise.all(childIds.map((cid) => deleteDoc(doc(db, 'comprasItens', cid))));
    await deleteDoc(doc(db, 'comprasFornecedores', id));
  }, []);

  // ---- Itens ----
  const addItem = useCallback(async (fornecedorId, data = {}) => {
    if (!fornecedorId) return;
    await addDoc(collection(db, 'comprasItens'), {
      fornecedorId,
      produto: (data.produto || '').trim(),
      marca: (data.marca || '').trim(),
      unid: (data.unid || '').trim(),
      qty: Number(data.qty) || 0,
      order: Date.now(),
      createdAt: Timestamp.now(),
    });
  }, []);

  const updateItem = useCallback(async (id, updates) => {
    const clean = {};
    if (typeof updates?.produto === 'string') clean.produto = updates.produto.trim();
    if (typeof updates?.marca === 'string') clean.marca = updates.marca.trim();
    if (typeof updates?.unid === 'string') clean.unid = updates.unid.trim();
    if (updates && 'qty' in updates) clean.qty = Number(updates.qty) || 0;
    if (Object.keys(clean).length) {
      await updateDoc(doc(db, 'comprasItens', id), clean);
    }
  }, []);

  const deleteItem = useCallback(async (id) => {
    await deleteDoc(doc(db, 'comprasItens', id));
  }, []);

  // Zera a quantidade de TODOS os itens (de todos os fornecedores).
  // Só grava nos que não estão zerados, pra minimizar escritas.
  const resetAllQuantities = useCallback(async () => {
    const toReset = itensRef.current.filter((i) => Number(i.qty) !== 0);
    await Promise.all(
      toReset.map((i) => updateDoc(doc(db, 'comprasItens', i.id), { qty: 0 }))
    );
    return toReset.length;
  }, []);

  // ---- Importação única (dados migrados do app antigo) ----
  // Grava os fornecedores + itens do seed embutido no Firestore. Pensado para
  // rodar uma vez, com a seção ainda vazia (botão só aparece nesse estado).
  const seedInitialData = useCallback(async () => {
    const suppliers = COMPRAS_SEED;
    if (!suppliers.length) throw new Error('Nenhum dado inicial disponível.');
    let nFornec = 0;
    let nItens = 0;
    for (let s = 0; s < suppliers.length; s++) {
      const sup = suppliers[s];
      const ref = await addDoc(collection(db, 'comprasFornecedores'), {
        name: sup.name,
        order: s,
        createdAt: Timestamp.now(),
      });
      nFornec++;
      for (let i = 0; i < sup.items.length; i++) {
        const it = sup.items[i];
        await addDoc(collection(db, 'comprasItens'), {
          fornecedorId: ref.id,
          produto: it.produto,
          marca: it.marca,
          unid: it.unid,
          qty: it.qty,
          order: i,
          createdAt: Timestamp.now(),
        });
        nItens++;
      }
    }
    return { fornecedores: nFornec, itens: nItens };
  }, []);

  return {
    fornecedores,
    itens,
    loading,
    error,
    addFornecedor,
    renameFornecedor,
    deleteFornecedor,
    addItem,
    updateItem,
    deleteItem,
    resetAllQuantities,
    seedInitialData,
  };
}
