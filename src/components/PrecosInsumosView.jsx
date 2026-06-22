import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

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
    <div>
      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Produtos" value={totalProdutos} />
        <StatCard label="Fornecedores" value={totalFornecedores} />
        <StatCard label="Registros" value={precos.length} />
      </div>

      {/* Filtro */}
      <input
        type="text"
        placeholder="Filtrar por produto ou fornecedor..."
        value={filtro}
        onChange={e => setFiltro(e.target.value)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 8,
          border: '1px solid var(--border)', marginBottom: 16,
          fontSize: 14, boxSizing: 'border-box',
          background: 'var(--card-bg)', color: 'var(--text)',
        }}
      />

      {/* Grafico */}
      {chartData.length > 1 && (
        <div style={{
          background: 'var(--card-bg)', borderRadius: 8,
          border: '1px solid var(--border)', padding: 16, marginBottom: 16,
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>
            Historico de Precos (R$/unidade)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6 }}
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

      {/* Tabela */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: 8,
        border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Produto</th>
              <th style={thStyle}>Fornecedor</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Preco/un</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Un</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={emptyStyle}>Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={5} style={emptyStyle}>Nenhum registro</td></tr>
            ) : filtrados.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={tdStyle}>{p.data}</td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{p.produto}</td>
                <td style={tdStyle}>{p.fornecedor}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>
                  R$ {p.preco_normalizado.toFixed(2)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{p.unidade_normalizada}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: 8,
      border: '1px solid var(--border)', padding: '10px 14px',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const thStyle = { padding: '8px 12px', fontSize: 12, fontWeight: 600 };
const tdStyle = { padding: '8px 12px' };
const emptyStyle = { padding: '32px 12px', textAlign: 'center', color: 'var(--text-secondary)' };
