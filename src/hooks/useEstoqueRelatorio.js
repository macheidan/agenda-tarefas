import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { supabase } from '../utils/supabase';
import { parseDataISO, calcResultado } from '../lib/precos';
import { relatorioId } from '../lib/suprimentos';

// Relatório Estoque (sub-seção de Suprimentos): cruza a CONTAGEM do Estoque
// Mensal com o PREÇO do "Produto (planilha)" da seção Preços.
//
// Duas fontes, dois hooks:
//   usePrecosPlanilha(mes)   — Supabase: último preço de cada Produto (planilha)
//                              até o último dia do mês de referência.
//   useRelatoriosEstoque()   — Firestore `estoqueRelatorios/{mes}_{loja}`: o
//                              relatório JÁ SALVO (congelado).
//
// Enquanto o mês não é salvo, a tela mostra o cálculo ao vivo. Depois de salvo,
// mostra o que está no doc — preço, contagem e total ficam presos ao que valia
// no fechamento, mesmo que uma nota nova entre no banco depois.

// Janela de busca de preço: 12 meses antes do corte. Produto sem nenhuma compra
// nesse intervalo fica sem preço no relatório (aparece como "sem preço"), o que
// é mais honesto que carregar um valor de anos atrás.
const JANELA_DIAS = 365;

function menos(diasISO, dias) {
  const d = new Date(`${diasISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// Puxa as linhas de `precos` no intervalo [desde, ate), paginando pra não
// esbarrar no limite padrão (~1000) do PostgREST. `ate` é exclusivo — quem
// chama passa o primeiro dia do mês seguinte, então serve pra coluna date e
// pra timestamp.
async function fetchPrecosNoIntervalo(desde, ate) {
  const PAGE = 1000;
  let all = [];
  for (let p = 0; p < 30; p++) {
    const { data, error } = await supabase
      .from('precos')
      .select('id, data, preco_normalizado, unidade_normalizada, produto_id, produtos(nome, nome_padrao, medida_padrao, fator_regra3)')
      .gte('data', desde)
      .lt('data', ate)
      .order('data', { ascending: false })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw new Error(error.message || String(error));
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
  }
  return all;
}

// Reduz as linhas ao ÚLTIMO preço de cada Produto (planilha). O custo é o
// Resultado (preço normalizado × Regra3); sem fator, o próprio preço
// normalizado — exatamente o que o CMV usa como custo/kg.
//
// A chave é o nome_padrao definido na seção Preços → Produtos (é ele o "Produto
// (planilha)"); quando o produto ainda não foi padronizado por lá, vale o
// próprio nome do produto. É a mesma chave que o vínculo do item de Compras
// (comprasItens.planilhaNome) guarda.
function reduzirPorPlanilha(rows) {
  const latest = {};
  for (const r of rows) {
    const nome = r.produtos?.nome_padrao || r.produtos?.nome;
    if (!nome) continue;
    const data = parseDataISO(r.data);
    const cur = latest[nome];
    const maisNovo = !cur || data > cur.data ||
      (data === cur.data && String(r.id) > String(cur.id));
    if (maisNovo) latest[nome] = { ...r, data };
  }
  const map = {};
  for (const nome in latest) {
    const p = latest[nome];
    const norm = Number(p.preco_normalizado) || 0;
    const res = calcResultado(norm, p.produtos?.fator_regra3);
    map[nome] = {
      custo: res == null ? norm : res,
      medida: p.unidade_normalizada || p.produtos?.medida_padrao || '',
      data: p.data,
    };
  }
  return map;
}

// Preços congelados na data de corte do mês. `ateExclusivo` = primeiro dia do
// mês seguinte (ver inicioProximoMes).
export function usePrecosPlanilha(ateExclusivo) {
  const [custos, setCustos] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ateExclusivo) return undefined;
    let vivo = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await fetchPrecosNoIntervalo(menos(ateExclusivo, JANELA_DIAS), ateExclusivo);
        if (!vivo) return;
        setCustos(reduzirPorPlanilha(rows));
      } catch (e) {
        if (!vivo) return;
        console.error('[relatorio-estoque] erro ao carregar preços:', e);
        setError(e?.message || String(e));
        setCustos({});
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [ateExclusivo]);

  return { custos, loading, error };
}

// Relatórios já salvos. Mapa id ('YYYY-MM_loja') -> doc.
export function useRelatoriosEstoque() {
  const [relatorios, setRelatorios] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'estoqueRelatorios'),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
        setRelatorios(map);
        setLoading(false);
      },
      (err) => {
        console.error('[relatorio-estoque] erro ao ouvir relatórios:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // Congela o mês: grava as linhas exatamente como estão na tela. A partir
  // daqui o relatório não olha mais pro banco de preços nem pra contagem.
  const salvar = useCallback(async (mes, loja, payload) => {
    const id = relatorioId(mes, loja.id);
    await setDoc(doc(db, 'estoqueRelatorios', id), {
      mes,
      loja: loja.id,
      lojaNome: loja.nome,
      ...payload,
      savedAt: Timestamp.now(),
    });
    return id;
  }, []);

  const reabrir = useCallback(async (mes, lojaId) => {
    await deleteDoc(doc(db, 'estoqueRelatorios', relatorioId(mes, lojaId)));
  }, []);

  return { relatorios, loading, salvar, reabrir };
}
