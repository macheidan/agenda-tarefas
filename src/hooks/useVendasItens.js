import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { consolidarItens } from '../lib/gestao';

const COLLECTION = 'vendas_itens';

/**
 * Ranking de itens vendidos (sabores/bordas/combos/tamanhos), escrito pelo
 * Apps Script da planilha VENDAS LOJAS. Doc por `${ano_mes}_${marca}_
 * ${categoria}_${slug(item)}` com { marca, ano_mes, categoria, item, qtd, rank }.
 * Sem anoMes traz o histórico inteiro da categoria (evolução mês a mês).
 * 'consolidado' soma dame + lov e re-rankeia no cliente.
 *
 * O resultado carrega a chave da consulta que o gerou: se a chave atual for
 * outra (troca de marca/mês/categoria), a view volta pro "carregando" sem
 * precisar de setState síncrono no efeito.
 */
export function useVendasItens({ marca, anoMes, categoria }) {
  const key = `${marca}|${anoMes ?? ''}|${categoria ?? ''}`;
  const [state, setState] = useState({ key: null, rows: [], error: null });

  useEffect(() => {
    const subscribeMarca = (m, onUpdate) => {
      const constraints = [where('marca', '==', m)];
      if (anoMes) constraints.push(where('ano_mes', '==', anoMes));
      if (categoria) constraints.push(where('categoria', '==', categoria));
      return onSnapshot(
        query(collection(db, COLLECTION), ...constraints),
        (snap) => onUpdate(snap.docs.map((d) => d.data())),
        (err) => setState({ key, rows: [], error: err.message })
      );
    };

    if (marca === 'consolidado') {
      let dame = [];
      let lov = [];
      let dameDone = false;
      let lovDone = false;
      const update = () => {
        if (!dameDone || !lovDone) return;
        setState({ key, rows: consolidarItens([...dame, ...lov]), error: null });
      };
      const u1 = subscribeMarca('dame', (rows) => { dame = rows; dameDone = true; update(); });
      const u2 = subscribeMarca('lov', (rows) => { lov = rows; lovDone = true; update(); });
      return () => { u1(); u2(); };
    }

    const unsub = subscribeMarca(marca, (rows) => {
      rows.sort((a, b) => a.rank - b.rank);
      setState({ key, rows, error: null });
    });
    return unsub;
  }, [marca, anoMes, categoria, key]);

  const atual = state.key === key;
  return {
    itens: atual ? state.rows : [],
    loading: !atual,
    error: atual ? state.error : null,
  };
}
