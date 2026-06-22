import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import styles from '../styles/PrecosInsumosView.module.css';

const COLORS = ['#8E0000', '#A50000', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

export default function PrecosInsumosView() {
  const [precos, setPrecos] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from('precos')
      .select('*, produtos(nome, categoria, medida_padrao), fornecedores(nome, categoria)')
      .order('data', { ascending: false })
      .limit(500);

    setPrecos((data || []).map(r => ({
      id: r.id,
      data: r.data,
      preco_bruto: r.preco_bruto,
      preco_normalizado: r.preco_normalizado,
      unidade_normalizada: r.unidade_normalizada,
      qtd_embalagem: r.qtd_embalagem,
      unidade_embalagem: r.unidade_embalagem,
      produto: r.produtos?.nome || '',
      fornecedor: r.fornecedores?.nome || '',
      categoria: r.produtos?.categoria || '',
    })));
    setLoading(false);
  }

  const filtrados = useMemo(() => {
    if (!filtro) return precos;
    const f = filtro.toLowerCase();
    return precos.filter(p =>
      p.produto.toLowerCase().includes(f) ||
      p.fornecedor.toLowerCase().includes(f)
    );
  }, [precos, filtro]);

  const produtosUnicos = useMemo(() =>
    [...new Set(filtrados.map(p => p.produto))].slice(0, 8),
    [filtrados]
  );

  const chartData = useMemo(() => {
    const byDate = {};
    for (const p of filtrados) {
      if (!produtosUnicos.includes(p.produto)) continue;
      if (!byDate[p.data]) byDate[p.data] = {};
      byDate[p.data][p.produto] = p.preco_normalizado;
    }
    return Object.entries(byDate)
      .map(([data, vals]) => ({ data, ...vals }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [filtrados, produtosUnicos]);

  const totalProdutos = new Set(precos.map(p => p.produto)).size;
  const totalFornecedores = new Set(precos.map(p => p.fornecedor)).size;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Preços Insumos</h2>
      </div>

      <div className={styles.stats}>
        <span><strong>{totalProdutos}</strong> produtos</span>
        <span><strong>{totalFornecedores}</strong> fornecedores</span>
        <span><strong>{precos.length}</strong> registros</span>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Filtrar por produto ou fornecedor..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
        />
      </div>

      {chartData.length > 1 && (
        <div className={styles.chartWrap}>
          <h3 className={styles.chartTitle}>Histórico de Preços (R$/unidade)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
              />
              {produtosUnicos.map((prod, i) => (
                <Line
                  key={prod} type="monotone" dataKey={prod}
                  stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                  dot={{ r: 3 }} connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className={styles.empty}>
          {precos.length === 0
            ? 'Nenhum registro de preço cadastrado.'
            : 'Nenhum resultado para o filtro atual.'}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Produto</th>
                <th>Fornecedor</th>
                <th className={styles.thRight}>Preço/un</th>
                <th className={styles.thRight}>Un</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id}>
                  <td data-label="Data">{p.data}</td>
                  <td className={styles.cellProduct} data-label="Produto">{p.produto}</td>
                  <td data-label="Fornec.">{p.fornecedor}</td>
                  <td className={styles.cellNum} data-label="Preço">
                    R$ {p.preco_normalizado.toFixed(2)}
                  </td>
                  <td className={styles.cellRight} data-label="Un">{p.unidade_normalizada}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
