import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { supabase } from '../utils/supabase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const OCULTOS_KEY = 'precos_fornecedores_ocultos';

// Fornecedores ocultados (ex: fornecedores eventuais sem relacao com insumos).
// Somem das listas de Preços, Fornecedores, Cadastrar e Subiram. Persistido no
// Firestore em settings/global.precosFornecedoresOcultos, pra valer em qualquer
// computador (antes era localStorage, preso a um navegador). Leitura liberada a
// qualquer logado; escrita so admin (mesma regra do settings/global).
function useFornecedoresOcultos() {
  const [ocultos, setOcultos] = useState([]);
  const seededRef = useRef(false);

  useEffect(() => {
    const ref = doc(db, 'settings', 'global');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const saved = snap.data()?.precosFornecedoresOcultos;
        if (Array.isArray(saved)) { setOcultos(saved); return; }
        // Ainda nao migrado: usa a lista antiga do localStorage e sobe pro banco 1x.
        let legacy = [];
        try {
          const arr = JSON.parse(localStorage.getItem(OCULTOS_KEY) || '[]');
          if (Array.isArray(arr)) legacy = arr;
        } catch { /* ignora */ }
        setOcultos(legacy);
        if (legacy.length && !seededRef.current) {
          seededRef.current = true;
          setDoc(ref, { precosFornecedoresOcultos: legacy }, { merge: true }).catch(() => {});
        }
      },
      () => setOcultos([])
    );
    return unsub;
  }, []);

  const toggle = useCallback((nome) => {
    setOcultos(prev => {
      const next = prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome];
      setDoc(doc(db, 'settings', 'global'), { precosFornecedoresOcultos: next }, { merge: true })
        .catch(e => console.error('[precos] erro ao salvar fornecedores ocultos:', e));
      return next;
    });
  }, []);

  return { ocultos, toggle };
}

// Produtos ocultos na aba Cadastrar/Planilha — mesmo padrao dos fornecedores
// ocultos (settings/global.precosProdutosOcultos, compartilhado entre computadores).
// Guarda ids de produto (produtos.id). So esconde da listagem da Planilha.
function useProdutosOcultos() {
  const [ocultos, setOcultos] = useState([]);

  useEffect(() => {
    const ref = doc(db, 'settings', 'global');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const saved = snap.data()?.precosProdutosOcultos;
        setOcultos(Array.isArray(saved) ? saved : []);
      },
      () => setOcultos([])
    );
    return unsub;
  }, []);

  const toggle = useCallback((id) => {
    setOcultos(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      setDoc(doc(db, 'settings', 'global'), { precosProdutosOcultos: next }, { merge: true })
        .catch(e => console.error('[precos] erro ao salvar produtos ocultos:', e));
      return next;
    });
  }, []);

  return { ocultos, toggle };
}

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

// Alias de fornecedores que sao o mesmo negocio com CNPJ diferente. "Conservas
// do Porto" e o mesmo fornecedor que a Distrimar — toda nota da Conservas do
// Porto (atual ou futura, com qualquer CNPJ) e tratada como Distrimar na
// exibicao, no filtro e em todas as agregacoes.
function normalizeFornecedor(nomeCurto, nome) {
  const display = (nomeCurto || nome || '').trim();
  const hay = (display + ' ' + (nome || '')).toLowerCase();
  if (hay.includes('conserva') && hay.includes('porto')) return 'Distrimar';
  return display;
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
  // Fornecedores ocultos (compartilhado pelas 3 sub-paginas).
  const { ocultos, toggle: toggleOculto } = useFornecedoresOcultos();
  const ocultosSet = useMemo(() => new Set(ocultos), [ocultos]);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [filtroLoja, setFiltroLoja] = useState('');
  // Quando ativo, mostra somente linhas cujo produto ainda nao tem Fator preenchido.
  const [filtroSemFator, setFiltroSemFator] = useState(false);
  const [dataInicio, setDataInicio] = useState(daysAgo(30));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [porPagina, setPorPagina] = useState(50);
  const [paginaAtual, setPaginaAtual] = useState(1);
  // Mapa produto_id -> fator (Regra3). Compartilhado entre todas as linhas do
  // mesmo produto bruto: editar uma reflete em todas, persiste em produtos.fator_regra3.
  const [fatores, setFatores] = useState({});
  // Valor "commitado" do fator (so muda no blur / Enter). O filtro "sem Fator"
  // usa este, e nao o que esta sendo digitado, pra que a linha nao suma da lista
  // no meio da digitacao — so depois de confirmar (Enter ou clicar fora).
  const [fatoresSalvos, setFatoresSalvos] = useState({});
  useEffect(() => { loadData(); }, []);

  function handleFatorChange(produtoId, raw) {
    setFatores(prev => ({ ...prev, [produtoId]: raw }));
  }

  // Enter so "commita" tirando o foco -> dispara o blur (mesma logica de clicar fora).
  function handleFatorKeyDown(e) {
    if (e.key === 'Enter') e.currentTarget.blur();
  }

  // Commit do fator: roda ao clicar fora (blur) ou ao apertar Enter. Se o campo
  // JA tinha um valor salvo e ele mudou, pede confirmacao antes de gravar; se o
  // usuario cancelar, reverte pro valor salvo. Campo vazio salva sem perguntar.
  async function handleFatorBlur(produtoId) {
    const raw = fatores[produtoId];
    const novo = raw === '' || raw == null ? null : String(raw).trim();
    const salvoRaw = fatoresSalvos[produtoId];
    const salvo = salvoRaw === '' || salvoRaw == null ? null : String(salvoRaw).trim();
    if (novo === salvo) return; // nada mudou — nao pergunta nem grava

    if (salvo != null) {
      const ok = window.confirm('A Regra3 deste produto já está preenchida. Tem certeza que deseja editar?');
      if (!ok) {
        setFatores(prev => ({ ...prev, [produtoId]: salvoRaw ?? '' })); // reverte
        return;
      }
    }

    // Commita o valor (texto exato, ex: "2" ou "/2") pro display, filtro e banco.
    setFatoresSalvos(prev => ({ ...prev, [produtoId]: novo }));
    setFatores(prev => ({ ...prev, [produtoId]: novo ?? '' }));
    const { error } = await supabase
      .from('produtos')
      .update({ fator_regra3: novo })
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
        fornecedor: normalizeFornecedor(r.fornecedores?.nome_curto, r.fornecedores?.nome),
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
      setFatoresSalvos(fmap);

      setPrecos(mapped);
    } catch (e) {
      console.error('[precos] catch:', e);
    }
    setLoading(false);
  }

  const fornecedoresUnicos = useMemo(() =>
    [...new Set(precos.map(p => p.fornecedor))].filter(f => f && !ocultosSet.has(f)).sort(),
    [precos, ocultosSet]
  );

  const lojasUnicas = useMemo(() =>
    [...new Set(precos.map(p => p.loja))].filter(Boolean).sort(),
    [precos]
  );

  // nome_padrao ("Produto (planilha)") distintos ja usados — opcoes do dropdown
  // que aparece quando a linha vem sem "Produto (planilha)".
  const nomesPadrao = useMemo(() =>
    [...new Set(precos.map(p => p.produto_padrao).filter(Boolean))].sort(),
    [precos]
  );

  // Define o "Produto (planilha)" (nome_padrao) manualmente para um produto sem
  // ele. Como o nome_padrao mora em produtos (por produto_id), a escolha vale
  // pra TODAS as linhas do mesmo produto na listagem. Persiste no banco e
  // atualiza o estado local pra refletir na hora.
  async function handleProdutoPadraoChange(produtoId, valor) {
    const novo = valor || null;
    setPrecos(prev => prev.map(p =>
      p.produto_id === produtoId ? { ...p, produto_padrao: novo || '' } : p
    ));
    const { error } = await supabase
      .from('produtos')
      .update({ nome_padrao: novo })
      .eq('id', produtoId);
    if (error) console.error('[precos] erro ao salvar nome_padrao:', error);
  }

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
      if (ocultosSet.has(p.fornecedor || '(sem)')) return false;
      if (dataInicio && p.data < dataInicio) return false;
      if (dataFim && p.data > dataFim) return false;
      if (filtroFornecedor && p.fornecedor !== filtroFornecedor) return false;
      if (filtroLoja && p.loja !== filtroLoja) return false;
      if (filtroSemFator) {
        // Usa o valor commitado (fatoresSalvos), nao o digitado, pra linha nao sumir no meio da digitacao.
        const fator = fatoresSalvos[p.produto_id];
        if (fator != null && String(fator).trim() !== '') return false;
      }
      if (filtroTexto) {
        const f = filtroTexto.toLowerCase();
        if (!p.produto.toLowerCase().includes(f) && !p.fornecedor.toLowerCase().includes(f)) return false;
      }
      return true;
    });
  }, [precos, filtroTexto, filtroFornecedor, filtroLoja, filtroSemFator, fatoresSalvos, dataInicio, dataFim, ocultosSet]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaSegura = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaSegura - 1) * porPagina;
  const paginados = filtrados.slice(inicio, inicio + porPagina);

  useEffect(() => { setPaginaAtual(1); }, [filtroTexto, filtroFornecedor, filtroLoja, filtroSemFator, dataInicio, dataFim, porPagina]);

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
        <button style={tabBtnS(subPage === 'cadastrar', '#43a047')} onClick={() => setSubPage('cadastrar')}>Cadastrar</button>
        <button style={tabBtnS(subPage === 'subiram', '#e53935')} onClick={() => setSubPage('subiram')}>Subiram</button>
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
        <FornecedoresView precos={precos} ocultos={ocultosSet} ocultosList={ocultos} toggleOculto={toggleOculto} />
      </div>
    );
  }

  if (subPage === 'cadastrar') {
    return (
      <div>
        {header}
        <CadastrarView onSaved={loadData} ocultos={ocultosSet} />
      </div>
    );
  }

  if (subPage === 'subiram') {
    return (
      <div>
        {header}
        <SubiramView precos={precos} ocultos={ocultosSet} />
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text, #222)', cursor: 'pointer', whiteSpace: 'nowrap' }} title="Mostra só os produtos sem Fator preenchido">
          <input type="checkbox" checked={filtroSemFator} onChange={e => setFiltroSemFator(e.target.checked)} style={{ cursor: 'pointer' }} />
          Fator
        </label>
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
                  <th style={{ ...thS, textAlign: 'right' }}>Preço Nota</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Fator</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Resultado</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Compara</th>
                </tr>
              </thead>
              <tbody>
                {paginados.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                    <td style={{ ...tdS, fontWeight: 500, fontSize: 11 }}>{p.produto}</td>
                    <td style={{ ...tdS, color: p.produto_padrao ? 'inherit' : '#bbb' }}>
                      {p.produto_padrao ? p.produto_padrao : (
                        <select
                          value=""
                          onChange={e => handleProdutoPadraoChange(p.produto_id, e.target.value)}
                          title="Selecionar Produto (planilha) — vale para todos os itens do mesmo produto"
                          style={produtoPadraoSelectS}
                        >
                          <option value="" disabled>Selecionar…</option>
                          {nomesPadrao.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      )}
                    </td>
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
                        onKeyDown={handleFatorKeyDown}
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
// Olho cortado (eye-off) — indica "ocultar". SVG inline pra herdar a cor (currentColor).
function EyeOffIcon({ size = 15 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function FornecedoresView({ precos, ocultos, ocultosList = [], toggleOculto }) {
  // Anos disponiveis a partir das datas das notas (asc).
  const anos = useMemo(() => {
    const s = new Set();
    for (const p of precos) { if (p.data) s.add(p.data.slice(0, 4)); }
    return [...s].sort();
  }, [precos]);

  const [ano, setAno] = useState(() => anos[anos.length - 1] || String(new Date().getFullYear()));
  // Fornecedores com a lista de produtos expandida (accordion inline).
  const [expandidos, setExpandidos] = useState(() => new Set());
  const [busca, setBusca] = useState('');

  const toggleExpand = (nome) => setExpandidos(prev => {
    const next = new Set(prev);
    if (next.has(nome)) next.delete(nome); else next.add(nome);
    return next;
  });

  // Se os anos mudarem (dados chegaram/trocaram) e o ano atual sumir, cai no mais recente.
  useEffect(() => {
    if (anos.length && !anos.includes(ano)) setAno(anos[anos.length - 1]);
  }, [anos, ano]);

  // Fornecedores ocultos somem de tudo aqui (agregacao, stats, matriz).
  const doAno = useMemo(
    () => precos.filter(p => p.data && p.data.slice(0, 4) === ano && !ocultos.has(p.fornecedor || '(sem)')),
    [precos, ano, ocultos]
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

  // Busca por nome do fornecedor (filtra so a lista exibida; os stats seguem o ano inteiro).
  const fornecedoresFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return porFornecedor;
    return porFornecedor.filter(r => r.fornecedor.toLowerCase().includes(q));
  }, [porFornecedor, busca]);

  // Produtos por fornecedor (pra expandir inline): fornecedor -> [{produto, meses, total}].
  const produtosPorFornecedor = useMemo(() => {
    const tmp = {};
    for (const p of doAno) {
      const f = p.fornecedor || '(sem)';
      const prod = p.produto || '(sem)';
      const m = Number(p.data.slice(5, 7)) - 1;
      const byF = (tmp[f] ||= {});
      const r = (byF[prod] ||= { produto: prod, meses: {}, total: 0 });
      r.meses[m] = (r.meses[m] || 0) + p.preco_bruto;
      r.total += p.preco_bruto;
    }
    const out = {};
    for (const f in tmp) out[f] = Object.values(tmp[f]).sort((a, b) => b.total - a.total);
    return out;
  }, [doAno]);

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

  const nFornecedores = porFornecedor.length;
  const nProdutos = new Set(doAno.map(p => p.produto).filter(Boolean)).size;

  // Matriz fornecedor x mes. Cada linha expande (accordion) os produtos daquele
  // fornecedor (produto x mes) inline, logo abaixo. Botao de olho-cortado oculta.
  function Matriz({ rows }) {
    const { t, geral } = totaisPorMes(rows);
    return (
      <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflowX: 'auto' }}>
        <table className="fornMatriz" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
              <th style={{ ...thS, position: 'sticky', left: 0, background: 'var(--bg, #f5f5f5)' }}>Fornecedor</th>
              {mesesAtivos.map(m => (
                <th key={m} style={{ ...thS, textAlign: 'right' }}>{MESES[m]}</th>
              ))}
              <th style={{ ...thS, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const aberto = expandidos.has(r.fornecedor);
              const produtos = produtosPorFornecedor[r.fornecedor] || [];
              return (
                <Fragment key={r.fornecedor}>
                  <tr
                    onClick={() => toggleExpand(r.fornecedor)}
                    style={{ borderTop: '1px solid var(--border, #e5e5e5)', cursor: 'pointer' }}
                  >
                    <td style={{ ...tdS, fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--card-bg, #fff)' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleOculto(r.fornecedor); }}
                        title={`Ocultar "${r.fornecedor}" das listas`}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#888', marginRight: 8, padding: 0, lineHeight: 0, verticalAlign: 'middle' }}
                      >
                        <EyeOffIcon />
                      </button>
                      <span style={{ color: 'var(--accent)', marginRight: 6, display: 'inline-block', width: 10 }}>{aberto ? '▾' : '▸'}</span>
                      {r.fornecedor}
                    </td>
                    {mesesAtivos.map(m => (
                      <td key={m} style={{ ...tdS, textAlign: 'right', fontSize: 12, color: r.meses[m] ? 'inherit' : '#ccc' }} title={r.meses[m] ? formatBRL(r.meses[m], 2) : ''}>
                        {r.meses[m] ? formatBRL(r.meses[m]) : '—'}
                      </td>
                    ))}
                    <td style={{ ...tdS, textAlign: 'right', fontSize: 12, fontWeight: 700 }} title={formatBRL(r.total, 2)}>{formatBRL(r.total)}</td>
                  </tr>
                  {aberto && produtos.map(prod => (
                    <tr key={`${r.fornecedor}|${prod.produto}`} style={{ background: 'var(--bg, #f9fafb)' }}>
                      <td style={{ ...tdS, paddingLeft: 40, fontSize: 12, color: 'var(--text-secondary, #555)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg, #f9fafb)' }}>
                        {prod.produto}
                      </td>
                      {mesesAtivos.map(m => (
                        <td key={m} style={{ ...tdS, textAlign: 'right', fontSize: 12, color: prod.meses[m] ? 'var(--text-secondary, #555)' : '#ccc' }} title={prod.meses[m] ? formatBRL(prod.meses[m], 2) : ''}>
                          {prod.meses[m] ? formatBRL(prod.meses[m]) : '—'}
                        </td>
                      ))}
                      <td style={{ ...tdS, textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #555)' }} title={formatBRL(prod.total, 2)}>{formatBRL(prod.total)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
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
      {/* Hover de linha igual ao da pagina Preços (inclui a coluna fixa). */}
      <style>{`
        .fornMatriz tbody tr { transition: background 0.1s ease; }
        .fornMatriz tbody tr:hover td { background: var(--accent-light, #ecf3ff) !important; }
      `}</style>
      {/* Navegacao de ano + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={prevAno} disabled={anoIdx <= 0} style={btnS} aria-label="Ano anterior">‹</button>
          <strong style={{ fontSize: 16, minWidth: 56, textAlign: 'center' }}>{ano}</strong>
          <button onClick={nextAno} disabled={anoIdx < 0 || anoIdx >= anos.length - 1} style={btnS} aria-label="Próximo ano">›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(110px, 1fr))', gap: 8, flex: 1 }}>
          <StatCard label="Fornecedores" value={nFornecedores} />
          <StatCard label="Produtos" value={nProdutos} />
        </div>
      </div>

      {doAno.length === 0 ? (
        <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>Nenhuma compra registrada em {ano}.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', flexWrap: 'wrap' }}>
            <input
              type="search"
              placeholder="Buscar fornecedor..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ ...inputS, flex: '1 1 220px', maxWidth: 320 }}
            />
            <p style={{ fontSize: 12, color: '#888', margin: 0, flex: '1 1 240px' }}>
              Total de compras por fornecedor em cada mês (valor das notas). Clique num fornecedor para expandir os produtos, ou no ícone de olho cortado para ocultá-lo das listas.
            </p>
          </div>
          {fornecedoresFiltrados.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>Nenhum fornecedor encontrado para "{busca}".</p>
          ) : (
            <Matriz rows={fornecedoresFiltrados} />
          )}
        </>
      )}

      {/* Fornecedores ocultos — restaurar com 1 clique. */}
      {ocultosList.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, border: '1px dashed var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg, #f9fafb)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8 }}>
            Fornecedores ocultos ({ocultosList.length}) — não aparecem em Preços, Fornecedores nem Subiram
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ocultosList.slice().sort((a, b) => a.localeCompare(b)).map(nome => (
              <button
                key={nome}
                onClick={() => toggleOculto(nome)}
                title="Mostrar este fornecedor novamente"
                style={{ ...btnS, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span>{nome}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>↺ Mostrar</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-pagina "Subiram": lista os produtos cuja ULTIMA compra ficou mais cara
// que a compra anterior (comparando o preco normalizado por kg/un/L).
function SubiramView({ precos, ocultos }) {
  const itens = useMemo(() => {
    const porProduto = {};
    for (const p of precos) {
      if (!p.data) continue;
      if (ocultos.has(p.fornecedor || '(sem)')) continue; // fornecedor oculto some da lista
      (porProduto[p.produto_id] ||= []).push(p);
    }
    const out = [];
    for (const id in porProduto) {
      const list = porProduto[id].slice().sort((a, b) => {
        if (a.data !== b.data) return a.data < b.data ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      if (list.length < 2) continue;
      const atual = list[list.length - 1];
      const anterior = list[list.length - 2];
      if (anterior.preco_normalizado > 0 && atual.preco_normalizado > anterior.preco_normalizado + 1e-9) {
        const diff = atual.preco_normalizado - anterior.preco_normalizado;
        const pct = (diff / anterior.preco_normalizado) * 100;
        out.push({ row: atual, anterior: anterior.preco_normalizado, diff, pct });
      }
    }
    return out.sort((a, b) => b.pct - a.pct);
  }, [precos, ocultos]);

  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter(i =>
      i.row.produto.toLowerCase().includes(q) || (i.row.fornecedor || '').toLowerCase().includes(q)
    );
  }, [itens, busca]);

  return (
    <div>
      <style>{`
        .subiuTable tbody tr { transition: background 0.1s ease; }
        .subiuTable tbody tr:hover td { background: var(--accent-light, #ecf3ff) !important; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Buscar produto ou fornecedor..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ ...inputS, flex: '1 1 220px', maxWidth: 320 }}
        />
        <div style={{ flex: '1 1 160px' }}>
          <StatCard label="Itens que subiram" value={itens.length} />
        </div>
      </div>
      {itens.length === 0 ? (
        <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>Nenhum item subiu em relação à última compra.</p>
      ) : filtrados.length === 0 ? (
        <p style={{ padding: 20, textAlign: 'center', color: '#888' }}>Nenhum item encontrado para "{busca}".</p>
      ) : (
        <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflowX: 'auto' }}>
          <table className="subiuTable" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
                <th style={thS}>Produto</th>
                <th style={thS}>Fornecedor</th>
                <th style={thS}>Última compra</th>
                <th style={{ ...thS, textAlign: 'right' }}>Anterior</th>
                <th style={{ ...thS, textAlign: 'right' }}>Atual</th>
                <th style={{ ...thS, textAlign: 'right' }}>Variação</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(i => (
                <tr key={i.row.id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={{ ...tdS, fontWeight: 500, fontSize: 11 }}>{i.row.produto}</td>
                  <td style={tdS}>{i.row.fornecedor}</td>
                  <td style={tdS}>{formatDate(i.row.data)}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontSize: 12 }}>R$ {i.anterior.toFixed(2)}/{i.row.unidade_normalizada}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontSize: 12 }}>R$ {i.row.preco_normalizado.toFixed(2)}/{i.row.unidade_normalizada}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontSize: 12, color: '#e53935', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    ▲ +R$ {i.diff.toFixed(2)} (+{i.pct.toFixed(1)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Converte texto do usuario (aceita virgula decimal) em numero, ou null se vazio/invalido.
function parseNum(s) {
  if (s === '' || s == null) return null;
  const n = Number(String(s).replace(',', '.').trim());
  return Number.isNaN(n) ? null : n;
}

// Sub-pagina "Cadastrar": insere manualmente um registro de preco (linha em
// `precos`). Permite criar um produto novo (ou reusar um existente pelo nome),
// puxar o "Produto (planilha)" / nome_padrao da lista ja cadastrada, e escolher
// um fornecedor existente ou cadastrar um novo na hora. Cobre todas as colunas
// editaveis da nota. Apos salvar, recarrega os dados da pagina (onSaved).
function CadastrarView({ onSaved, ocultos }) {
  const ocultosSet = useMemo(() => ocultos || new Set(), [ocultos]);
  const [produtos, setProdutos] = useState([]);       // {id, nome, nome_padrao, fator_regra3}
  const [fornecedores, setFornecedores] = useState([]); // {id, nome, nome_curto}
  const [precosRaw, setPrecosRaw] = useState([]);     // {produto_id, fornecedor_id, nfe_id} (p/ detectar manuais)
  const [loadingLists, setLoadingLists] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null); // { tipo: 'ok' | 'err', texto }
  // Edicao inline nas listas de manuais.
  const [editProd, setEditProd] = useState(null);   // { id, nome, nome_padrao, fator }
  const [editForn, setEditForn] = useState(null);   // { id, nome, nome_curto }

  const vazio = {
    produto: '', nome_padrao: '', fornecedorId: '', novoFornecedor: '',
    loja: '', data: new Date().toISOString().slice(0, 10),
    preco_bruto: '', qtd_embalagem: '', unidade_embalagem: '',
    preco_normalizado: '', unidade_normalizada: '', fator: '',
  };
  const [form, setForm] = useState(vazio);
  const [criandoFornecedor, setCriandoFornecedor] = useState(false);
  const formRef = useRef(null);
  // Sub-abas do Cadastrar: 'produto' (registro de preco), 'fornecedor' (cadastro/
  // edicao de fornecedores) e 'planilha' (vinculo produto da nota -> nome padrao).
  const [cadTab, setCadTab] = useState('produto');
  // Cadastro de fornecedor novo (aba Fornecedor): nome (como vem na nota) + nome
  // convertido (nome_curto, o que aparece nas listas).
  const [novoForn, setNovoForn] = useState({ nome: '', nome_curto: '' });
  const [buscaForn, setBuscaForn] = useState('');
  const [buscaPlanilha, setBuscaPlanilha] = useState('');
  const [soSemVinculo, setSoSemVinculo] = useState(false);
  // Produtos ocultos na Planilha (compartilhado via Firestore, por id de produto).
  const { ocultos: produtosOcultos, toggle: toggleProdutoOculto } = useProdutosOcultos();
  const produtosOcultosSet = useMemo(() => new Set(produtosOcultos), [produtosOcultos]);

  const set = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }));

  // Replica um produto manual no formulario: puxa o ULTIMO lancamento dele e
  // preenche tudo, deixando a data = hoje. Util pra recadastrar o mesmo item
  // (mesma embalagem/preco) mudando so a data, sem redigitar.
  async function replicarProduto(p) {
    const { data, error } = await supabase
      .from('precos').select('*')
      .eq('produto_id', p.id).is('nfe_id', null)
      .order('data', { ascending: false }).limit(1);
    if (error) console.error('[precos] erro ao replicar:', error);
    const last = data && data[0];
    setCriandoFornecedor(false);
    setForm({
      produto: p.nome || '',
      nome_padrao: p.nome_padrao || '',
      fornecedorId: last?.fornecedor_id != null ? String(last.fornecedor_id) : '',
      novoFornecedor: '',
      loja: last?.loja || '',
      data: new Date().toISOString().slice(0, 10),
      preco_bruto: last?.preco_bruto != null ? String(last.preco_bruto) : '',
      qtd_embalagem: last?.qtd_embalagem != null ? String(last.qtd_embalagem) : '',
      unidade_embalagem: last?.unidade_embalagem || '',
      preco_normalizado: last?.preco_normalizado != null ? String(last.preco_normalizado) : '',
      unidade_normalizada: last?.unidade_normalizada || '',
      fator: p.fator_regra3 || '',
    });
    setEditProd(null);
    setMsg({ tipo: 'ok', texto: `Dados de "${p.nome}" replicados no formulário — ajuste a data (ou o que precisar) e clique em Cadastrar.` });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => { carregarListas(); }, []);

  async function carregarListas() {
    setLoadingLists(true);
    // Pagina precos pra nao parar no limite de ~1000 linhas do PostgREST.
    async function fetchPrecos() {
      const PAGE = 1000; let all = [];
      for (let i = 0; i < 30; i++) {
        const { data, error } = await supabase
          .from('precos').select('produto_id, fornecedor_id, nfe_id')
          .range(i * PAGE, i * PAGE + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
      }
      return all;
    }
    const [{ data: prod }, { data: forn }, pr] = await Promise.all([
      supabase.from('produtos').select('id, nome, nome_padrao, fator_regra3').order('nome'),
      supabase.from('fornecedores').select('id, nome, nome_curto').order('nome'),
      fetchPrecos(),
    ]);
    setProdutos(prod || []);
    setFornecedores(forn || []);
    setPrecosRaw(pr || []);
    setLoadingLists(false);
  }

  // nome_padrao distintos ja cadastrados (pra datalist do "Produto (planilha)").
  const nomesPadrao = useMemo(
    () => [...new Set(produtos.map(p => p.nome_padrao).filter(Boolean))].sort(),
    [produtos]
  );

  // Fornecedores ocultos (escondidos na sub-pagina Fornecedores) somem de todas
  // as listagens aqui tambem — usa o mesmo nome normalizado pra casar com o set.
  const fornecedoresVisiveis = useMemo(
    () => fornecedores.filter(f => !ocultosSet.has(normalizeFornecedor(f.nome_curto, f.nome))),
    [fornecedores, ocultosSet]
  );

  // Estatistica de lancamentos por produto/fornecedor: quantos manuais (nfe_id
  // null) vs vindos de NFe. "Manual" = tem ao menos 1 lancamento e NENHUM de NFe.
  const { byProd, byForn } = useMemo(() => {
    const bp = {}, bf = {};
    for (const p of precosRaw) {
      const k = p.nfe_id == null ? 'manual' : 'nfe';
      (bp[p.produto_id] ||= { manual: 0, nfe: 0 })[k]++;
      (bf[p.fornecedor_id] ||= { manual: 0, nfe: 0 })[k]++;
    }
    return { byProd: bp, byForn: bf };
  }, [precosRaw]);

  const produtosManuais = useMemo(
    () => produtos.filter(p => { const s = byProd[p.id]; return s && s.manual > 0 && s.nfe === 0; }),
    [produtos, byProd]
  );

  // Lista pro dropdown: IGUAL a lista de fornecedores do filtro em Preços —
  // somente fornecedores que TEM lancamento, com o nome ja normalizado (ex:
  // "Distrimar"), deduplicado e ordenado. Cadastros vazios/duplicados em caixa
  // alta (DISTRIMAR, FOCATTO...) somem. O value aponta pro id canonico (o que
  // tem mais lancamentos) pra atribuir ao fornecedor certo.
  const fornecedoresDropdown = useMemo(() => {
    const porChave = new Map(); // chave -> { label, id, total }
    for (const f of fornecedoresVisiveis) {
      const s = byForn[f.id];
      if (!s) continue; // sem lancamento nao entra (igual a Preços)
      const label = normalizeFornecedor(f.nome_curto, f.nome);
      const chave = label.toLowerCase();
      const total = s.manual + s.nfe;
      const atual = porChave.get(chave);
      if (!atual || total > atual.total) porChave.set(chave, { label, id: f.id, total });
    }
    return [...porChave.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [fornecedoresVisiveis, byForn]);

  // Aba Fornecedor: todos os fornecedores que tem ao menos 1 lancamento (nota ou
  // manual), pra editar o "nome convertido" (nome_curto). Filtra pela busca.
  const fornecedoresLista = useMemo(() => {
    const q = buscaForn.trim().toLowerCase();
    return fornecedores
      .filter(f => byForn[f.id])
      .filter(f => !q || (f.nome || '').toLowerCase().includes(q) || (f.nome_curto || '').toLowerCase().includes(q))
      .sort((a, b) => (a.nome_curto || a.nome || '').localeCompare(b.nome_curto || b.nome || ''));
  }, [fornecedores, byForn, buscaForn]);

  // Aba Planilha: produtos com lancamento, mostrando nome da nota x nome_padrao.
  // Filtra por busca, oculta os marcados e, opcionalmente, mostra so sem vinculo.
  const produtosPlanilha = useMemo(() => {
    const q = buscaPlanilha.trim().toLowerCase();
    return produtos
      .filter(p => byProd[p.id])
      .filter(p => !produtosOcultosSet.has(p.id))
      .filter(p => !soSemVinculo || !p.nome_padrao)
      .filter(p => !q || (p.nome || '').toLowerCase().includes(q) || (p.nome_padrao || '').toLowerCase().includes(q))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [produtos, byProd, buscaPlanilha, soSemVinculo, produtosOcultosSet]);

  // Produtos ocultos que ainda existem (pra secao de restaurar na Planilha).
  const produtosOcultosLista = useMemo(
    () => produtos.filter(p => produtosOcultosSet.has(p.id)),
    [produtos, produtosOcultosSet]
  );

  // --- Edicao / exclusao de produtos manuais ---
  async function salvarEdicaoProduto() {
    const e = editProd;
    if (!e || !e.nome.trim()) return;
    const { error } = await supabase.from('produtos').update({
      nome: e.nome.trim(),
      nome_padrao: e.nome_padrao.trim() || null,
      fator_regra3: e.fator.trim() || null,
    }).eq('id', e.id);
    if (error) { setMsg({ tipo: 'err', texto: 'Erro ao editar produto: ' + error.message }); return; }
    setEditProd(null);
    await carregarListas(); onSaved?.();
  }

  async function excluirProduto(p) {
    const n = (byProd[p.id]?.manual) || 0;
    if (!window.confirm(`Excluir o produto "${p.nome}" e seus ${n} lançamento(s)?`)) return;
    const d1 = await supabase.from('precos').delete().eq('produto_id', p.id);
    if (d1.error) { setMsg({ tipo: 'err', texto: 'Erro ao excluir lançamentos: ' + d1.error.message }); return; }
    const d2 = await supabase.from('produtos').delete().eq('id', p.id);
    if (d2.error) { setMsg({ tipo: 'err', texto: 'Erro ao excluir produto: ' + d2.error.message }); return; }
    setMsg({ tipo: 'ok', texto: `Produto "${p.nome}" excluído.` });
    await carregarListas(); onSaved?.();
  }

  // --- Edicao / exclusao de fornecedores manuais ---
  async function salvarEdicaoFornecedor() {
    const e = editForn;
    if (!e || !e.nome.trim()) return;
    // "nome da nota" e a chave que a integracao SEFAZ usa pra casar o fornecedor
    // (.eq('nome', ...)). Editar isso num fornecedor que vem de NFe faria a proxima
    // nota nao reconhecer e criar duplicado — por isso so grava o nome quando o
    // fornecedor e 100% manual (lockNome=false). Nome curto pode sempre editar.
    const upd = { nome_curto: e.nome_curto.trim() || null };
    if (!e.lockNome) upd.nome = e.nome.trim();
    const { error } = await supabase.from('fornecedores').update(upd).eq('id', e.id);
    if (error) { setMsg({ tipo: 'err', texto: 'Erro ao editar fornecedor: ' + error.message }); return; }
    setEditForn(null);
    await carregarListas(); onSaved?.();
  }

  async function excluirFornecedor(f) {
    const n = (byForn[f.id]?.manual) || 0;
    if (!window.confirm(`Excluir o fornecedor "${f.nome_curto || f.nome}" e seus ${n} lançamento(s)?`)) return;
    const d1 = await supabase.from('precos').delete().eq('fornecedor_id', f.id);
    if (d1.error) { setMsg({ tipo: 'err', texto: 'Erro ao excluir lançamentos: ' + d1.error.message }); return; }
    const d2 = await supabase.from('fornecedores').delete().eq('id', f.id);
    if (d2.error) { setMsg({ tipo: 'err', texto: 'Erro ao excluir fornecedor: ' + d2.error.message }); return; }
    setMsg({ tipo: 'ok', texto: `Fornecedor "${f.nome_curto || f.nome}" excluído.` });
    await carregarListas(); onSaved?.();
  }

  // Aba Fornecedor: cadastra um fornecedor novo (nome da nota + nome convertido).
  async function salvarNovoFornecedor() {
    const nome = novoForn.nome.trim();
    if (!nome) { setMsg({ tipo: 'err', texto: 'Informe o nome do fornecedor (como vem na nota).' }); return; }
    const nomeCurto = novoForn.nome_curto.trim() || nome;
    const { error } = await supabase.from('fornecedores').insert({ nome, nome_curto: nomeCurto });
    if (error) { setMsg({ tipo: 'err', texto: 'Erro ao cadastrar fornecedor: ' + error.message }); return; }
    setMsg({ tipo: 'ok', texto: `Fornecedor "${nomeCurto}" cadastrado.` });
    setNovoForn({ nome: '', nome_curto: '' });
    await carregarListas(); onSaved?.();
  }

  // Aba Planilha: troca o vinculo de um produto da nota para um "Produto
  // (planilha)" (nome_padrao). Vazio desvincula. Atualiza estado local + banco.
  async function salvarNomePadrao(produtoId, valor) {
    const novo = (valor || '').trim() === '' ? null : valor.trim();
    setProdutos(prev => prev.map(p => p.id === produtoId ? { ...p, nome_padrao: novo } : p));
    const { error } = await supabase.from('produtos').update({ nome_padrao: novo }).eq('id', produtoId);
    if (error) setMsg({ tipo: 'err', texto: 'Erro ao salvar vínculo: ' + error.message });
    else onSaved?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    const produtoNome = form.produto.trim();
    const precoNorm = parseNum(form.preco_normalizado);
    if (!produtoNome) return setMsg({ tipo: 'err', texto: 'Informe o nome do produto.' });
    if (!criandoFornecedor && !form.fornecedorId) return setMsg({ tipo: 'err', texto: 'Selecione um fornecedor (ou cadastre um novo).' });
    if (criandoFornecedor && !form.novoFornecedor.trim()) return setMsg({ tipo: 'err', texto: 'Informe o nome do novo fornecedor.' });
    if (!form.data) return setMsg({ tipo: 'err', texto: 'Informe a data.' });
    if (precoNorm == null) return setMsg({ tipo: 'err', texto: 'Informe o Preço Nota (R$/un).' });

    setSalvando(true);
    try {
      // 1) Fornecedor: novo ou existente.
      let fornecedorId = form.fornecedorId ? Number(form.fornecedorId) : null;
      if (criandoFornecedor) {
        const nome = form.novoFornecedor.trim();
        const { data, error } = await supabase
          .from('fornecedores')
          .insert({ nome, nome_curto: nome })
          .select('id')
          .single();
        if (error) throw new Error('fornecedor: ' + error.message);
        fornecedorId = data.id;
      }

      // 2) Produto: reusa se ja existe pelo nome (case-insensitive), senao cria.
      const fatorVal = form.fator.trim() === '' ? null : form.fator.trim();
      const padraoVal = form.nome_padrao.trim() === '' ? null : form.nome_padrao.trim();
      const existente = produtos.find(p => (p.nome || '').trim().toLowerCase() === produtoNome.toLowerCase());
      let produtoId;
      if (existente) {
        produtoId = existente.id;
        // Atualiza nome_padrao/fator se o usuario preencheu (nao apaga o que ja existe).
        const upd = {};
        if (padraoVal != null) upd.nome_padrao = padraoVal;
        if (fatorVal != null) upd.fator_regra3 = fatorVal;
        if (Object.keys(upd).length) {
          const { error } = await supabase.from('produtos').update(upd).eq('id', produtoId);
          if (error) throw new Error('produto (update): ' + error.message);
        }
      } else {
        const { data, error } = await supabase
          .from('produtos')
          .insert({ nome: produtoNome, nome_padrao: padraoVal, fator_regra3: fatorVal })
          .select('id')
          .single();
        if (error) throw new Error('produto: ' + error.message);
        produtoId = data.id;
      }

      // 3) Registro de preco (a nota em si).
      const { error: errPreco } = await supabase.from('precos').insert({
        produto_id: produtoId,
        fornecedor_id: fornecedorId,
        data: form.data,
        preco_bruto: parseNum(form.preco_bruto),
        qtd_embalagem: parseNum(form.qtd_embalagem),
        unidade_embalagem: form.unidade_embalagem.trim() || null,
        preco_normalizado: precoNorm,
        unidade_normalizada: form.unidade_normalizada.trim() || null,
        loja: form.loja || null,
      });
      if (errPreco) throw new Error('preço: ' + errPreco.message);

      setMsg({ tipo: 'ok', texto: `Registro de "${produtoNome}" cadastrado com sucesso.` });
      // Limpa o formulario mantendo a data (geralmente cadastra varios da mesma nota).
      setForm({ ...vazio, data: form.data });
      setCriandoFornecedor(false);
      await carregarListas();
      onSaved?.();
    } catch (err) {
      console.error('[precos] erro ao cadastrar:', err);
      setMsg({ tipo: 'err', texto: 'Erro ao salvar: ' + err.message });
    }
    setSalvando(false);
  }

  if (loadingLists) return <p style={{ padding: 20, textAlign: 'center' }}>Carregando listas...</p>;

  const msgBox = msg && (
    <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 6, fontSize: 13,
      background: msg.tipo === 'ok' ? '#e8f5e9' : '#ffebee',
      color: msg.tipo === 'ok' ? '#2e7d32' : '#c62828',
      border: `1px solid ${msg.tipo === 'ok' ? '#a5d6a7' : '#ef9a9a'}` }}>
      {msg.texto}
    </div>
  );

  return (
   <div>
    {/* Datalists compartilhadas pelas sub-abas. */}
    <datalist id="dl-produtos">
      {produtos.map(p => <option key={p.id} value={p.nome} />)}
    </datalist>
    <datalist id="dl-nome-padrao">
      {nomesPadrao.map(n => <option key={n} value={n} />)}
    </datalist>
    <datalist id="dl-unidade-norm">
      {['kg', 'g', 'lt', 'ml', 'un'].map(u => <option key={u} value={u} />)}
    </datalist>

    {/* Sub-abas: Produto / Fornecedor / Planilha. */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <button style={subTabBtnS(cadTab === 'produto')} onClick={() => { setCadTab('produto'); setMsg(null); }}>Produto</button>
      <button style={subTabBtnS(cadTab === 'fornecedor')} onClick={() => { setCadTab('fornecedor'); setMsg(null); }}>Fornecedor</button>
      <button style={subTabBtnS(cadTab === 'planilha')} onClick={() => { setCadTab('planilha'); setMsg(null); }}>Planilha</button>
    </div>

    {msgBox}

    {/* ---------- Aba PRODUTO: registro de preço (fornecedor só seleção) ---------- */}
    {cadTab === 'produto' && (
     <>
      <form ref={formRef} onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px' }}>
          Cadastre manualmente um registro de preço. Se o produto já existir (mesmo nome), ele é reaproveitado.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Campo label="Produto *">
            <input list="dl-produtos" value={form.produto} onChange={e => set('produto', e.target.value)}
              placeholder="Nome do produto (ex: AZEITE BORGES 500ML)" style={cadInputS} />
          </Campo>

          <Campo label="Produto (planilha)">
            <input list="dl-nome-padrao" value={form.nome_padrao} onChange={e => set('nome_padrao', e.target.value)}
              placeholder="Nome padronizado" style={cadInputS} />
          </Campo>

          <Campo label="Fornecedor *" full>
            <select value={form.fornecedorId} onChange={e => set('fornecedorId', e.target.value)} style={{ ...cadInputS }}>
              <option value="">Selecione...</option>
              {fornecedoresDropdown.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <span style={{ fontSize: 11, color: '#888' }}>
              Não achou o fornecedor? Cadastre na aba <strong>Fornecedor</strong>.
            </span>
          </Campo>

          <Campo label="Loja">
            <select value={form.loja} onChange={e => set('loja', e.target.value)} style={cadInputS}>
              <option value="">—</option>
              <option value="dame">Dame</option>
              <option value="lov">Lov</option>
            </select>
          </Campo>

          <Campo label="Data *">
            <input type="date" value={form.data} onChange={e => set('data', e.target.value)} style={cadInputS} />
          </Campo>

          <Campo label="Preço Nota (R$/un) *">
            <input inputMode="decimal" value={form.preco_normalizado} onChange={e => set('preco_normalizado', e.target.value)}
              placeholder="6,79" style={cadInputS} />
          </Campo>

          <Campo label="Unidade (kg/lt/un)">
            <input list="dl-unidade-norm" value={form.unidade_normalizada} onChange={e => set('unidade_normalizada', e.target.value)}
              placeholder="kg" style={cadInputS} />
          </Campo>

          <Campo label="Preço bruto (R$ da nota)">
            <input inputMode="decimal" value={form.preco_bruto} onChange={e => set('preco_bruto', e.target.value)}
              placeholder="331,76" style={cadInputS} />
          </Campo>

          <Campo label="Fator (Regra3)">
            <input value={form.fator} onChange={e => set('fator', e.target.value)}
              placeholder="2 ou /2" title="Multiplica por padrao (ex: 2). Use / pra dividir (ex: /2)" style={cadInputS} />
          </Campo>

          <Campo label="Qtd embalagem">
            <input inputMode="decimal" value={form.qtd_embalagem} onChange={e => set('qtd_embalagem', e.target.value)}
              placeholder="48,86" style={cadInputS} />
          </Campo>

          <Campo label="Unidade embalagem">
            <input value={form.unidade_embalagem} onChange={e => set('unidade_embalagem', e.target.value)}
              placeholder="LT" style={cadInputS} />
          </Campo>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="submit" disabled={salvando}
            style={{ ...btnS, background: '#43a047', color: '#fff', border: '1px solid #43a047', padding: '8px 18px', fontWeight: 600, opacity: salvando ? 0.6 : 1 }}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
          <button type="button" onClick={() => { setForm(vazio); setCriandoFornecedor(false); setMsg(null); }} style={{ ...btnS, padding: '8px 18px' }}>
            Limpar
          </button>
        </div>
      </form>

      {/* Produtos cadastrados manualmente (sem origem em NFe). */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>Produtos cadastrados manualmente ({produtosManuais.length})</h3>
        {produtosManuais.length === 0 ? (
          <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Nenhum produto cadastrado manualmente ainda.</p>
        ) : (
          <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
                  <th style={thS}>Produto</th>
                  <th style={thS}>Produto (planilha)</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Fator</th>
                  <th style={{ ...thS, textAlign: 'center' }}>Lanç.</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtosManuais.map(p => {
                  const emEdicao = editProd?.id === p.id;
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                      {emEdicao ? (
                        <>
                          <td style={tdS}><input value={editProd.nome} onChange={e => setEditProd({ ...editProd, nome: e.target.value })} style={cadInputS} /></td>
                          <td style={tdS}><input list="dl-nome-padrao" value={editProd.nome_padrao} onChange={e => setEditProd({ ...editProd, nome_padrao: e.target.value })} style={cadInputS} /></td>
                          <td style={{ ...tdS, textAlign: 'right' }}><input value={editProd.fator} onChange={e => setEditProd({ ...editProd, fator: e.target.value })} placeholder="2 ou /2" style={fatorInputS} /></td>
                          <td style={{ ...tdS, textAlign: 'center', color: '#888' }}>{byProd[p.id]?.manual || 0}</td>
                          <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={salvarEdicaoProduto} style={{ ...btnS, marginRight: 6 }}>Salvar</button>
                            <button type="button" onClick={() => setEditProd(null)} style={btnS}>Cancelar</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...tdS, fontWeight: 500, fontSize: 12 }}>{p.nome}</td>
                          <td style={{ ...tdS, color: p.nome_padrao ? 'inherit' : '#bbb' }}>{p.nome_padrao || '—'}</td>
                          <td style={{ ...tdS, textAlign: 'right' }}>{p.fator_regra3 || '—'}</td>
                          <td style={{ ...tdS, textAlign: 'center', color: '#888' }}>{byProd[p.id]?.manual || 0}</td>
                          <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={() => replicarProduto(p)} style={{ ...btnS, marginRight: 6, color: '#1565c0', borderColor: '#90caf9' }} title="Copiar este item para o formulário (ex: mudar só a data)">Replicar</button>
                            <button type="button" onClick={() => setEditProd({ id: p.id, nome: p.nome || '', nome_padrao: p.nome_padrao || '', fator: p.fator_regra3 || '' })} style={{ ...btnS, marginRight: 6 }}>Editar</button>
                            <button type="button" onClick={() => excluirProduto(p)} style={{ ...btnS, color: '#c62828', borderColor: '#ef9a9a' }}>Excluir</button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
     </>
    )}

    {/* ---------- Aba FORNECEDOR: cadastro + edição de fornecedores ---------- */}
    {cadTab === 'fornecedor' && (
     <div style={{ maxWidth: 760 }}>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px' }}>
        Cadastre um fornecedor novo ou edite os existentes. O <strong>nome da nota</strong> é como vem no documento fiscal; o <strong>nome convertido</strong> é o nome curto que aparece nas listas (editável).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 8 }}>
        <Campo label="Nome da nota *">
          <input value={novoForn.nome} onChange={e => setNovoForn({ ...novoForn, nome: e.target.value })}
            placeholder="Como vem na nota fiscal" style={cadInputS} />
        </Campo>
        <Campo label="Nome convertido">
          <input value={novoForn.nome_curto} onChange={e => setNovoForn({ ...novoForn, nome_curto: e.target.value })}
            placeholder="Nome curto (opcional — usa o da nota se vazio)" style={cadInputS} />
        </Campo>
      </div>
      <button type="button" onClick={salvarNovoFornecedor}
        style={{ ...btnS, background: '#43a047', color: '#fff', border: '1px solid #43a047', padding: '8px 18px', fontWeight: 600 }}>
        + Cadastrar fornecedor
      </button>

      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: '1 1 auto' }}>Fornecedores existentes ({fornecedoresLista.length})</h3>
        <input type="search" placeholder="Buscar fornecedor..." value={buscaForn} onChange={e => setBuscaForn(e.target.value)}
          style={{ ...inputS, flex: '0 1 240px' }} />
      </div>

      {fornecedoresLista.length === 0 ? (
        <p style={{ fontSize: 12, color: '#888', margin: '8px 0 0' }}>Nenhum fornecedor encontrado.</p>
      ) : (
        <div style={{ marginTop: 8, background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
                <th style={thS}>Nome da nota</th>
                <th style={thS}>Nome convertido</th>
                <th style={{ ...thS, textAlign: 'center' }}>Lanç.</th>
                <th style={{ ...thS, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {fornecedoresLista.map(f => {
                const emEdicao = editForn?.id === f.id;
                const stats = byForn[f.id] || { manual: 0, nfe: 0 };
                const soManual = stats.manual > 0 && stats.nfe === 0;
                return (
                  <tr key={f.id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                    {emEdicao ? (
                      <>
                        <td style={tdS}>
                          {editForn.lockNome ? (
                            <span title="Nome da nota não pode ser alterado (a integração casa o fornecedor por ele)" style={{ color: 'var(--text-secondary, #555)' }}>
                              {editForn.nome} 🔒
                            </span>
                          ) : (
                            <input value={editForn.nome} onChange={e => setEditForn({ ...editForn, nome: e.target.value })} style={cadInputS} />
                          )}
                        </td>
                        <td style={tdS}><input value={editForn.nome_curto} onChange={e => setEditForn({ ...editForn, nome_curto: e.target.value })} autoFocus placeholder="Nome curto" style={cadInputS} /></td>
                        <td style={{ ...tdS, textAlign: 'center', color: '#888' }}>{stats.manual + stats.nfe}</td>
                        <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={salvarEdicaoFornecedor} style={{ ...btnS, marginRight: 6 }}>Salvar</button>
                          <button type="button" onClick={() => setEditForn(null)} style={btnS}>Cancelar</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...tdS, fontWeight: 500 }}>{f.nome}</td>
                        <td style={{ ...tdS, color: f.nome_curto ? 'inherit' : '#bbb' }}>{f.nome_curto || '—'}</td>
                        <td style={{ ...tdS, textAlign: 'center', color: '#888' }}>{stats.manual + stats.nfe}</td>
                        <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => setEditForn({ id: f.id, nome: f.nome || '', nome_curto: f.nome_curto || '', lockNome: !soManual })} style={{ ...btnS, marginRight: 6 }}>Editar</button>
                          {soManual && (
                            <button type="button" onClick={() => excluirFornecedor(f)} style={{ ...btnS, color: '#c62828', borderColor: '#ef9a9a' }}>Excluir</button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 11, color: '#888', margin: '8px 0 0' }}>
        Fornecedores que vêm de nota fiscal: o <strong>nome da nota</strong> fica travado (🔒) — a integração usa ele pra reconhecer o fornecedor; alterá-lo criaria um duplicado na próxima importação. Edite só o <strong>nome convertido</strong>. Excluir só é possível nos 100% manuais.
      </p>
     </div>
    )}

    {/* ---------- Aba PLANILHA: vínculo produto da nota -> Produto (planilha) ---------- */}
    {cadTab === 'planilha' && (
     <div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px' }}>
        Nome do produto como vem na nota × nome do produto na planilha. Troque o vínculo escolhendo (ou digitando) um <strong>Produto (planilha)</strong> diferente — vale para todas as compras do mesmo produto.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="search" placeholder="Buscar produto..." value={buscaPlanilha} onChange={e => setBuscaPlanilha(e.target.value)}
          style={{ ...inputS, flex: '1 1 240px', maxWidth: 320 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text, #222)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={soSemVinculo} onChange={e => setSoSemVinculo(e.target.checked)} style={{ cursor: 'pointer' }} />
          Só sem vínculo
        </label>
        <span style={{ fontSize: 12, color: '#888' }}>{produtosPlanilha.length} produto(s)</span>
      </div>

      {produtosPlanilha.length === 0 ? (
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Nenhum produto encontrado.</p>
      ) : (
        <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
                <th style={{ ...thS, width: 34 }}></th>
                <th style={thS}>Produto (nota)</th>
                <th style={thS}>Produto (planilha)</th>
              </tr>
            </thead>
            <tbody>
              {produtosPlanilha.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={{ ...tdS, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => toggleProdutoOculto(p.id)}
                      title={`Ocultar "${p.nome}" da planilha`}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#888', padding: 0, lineHeight: 0, verticalAlign: 'middle' }}
                    >
                      <EyeOffIcon />
                    </button>
                  </td>
                  <td style={{ ...tdS, fontWeight: 500, fontSize: 12 }}>{p.nome}</td>
                  <td style={tdS}>
                    <input
                      list="dl-nome-padrao"
                      defaultValue={p.nome_padrao || ''}
                      placeholder="— sem vínculo —"
                      title="Selecione ou digite o Produto (planilha). Vazio remove o vínculo."
                      onBlur={e => { if ((e.target.value || '').trim() !== (p.nome_padrao || '')) salvarNomePadrao(p.id, e.target.value); }}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      style={{ ...cadInputS, maxWidth: 320 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Produtos ocultos — restaurar com 1 clique. */}
      {produtosOcultosLista.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, border: '1px dashed var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg, #f9fafb)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8 }}>
            Produtos ocultos ({produtosOcultosLista.length}) — não aparecem nesta lista
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {produtosOcultosLista.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map(p => (
              <button
                key={p.id}
                onClick={() => toggleProdutoOculto(p.id)}
                title="Mostrar este produto novamente"
                style={{ ...btnS, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span>{p.nome}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>↺ Mostrar</span>
              </button>
            ))}
          </div>
        </div>
      )}
     </div>
    )}
   </div>
  );
}

function Campo({ label, full, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : 'auto' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #555)' }}>{label}</span>
      {children}
    </label>
  );
}

const cadInputS = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', fontSize: 13, background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', boxSizing: 'border-box', width: '100%' };

const headerS = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 0', marginBottom: 12, borderBottom: '1px solid var(--border, #e5e5e5)' };
const headerTitleS = { fontSize: 18, fontWeight: 700, color: 'var(--text, #222)' };
const tabBtnS = (active, color = 'var(--accent, #465fff)') => ({ padding: '8px 14px', border: `2px solid ${color}`, borderRadius: 6, background: active ? color : 'var(--card-bg, #fff)', color: active ? '#fff' : color, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' });
// Sub-abas internas do Cadastrar (Produto / Fornecedor / Planilha) — visual mais leve que as abas principais.
const subTabBtnS = (active) => ({ padding: '6px 14px', border: '1px solid var(--border, #e5e5e5)', borderRadius: 20, background: active ? 'var(--accent, #465fff)' : 'var(--card-bg, #fff)', color: active ? '#fff' : 'var(--text-secondary, #555)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' });
const inputS = { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', fontSize: 13, background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', boxSizing: 'border-box' };
const thS = { padding: '8px 10px', fontSize: 12, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' };
const tdS = { padding: '7px 10px' };
const fatorInputS = { width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border, #e5e5e5)', textAlign: 'right', fontSize: 12, background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', boxSizing: 'border-box' };
const produtoPadraoSelectS = { minWidth: 140, maxWidth: 200, padding: '5px 24px 5px 8px', borderRadius: 6, border: '1px solid var(--accent, #465fff)', fontSize: 12, fontWeight: 600, background: 'var(--accent-light, #eef2ff)', color: 'var(--accent, #465fff)', cursor: 'pointer', boxSizing: 'border-box', appearance: 'auto' };
const btnS = { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', cursor: 'pointer', fontSize: 12 };
