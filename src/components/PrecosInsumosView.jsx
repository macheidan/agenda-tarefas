import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Normaliza a data para 'YYYY-MM-DD' independente do formato de origem
// (ISO com hora, 'DD/MM/YYYY' ou ja 'YYYY-MM-DD'). Sem isso, datas em
// formato diferente quebram a comparacao de string usada no filtro.
function parseDataISO(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

const PAGE_OPTIONS = [50, 100, 200];

// Normaliza o identificador da loja (pizzaria) para exibicao: 'lov' -> 'Lov', 'dame' -> 'Dame'.
function normalizeLoja(raw) {
  if (!raw) return '';
  const v = String(raw).trim();
  const low = v.toLowerCase();
  if (low === 'lov') return 'Lov';
  if (low === 'dame') return 'Dame';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export default function PrecosInsumosView() {
  const [precos, setPrecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  const [dataInicio, setDataInicio] = useState(daysAgo(30));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [porPagina, setPorPagina] = useState(50);
  const [paginaAtual, setPaginaAtual] = useState(1);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Pagina pra nao esbarrar no limite padrao de linhas do PostgREST (~1000),
      // que poderia esconder parte das notas.
      const PAGE = 1000;
      let all = [];
      for (let p = 0; p < 30; p++) {
        const { data, error } = await supabase
          .from('precos')
          .select('*, produtos(nome, nome_padrao, categoria, medida_padrao), fornecedores(nome, nome_curto, categoria)')
          .order('data', { ascending: false })
          .range(p * PAGE, p * PAGE + PAGE - 1);

        if (error) {
          console.error('[precos] supabase error:', error);
          break;
        }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
      }

      console.log('[precos] total rows:', all.length);
      if (all[0]) console.log('[precos] colunas da tabela precos:', Object.keys(all[0]));

      const mapped = all.map(r => ({
        id: r.id,
        data: parseDataISO(r.data),
        preco_bruto: Number(r.preco_bruto) || 0,
        preco_normalizado: Number(r.preco_normalizado) || 0,
        unidade_normalizada: r.unidade_normalizada || '',
        qtd_embalagem: Number(r.qtd_embalagem) || 0,
        unidade_embalagem: r.unidade_embalagem || '',
        produto: r.produtos?.nome || '',
        produto_padrao: r.produtos?.nome_padrao || '',
        fornecedor: r.fornecedores?.nome_curto || r.fornecedores?.nome || '',
        loja: normalizeLoja(r.loja ?? r.store ?? r.pizzaria ?? r.unidade_loja ?? r.notas?.loja ?? ''),
      }));

      const datas = mapped.map(m => m.data).filter(Boolean).sort();
      console.log('[precos] datas min->max:', datas[0], '->', datas[datas.length - 1], '| mapeadas:', mapped.length);
      setPrecos(mapped);
    } catch (e) {
      console.error('[precos] catch:', e);
    }
    setLoading(false);
  }

  const fornecedoresUnicos = useMemo(() =>
    [...new Set(precos.map(p => p.fornecedor))].filter(Boolean).sort(),
    [precos]
  );

  const lojasUnicas = useMemo(() =>
    [...new Set(precos.map(p => p.loja))].filter(Boolean).sort(),
    [precos]
  );

  const filtrados = useMemo(() => {
    return precos.filter(p => {
      if (dataInicio && p.data < dataInicio) return false;
      if (dataFim && p.data > dataFim) return false;
      if (filtroFornecedor && p.fornecedor !== filtroFornecedor) return false;
      if (filtroLoja && p.loja !== filtroLoja) return false;
      if (filtroTexto) {
        const f = filtroTexto.toLowerCase();
        if (!p.produto.toLowerCase().includes(f) && !p.fornecedor.toLowerCase().includes(f)) return false;
      }
      return true;
    });
  }, [precos, filtroTexto, filtroFornecedor, filtroLoja, dataInicio, dataFim]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaSegura = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaSegura - 1) * porPagina;
  const paginados = filtrados.slice(inicio, inicio + porPagina);

  useEffect(() => { setPaginaAtual(1); }, [filtroTexto, filtroFornecedor, filtroLoja, dataInicio, dataFim, porPagina]);

  const totalProdutos = new Set(filtrados.map(p => p.produto)).size;

  // Diagnostico (sobre TODOS os registros carregados, ignorando filtros):
  // ajuda a ver se o problema e dado faltando no banco ou data/formato.
  const datasValidas = precos.map(p => p.data).filter(Boolean).sort();
  const dataMin = datasValidas[0] || '—';
  const dataMax = datasValidas[datasValidas.length - 1] || '—';
  const semData = precos.filter(p => !p.data).length;

  if (loading) return <p style={{ padding: 20, textAlign: 'center' }}>Carregando precos...</p>;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <StatCard label="Produtos" value={totalProdutos} />
        <StatCard label="Fornecedores" value={filtroFornecedor ? 1 : fornecedoresUnicos.length} />
        <StatCard label="Registros" value={filtrados.length} />
      </div>

      {/* Diagnostico de carregamento do banco (todos os registros, sem filtro) */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10, padding: '6px 10px', background: 'var(--bg, #f5f5f5)', borderRadius: 6 }}>
        Banco: <strong>{precos.length}</strong> registros carregados · datas no banco: <strong>{dataMin}</strong> → <strong>{dataMax}</strong>
        {semData > 0 && <> · <strong>{semData}</strong> sem data válida</>}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <input
          type="search" placeholder="Buscar produto..."
          value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)}
          style={{ ...inputS, flex: '1 1 160px' }}
        />
        <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)} style={{ ...inputS, flex: '1 1 140px' }}>
          <option value="">Todos fornecedores</option>
          {fornecedoresUnicos.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {lojasUnicas.length > 0 && (
          <select value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)} style={{ ...inputS, flex: '1 1 120px' }}>
            <option value="">Todas as lojas</option>
            {lojasUnicas.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 260px' }}>
          <span style={{ fontSize: 11, color: '#888' }}>De</span>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ ...inputS, flex: 1 }} />
          <span style={{ fontSize: 11, color: '#888' }}>Ate</span>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ ...inputS, flex: 1 }} />
        </div>
        <select value={porPagina} onChange={e => setPorPagina(Number(e.target.value))} style={{ ...inputS, width: 75 }}>
          {PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}/pag</option>)}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>Nenhum registro encontrado ({precos.length} total, filtro removeu todos)</p>
      ) : (
        <>
          {/* Tabela */}
          <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
                  <th style={thS}>Produto</th>
                  <th style={thS}>Produto (planilha)</th>
                  <th style={thS}>Fornecedor</th>
                  <th style={thS}>Data</th>
                  <th style={{ ...thS, textAlign: 'right' }}>$ Compra</th>
                  <th style={{ ...thS, textAlign: 'right' }}>$ kg/un/L</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                    <td style={{ ...tdS, fontWeight: 500 }}>{p.produto}</td>
                    <td style={{ ...tdS, color: p.produto_padrao ? 'inherit' : '#bbb' }}>{p.produto_padrao || '—'}</td>
                    <td style={tdS}>{p.fornecedor}</td>
                    <td style={tdS}>{formatDate(p.data)}</td>
                    <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>R$ {p.preco_bruto.toFixed(2)}</td>
                    <td style={{ ...tdS, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>R$ {p.preco_normalizado.toFixed(2)}/{p.unidade_normalizada}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginacao */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12 }}>
            <span style={{ color: '#888' }}>{inicio + 1}-{Math.min(inicio + porPagina, filtrados.length)} de {filtrados.length}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setPaginaAtual(p => Math.max(1, p - 1))} disabled={paginaSegura <= 1} style={btnS}>Ant</button>
              <strong>{paginaSegura}/{totalPaginas}</strong>
              <button onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura >= totalPaginas} style={btnS}>Prox</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const inputS = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', fontSize: 13, background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', boxSizing: 'border-box' };
const thS = { padding: '8px 10px', fontSize: 12, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' };
const tdS = { padding: '7px 10px' };
const btnS = { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', cursor: 'pointer', fontSize: 12 };
