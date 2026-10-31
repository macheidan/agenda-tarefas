import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = 'vendas_diario';

/**
 * Vendas dia a dia, mês a mês — sub-aba "Por Dia da Semana" de Vendas.
 * Escrito por `scripts/vendas/coletar_diario.py` + `importar_diario.mjs` a
 * partir do relatório `revenue-per-day` (Faturamento por dia) do Saipos.
 *
 * Mesmo desenho do useVendasBairros: um doc por MÊS de uma loja, com os dias
 * dentro (~42 leituras pro histórico das duas lojas):
 *
 *   vendas_diario/{ano_mes}_{marca}
 *     { marca, ano_mes, total_qtd, total_valor, atualizado_em,
 *       dias: [{ d: 'AAAA-MM-DD', q: pedidos, v: valor }] }
 *
 * 'consolidado' soma Dáme + Lov no cliente, dia a dia.
 */
export function useVendasDiario(marca) {
  const [state, setState] = useState({ key: null, meses: [], error: null });

  useEffect(() => {
    const subscribeMarca = (m, onUpdate) =>
      onSnapshot(
        query(collection(db, COLLECTION), where('marca', '==', m)),
        (snap) => onUpdate(snap.docs.map((d) => d.data())),
        (err) => setState({ key: marca, meses: [], error: err.message })
      );

    if (marca === 'consolidado') {
      let dame = null;
      let lov = null;
      const update = () => {
        if (!dame || !lov) return;
        setState({ key: marca, meses: consolidarMeses([...dame, ...lov]), error: null });
      };
      const u1 = subscribeMarca('dame', (rows) => { dame = rows; update(); });
      const u2 = subscribeMarca('lov', (rows) => { lov = rows; update(); });
      return () => { u1(); u2(); };
    }

    return subscribeMarca(marca, (rows) => {
      setState({ key: marca, meses: ordenar(rows), error: null });
    });
  }, [marca]);

  const atual = state.key === marca;
  return {
    meses: atual ? state.meses : [],
    loading: !atual,
    error: atual ? state.error : null,
  };
}

const ordenar = (rows) =>
  [...rows].sort((a, b) => String(a.ano_mes).localeCompare(String(b.ano_mes)));

function consolidarMeses(rows) {
  const porMes = new Map();
  for (const row of rows) {
    const dias = porMes.get(row.ano_mes) ?? new Map();
    for (const d of row.dias || []) {
      const ja = dias.get(d.d) ?? { d: d.d, q: 0, v: 0 };
      ja.q += d.q || 0;
      ja.v += d.v || 0;
      dias.set(d.d, ja);
    }
    porMes.set(row.ano_mes, dias);
  }
  return ordenar(
    [...porMes.entries()].map(([anoMes, dias]) => ({
      marca: 'consolidado',
      ano_mes: anoMes,
      dias: [...dias.values()].sort((a, b) => a.d.localeCompare(b.d)),
    }))
  );
}

// Segunda primeiro: é como a semana da pizzaria se lê (o fim de semana junto
// no fim da tabela).
export const DIAS_SEMANA = [
  { dow: 1, curto: 'Seg', nome: 'Segunda' },
  { dow: 2, curto: 'Ter', nome: 'Terça' },
  { dow: 3, curto: 'Qua', nome: 'Quarta' },
  { dow: 4, curto: 'Qui', nome: 'Quinta' },
  { dow: 5, curto: 'Sex', nome: 'Sexta' },
  { dow: 6, curto: 'Sáb', nome: 'Sábado' },
  { dow: 0, curto: 'Dom', nome: 'Domingo' },
];

/** Média por dia da semana de um mês. Conta só os dias com venda: dia fechado
 *  (feriado, folga) não puxa a média de sexta pra baixo — o nº de dias que
 *  entrou na conta vai junto pra tela mostrar. */
export function mediasPorDiaSemana(mes) {
  const acc = new Map(DIAS_SEMANA.map((s) => [s.dow, { dias: 0, q: 0, v: 0 }]));
  for (const d of mes?.dias || []) {
    if (!(d.q > 0)) continue;
    const [y, m, dd] = d.d.split('-').map(Number);
    const a = acc.get(new Date(y, m - 1, dd).getDay());
    a.dias += 1;
    a.q += d.q;
    a.v += d.v || 0;
  }
  return DIAS_SEMANA.map((s) => {
    const a = acc.get(s.dow);
    return {
      ...s,
      dias: a.dias,
      totalQtd: a.q,
      totalValor: a.v,
      qtd: a.dias ? a.q / a.dias : null,
      valor: a.dias ? a.v / a.dias : null,
      ticket: a.q ? a.v / a.q : null,
    };
  });
}
