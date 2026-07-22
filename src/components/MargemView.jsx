import { Fragment, useState, useMemo } from 'react';
import { useCmv } from '../hooks/useCmv';
import { useMargem } from '../hooks/useMargem';
import { calcBeneficiado, calcSabor } from '../lib/cmvCalc';
import {
  TAMANHOS, CANAIS, PLANILHA_URL, normalizarSabor, lookupCmv,
  calcularPreco, calcularMargem,
} from '../lib/margemPlanilha';
import { IS_V2 } from '../lib/v2';

// ── Margem por canal (iFood / Site / Saipos) ────────────────────────────────
// Preço vem da planilha CARDAPIOS (Google Sheets, lida ao vivo); custo vem das
// fichas do CMV (Resultado da seção Preços); taxas configuráveis por canal.
// Mesmo estilo inline do CmvView (sub-view de Preços, tema por CSS vars).

const inputS = { padding: '6px 8px', borderRadius: IS_V2 ? 8 : 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', fontSize: 13 };
const btnS = IS_V2
  ? { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', cursor: 'pointer', fontSize: 14, fontWeight: 500, boxShadow: 'var(--shadow-xs)' }
  : { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', cursor: 'pointer', fontSize: 13 };
const tabTrackS = IS_V2
  ? { display: 'inline-flex', width: 'fit-content', alignItems: 'center', gap: 2, padding: 2, borderRadius: 8, background: 'var(--seg-track)' }
  : { display: 'contents' };
const segBtnS = (active) => ({ padding: '8px 12px', border: 'none', borderRadius: 6, background: active ? 'var(--seg-active-bg)' : 'transparent', color: active ? 'var(--seg-active-text)' : 'var(--text-muted, #888)', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', boxShadow: active ? 'var(--shadow-xs)' : 'none', cursor: 'pointer' });
const thS = { textAlign: 'left', padding: '6px 8px', fontSize: IS_V2 ? 12 : 11, color: 'var(--text-muted)', fontWeight: IS_V2 ? 500 : 600, whiteSpace: 'nowrap' };
const tdS = { padding: '5px 8px', fontSize: 12, color: 'var(--text, #222)' };
const cardS = { background: 'var(--card-bg, #fff)', borderRadius: IS_V2 ? 12 : 8, border: '1px solid var(--border, #e5e5e5)', padding: 12, marginBottom: 12 };

const hoverCss = '.mgRow{transition:background .12s}.mgRow:hover{background:var(--card-hover,#f6f7f9)}'
  + '.mgCell{position:relative}.mgCell .mgTip{display:none;position:absolute;bottom:100%;left:50%;transform:translateX(-50%);z-index:60;width:240px;background:var(--card-bg,#fff);border:1px solid var(--border,#e5e5e5);border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.14);padding:10px;text-align:left;pointer-events:none}'
  + '.mgCell:hover .mgTip{display:block}';

function fmt(n) {
  return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPerc(p) {
  return (p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

const SIZE_LABEL = Object.fromEntries(TAMANHOS.map((t) => [t.id, t.label]));
const SIZE_ORDER = Object.fromEntries(TAMANHOS.map((t, i) => [t.id, i]));

export default function MargemView({ custoBase = {} }) {
  const { beneficiados, sabores: cmvSabores, bases: cmvBases } = useCmv();
  const { planilha, loading, error, fetchedAt, refresh, config, saveConfig } = useMargem();

  const [tamanho, setTamanho] = useState('grande'); // id do tamanho ou 'todos'
  const [marca, setMarca] = useState('todas'); // 'todas' | 'dame' | 'lov'
  const [sort, setSort] = useState(null); // { key, dir: 1 | -1 }

  // custo/kg de cada beneficiado + ficha de cada sabor do CMV (custo por
  // tamanho e flag de arquivado), indexado pelo slug do nome — mesma conta da
  // aba CMV. Sabor arquivado lá fica FORA da margem.
  const cmvBySlug = useMemo(() => {
    const benefCusto = {};
    for (const b of beneficiados) benefCusto[b.nome] = calcBeneficiado(b, custoBase).custoPorKg;
    const map = {};
    for (const s of cmvSabores) {
      map[normalizarSabor(s.nome)] = { custos: calcSabor(s, custoBase, benefCusto, cmvBases), archived: !!s.archived };
    }
    return map;
  }, [beneficiados, cmvSabores, cmvBases, custoBase]);

  // Linhas: sabor da planilha × tamanho, com preço/margem por canal.
  const rows = useMemo(() => {
    if (!planilha) return [];
    const tamanhos = tamanho === 'todos' ? TAMANHOS : TAMANHOS.filter((t) => t.id === tamanho);
    const out = [];
    for (const sab of planilha.sabores) {
      if (marca === 'dame' && !sab.dame) continue;
      if (marca === 'lov' && !sab.lov) continue;
      const ficha = lookupCmv(cmvBySlug, sab.slug);
      if (ficha?.archived) continue; // arquivado no CMV = fora da margem
      const custos = ficha?.custos; // { qtdP..qtdS } ou undefined
      for (const t of tamanhos) {
        const custo = custos ? custos[t.sizeKey] : null;
        // Fruki 2L de brinde na Super (Lov) — só quando a visão inclui a Lov.
        const custoExtra = t.id === 'super' && sab.lov && marca !== 'dame' ? (config.brindeSuper || 0) : 0;
        const margens = {};
        for (const c of CANAIS) {
          const preco = calcularPreco(sab, c.id, t.id, planilha.bases);
          if (preco == null) { margens[c.id] = null; continue; }
          if (custo == null) { margens[c.id] = { preco, custo: null }; continue; }
          const m = calcularMargem(preco, custo + custoExtra, config.canais[c.id], config.pizzasPorPedido);
          margens[c.id] = { preco, custo, custoExtra, ...m };
        }
        out.push({ sab, tamanho: t.id, custo, custoExtra, margens });
      }
    }
    return out;
  }, [planilha, tamanho, marca, cmvBySlug, config]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const val = (r) => {
      switch (sort.key) {
        case 'sabor': return r.sab.nome;
        case 'tamanho': return SIZE_ORDER[r.tamanho];
        case 'custo': return r.custo ?? -1;
        default: return r.margens[sort.key]?.margemPerc ?? -999; // key = canal id
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      const d = sort.dir * cmp;
      // desempate estável: mantém tamanhos em ordem dentro do sabor no "Todos"
      return d !== 0 ? d : SIZE_ORDER[a.tamanho] - SIZE_ORDER[b.tamanho];
    });
  }, [rows, sort]);

  const clickSort = (key) => setSort((prev) =>
    prev?.key !== key ? { key, dir: key === 'sabor' ? 1 : -1 } : prev.dir === 1 ? { key, dir: -1 } : prev.dir === -1 && key !== 'sabor' ? { key, dir: 1 } : null);
  const setaSort = (key) => sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '';

  // Média simples da margem % por canal (linhas com ficha) + margens negativas.
  const stats = useMemo(() => {
    const sum = {}, count = {}, neg = {};
    for (const c of CANAIS) { sum[c.id] = 0; count[c.id] = 0; neg[c.id] = 0; }
    for (const r of rows) {
      for (const c of CANAIS) {
        const m = r.margens[c.id];
        if (!m || m.custo == null) continue;
        sum[c.id] += m.margemPerc;
        count[c.id]++;
        if (m.margem < 0) neg[c.id]++;
      }
    }
    const media = {};
    for (const c of CANAIS) media[c.id] = count[c.id] > 0 ? sum[c.id] / count[c.id] : 0;
    return { media, neg, count };
  }, [rows]);

  // Sabores do cardápio sem ficha no CMV (higiene de dados).
  const semFicha = useMemo(() => {
    if (!planilha) return [];
    return planilha.sabores.filter((s) => !lookupCmv(cmvBySlug, s.slug)).map((s) => s.nome);
  }, [planilha, cmvBySlug]);

  // Sabores do cardápio cuja ficha está arquivada no CMV (escondidos da tabela).
  const arquivados = useMemo(() => {
    if (!planilha) return [];
    return planilha.sabores.filter((s) => lookupCmv(cmvBySlug, s.slug)?.archived).map((s) => s.nome);
  }, [planilha, cmvBySlug]);

  if (loading && !planilha) return <p style={{ padding: 20, textAlign: 'center' }}>Carregando planilha do cardápio...</p>;
  if (error && !planilha) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>Erro ao ler a planilha: {error}</p>
        <button style={btnS} onClick={refresh}>Tentar de novo</button>
      </div>
    );
  }

  const tamanhoLabel = tamanho === 'todos' ? 'todos os tamanhos' : SIZE_LABEL[tamanho];

  return (
    <div>
      <style>{hoverCss}</style>

      {/* Filtros: tamanho (segmented) + marca + atualizar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={tabTrackS}>
          {[{ id: 'todos', label: 'Todos' }, ...TAMANHOS].map((t) => (
            <button key={t.id}
              style={IS_V2 ? segBtnS(tamanho === t.id) : { ...btnS, ...(tamanho === t.id ? { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600 } : {}) }}
              onClick={() => setTamanho(t.id)} title={t.cm ? `${t.label} ${t.cm}` : 'Todos os tamanhos'}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={marca} onChange={(e) => setMarca(e.target.value)} style={inputS} title="Filtra os sabores vendidos em cada marca (preços são unificados)">
          <option value="todas">Dáme + Lov</option>
          <option value="dame">Dáme</option>
          <option value="lov">Lov</option>
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {fetchedAt ? `planilha lida às ${fetchedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
        <button style={btnS} onClick={refresh} disabled={loading} title="Relê a planilha CARDAPIOS agora (ela também é relida a cada visita)">
          {loading ? 'Atualizando…' : '↻ Atualizar'}
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        Margem efetiva por canal: <strong>preço − custo − taxas</strong>. Preço = base do tamanho + adicional do sabor
        (<a href={PLANILHA_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>planilha CARDAPIOS</a>, lida ao vivo);
        custo = ficha técnica do CMV. iFood/Site multiplicam o adicional por 1/2/3/4× (P/M/G/S); Saipos usa as colunas Médio/Soma.
      </p>

      {/* Cards de média por canal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
        {CANAIS.map((c) => (
          <div key={c.id} style={{ ...cardS, marginBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: c.cor }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{fmtPerc(stats.media[c.id])}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>margem média · {tamanhoLabel}</div>
            {stats.neg[c.id] > 0 && (
              <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>⚠ {stats.neg[c.id]} margem(ns) negativa(s)</div>
            )}
          </div>
        ))}
      </div>

      <PainelTaxas config={config} onSave={saveConfig} />

      {/* Tabela sabores × canais */}
      <div style={{ ...cardS, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
              <th style={{ ...thS, cursor: 'pointer', userSelect: 'none' }} onClick={() => clickSort('sabor')}>Sabor{setaSort('sabor')}</th>
              {tamanho === 'todos' && (
                <th style={{ ...thS, cursor: 'pointer', userSelect: 'none' }} onClick={() => clickSort('tamanho')}>Tam.{setaSort('tamanho')}</th>
              )}
              <th style={{ ...thS, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => clickSort('custo')} title="Custo da ficha técnica (CMV)">CMV{setaSort('custo')}</th>
              {CANAIS.map((c) => (
                <th key={c.id} colSpan={2}
                  style={{ ...thS, textAlign: 'center', color: c.cor, borderLeft: '1px solid var(--border, #e5e5e5)', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => clickSort(c.id)} title={`Ordenar pela margem % ${c.label}`}>
                  {c.label}{setaSort(c.id)}
                </th>
              ))}
            </tr>
            <tr style={{ background: 'var(--bg, #f5f5f5)' }}>
              <th style={thS}></th>
              {tamanho === 'todos' && <th style={thS}></th>}
              <th style={thS}></th>
              {CANAIS.map((c) => (
                <Fragment key={c.id}>
                  <th style={{ ...thS, textAlign: 'right', fontSize: 10, borderLeft: '1px solid var(--border, #e5e5e5)' }}>Preço</th>
                  <th style={{ ...thS, textAlign: 'right', fontSize: 10 }}>Margem</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              {/* key pelo NOME (único na planilha) — o slug colide em "Da casa (LOV)"
                  × "Da casa (DAME)" e key duplicada faz o React duplicar linha ao ordenar */}
              <tr key={`${r.sab.nome}-${r.tamanho}`} className="mgRow" style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                <td style={{ ...tdS, fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {r.sab.nome}
                  {marca === 'todas' && (!r.sab.dame || !r.sab.lov) && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{r.sab.dame ? 'só Dáme' : 'só Lov'}</span>
                  )}
                </td>
                {tamanho === 'todos' && <td style={{ ...tdS, color: 'var(--text-muted)' }}>{SIZE_LABEL[r.tamanho]}</td>}
                <td style={{ ...tdS, textAlign: 'right' }} title={r.custoExtra > 0 ? `+ ${fmt(r.custoExtra)} de brinde (Fruki 2L da Super Lov) somado na margem` : undefined}>
                  {r.custo == null ? <span style={{ color: 'var(--text-muted)' }} title="Sem ficha técnica no CMV com esse nome">—</span> : fmt(r.custo)}
                </td>
                {CANAIS.map((c) => {
                  const m = r.margens[c.id];
                  if (!m) {
                    return <td key={c.id} colSpan={2} style={{ ...tdS, textAlign: 'center', color: 'var(--text-muted)', borderLeft: '1px solid var(--border, #e5e5e5)' }}>—</td>;
                  }
                  return (
                    <Fragment key={c.id}>
                      <td style={{ ...tdS, textAlign: 'right', borderLeft: '1px solid var(--border, #e5e5e5)' }}>{fmt(m.preco)}</td>
                      {m.custo == null ? (
                        <td style={{ ...tdS, textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                      ) : (
                        <td className="mgCell" style={{ ...tdS, textAlign: 'right', cursor: 'help', ...(m.margem < 0 ? { color: 'var(--danger)', fontWeight: 700, background: 'rgba(220,53,69,0.08)' } : {}) }}>
                          <div style={{ lineHeight: 1.15 }}>
                            <div style={{ fontWeight: 600 }}>{fmt(m.margem)}</div>
                            <div style={{ fontSize: 10, color: m.margem < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmtPerc(m.margemPerc)}</div>
                          </div>
                          <Breakdown m={m} canal={c.label} sabor={r.sab.nome} />
                        </td>
                      )}
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum sabor pra essa combinação de filtros.</p>
        )}
      </div>

      {semFicha.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0' }}>
          Sem ficha técnica no CMV (margem não calculada): {semFicha.join(', ')}. Cadastre na aba CMV com o mesmo nome do cardápio.
        </p>
      )}
      {arquivados.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
          Arquivados no CMV (fora da margem): {arquivados.join(', ')}. Desarquive na aba CMV pra voltarem.
        </p>
      )}
    </div>
  );
}

// Tooltip com o breakdown da margem (aparece no hover da célula).
function Breakdown({ m, canal, sabor }) {
  const linha = (label, valor, neg = true) => (
    valor > 0 && (
      <tr>
        <td style={{ fontSize: 11, color: 'var(--text-muted)', padding: '1px 0' }}>{label}</td>
        <td style={{ fontSize: 11, textAlign: 'right', color: neg ? 'var(--danger)' : 'inherit', whiteSpace: 'nowrap' }}>
          {neg ? '− ' : '+ '}{fmt(valor)}
        </td>
      </tr>
    )
  );
  return (
    <div className="mgTip">
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        {sabor} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {canal}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ fontSize: 11, color: 'var(--text-muted)', padding: '1px 0' }}>Preço de venda</td>
            <td style={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>+ {fmt(m.preco)}</td>
          </tr>
          {linha('Custo do produto', m.custo)}
          {linha('Brinde (Fruki 2L)', m.custoExtra)}
          {linha('Taxa de venda', m.taxas.taxaVenda)}
          {linha('Pgto online', m.taxas.pgtoOnline)}
          {linha('Entrega (÷ pizzas/pedido)', m.taxas.entrega)}
          {linha('Maquininha', m.taxas.cartao)}
          {linha('Outros descontos', m.taxas.outros)}
          <tr>
            <td style={{ fontSize: 11, fontWeight: 700, paddingTop: 4, borderTop: '1px solid var(--border, #e5e5e5)' }}>Margem</td>
            <td style={{ fontSize: 11, fontWeight: 700, textAlign: 'right', paddingTop: 4, borderTop: '1px solid var(--border, #e5e5e5)', color: m.margem < 0 ? 'var(--danger)' : 'var(--success)', whiteSpace: 'nowrap' }}>
              = {fmt(m.margem)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Painel colapsável de taxas por canal (config compartilhada em cmvConfig/margem).
function PainelTaxas({ config, onSave }) {
  const [open, setOpen] = useState(false);

  const setCanal = (canal, field, valor) =>
    onSave({ ...config, canais: { ...config.canais, [canal]: { ...config.canais[canal], [field]: valor } } });

  return (
    <div style={{ ...cardS, borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <strong style={{ fontSize: 14 }}>{open ? '▾' : '▸'} Taxas por canal</strong>
        {!open && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {CANAIS.map((c) => `${c.label} ${fmtPerc(config.canais[c.id].taxaVenda + config.canais[c.id].taxaPgtoOnline)}`).join(' · ')}
            {' · entrega ÷ '}{config.pizzasPorPedido}{' pizzas/pedido'}
          </span>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Valem pra todo mundo (salvas no banco). Percentuais sobre o preço; entrega é R$ por pedido, dividida pelas pizzas/pedido.
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <CampoNum label="Pizzas por pedido (média)" value={config.pizzasPorPedido} step="0.01"
              onCommit={(v) => onSave({ ...config, pizzasPorPedido: v || 1 })} />
            <CampoNum label="Brinde Super Lov (R$ Fruki 2L)" value={config.brindeSuper} step="0.5"
              onCommit={(v) => onSave({ ...config, brindeSuper: v || 0 })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {CANAIS.map((c) => {
              const cfg = config.canais[c.id];
              return (
                <div key={c.id} style={{ border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: c.cor, marginBottom: 8 }}>{c.label}</div>
                  <CampoNum label="Taxa de venda (%)" value={cfg.taxaVenda * 100} step="0.5" onCommit={(v) => setCanal(c.id, 'taxaVenda', (v || 0) / 100)} />
                  <CampoNum label="Pgto online (%)" value={cfg.taxaPgtoOnline * 100} step="0.1" onCommit={(v) => setCanal(c.id, 'taxaPgtoOnline', (v || 0) / 100)} />
                  <CampoNum label="Entrega (R$/pedido)" value={cfg.taxaEntrega} step="0.5" onCommit={(v) => setCanal(c.id, 'taxaEntrega', v || 0)} />
                  <CampoNum label="Maquininha (%)" value={cfg.taxaCartao * 100} step="0.1" onCommit={(v) => setCanal(c.id, 'taxaCartao', (v || 0) / 100)} />
                  <CampoNum label="Outros descontos (R$/pizza)" value={cfg.outros} step="0.5" onCommit={(v) => setCanal(c.id, 'outros', v || 0)} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Input numérico que só grava no blur/Enter (evita um write por tecla digitada).
function CampoNum({ label, value, step, onCommit }) {
  const [raw, setRaw] = useState(null); // null = sem edição local, mostra value
  const shown = raw != null ? raw : String(Math.round((Number(value) + Number.EPSILON) * 1000) / 1000);
  const commit = () => {
    if (raw == null) return;
    const n = Number(String(raw).replace(',', '.'));
    setRaw(null);
    if (Number.isFinite(n)) onCommit(n);
  };
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
      {label}
      <input inputMode="decimal" step={step} value={shown}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ ...inputS, width: 72, textAlign: 'right' }} />
    </label>
  );
}
