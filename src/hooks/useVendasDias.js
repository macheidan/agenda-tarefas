import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = 'vendas_dias';

/**
 * Histórico diário de vendas (Dáme + Lov) de um mês fechado, gravado toda
 * madrugada por scripts/dash/runner.py (vendas_dias.json -> Firestore) — ao
 * contrário do JSON do coletor (useDashFeed), que só tem o mês corrente e
 * reseta ao virar o mês. Usado pelo card "Vendas por dia" da Mesa do Dono
 * pra navegar meses passados. Passe `anoMes: null` pra não assinar nada
 * (ex.: mês corrente, que já vem ao vivo pelo useDashFeed).
 */
export function useVendasDias(anoMes) {
  // Guarda o mês junto do resultado: assim, ao trocar de anoMes, o valor
  // antigo não vaza pra tela por um frame (comparado no return, não via
  // reset em efeito).
  const [snapshot, setSnapshot] = useState(null); // { anoMes, dias } | null
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!anoMes) return undefined;
    const unsub = onSnapshot(
      doc(db, COLLECTION, anoMes),
      (snap) => {
        setSnapshot({ anoMes, dias: snap.exists() ? (snap.data().dias ?? []) : [] });
        setError(null);
      },
      (err) => setError(err.message)
    );
    return unsub;
  }, [anoMes]);

  const valido = !!anoMes && snapshot?.anoMes === anoMes;
  return { dias: valido ? snapshot.dias : [], loading: !!anoMes && !valido && !error, error };
}
