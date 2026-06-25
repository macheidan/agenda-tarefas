import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabase';

function formatDate(d) {
  if (!d) return '';
  const [, m, day] = d.split('-');
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

// Regra3: o fator multiplica o preco/kg por padrao (ex: "2" -> x2). Com o
// prefixo "/" ele divide (ex: "/2" -> dividido por 2). Aceita virgula decimal.
// Retorna o resultado numerico ou null se o campo estiver vazio/invalido.
function calcResultado(precoNorm, raw) {
  if (raw === '' || raw == null) return null;
  const s = String(raw).trim();
  const isDiv = s.startsWith('/');
  const numStr = (isDiv ? s.slice(1) : s).replace(',', '.').trim();
  const n = Number(numStr);
  if (numStr === '' || Number.isNaN(n)) return null;
  if (isDiv) return n === 0 ? null : precoNorm / n;
  return precoNorm * n;
}

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
  // Sub-paginas (mesmo estilo de navegacao do Depto Pessoal): 'precos' = tabela
  // de notas; 'fornecedores' = total de compras por fornecedor/produto/mes.
  const [subPage, setSubPage] = useState('precos');
  const [precos, setPrecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  const [dataInicio, setDataInicio] = useState(daysAgo(30));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [porPagina, setPorPagina] = useState(50);
  const [paginaAtual, setPaginaAtual] = useState(1);
  // Mapa produto_id -> fator (Regra3). Compartilhado entre todas as linhas do
  // mesmo produto bruto: editar uma reflete em todas, persiste em produtos.fator_regra3.
  const [fatores, setFatores] = useState({});
  // Produtos cuja edicao da Regra3 ja foi confirmada nesta sessao de foco. Um
  // campo ja preenchido pede confirmacao antes de aceitar a 1a alteracao.
  const [fatoresDesbloqueados, setFatoresDesbloqueados] = useState({});

  useEffect(() => { loadData(); }, []);

  // Ao focar um campo da Regra3 ja preenchido, confirma a intencao de editar.
  // Se o usuario cancelar, tira o foco e mantem o valor; se confirmar, libera
  // a edicao ate o blur.
  function handleFatorFocus(e, produtoId) {
    const atual = fatores[produtoId];
    const preenchido = atual != null && String(atual).trim() !== '';
    if (preenchido && !fatoresDesbloqueados[produtoId]) {
      const ok = window.confirm('A Regra3 deste produto já está preenchida. Tem certeza que deseja editar?');
      if (ok) {
        setFatoresDesbloqueados(prev => ({ ...prev, [produtoId]: true }));
      } else {
        e.target.blur();
      }
    }
  }

  function handleFatorChange(produtoId, raw) {
    setFatores(prev => ({ ...prev, [produtoId]: raw }));
  }

  async function handleFatorBlur(produtoId) {
    // Reseta o desbloqueio: o proximo foco num campo preenchido pede confirmacao de novo.
    setFatoresDesbloqueados(prev => {
      if (!prev[produtoId]) return prev;
      const next = { ...prev };
      delete next[produtoId];
      return next;
    });
    const raw = fatores[produtoId];
    // Guarda o texto exato (ex: "2" ou "/2") pra preservar a operacao escolhida.
    const val = raw === '' || raw == null ? null : String(raw).trim();
    const { error } = await supabase
      .from('produtos')
      .update({ fator_regra3: val })
      .eq('id', produtoId);
    if (error) console.error('[precos] erro ao salvar fator:', error);
  }

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
          .select('*, produtos(nome, nome_padrao, categoria, medida_padrao, fator_regra3), fornecedores(nome, nome_curto, categoria)')
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
        produto_id: r.produto_id,
        data: parseDataISO(r.data),
        preco_bruto: Number(r.preco_bruto) || 0,
        preco_normalizado: Number(r.preco_normalizado) || 0,
        unidade_normalizada: r.unidade_normalizada || '',
        qtd_embalagem: Number(r.qtd_embalagem) || 0,
        unidade_embalagem: r.unidade_embalagem || '',
        produto: r.produtos?.nome || '',
        produto_padrao: r.produtos?.nome_padrao || '',
        fator_regra3: r.produtos?.fator_regra3 ?? null,
        fornecedor: r.fornecedores?.nome_curto || r.fornecedores?.nome || '',
        loja: normalizeLoja(r.loja ?? r.store ?? r.pizzaria ?? r.unidade_loja ?? r.notas?.loja ?? ''),
      }));

      // Fator (Regra3) e por produto bruto (produto_id), nao por linha de preco.
      // Inicializa o mapa produto_id -> fator a partir do que ja esta salvo no banco.
      const fmap = {};
      for (const m of mapped) {
        if (m.fator_regra3 != null && fmap[m.produto_id] === undefined) {
          fmap[m.produto_id] = m.fator_regra3;
        }
      }
      setFatores(fmap);

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

  // Mapa id-da-linha -> preco_normalizado da compra IMEDIATAMENTE anterior do
  // mesmo produto. Usa todos os registros carregados (ignora filtros) pra que a
  // "ultima compra" seja a real, e nao a anterior dentro do recorte filtrado.
  const precoAnteriorPorId = useMemo(() => {
    const porProduto = {};
    for (const p of precos) {
      (porProduto[p.produto_id] ||= []).push(p);
    }
    const result = {};
    for (const id in porProduto) {
      // Ordena por data crescente (id como desempate estavel pra mesma data).
      const list = porProduto[id].slice().sort((a, b) => {
        if (a.data !== b.data) return a.data < b.data ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      for (let i = 0; i < list.length; i++) {
        result[list[i].id] = i > 0 ? list[i - 1].preco_normalizado : null;
      }
    }
    return result;
  }, [precos]);

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

  // Navegacao por sub-paginas, no mesmo estilo do Depto Pessoal (abas no topo).
  const header = (
    <div style={headerS}>
      <h2 style={headerTitleS}>📦 Preços Insumos</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={tabBtnS(subPage === 'precos')} onClick={() => setSubPage('precos')}>Preços</button>
        <button style={tabBtnS(subPage === 'fornecedores')} onClick={() => setSubPage('fornecedores')}>Fornecedores</button>
      </div>
    </div>
  );

  if (loading) return (
    <div>
      {header}
      <p style={{ padding: 20, textAlign: 'center' }}>Carregando precos...</p>
    </div>
  );

  if (subPage === 'fornecedores') {
    return (
      <div>
        {header}
        <FornecedoresView precos={precos} />
      </div>
    );
  }

  return (
    <div>
      {header}
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
          <style>{`
            .precosTable tbody tr { transition: background 0.1s ease; }
            .precosTable tbody tr:hover { background: var(--accent-light, #ecf3ff); }
          `}</style>
          <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflowX: 'auto' }}>
            <table className="precosTable" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
                  <th style={thS}>Produto</th>
                  <th style={thS}>Produto (planilha)</th>
                  <th style={thS}>Fornecedor</th>
                  <th style={thS}>Data</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Preço Item</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Regra3</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Resultado</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Compara</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                    <td style={{ ...tdS, fontWeight: 500, fontSize: 11 }}>{p.produto}</td>
                    <td style={{ ...tdS, color: p.produto_padrao ? 'inherit' : '#bbb' }}>{p.produto_padrao || '—'}</td>
                    <td style={tdS}>{p.fornecedor}</td>
                    <td style={tdS}>{formatDate(p.data)}</td>
                    <td style={{ ...tdS, textAlign: 'right', fontSize: 12 }}>R$ {p.preco_normalizado.toFixed(2)}/{p.unidade_normalizada}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>
                      <input
                        type="text"
                        inputMode="text"
                        placeholder="2 ou /2"
                        title="Multiplica por padrao (ex: 2). Use / pra dividir (ex: /2)"
                        value={fatores[p.produto_id] ?? ''}
                        onFocus={e => handleFatorFocus(e, p.produto_id)}
                        onChange={e => handleFatorChange(p.produto_id, e.target.value)}
                        onBlur={() => handleFatorBlur(p.produto_id)}
                        style={fatorInputS}
                      />
                    </td>
                    <td style={{ ...tdS, textAlign: 'right', fontSize: 12 }}>{(() => {
                      const res = calcResultado(p.preco_normalizado, fatores[p.produto_id]);
                      return res == null ? '—' : 'R$ ' + res.toFixed(2);
                    })()}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>{(() => {
                      const ant = precoAnteriorPorId[p.id];
                      if (ant == null) return <span style={{ color: '#bbb' }}>—</span>;
                      const subiu = p.preco_normalizado > ant + 1e-9;
                      const desceu = p.preco_normalizado < ant - 1e-9;
                      const cor = subiu ? '#e53935' : desceu ? '#43a047' : '#888';
                      const seta = subiu ? '▲' : desceu ? '▼' : '=';
                      return (
                        <span style={{ color: cor, fontSize: 12, whiteSpace: 'nowrap' }} title="Preço da última compra">
                          {seta} R$ {ant.toFixed(2)}
                        </span>
                      );
                    })()}</td>
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

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Formata em R$ (pt-BR). Por padrao sem casas decimais pra deixar a matriz
// compacta; o valor exato (2 casas) vai no title de cada celula.
function formatBRL(n, decimals = 0) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Sub-pagina "Fornecedores": usa as notas (precos) puxadas da Receita Federal
// pra mostrar quanto se compra por fornecedor por mes. Clicar num fornecedor
// abre o detalhe por produto/mes (quanto de cada produto com aquele fornecedor).
function FornecedoresView({ precos }) {
  // Anos disponiveis a partir das datas das notas (asc).
  const anos = useMemo(() => {
    const s = new Set();
    for (const p of precos) { if (p.data) s.add(p.data.slice(0, 4)); }
    return [...s].sort();
  }, [precos]);

  const [ano, setAno] = useState(() => anos[anos.length - 1] || String(new Date().getFullYear()));
  const [fornecedorSel, setFornecedorSel] = useState(null);

  // Se os anos mudarem (dados chegaram/trocaram) e o ano atual sumir, cai no mais recente.
  useEffect(() => {
    if (anos.length && !anos.includes(ano)) setAno(anos[anos.length - 1]);
  }, [anos, ano]);

  const doAno = useMemo(
    () => precos.filter(p => p.data && p.data.slice(0, 4) === ano),
    [precos, ano]
  );

  // Mostra so os meses que tem alguma compra no ano (matriz mais enxuta).
  const mesesAtivos = useMemo(() => {
    const s = new Set();
    for (const p of doAno) s.add(Number(p.data.slice(5, 7)) - 1);
    return [...s].sort((a, b) => a - b);
  }, [doAno]);

  // Agrega valor (preco_bruto = "$ Compra" da nota) por chave -> mes.
  function agrega(rows, keyFn, keyLabel) {
    const map = {};
    for (const p of rows) {
      const key = keyFn(p) || '(sem)';
      const m = Number(p.data.slice(5, 7)) - 1;
      const r = (map[key] ||= { [keyLabel]: key, meses: {}, total: 0 });
      r.meses[m] = (r.meses[m] || 0) + p.preco_bruto;
      r.total += p.preco_bruto;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }

  const porFornecedor = useMemo(
    () => agrega(doAno, p => p.fornecedor, 'fornecedor'),
    [doAno]
  );

  const porProduto = useMemo(() => {
    if (!fornecedorSel) return [];
    return agrega(doAno.filter(p => (p.fornecedor || '(sem)') === fornecedorSel), p => p.produto, 'produto');
  }, [doAno, fornecedorSel]);

  // Totais por mes (rodape) das linhas exibidas.
  function totaisPorMes(rows) {
    const t = {};
    let geral = 0;
    for (const r of rows) {
      for (const m of mesesAtivos) t[m] = (t[m] || 0) + (r.meses[m] || 0);
      geral += r.total;
    }
    return { t, geral };
  }

  const anoIdx = anos.indexOf(ano);
  const prevAno = () => { if (anoIdx > 0) setAno(anos[anoIdx - 1]); };
  const nextAno = () => { if (anoIdx >= 0 && anoIdx < anos.length - 1) setAno(anos[anoIdx + 1]); };

  const totalAno = porFornecedor.reduce((s, r) => s + r.total, 0);
  const nFornecedores = porFornecedor.length;
  const nProdutos = new Set(doAno.map(p => p.produto).filter(Boolean)).size;

  // Renderiza a matriz (linhas x meses + total). `onRowClick` opcional pra drill-down.
  function Matriz({ rows, labelCol, labelKey, onRowClick }) {
    const { t, geral } = totaisPorMes(rows);
    return (
      <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
              <th style={{ ...thS, position: 'sticky', left: 0, background: 'var(--bg, #f5f5f5)' }}>{labelCol}</th>
              {mesesAtivos.map(m => (
                <th key={m} style={{ ...thS, textAlign: 'right' }}>{MESES[m]}</th>
              ))}
              <th style={{ ...thS, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r[labelKey]}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ borderTop: '1px solid var(--border, #e5e5e5)', cursor: onRowClick ? 'pointer' : 'default' }}
              >
                <td style={{ ...tdS, fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--card-bg, #fff)' }}>
                  {onRowClick && <span style={{ color: 'var(--accent)', marginRight: 4 }}>›</span>}
                  {r[labelKey]}
                </td>
                {mesesAtivos.map(m => (
                  <td key={m} style={{ ...tdS, textAlign: 'right', fontSize: 12, color: r.meses[m] ? 'inherit' : '#ccc' }} title={r.meses[m] ? formatBRL(r.meses[m], 2) : ''}>
                    {r.meses[m] ? formatBRL(r.meses[m]) : '—'}
                  </td>
                ))}
                <td style={{ ...tdS, textAlign: 'right', fontSize: 12, fontWeight: 700 }} title={formatBRL(r.total, 2)}>{formatBRL(r.total)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border, #e5e5e5)', background: 'var(--bg, #f5f5f5)' }}>
              <td style={{ ...tdS, fontWeight: 700, position: 'sticky', left: 0, background: 'var(--bg, #f5f5f5)' }}>Total</td>
              {mesesAtivos.map(m => (
                <td key={m} style={{ ...tdS, textAlign: 'right', fontSize: 12, fontWeight: 600 }} title={formatBRL(t[m] || 0, 2)}>{formatBRL(t[m] || 0)}</td>
              ))}
              <td style={{ ...tdS, textAlign: 'right', fontSize: 12, fontWeight: 800 }} title={formatBRL(geral, 2)}>{formatBRL(geral)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      {/* Navegacao de ano + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={prevAno} disabled={anoIdx <= 0} style={btnS} aria-label="Ano anterior">‹</button>
          <strong style={{ fontSize: 16, minWidth: 56, textAlign: 'center' }}>{ano}</strong>
          <button onClick={nextAno} disabled={anoIdx < 0 || anoIdx >= anos.length - 1} style={btnS} aria-label="Próximo ano">›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(110px, 1fr))', gap: 8, flex: 1 }}>
          <StatCard label="Total no ano" value={formatBRL(totalAno)} />
          <StatCard label="Fornecedores" value={nFornecedores} />
          <StatCard label="Produtos" value={nProdutos} />
        </div>
      </div>

      {/* Breadcrumb / drill-down */}
      {fornecedorSel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 }}>
          <button onClick={() => setFornecedorSel(null)} style={{ ...btnS, fontWeight: 600 }}>← Fornecedores</button>
          <span style={{ color: '#888' }}>/</span>
          <strong>{fornecedorSel}</strong>
          <span style={{ color: '#888', fontSize: 12 }}>— compras por produto/mês</span>
        </div>
      )}

      {doAno.length === 0 ? (
        <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>Nenhuma compra registrada em {ano}.</p>
      ) : !fornecedorSel ? (
        <>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px' }}>
            Total de compras por fornecedor em cada mês (valor das notas). Clique num fornecedor para ver por produto.
          </p>
          <Matriz rows={porFornecedor} labelCol="Fornecedor" labelKey="fornecedor" onRowClick={r => setFornecedorSel(r.fornecedor)} />
        </>
      ) : porProduto.length === 0 ? (
        <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>Nenhuma compra de {fornecedorSel} em {ano}.</p>
      ) : (
        <Matriz rows={porProduto} labelCol="Produto" labelKey="produto" />
      )}
    </div>
  );
}

const headerS = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 0', marginBottom: 12, borderBottom: '1px solid var(--border, #e5e5e5)' };
const headerTitleS = { fontSize: 18, fontWeight: 700, color: 'var(--text, #222)' };
const tabBtnS = (active) => ({ padding: '8px 14px', border: '2px solid var(--accent, #465fff)', borderRadius: 6, background: active ? 'var(--accent, #465fff)' : 'var(--card-bg, #fff)', color: active ? '#fff' : 'var(--accent, #465fff)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' });
const inputS = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', fontSize: 13, background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', boxSizing: 'border-box' };
const thS = { padding: '8px 10px', fontSize: 12, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' };
const tdS = { padding: '7px 10px' };
const fatorInputS = { width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border, #e5e5e5)', textAlign: 'right', fontSize: 12, background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', boxSizing: 'border-box' };
const btnS = { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', cursor: 'pointer', fontSize: 12 };
