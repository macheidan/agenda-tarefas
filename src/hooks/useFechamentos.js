import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { consolidarFechamentos } from '../lib/gestao';

const COLLECTION = 'fechamentos_mensais';

/**
 * Fechamentos mensais de uma marca em tempo real (Mesa do Dono e DRE).
 * Doc id `${ano_mes}_${marca}`, escrito pelos Apps Scripts das planilhas
 * DRE e VENDAS LOJAS — no cliente é só leitura.
 * Para 'consolidado' assina dame + lov e soma por ano_mes.
 * `fechamentos` fica null até o primeiro snapshot (loading derivado disso);
 * ao trocar de marca os dados antigos seguem na tela até o novo chegar.
 */
export function useFechamentos(marca) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (marca === 'consolidado') {
      let dame = [];
      let lov = [];
      let dameDone = false;
      let lovDone = false;
      const update = () => {
        if (!dameDone || !lovDone) return;
        setState(consolidarFechamentos(dame, lov));
        setError(null);
      };
      const unsubDame = onSnapshot(
        query(collection(db, COLLECTION), where('marca', '==', 'dame')),
        (snap) => { dame = snap.docs.map((d) => d.data()); dameDone = true; update(); },
        (err) => setError(err.message)
      );
      const unsubLov = onSnapshot(
        query(collection(db, COLLECTION), where('marca', '==', 'lov')),
        (snap) => { lov = snap.docs.map((d) => d.data()); lovDone = true; update(); },
        (err) => setError(err.message)
      );
      return () => { unsubDame(); unsubLov(); };
    }

    const unsub = onSnapshot(
      query(collection(db, COLLECTION), where('marca', '==', marca)),
      (snap) => {
        const list = snap.docs.map((d) => d.data());
        list.sort((a, b) => a.ano_mes.localeCompare(b.ano_mes));
        setState(list);
        setError(null);
      },
      (err) => setError(err.message)
    );
    return unsub;
  }, [marca]);

  return { fechamentos: state ?? [], loading: state === null && !error, error };
}
