import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { supabase } from '../utils/supabase';

// Conferir Pedidos (sub-seção de Suprimentos): duas fontes.
//
//   Firestore `comprasPedidos`      — o que o gerente PEDIU (congelado no Copiar)
//   Supabase `notas_fiscais`+`precos` — o que o fornecedor ENTREGOU
//
// A nota fiscal já entra sozinha no Supabase (importador do precos_produtos):
// `notas_fiscais` é a capa (fornecedor, data de emissão, valor, loja) e as
// linhas vivem em `precos` ligadas por `nfe_id`. As duas tabelas têm a policy
// que libera o token do Firebase, a mesma que a seção Preços usa.
//
// Fechar a conferência congela um snapshot imutável em `comprasConferencias`,
// no padrão do `estoqueRelatorios`: reabrir é apagar o doc.

/** Soma N dias a uma data ISO ('YYYY-MM-DD'). */
export const maisDias = (iso, dias) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/**
 * Notas candidatas a um pedido: mesmo fornecedor (pelo de-para), mesma loja e
 * emitidas entre a data do pedido e alguns dias depois da entrega prevista.
 *
 * A janela é curta de propósito. Larga demais, a nota da semana seguinte entra
 * como candidata do pedido anterior e vem marcada por engano — e a assistente
 * teria que desmarcar toda semana. Entrega atrasada além disso é caso raro, e
 * pra esses a tela mostra o campo de ajuste dos dias.
 */
export function useNotasCandidatas({ lojaId, fornecedorSupabaseId, de, ate }) {
  const [notas, setNotas] = useState([]);
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pronto = Boolean(lojaId && fornecedorSupabaseId && de && ate);

  useEffect(() => {
    if (!pronto) return undefined;
    let vivo = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data: caps, error: e1 } = await supabase
          .from('notas_fiscais')
          .select('id, chave_acesso, fornecedor_id, data_emissao, valor_total, loja')
          .eq('loja', lojaId)
          .eq('fornecedor_id', fornecedorSupabaseId)
          .gte('data_emissao', de)
          .lte('data_emissao', ate)
          .order('data_emissao', { ascending: true });
        if (e1) throw new Error(e1.message || String(e1));
        if (!vivo) return;

        const ids = (caps || []).map((n) => n.id);
        if (!ids.length) { setNotas([]); setLinhas([]); return; }

        const { data: its, error: e2 } = await supabase
          .from('precos')
          .select('id, nfe_id, produto_id, qtd_embalagem, unidade_embalagem, preco_bruto, produtos(nome, nome_padrao)')
          .in('nfe_id', ids);
        if (e2) throw new Error(e2.message || String(e2));
        if (!vivo) return;

        setNotas(caps || []);
        setLinhas((its || []).map((r) => ({
          id: r.id,
          nfeId: r.nfe_id,
          produtoId: r.produto_id,
          produto: r.produtos?.nome || '',
          planilha: r.produtos?.nome_padrao || r.produtos?.nome || '',
          qtd: Number(r.qtd_embalagem) || 0,
          unid: r.unidade_embalagem || '',
          valor: Number(r.preco_bruto) || 0,
        })));
      } catch (e) {
        if (!vivo) return;
        console.error('[conferencia] erro ao carregar notas:', e);
        setError(e?.message || String(e));
        setNotas([]);
        setLinhas([]);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [pronto, lojaId, fornecedorSupabaseId, de, ate]);

  return pronto ? { notas, linhas, loading, error } : { notas: [], linhas: [], loading: false, error: null };
}

/**
 * Conferências fechadas. Mapa pedidoId -> doc.
 *
 * A coleção acompanha `comprasPedidos` (~17 docs por semana); ouvir tudo seria
 * desperdício de leitura no free tier, então quem chama passa a janela.
 */
export function useConferencias(desde) {
  const [conferencias, setConferencias] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!desde) return undefined;
    const unsub = onSnapshot(
      collection(db, 'comprasConferencias'),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const v = { id: d.id, ...d.data() };
          if (String(v.data || '') >= desde) map[d.id] = v;
        });
        setConferencias(map);
        setLoading(false);
      },
      (err) => {
        console.error('[conferencia] erro ao ouvir conferências:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [desde]);

  // Congela a conferência: grava as linhas exatamente como estão na tela. A
  // partir daqui ela não olha mais pro Supabase — nota nova que entre depois
  // não mexe no que já foi conferido.
  const fechar = useCallback(async (pedido, payload) => {
    await setDoc(doc(db, 'comprasConferencias', pedido.id), {
      pedidoId: pedido.id,
      data: pedido.data,
      lojaId: pedido.lojaId,
      lojaNome: pedido.lojaNome,
      fornecedorId: pedido.fornecedorId,
      fornecedorNome: pedido.fornecedorNome,
      ...payload,
      fechadoEm: Timestamp.now(),
    });
  }, []);

  const reabrir = useCallback(async (pedidoId) => {
    await deleteDoc(doc(db, 'comprasConferencias', pedidoId));
  }, []);

  return { conferencias, loading, fechar, reabrir };
}

/**
 * Todas as linhas de nota de uma janela (padrão 90 dias), pra caixa "Unidades"
 * levantar de uma vez tudo que ainda não converte.
 *
 * Só busca quando `ativo` — são ~2000 linhas, caro demais pra carregar em toda
 * visita da tela quando a caixa costuma ficar fechada.
 */
export function useLinhasNotaRecentes(ativo, dias = 90) {
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    setLoading(true);
    (async () => {
      try {
        const desde = maisDias(new Date().toISOString().slice(0, 10), -dias);
        const PAGE = 1000;
        let todas = [];
        for (let p = 0; p < 30; p += 1) {
          const { data, error: err } = await supabase
            .from('precos')
            .select('id, qtd_embalagem, unidade_embalagem, produtos(nome, nome_padrao)')
            .gte('data', desde)
            .range(p * PAGE, p * PAGE + PAGE - 1);
          if (err) throw new Error(err.message || String(err));
          if (!data?.length) break;
          todas = todas.concat(data);
          if (data.length < PAGE) break;
        }
        if (!vivo) return;
        setLinhas(todas.map((r) => ({
          id: r.id,
          produto: r.produtos?.nome || '',
          planilha: r.produtos?.nome_padrao || r.produtos?.nome || '',
          qtd: Number(r.qtd_embalagem) || 0,
          unid: r.unidade_embalagem || '',
        })));
        setError(null);
      } catch (e) {
        if (!vivo) return;
        console.error('[conferencia] erro ao levantar unidades pendentes:', e);
        setError(e?.message || String(e));
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [ativo, dias]);

  return { linhas, loading, error };
}

/**
 * Nomes de produto que JÁ vieram numa nota fiscal importada (12 meses), pra
 * caixa "Vínculos" sugerir e listar.
 *
 * Só os que vieram em NFe (`nfe_id` preenchido) de propósito: vincular um item
 * a um produto que nunca chega por nota não resolve nada na conferência — ele
 * continuaria aparecendo como "não veio" toda semana.
 */
export function useProdutosDeNota(ativo, dias = 365) {
  const [nomes, setNomes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    setLoading(true);
    (async () => {
      try {
        const desde = maisDias(new Date().toISOString().slice(0, 10), -dias);
        const PAGE = 1000;
        const vistos = new Set();
        for (let p = 0; p < 30; p += 1) {
          const { data, error } = await supabase
            .from('precos')
            .select('produtos(nome, nome_padrao)')
            .not('nfe_id', 'is', null)
            .gte('data', desde)
            .range(p * PAGE, p * PAGE + PAGE - 1);
          if (error) throw new Error(error.message || String(error));
          if (!data?.length) break;
          for (const r of data) {
            const n = r.produtos?.nome_padrao || r.produtos?.nome;
            if (n) vistos.add(n);
          }
          if (data.length < PAGE) break;
        }
        if (!vivo) return;
        setNomes([...vistos].sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' })));
      } catch (e) {
        if (!vivo) return;
        console.error('[conferencia] erro ao carregar produtos da nota:', e);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [ativo, dias]);

  return { nomes, loading };
}

/** Fornecedores do Supabase, pro de-para. Lista curta, cabe numa consulta só. */
export function useFornecedoresNota() {
  const [fornecedores, setFornecedores] = useState([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('id, nome, nome_curto')
        .order('nome');
      if (!vivo) return;
      if (error) { console.error('[conferencia] erro ao carregar fornecedores:', error); return; }
      setFornecedores(data || []);
    })();
    return () => { vivo = false; };
  }, []);

  return fornecedores;
}
