import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const PAGE_OPTIONS = [50, 100, 200];

export default function PrecosInsumosView() {
  const [precos, setPrecos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [dataInicio, setDataInicio] = useState(daysAgo(30));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

  // Paginacao
  const [porPagina, setPorPagina] = useState(50);
  const [paginaAtual, setPaginaAtual] = useState(1);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from('precos')
      .select('*, produtos(nome, categoria, medida_padrao), fornecedores(nome, categoria)')
      .order('data', { ascending: false })
      .limit(2000);

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
    })));
    setLoading(false);
  }

  // Lista de fornecedores unicos
  const fornecedoresUnicos = useMemo(() =>
    [...new Set(precos.map(p => p.fornecedor))].filter(Boolean).sort(),
    [precos]
  );

  // Filtrar
  const filtrados = useMemo(() => {
    return precos.filter(p => {
      if (dataInicio && p.data < dataInicio) return false;
      if (dataFim && p.data > dataFim) return false;
      if (filtroFornecedor && p.fornecedor !== filtroFornecedor) return false;
      if (filtroTexto) {
        const f = filtroTexto.toLowerCase();
        if (!p.produto.toLowerCase().includes(f) && !p.fornecedor.toLowerCase().includes(f)) return false;
      }
      return true;
    });
  }, [precos, filtroTexto, filtroFornecedor, dataInicio, dataFim]);

  // Paginacao
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaSegura = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaSegura - 1) * porPagina;
  const paginados = filtrados.slice(inicio, inicio + porPagina);

  // Reset pagina ao mudar filtro
  useEffect(() => { setPaginaAtual(1); }, [filtroTexto, filtroFornecedor, dataInicio, dataFim, porPagina]);

  const totalProdutos = new Set(filtrados.map(p => p.produto)).size;

  return (
    <div>
      {/* Stats */}
      <div style={statsRow}>
        <Stat label="Produtos" value={totalProdutos} />
        <Stat label="Fornecedores" value={filtroFornecedor ? 1 : fornecedoresUnicos.length} />
        <Stat label="Registros" value={filtrados.length} />
      </div>

      {/* Filtros */}
      <div style={filtersRow}>
        {/* Busca texto */}
        <input
          type="search"
          placeholder="Buscar produto..."
          value={filtroTexto}
          onChange={e => setFiltroTexto(e.target.value)}
          style={inputStyle}
        />

        {/* Fornecedor */}
        <select
          value={filtroFornecedor}
          onChange={e => setFiltroFornecedor(e.target.value)}
          style={selectStyle}
        >
          <option value="">Todos fornecedores</option>
          {fornecedoresUnicos.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {/* Datas */}
        <div style={dateGroup}>
          <label style={dateLabel}>De</label>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={dateInput} />
          <label style={dateLabel}>Ate</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={dateInput} />
        </div>

        {/* Itens por pagina */}
        <select
          value={porPagina}
          onChange={e => setPorPagina(Number(e.target.value))}
          style={{ ...selectStyle, width: 80 }}
        >
          {PAGE_OPTIONS.map(n => (
            <option key={n} value={n}>{n}/pag</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={emptyStyle}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div style={emptyStyle}>Nenhum registro encontrado</div>
      ) : (
        <>
          <div style={tableWrap}>
            <table style={tableStyle}>
              <thead>
                <tr style={theadRow}>
                  <th style={th}>Produto</th>
                  <th style={th}>Fornecedor</th>
                  <th style={th}>Data</th>
                  <th style={thRight}>$ Compra</th>
                  <th style={thRight}>$ kg/un/L</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map(p => (
                  <tr key={p.id} style={trStyle}>
                    <td style={tdBold}>{p.produto}</td>
                    <td style={td}>{p.fornecedor}</td>
                    <td style={td}>{formatDate(p.data)}</td>
                    <td style={tdNum}>R$ {p.preco_bruto.toFixed(2)}</td>
                    <td style={tdNum}>
                      R$ {p.preco_normalizado.toFixed(2)}/{p.unidade_normalizada}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginacao */}
          <div style={paginationRow}>
            <span style={paginationInfo}>
              {inicio + 1}-{Math.min(inicio + porPagina, filtrados.length)} de {filtrados.length}
            </span>
            <div style={paginationButtons}>
              <button
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaSegura <= 1}
                style={pagBtn}
              >Anterior</button>
              <span style={pagCurrent}>{paginaSegura}/{totalPaginas}</span>
              <button
                onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura >= totalPaginas}
                style={pagBtn}
              >Proximo</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary, #888)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// --- Estilos inline (compativel com o sistema de vars do intranet) ---

const statsRow = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 };
const statCard = { background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', padding: '10px 14px' };

const filtersRow = { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' };
const inputStyle = {
  flex: '1 1 200px', padding: '8px 12px', borderRadius: 6,
  border: '1px solid var(--border, #e5e5e5)', fontSize: 13,
  background: 'var(--card-bg, #fff)', color: 'var(--text, #222)',
};
const selectStyle = {
  padding: '8px 12px', borderRadius: 6,
  border: '1px solid var(--border, #e5e5e5)', fontSize: 13,
  background: 'var(--card-bg, #fff)', color: 'var(--text, #222)',
};
const dateGroup = { display: 'flex', alignItems: 'center', gap: 4 };
const dateLabel = { fontSize: 12, color: 'var(--text-secondary, #888)' };
const dateInput = {
  padding: '7px 8px', borderRadius: 6,
  border: '1px solid var(--border, #e5e5e5)', fontSize: 12,
  background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', width: 130,
};

const tableWrap = { background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflow: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const theadRow = { background: 'var(--bg, #f5f5f5)', textAlign: 'left' };
const th = { padding: '8px 12px', fontSize: 12, fontWeight: 600 };
const thRight = { ...th, textAlign: 'right' };
const trStyle = { borderTop: '1px solid var(--border, #e5e5e5)' };
const td = { padding: '8px 12px' };
const tdBold = { ...td, fontWeight: 500 };
const tdNum = { ...td, textAlign: 'right', fontFamily: 'monospace' };

const emptyStyle = { padding: '32px 12px', textAlign: 'center', color: 'var(--text-secondary, #888)' };

const paginationRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13 };
const paginationInfo = { color: 'var(--text-secondary, #888)' };
const paginationButtons = { display: 'flex', alignItems: 'center', gap: 8 };
const pagBtn = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)',
  background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', cursor: 'pointer', fontSize: 13,
};
const pagCurrent = { fontWeight: 600 };
