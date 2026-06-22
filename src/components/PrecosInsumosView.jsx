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

const PAGE_OPTIONS = [50, 100, 200];

export default function PrecosInsumosView() {
  const [precos, setPrecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [dataInicio, setDataInicio] = useState(daysAgo(30));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
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

  const fornecedoresUnicos = useMemo(() =>
    [...new Set(precos.map(p => p.fornecedor))].filter(Boolean).sort(),
    [precos]
  );

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

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaSegura = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaSegura - 1) * porPagina;
  const paginados = filtrados.slice(inicio, inicio + porPagina);

  useEffect(() => { setPaginaAtual(1); }, [filtroTexto, filtroFornecedor, dataInicio, dataFim, porPagina]);

  const totalProdutos = new Set(filtrados.map(p => p.produto)).size;

  return (
    <div className="pi-root">
      <style>{CSS}</style>

      {/* Stats */}
      <div className="pi-stats">
        <div className="pi-stat"><span className="pi-stat-val">{totalProdutos}</span><span className="pi-stat-lbl">produtos</span></div>
        <div className="pi-stat"><span className="pi-stat-val">{filtroFornecedor ? 1 : fornecedoresUnicos.length}</span><span className="pi-stat-lbl">fornec.</span></div>
        <div className="pi-stat"><span className="pi-stat-val">{filtrados.length}</span><span className="pi-stat-lbl">registros</span></div>
      </div>

      {/* Filtros */}
      <div className="pi-filters">
        <input
          type="search"
          placeholder="Buscar produto..."
          value={filtroTexto}
          onChange={e => setFiltroTexto(e.target.value)}
          className="pi-input pi-search"
        />
        <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)} className="pi-input pi-select">
          <option value="">Todos fornecedores</option>
          {fornecedoresUnicos.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="pi-dates">
          <label className="pi-date-lbl">De</label>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="pi-input pi-date" />
          <label className="pi-date-lbl">Ate</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="pi-input pi-date" />
        </div>
        <select value={porPagina} onChange={e => setPorPagina(Number(e.target.value))} className="pi-input pi-perpag">
          {PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}/pag</option>)}
        </select>
      </div>

      {/* Conteudo */}
      {loading ? (
        <div className="pi-empty">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="pi-empty">Nenhum registro encontrado</div>
      ) : (
        <>
          {/* Tabela desktop */}
          <div className="pi-table-wrap">
            <table className="pi-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Fornecedor</th>
                  <th>Data</th>
                  <th className="pi-r">$ Compra</th>
                  <th className="pi-r">$ kg/un/L</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map(p => (
                  <tr key={p.id}>
                    <td className="pi-bold">{p.produto}</td>
                    <td>{p.fornecedor}</td>
                    <td>{formatDate(p.data)}</td>
                    <td className="pi-num">R$ {p.preco_bruto.toFixed(2)}</td>
                    <td className="pi-num">R$ {p.preco_normalizado.toFixed(2)}/{p.unidade_normalizada}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="pi-cards">
            {paginados.map(p => (
              <div key={p.id} className="pi-card">
                <div className="pi-card-top">
                  <span className="pi-card-produto">{p.produto}</span>
                  <span className="pi-card-data">{formatDate(p.data)}</span>
                </div>
                <div className="pi-card-forn">{p.fornecedor}</div>
                <div className="pi-card-bottom">
                  <span className="pi-card-compra">R$ {p.preco_bruto.toFixed(2)}</span>
                  <span className="pi-card-norm">R$ {p.preco_normalizado.toFixed(2)}/{p.unidade_normalizada}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Paginacao */}
          <div className="pi-pag">
            <span className="pi-pag-info">{inicio + 1}-{Math.min(inicio + porPagina, filtrados.length)} de {filtrados.length}</span>
            <div className="pi-pag-btns">
              <button onClick={() => setPaginaAtual(p => Math.max(1, p - 1))} disabled={paginaSegura <= 1} className="pi-pag-btn">Ant</button>
              <span className="pi-pag-cur">{paginaSegura}/{totalPaginas}</span>
              <button onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura >= totalPaginas} className="pi-pag-btn">Prox</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.pi-root { font-size: 14px; }

/* Stats */
.pi-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.pi-stat { background: var(--card-bg, #fff); border-radius: 8px; border: 1px solid var(--border, #e5e5e5); padding: 8px 12px; display: flex; flex-direction: column; }
.pi-stat-val { font-size: 20px; font-weight: 700; }
.pi-stat-lbl { font-size: 11px; color: var(--text-secondary, #888); }

/* Filtros */
.pi-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.pi-input { padding: 7px 10px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5); font-size: 13px; background: var(--card-bg, #fff); color: var(--text, #222); box-sizing: border-box; }
.pi-search { flex: 1 1 160px; min-width: 0; }
.pi-select { flex: 1 1 140px; min-width: 0; }
.pi-dates { display: flex; align-items: center; gap: 4px; flex: 1 1 260px; }
.pi-date-lbl { font-size: 11px; color: var(--text-secondary, #888); }
.pi-date { flex: 1; min-width: 0; }
.pi-perpag { width: 75px; flex: 0 0 75px; }

/* Tabela desktop */
.pi-table-wrap { background: var(--card-bg, #fff); border-radius: 8px; border: 1px solid var(--border, #e5e5e5); overflow: auto; }
.pi-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pi-table thead tr { background: var(--bg, #f5f5f5); }
.pi-table th { padding: 8px 10px; font-size: 12px; font-weight: 600; text-align: left; white-space: nowrap; }
.pi-table td { padding: 7px 10px; border-top: 1px solid var(--border, #e5e5e5); }
.pi-bold { font-weight: 500; }
.pi-r { text-align: right !important; }
.pi-num { text-align: right; font-family: monospace; font-size: 12px; white-space: nowrap; }

/* Cards mobile - escondido no desktop */
.pi-cards { display: none; }
.pi-card { background: var(--card-bg, #fff); border-radius: 8px; border: 1px solid var(--border, #e5e5e5); padding: 10px 12px; margin-bottom: 6px; }
.pi-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.pi-card-produto { font-weight: 600; font-size: 13px; flex: 1; }
.pi-card-data { font-size: 11px; color: var(--text-secondary, #888); white-space: nowrap; }
.pi-card-forn { font-size: 11px; color: var(--text-secondary, #888); margin: 2px 0 6px; }
.pi-card-bottom { display: flex; justify-content: space-between; }
.pi-card-compra { font-size: 12px; color: var(--text-secondary, #888); }
.pi-card-norm { font-size: 14px; font-weight: 700; font-family: monospace; }

/* Paginacao */
.pi-pag { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12px; }
.pi-pag-info { color: var(--text-secondary, #888); }
.pi-pag-btns { display: flex; align-items: center; gap: 6px; }
.pi-pag-btn { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5); background: var(--card-bg, #fff); color: var(--text, #222); cursor: pointer; font-size: 12px; }
.pi-pag-btn:disabled { opacity: 0.4; cursor: default; }
.pi-pag-cur { font-weight: 600; }
.pi-empty { padding: 32px 12px; text-align: center; color: var(--text-secondary, #888); }

/* Mobile */
@media (max-width: 640px) {
  .pi-table-wrap { display: none; }
  .pi-cards { display: block; }
  .pi-filters { flex-direction: column; }
  .pi-search, .pi-select { flex: 1 1 100%; }
  .pi-dates { flex: 1 1 100%; }
  .pi-perpag { flex: 1 1 100%; width: 100%; }
  .pi-stats { gap: 6px; }
  .pi-stat { padding: 6px 10px; }
  .pi-stat-val { font-size: 18px; }
}
`;
