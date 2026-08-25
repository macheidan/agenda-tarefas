import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = 'dre_detalhes';

/**
 * Detalhes do DRE: lançamentos dos extratos agregados por favorecido, um doc
 * por `${ano_mes}_${marca}` com `itens: { conta: [{ n, v }] }`.
 * Carregamento preguiçoso: só assina quando `enabled` vira true (primeira
 * linha expandida na tabela). 'consolidado' busca dame + lov; o merge é do
 * consumidor (DreView soma por favorecido).
 */
export function useDreDetalhes(marca, enabled) {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const marcas = marca === 'consolidado' ? ['dame', 'lov'] : [marca];
    const unsub = onSnapshot(
      query(collection(db, COLLECTION), where('marca', 'in', marcas)),
      (snap) => setState(snap.docs.map((d) => d.data())),
      () => setState([])
    );
    return unsub;
  }, [marca, enabled]);

  return { detalhes: state ?? [], loading: enabled && state === null };
}
