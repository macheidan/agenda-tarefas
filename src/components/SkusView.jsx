import { useCallback, useMemo, useRef, useState } from 'react';
import { useCmv } from '../hooks/useCmv';
import { IS_V2 } from '../lib/v2';

// Sub-seção SKUs (Preços): matriz "Produto (planilha)" × sabores. Mostra em quais
// sabores cada item que compramos é usado — direto na ficha do sabor, via um
// beneficiado (ex.: Massa, Molho) ou pela Base da categoria (entra em todas).
//
// Duas categorias, derivadas do uso (não há cadastro manual):
//   Insumos — o produto aparece em alguma ficha (sabor ou beneficiado)
//   Outros  — o resto do que compramos (limpeza, bobina, embalagem...)
//
// Fontes: nomesPadrao/custoBase vêm da seção Preços (Supabase); sabores,
// beneficiados e bases vêm do CMV (Firestore, useCmv).

// ── Estilos locais (mesmo padrão inline do PrecosInsumosView/CmvView) ───────
const inputS = { padding: '6px 8px', borderRadius: IS_V2 ? 8 : 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', fontSize: 13 };

const btnS = IS_V2
  ? { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', cursor: 'pointer', fontSize: 14, fontWeight: 500, boxShadow: 'var(--shadow-xs)' }
  : { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', cursor: 'pointer', fontSize: 13 };

const btnAtivoS = { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600 };

const cardS = { background: 'var(--card-bg, #fff)', borderRadius: IS_V2 ? 12 : 8, border: '1px solid var(--border, #e5e5e5)', padding: 0, marginBottom: 12, overflow: 'auto', maxHeight: '72vh' };

const thS = { padding: '6px 8px', fontSize: IS_V2 ? 12 : 11, color: 'var(--text-muted)', fontWeight: IS_V2 ? 500 : 600, textAlign: 'left', whiteSpace: 'nowrap' };
const tdS = { padding: '4px 8px', fontSize: 12, color: 'var(--text, #222)' };

// Primeira coluna (nome do produto) fica fixa na rolagem horizontal — com ~60
// sabores em colunas, sem isso não dá pra saber de que linha é a marcação.
const stickyTdS = { ...tdS, position: 'sticky', left: 0, zIndex: 2, background: 'var(--card-bg, #fff)', minWidth: 190, maxWidth: 260, borderRight: '1px solid var(--border, #e5e5e5)' };
const stickyThS = { ...thS, position: 'sticky', left: 0, zIndex: 4, background: 'var(--bg, #f5f5f5)', minWidth: 190, borderRight: '1px solid var(--border, #e5e5e5)', verticalAlign: 'bottom' };

// Cabeçalho do sabor: texto na vertical pra coluna caber em ~28px.
const saborThS = { ...thS, padding: '6px 2px', width: 28, minWidth: 28, textAlign: 'center', verticalAlign: 'bottom' };
const saborLabelS = { writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', maxHeight: 170, overflow: 'hidden', margin: '0 auto' };

const celS = { ...tdS, padding: '4px 2px', textAlign: 'center', width: 28, minWidth: 28 };

const secaoS = { padding: '8px 10px', fontSize: 13, fontWeight: 700, color: 'var(--text, #222)', background: 'var(--bg-secondary, #fafafa)', position: 'sticky', left: 0 };

// Realce cruzado (crosshair): passar o mouse numa célula acende a LINHA e a
// COLUNA inteiras — numa matriz de ~200 produtos x ~60 sabores é a única forma
// de saber de que produto/sabor é a marcação sob o cursor.
//
// O realce é pintado com `background-image` (gradiente chapado) e não com
// `background-color`: assim ele se SOBREPÕE ao fundo já existente em vez de
// substituí-lo — a coluna fixa continua opaca durante a rolagem horizontal e a
// linha de seção mantém o cinza dela.
// A regra é injetada mutando o textContent de um <style> por ref, sem passar
// por estado do React: re-renderizar 12 mil células a cada mousemove travaria.
const CROSS = 'background-image:linear-gradient(var(--accent-light),var(--accent-light))';
// Célula sob o cursor: mesmo realce + anel accent (outline pra dentro, que não
// desloca nada numa tabela com border-collapse).
const CROSS_CELL = `${CROSS};outline:1px solid var(--accent);outline-offset:-1px`;

function crossCss(row, col) {
  const rules = [
    `.skuTable tbody td:nth-child(${col}),.skuTable thead th:nth-child(${col}){${CROSS}}`,
  ];
  if (row != null) {
    rules.push(`.skuTable tbody tr[data-r="${row}"] td{${CROSS}}`);
    rules.push(`.skuTable tbody tr[data-r="${row}"] td:nth-child(${col}){${CROSS_CELL}}`);
  }
  return rules.join('');
}

function fmt(n) {
  return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SkusView({ custoBase = {}, nomesPadrao = [] }) {
  const { sabores, beneficiados, bases, loading } = useCmv();

  const [busca, setBusca] = useState('');
  const [catSabor, setCatSabor] = useState('todas'); // todas | salgada | doce
  const [soUsados, setSoUsados] = useState(false); // esconde sabor sem nenhum item marcado

  // Crosshair: <style> mutado na mão + último alvo, pra só reescrever a regra
  // quando o cursor de fato troca de célula.
  const crossRef = useRef(null);
  const ultimoRef = useRef('');

  const onCruzar = useCallback((e) => {
    const node = crossRef.current;
    if (!node) return;
    const cel = e.target.closest?.('td, th');
    // Linha de seção / estado vazio (colSpan) não tem cruzamento que faça sentido.
    if (!cel || !cel.parentElement || cel.colSpan > 1) {
      if (ultimoRef.current !== '') { ultimoRef.current = ''; node.textContent = ''; }
      return;
    }
    const col = cel.cellIndex + 1;
    const row = cel.parentElement.dataset.r;
    const chave = `${row ?? ''}|${col}`;
    if (chave === ultimoRef.current) return;
    ultimoRef.current = chave;
    node.textContent = crossCss(row, col);
  }, []);

  const onSair = useCallback(() => {
    ultimoRef.current = '';
    if (crossRef.current) crossRef.current.textContent = '';
  }, []);

  // Sabores que viram colunas (arquivados ficam de fora).
  const colunas = useMemo(() => {
    const ativos = sabores.filter(s => !s.archived);
    const filtrados = catSabor === 'todas' ? ativos : ativos.filter(s => (s.categoria || 'salgada') === catSabor);
    return [...filtrados].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [sabores, catSabor]);

  // Produtos (planilha) que cada beneficiado consome. Arquivado continua valendo:
  // sabores que já o usam seguem puxando os ingredientes dele.
  const refsPorBeneficiado = useMemo(() => {
    const m = {};
    for (const b of beneficiados) {
      m[b.nome] = [...new Set((b.lines || []).map(l => l.ref).filter(Boolean))];
    }
    return m;
  }, [beneficiados]);

  // usos[produto][saborId] = { direto, base, via: [nomes de beneficiado] }
  // e usosBenef[produto] = [nomes de beneficiado que usam o produto].
  const { usos, usosBenef, produtosEmFicha } = useMemo(() => {
    const usos = {};
    const usosBenef = {};
    const emFicha = new Set();

    for (const b of beneficiados) {
      for (const ref of refsPorBeneficiado[b.nome] || []) {
        emFicha.add(ref);
        (usosBenef[ref] ||= []).push(b.nome);
      }
    }

    const marcar = (ref, saborId, campo, nomeBenef) => {
      emFicha.add(ref);
      const linha = (usos[ref] ||= {});
      const cel = (linha[saborId] ||= { direto: false, base: false, via: [] });
      if (campo === 'via') { if (!cel.via.includes(nomeBenef)) cel.via.push(nomeBenef); }
      else cel[campo] = true;
    };

    for (const s of sabores) {
      if (s.archived) continue;
      const cat = s.categoria || 'salgada';
      const own = s.lines || [];
      const ownKeys = new Set(own.map(l => `${l.tipo || 'base'}:${l.ref}`));
      // Mesma regra do calcSabor: linha da Base já presente na ficha não conta 2x.
      const baseLines = ((bases && bases[cat]) || []).filter(l => !ownKeys.has(`${l.tipo || 'base'}:${l.ref}`));

      const aplicar = (l, daBase) => {
        if (!l.ref) return;
        if (l.tipo === 'beneficiado') {
          for (const ref of refsPorBeneficiado[l.ref] || []) marcar(ref, s.id, 'via', l.ref);
        } else {
          marcar(l.ref, s.id, daBase ? 'base' : 'direto');
        }
      };
      for (const l of own) aplicar(l, false);
      for (const l of baseLines) aplicar(l, true);
    }

    return { usos, usosBenef, produtosEmFicha: emFicha };
  }, [sabores, beneficiados, bases, refsPorBeneficiado]);

  // Linhas: tudo que compramos (nome_padrao das notas) + refs usados em ficha que
  // não aparecem nas compras dos últimos 12 meses (produto que parou de ser comprado).
  const linhas = useMemo(() => {
    const todos = [...new Set([...nomesPadrao, ...produtosEmFicha])].filter(Boolean);
    const f = busca.trim().toLowerCase();
    const filtrados = f ? todos.filter(n => n.toLowerCase().includes(f)) : todos;
    const insumos = [], outros = [];
    for (const n of filtrados.sort((a, b) => a.localeCompare(b))) {
      (produtosEmFicha.has(n) ? insumos : outros).push(n);
    }
    return { insumos, outros };
  }, [nomesPadrao, produtosEmFicha, busca]);

  // Sabor sem nenhum item marcado (ficha ainda vazia) — o toggle "só sabores com
  // ficha" tira essas colunas pra tabela não ficar cheia de vão.
  const colunasVisiveis = useMemo(() => {
    if (!soUsados) return colunas;
    return colunas.filter(s => Object.values(usos).some(l => l[s.id]));
  }, [colunas, usos, soUsados]);

  // Contagem por sabor (mostrada na 2ª linha do cabeçalho).
  const totalPorSabor = useMemo(() => {
    const m = {};
    for (const s of colunasVisiveis) {
      m[s.id] = Object.keys(usos).filter(ref => usos[ref][s.id]).length;
    }
    return m;
  }, [colunasVisiveis, usos]);

  if (loading) return <p style={{ padding: 20, textAlign: 'center' }}>Carregando SKUs…</p>;

  const nCols = 4 + colunasVisiveis.length;

  const celula = (ref, saborId) => {
    const c = usos[ref]?.[saborId];
    if (!c) return <td key={saborId} style={celS} />;
    const origens = [];
    if (c.direto) origens.push('direto na ficha');
    if (c.base) origens.push('base (entra em todas)');
    if (c.via.length) origens.push('via ' + c.via.join(', '));
    const soVia = !c.direto && !c.base;
    return (
      <td key={saborId} style={celS} title={`${ref} — ${origens.join(' · ')}`}>
        <span style={{ color: soVia ? 'var(--text-muted)' : 'var(--accent)', fontSize: soVia ? 10 : 12 }}>
          {soVia ? '○' : '●'}
        </span>
      </td>
    );
  };

  // `data-r` é o índice da linha na tabela toda (Insumos + Outros) — é a chave
  // que o crosshair usa no seletor, então precisa ser único e sem caracteres
  // que quebrem CSS (nome de produto não serviria).
  const linhaProduto = (ref, idx) => {
    const custo = custoBase[ref]?.custo;
    const benefs = usosBenef[ref] || [];
    const nSabores = Object.keys(usos[ref] || {}).length;
    return (
      <tr key={ref} data-r={idx} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
        <td style={stickyTdS}>{ref}</td>
        <td style={{ ...tdS, textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {custo == null ? '—' : fmt(custo)}
        </td>
        <td style={{ ...tdS, textAlign: 'center', color: 'var(--text-muted)' }} title={benefs.length ? benefs.join(', ') : undefined}>
          {benefs.length || ''}
        </td>
        <td style={{ ...tdS, textAlign: 'center', fontWeight: nSabores ? 600 : 400, color: nSabores ? 'var(--text)' : 'var(--text-muted)' }}>
          {nSabores || ''}
        </td>
        {colunasVisiveis.map(s => celula(ref, s.id))}
      </tr>
    );
  };

  return (
    <div>
      {/* Regra do crosshair — reescrita direto no DOM pelo onCruzar. */}
      <style ref={crossRef} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" placeholder="Buscar produto…" value={busca} onChange={e => setBusca(e.target.value)}
          style={{ ...inputS, flex: '1 1 200px', maxWidth: 280 }} />
        <button style={{ ...btnS, ...(catSabor === 'todas' ? btnAtivoS : {}) }} onClick={() => setCatSabor('todas')}>Todas</button>
        <button style={{ ...btnS, ...(catSabor === 'salgada' ? btnAtivoS : {}) }} onClick={() => setCatSabor('salgada')}>Salgadas</button>
        <button style={{ ...btnS, ...(catSabor === 'doce' ? btnAtivoS : {}) }} onClick={() => setCatSabor('doce')}>Doces</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text, #222)' }}
          title="Esconde as colunas de sabores que ainda não têm nenhum ingrediente na ficha">
          <input type="checkbox" checked={soUsados} onChange={e => setSoUsados(e.target.checked)} /> Só sabores com ficha
        </label>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
        <strong>Insumos</strong> = produto que entra em algum sabor ou beneficiado; <strong>Outros</strong> = o resto do que compramos (limpeza, bobina, embalagem…).
        {' '}<span style={{ color: 'var(--accent)' }}>●</span> na ficha do sabor ou na base · <span>○</span> via beneficiado (Massa, Molho…). O mouse acende a linha e a coluna da célula; o tooltip mostra a origem.
      </p>

      <div style={cardS} onMouseOver={onCruzar} onMouseLeave={onSair}>
        <table className="skuTable" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
              <th style={stickyThS}>Produto (planilha)</th>
              <th style={{ ...thS, textAlign: 'right', verticalAlign: 'bottom' }}>Custo/un</th>
              <th style={{ ...thS, textAlign: 'center', verticalAlign: 'bottom' }} title="Em quantos beneficiados o produto entra">Benef.</th>
              <th style={{ ...thS, textAlign: 'center', verticalAlign: 'bottom' }} title="Em quantos sabores o produto entra (direto, base ou via beneficiado)">Sabores</th>
              {colunasVisiveis.map(s => (
                <th key={s.id} style={saborThS} title={`${s.nome} (${s.categoria || 'salgada'}) — ${totalPorSabor[s.id] || 0} itens`}>
                  <div style={saborLabelS}>{s.nome}</div>
                </th>
              ))}
            </tr>
            <tr style={{ background: 'var(--bg, #f5f5f5)', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ ...stickyThS, fontWeight: 400 }} />
              <th style={thS} /><th style={thS} /><th style={thS} />
              {colunasVisiveis.map(s => (
                <th key={s.id} style={{ ...saborThS, fontWeight: 400, fontSize: 10 }}>{totalPorSabor[s.id] || ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={nCols} style={secaoS}>Insumos ({linhas.insumos.length})</td></tr>
            {linhas.insumos.length === 0
              ? <tr><td colSpan={nCols} style={{ ...tdS, padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum insumo. As fichas do CMV ainda não usam nenhum produto.</td></tr>
              : linhas.insumos.map((ref, i) => linhaProduto(ref, i))}

            <tr><td colSpan={nCols} style={secaoS}>Outros ({linhas.outros.length})</td></tr>
            {linhas.outros.length === 0
              ? <tr><td colSpan={nCols} style={{ ...tdS, padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum produto fora das fichas.</td></tr>
              : linhas.outros.map((ref, i) => linhaProduto(ref, linhas.insumos.length + i))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
        {linhas.insumos.length + linhas.outros.length} produtos · {colunasVisiveis.length} sabores
        {colunas.length !== colunasVisiveis.length && ` (${colunas.length - colunasVisiveis.length} sem ficha ocultos)`}
        {' '}· Custo/un vem do Resultado da nota mais recente de cada produto.
      </p>
    </div>
  );
}
