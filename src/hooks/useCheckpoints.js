import { useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, orderBy,
  query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = 'checkpoints';

// Anotações de negócio por mês (aba Anotações da Gestão). Marcam os gráficos
// da Mesa do Dono e de Vendas com dot + tooltip. Docs antigos sem escopo são
// normalizados pra 'consolidado' na leitura.
function useStream() {
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, COLLECTION), orderBy('ano_mes', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCheckpoints(snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, escopo: data.escopo ?? 'consolidado' };
        }));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { checkpoints, loading };
}

/**
 * Checkpoints visíveis na view de marca ativa (pros gráficos):
 * 'consolidado' vê todos; 'dame'/'lov' veem os da marca + os de ambas.
 * Retorna também o índice byMes usado por dots e tooltips.
 */
export function useCheckpoints(marca) {
  const { checkpoints, loading } = useStream();

  const filtered = useMemo(
    () => (marca === 'consolidado'
      ? checkpoints
      : checkpoints.filter((c) => c.escopo === marca || c.escopo === 'consolidado')),
    [checkpoints, marca]
  );

  const byMes = useMemo(() => {
    const m = new Map();
    for (const c of filtered) {
      if (!m.has(c.ano_mes)) m.set(c.ano_mes, []);
      m.get(c.ano_mes).push(c);
    }
    return m;
  }, [filtered]);

  return { checkpoints: filtered, byMes, loading };
}

/** Campos opcionais: undefined não entra no Firestore — omite no create, remove no update. */
function optionalFields(data, forUpdate) {
  const out = {};
  for (const key of ['data', 'tipo', 'custo']) {
    const v = data[key];
    if (v !== undefined && v !== null && v !== '') out[key] = v;
    else if (forUpdate) out[key] = deleteField();
  }
  return out;
}

/** Todos os checkpoints (sem filtro de marca) + CRUD — pra aba Anotações. */
export function useAllCheckpoints() {
  const { checkpoints, loading } = useStream();

  const addCheckpoint = async (data, createdBy) => {
    await addDoc(collection(db, COLLECTION), {
      ano_mes: data.ano_mes,
      titulo: data.titulo,
      descricao: data.descricao ?? '',
      escopo: data.escopo,
      ...optionalFields(data, false),
      createdAt: serverTimestamp(),
      createdBy,
    });
  };

  const updateCheckpoint = async (id, data) => {
    await updateDoc(doc(db, COLLECTION, id), {
      ano_mes: data.ano_mes,
      titulo: data.titulo,
      descricao: data.descricao ?? '',
      escopo: data.escopo,
      ...optionalFields(data, true),
    });
  };

  const deleteCheckpoint = async (id) => {
    await deleteDoc(doc(db, COLLECTION, id));
  };

  return { checkpoints, loading, addCheckpoint, updateCheckpoint, deleteCheckpoint };
}
