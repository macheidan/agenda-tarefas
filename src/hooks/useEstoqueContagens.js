import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, setDoc, deleteField, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { contagemId } from '../lib/suprimentos';

// Contagem do Estoque Mensal, POR MÊS e por loja.
//
//   estoqueContagens/{YYYY-MM}_{loja} — {
//     mes, loja,
//     qtys:     { [itemId]: number },
//     catalogo: [{ id, produto, marca, unid, fornecedorId, fornecedor, planilha }],
//   }
//
// Antes a contagem vivia num campo do próprio item (estoqueQtyDame/Lov), o que
// só guardava a foto mais recente: contar agosto apagava julho. Agora cada mês
// tem seu doc, então a contagem fica registrada e o Relatório Estoque consegue
// valorizar qualquer mês, não só o último.
//
// `catalogo` é a LISTA DE COMPRAS CONGELADA: o elenco de produtos como estava
// no momento em que aquele mês começou a ser preenchido. O mês contado é
// registro histórico — se depois um produto sai do catálogo (deixou de ser
// comprado, foi apagado) ou entra um novo, o mês fechado não muda. É por ele
// que a tela monta a lista, não pelo catálogo de hoje.
//
// Um doc por mês/loja (não um por item) porque a tela sempre lê a contagem
// inteira de uma vez, e escrever campo a campo dentro de `qtys.<id>` não
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

  // Elenco congelado do mês. Vazio = mês ainda não começou a ser preenchido —
  // aí vale o catálogo de Compras de hoje, e é ele que será congelado na
  // primeira contagem.
  const catalogoDe = useCallback(
    (mes, lojaId) => contagens[contagemId(mes, lojaId)]?.catalogo || null,
    [contagens]
  );

  // Grava a contagem de um item. Campo vazio APAGA a entrada (volta a "não
  // contado"); 0 é uma contagem válida — significa "acabou".
  //
  // `catalogoAtual` só é usado na PRIMEIRA gravação do mês: é o elenco que fica
  // congelado. Nas seguintes é ignorado — mudar o catálogo de Compras no meio
  // do mês não pode reescrever a lista que a loja está contando.
  const setQty = useCallback(async (mes, lojaId, itemId, value, catalogoAtual) => {
    const id = contagemId(mes, lojaId);
    const raw = typeof value === 'string' ? value.trim() : value;
    const n = raw === '' || raw === null || raw === undefined ? null : Number(raw);
    const contado = Number.isFinite(n);
    const payload = {
      mes,
      loja: lojaId,
      qtys: { [itemId]: contado ? n : deleteField() },
      updatedAt: Timestamp.now(),
    };
    if (!contagens[id]?.catalogo && Array.isArray(catalogoAtual) && catalogoAtual.length) {
      payload.catalogo = catalogoAtual;
      payload.catalogoEm = Timestamp.now();
    }
    await setDoc(doc(db, 'estoqueContagens', id), payload, { merge: true });
  }, [contagens]);

  return { contagens, loading, qtysDe, catalogoDe, setQty };
}
