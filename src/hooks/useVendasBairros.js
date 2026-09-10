import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTION = 'vendas_bairros';

/**
 * Vendas por área de entrega (bairro), mês a mês — sub-aba "Por Bairro" de
 * Vendas. Escrito por `scripts/vendas/coletar_bairros.py` +
 * `importar_bairros.mjs` a partir do relatório `sales-by-store-district` do
 * Saipos.
 *
 * NÃO é um doc por bairro: são ~60 bairros × 32 meses × 2 lojas, e a tela
 * precisa do histórico inteiro pra desenhar a linha mês a mês — um doc por
 * bairro custaria ~2 mil leituras por abertura, e a quota do Firestore
 * (free tier) já é o gargalo do projeto. Cada doc é um MÊS de uma loja:
 *
 *   vendas_bairros/{ano_mes}_{marca}
 *     { marca, ano_mes, total_qtd, total_valor, atualizado_em,
 *       bairros: [{ b: bairro, q: pedidos, v: valor }] }
 *
 * Assim o histórico das duas lojas sai em ~64 leituras.
 *
 * 'consolidado' soma Dáme + Lov no cliente (não existe doc consolidado), pelo
 * mesmo critério de agrupamento do coletor: bairros com a mesma chave
 * normalizada viram uma linha só.
 */
export function useVendasBairros(marca) {
  const [state, setState] = useState({ key: null, meses: [], error: null });

  useEffect(() => {
    const subscribeMarca = (m, onUpdate) =>
      onSnapshot(
        query(collection(db, COLLECTION), where('marca', '==', m)),
        (snap) => onUpdate(snap.docs.map((d) => d.data())),
        (err) => setState({ key: marca, meses: [], error: err.message })
      );

    if (marca === 'consolidado') {
      let dame = [];
      let lov = [];
      let dameDone = false;
      let lovDone = false;
      const update = () => {
        if (!dameDone || !lovDone) return;
        setState({ key: marca, meses: consolidarMeses([...dame, ...lov]), error: null });
      };
      const u1 = subscribeMarca('dame', (rows) => { dame = rows; dameDone = true; update(); });
      const u2 = subscribeMarca('lov', (rows) => { lov = rows; lovDone = true; update(); });
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

/** Chave de agrupamento de bairro — espelha `chaveBairro` de
 *  `utils/relatoriosClientes.js` e `chave_bairro` do coletor: "Passo D'Areia"
 *  e "Passo da Areia" são o mesmo lugar. */
const CONECTIVOS = new Set(['da', 'de', 'do', 'das', 'dos', 'd', 'e']);

export function chaveBairro(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((p) => p && !CONECTIVOS.has(p))
    .join(' ');
}

/** Soma os meses das duas lojas: mesmo mês vira um doc só, e bairro repetido
 *  entre as lojas soma pedidos e valor (a grafia exibida é a da loja com mais
 *  pedidos naquele mês). */
function consolidarMeses(rows) {
  const porMes = new Map();
  for (const row of rows) {
    const alvo = porMes.get(row.ano_mes) ?? { marca: 'consolidado', ano_mes: row.ano_mes, _bairros: new Map() };
    for (const b of row.bairros || []) {
      const chave = chaveBairro(b.b) || 'sem bairro';
      const ja = alvo._bairros.get(chave);
      if (ja) {
        if ((b.q || 0) > ja.q) ja.b = b.b;
        ja.q += b.q || 0;
        ja.v += b.v || 0;
      } else {
        alvo._bairros.set(chave, { b: b.b, q: b.q || 0, v: b.v || 0 });
      }
    }
    porMes.set(row.ano_mes, alvo);
  }
  return ordenar(
    [...porMes.values()].map((m) => {
      const bairros = [...m._bairros.values()].sort((a, b) => b.q - a.q);
      return {
        marca: 'consolidado',
        ano_mes: m.ano_mes,
        bairros,
        total_qtd: bairros.reduce((s, b) => s + b.q, 0),
        total_valor: bairros.reduce((s, b) => s + b.v, 0),
      };
    })
  );
}
