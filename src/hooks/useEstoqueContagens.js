import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, setDoc, deleteField, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { contagemId } from '../lib/suprimentos';

// Contagem do Estoque Mensal, POR MÊS e por loja.
//
//   estoqueContagens/{YYYY-MM}_{loja} — { mes, loja, qtys: { [itemId]: number } }
//
// Antes a contagem vivia num campo do próprio item (estoqueQtyDame/Lov), o que
// só guardava a foto mais recente: contar agosto apagava julho. Agora cada mês
// tem seu doc, então a contagem fica registrada e o Relatório Estoque consegue
// valorizar qualquer mês, não só o último.
//
// Um doc por mês/loja (não um por item) porque a tela sempre lê a contagem
// inteira de uma vez, e escrever campo a campo dentro do mapa (`qtys.<id>`) não
// conflita entre duas pessoas contando ao mesmo tempo.
export function useEstoqueContagens() {
  const [contagens, setContagens] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'estoqueContagens'),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
        setContagens(map);
        setLoading(false);
      },
      (err) => {
        console.error('[estoque] erro ao ouvir contagens:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // Mapa itemId -> quantidade de um mês/loja (vazio se ninguém contou ainda).
  const qtysDe = useCallback(
    (mes, lojaId) => contagens[contagemId(mes, lojaId)]?.qtys || {},
    [contagens]
  );

  // Grava a contagem de um item. Campo vazio APAGA a entrada (volta a "não
  // contado"); 0 é uma contagem válida — significa "acabou".
  const setQty = useCallback(async (mes, lojaId, itemId, value) => {
    const raw = typeof value === 'string' ? value.trim() : value;
    const n = raw === '' || raw === null || raw === undefined ? null : Number(raw);
    await setDoc(
      doc(db, 'estoqueContagens', contagemId(mes, lojaId)),
      {
        mes,
        loja: lojaId,
        qtys: { [itemId]: Number.isFinite(n) ? n : deleteField() },
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  }, []);

  return { contagens, loading, qtysDe, setQty };
}
