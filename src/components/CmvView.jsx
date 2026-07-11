import { useState, useMemo } from 'react';
import { useCmv } from '../hooks/useCmv';

// ── Estilos locais (mesmo tema por CSS vars da intranet) ────────────────────
const inputS = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', fontSize: 13 };
const btnS = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #e5e5e5)', background: 'var(--card-bg, #fff)', color: 'var(--text, #222)', cursor: 'pointer', fontSize: 13 };
const thS = { textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' };
const tdS = { padding: '5px 8px', fontSize: 12, color: 'var(--text, #222)' };
const cardS = { background: 'var(--card-bg, #fff)', borderRadius: 8, border: '1px solid var(--border, #e5e5e5)', padding: 12, marginBottom: 12 };
const SIZES = [['qtdP', 'Pequena'], ['qtdM', 'Média'], ['qtdG', 'Grande'], ['qtdS', 'Super']];

function fmt(n) {
  return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Aceita virgula decimal; '' -> 0.
function num(v) {
  if (v === '' || v == null) return 0;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isNaN(n) ? 0 : n;
}

// Custo por kg de um beneficiado: soma(qtd x custo do ingrediente) / rendimento
// (rendimento vazio => usa o peso bruto, ou seja, sem perda).
function calcBeneficiado(b, custoBase) {
  let pesoBruto = 0, custoTotal = 0;
  for (const l of b.lines || []) {
    const q = num(l.qtd);
    pesoBruto += q;
    custoTotal += q * (custoBase[l.ref]?.custo || 0);
  }
  const rend = num(b.rendimento) > 0 ? num(b.rendimento) : pesoBruto;
  const custoPorKg = rend > 0 ? custoTotal / rend : 0;
  return { pesoBruto, custoTotal, rendimento: rend, custoPorKg };
}

export default function CmvView({ custoBase = {}, nomesPadrao = [] }) {
  const {
    beneficiados, sabores, loading,
    addBeneficiado, updateBeneficiado, deleteBeneficiado,
    addSabor, updateSabor, deleteSabor, seedInitialData,
  } = useCmv();

  const [aba, setAba] = useState('beneficiados');
  const [novoBenef, setNovoBenef] = useState('');
  const [novoSabor, setNovoSabor] = useState('');
  const [importando, setImportando] = useState(false);

  // custo/kg de cada beneficiado (vira "ingrediente" utilizável nos sabores).
  const benefCusto = useMemo(() => {
    const m = {};
    for (const b of beneficiados) m[b.nome] = calcBeneficiado(b, custoBase).custoPorKg;
    return m;
  }, [beneficiados, custoBase]);

  // Opcoes do dropdown de ingrediente do SABOR: beneficiados + produtos planilha.
  const opcoesSabor = useMemo(() => ({
    beneficiados: beneficiados.map(b => b.nome).sort((a, b) => a.localeCompare(b)),
    base: [...nomesPadrao].sort((a, b) => a.localeCompare(b)),
  }), [beneficiados, nomesPadrao]);

  async function importar() {
    if (!window.confirm('Importar as fichas da planilha (beneficiados + sabores) para o CMV?')) return;
    setImportando(true);
    try {
      const r = await seedInitialData();
      alert(`Importado: ${r.beneficiados} beneficiados e ${r.sabores} sabores.`);
    } catch (e) {
      alert('Erro ao importar: ' + (e?.message || e));
    } finally {
      setImportando(false);
    }
  }

  if (loading) return <p style={{ padding: 20, textAlign: 'center' }}>Carregando CMV...</p>;

  const vazio = beneficiados.length === 0 && sabores.length === 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={{ ...btnS, ...(aba === 'beneficiados' ? { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600 } : {}) }} onClick={() => setAba('beneficiados')}>Beneficiados ({beneficiados.length})</button>
        <button style={{ ...btnS, ...(aba === 'sabores' ? { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600 } : {}) }} onClick={() => setAba('sabores')}>Sabores ({sabores.length})</button>
        <span style={{ flex: 1 }} />
        {vazio && (
          <button style={{ ...btnS, borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={importar} disabled={importando}>
            {importando ? 'Importando…' : '⬇ Importar da planilha'}
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        O custo vem do <strong>Resultado</strong> (custo/kg) de cada Produto (planilha) da seção Preços. Beneficiados viram ingredientes reutilizáveis nos sabores. Quantidades em kg (ou un).
      </p>

      {aba === 'beneficiados' ? (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input placeholder="Novo beneficiado (ex.: Massa)" value={novoBenef} onChange={e => setNovoBenef(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && novoBenef.trim()) { addBeneficiado(novoBenef); setNovoBenef(''); } }}
              style={{ ...inputS, flex: '1 1 240px', maxWidth: 320 }} />
            <button style={{ ...btnS, borderColor: 'var(--success)', color: 'var(--success)' }}
              onClick={() => { if (novoBenef.trim()) { addBeneficiado(novoBenef); setNovoBenef(''); } }}>+ Novo</button>
          </div>
          {beneficiados.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum beneficiado. Crie um acima ou importe da planilha.</p>
          ) : beneficiados.map(b => (
            <BeneficiadoCard key={b.id} b={b} custoBase={custoBase} nomesPadrao={opcoesSabor.base}
              onUpdate={updateBeneficiado} onDelete={deleteBeneficiado} />
          ))}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input placeholder="Novo sabor (ex.: 4 Queijos)" value={novoSabor} onChange={e => setNovoSabor(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && novoSabor.trim()) { addSabor(novoSabor); setNovoSabor(''); } }}
              style={{ ...inputS, flex: '1 1 240px', maxWidth: 320 }} />
            <button style={{ ...btnS, borderColor: 'var(--success)', color: 'var(--success)' }}
              onClick={() => { if (novoSabor.trim()) { addSabor(novoSabor); setNovoSabor(''); } }}>+ Novo</button>
          </div>
          {sabores.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum sabor. Crie um acima ou importe da planilha.</p>
          ) : sabores.map(s => (
            <SaborCard key={s.id} s={s} custoBase={custoBase} benefCusto={benefCusto} opcoes={opcoesSabor}
              onUpdate={updateSabor} onDelete={deleteSabor} />
          ))}
        </>
      )}
    </div>
  );
}

// ── Beneficiado: receita de ingredientes base (qtd em kg) + rendimento ──────
function BeneficiadoCard({ b, custoBase, nomesPadrao, onUpdate, onDelete }) {
  const sig = JSON.stringify(b.lines || []);
  const [lines, setLines] = useState(b.lines || []);
  const [rend, setRend] = useState(b.rendimento ?? '');
  // Ressincroniza o estado local quando o doc muda (padrão "ajustar estado no render",
  // recomendado pelo React em vez de setState dentro de useEffect).
  const [prevSig, setPrevSig] = useState(sig);
  const [prevRend, setPrevRend] = useState(b.rendimento ?? '');
  if (sig !== prevSig) { setPrevSig(sig); setLines(b.lines || []); }
  if ((b.rendimento ?? '') !== prevRend) { setPrevRend(b.rendimento ?? ''); setRend(b.rendimento ?? ''); }

  const commit = (ls) => onUpdate(b.id, { lines: ls.map(l => ({ ref: l.ref, qtd: num(l.qtd) })) });
  const calc = useMemo(() => calcBeneficiado({ lines, rendimento: rend }, custoBase), [lines, rend, custoBase]);

  const setQtd = (i, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, qtd: v } : l));
  const setRef = (i, v) => { const ls = lines.map((l, idx) => idx === i ? { ...l, ref: v } : l); setLines(ls); commit(ls); };
  const addLine = () => { const ls = [...lines, { ref: nomesPadrao[0] || '', qtd: '' }]; setLines(ls); commit(ls); };
  const rmLine = (i) => { const ls = lines.filter((_, idx) => idx !== i); setLines(ls); commit(ls); };

  return (
    <div style={cardS}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{b.nome}</strong>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Peso bruto {calc.pesoBruto.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg · Custo total {fmt(calc.custoTotal)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Custo/kg {fmt(calc.custoPorKg)}</span>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }} title="kg de saída após o preparo (perda). Vazio = igual ao peso bruto.">
          Rendimento
          <input inputMode="decimal" value={rend} onChange={e => setRend(e.target.value)} onBlur={() => onUpdate(b.id, { rendimento: rend === '' ? null : num(rend) })}
            placeholder="kg" style={{ ...inputS, width: 70 }} />
        </label>
        <button style={{ ...btnS, color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => { if (window.confirm(`Excluir o beneficiado "${b.nome}"?`)) onDelete(b.id); }} title="Excluir beneficiado">Excluir</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--bg, #f5f5f5)' }}>
            <th style={thS}>Ingrediente</th><th style={{ ...thS, width: 110 }}>Qtd</th>
            <th style={{ ...thS, textAlign: 'right' }}>Custo/un</th><th style={{ ...thS, textAlign: 'right' }}>Custo</th><th style={thS}></th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const cu = custoBase[l.ref]?.custo;
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={tdS}>
                    <select value={l.ref} onChange={e => setRef(i, e.target.value)} style={{ ...inputS, width: '100%', maxWidth: 260 }}>
                      {!nomesPadrao.includes(l.ref) && l.ref ? <option value={l.ref}>{l.ref}</option> : null}
                      {nomesPadrao.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td style={tdS}><input inputMode="decimal" value={l.qtd} onChange={e => setQtd(i, e.target.value)} onBlur={() => commit(lines)} placeholder="kg" style={{ ...inputS, width: 90 }} /></td>
                  <td style={{ ...tdS, textAlign: 'right', color: 'var(--text-muted)' }}>{cu == null ? '—' : fmt(cu)}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>{fmt(num(l.qtd) * (cu || 0))}</td>
                  <td style={{ ...tdS, textAlign: 'center' }}><button style={{ ...btnS, padding: '2px 8px', color: 'var(--danger)' }} onClick={() => rmLine(i)} title="Remover ingrediente">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button style={{ ...btnS, marginTop: 8, fontSize: 12 }} onClick={addLine}>+ Ingrediente</button>
    </div>
  );
}

// ── Sabor: ingredientes (base ou beneficiado) x 4 tamanhos (qtd em kg) ──────
function SaborCard({ s, custoBase, benefCusto, opcoes, onUpdate, onDelete }) {
  const sig = JSON.stringify(s.lines || []);
  const [lines, setLines] = useState(s.lines || []);
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) { setPrevSig(sig); setLines(s.lines || []); }

  const custoUnit = (l) => (l.tipo === 'beneficiado' ? (benefCusto[l.ref] || 0) : (custoBase[l.ref]?.custo || 0));
  const totais = useMemo(() => {
    const t = { qtdP: 0, qtdM: 0, qtdG: 0, qtdS: 0 };
    for (const l of lines) { const cu = custoUnit(l); for (const [k] of SIZES) t[k] += num(l[k]) * cu; }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, custoBase, benefCusto]);

  const commit = (ls) => onUpdate(s.id, {
    lines: ls.map(l => ({ ref: l.ref, tipo: l.tipo || 'base', qtdP: num(l.qtdP), qtdM: num(l.qtdM), qtdG: num(l.qtdG), qtdS: num(l.qtdS) })),
  });
  const setCell = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const setRef = (i, val) => {
    const [tipo, ...rest] = val.split(':'); const ref = rest.join(':');
    const ls = lines.map((l, idx) => idx === i ? { ...l, ref, tipo } : l); setLines(ls); commit(ls);
  };
  const addLine = () => { const ls = [...lines, { ref: opcoes.base[0] || '', tipo: 'base', qtdP: '', qtdM: '', qtdG: '', qtdS: '' }]; setLines(ls); commit(ls); };
  const rmLine = (i) => { const ls = lines.filter((_, idx) => idx !== i); setLines(ls); commit(ls); };

  return (
    <div style={cardS}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{s.nome}</strong>
        <span style={{ flex: 1 }} />
        {SIZES.map(([k, label]) => (
          <span key={k} style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {label} <strong style={{ color: 'var(--accent)' }}>{fmt(totais[k])}</strong>
          </span>
        ))}
        <button style={{ ...btnS, color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => { if (window.confirm(`Excluir o sabor "${s.nome}"?`)) onDelete(s.id); }} title="Excluir sabor">Excluir</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--bg, #f5f5f5)' }}>
            <th style={thS}>Ingrediente</th>
            {SIZES.map(([k, label]) => <th key={k} style={{ ...thS, textAlign: 'right' }}>{label} (kg)</th>)}
            <th style={{ ...thS, textAlign: 'right' }}>Custo/un</th><th style={thS}></th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const cu = custoUnit(l);
              const selVal = `${l.tipo || 'base'}:${l.ref}`;
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--border, #e5e5e5)' }}>
                  <td style={tdS}>
                    <select value={selVal} onChange={e => setRef(i, e.target.value)} style={{ ...inputS, width: '100%', maxWidth: 240 }}>
                      {!opcoes.base.includes(l.ref) && !opcoes.beneficiados.includes(l.ref) && l.ref
                        ? <option value={selVal}>{l.ref}</option> : null}
                      {opcoes.beneficiados.length > 0 && (
                        <optgroup label="Beneficiados">
                          {opcoes.beneficiados.map(n => <option key={'b' + n} value={`beneficiado:${n}`}>{n}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="Ingredientes">
                        {opcoes.base.map(n => <option key={'i' + n} value={`base:${n}`}>{n}</option>)}
                      </optgroup>
                    </select>
                  </td>
                  {SIZES.map(([k]) => (
                    <td key={k} style={{ ...tdS, textAlign: 'right' }}>
                      <input inputMode="decimal" value={l[k] ?? ''} onChange={e => setCell(i, k, e.target.value)} onBlur={() => commit(lines)} style={{ ...inputS, width: 70, textAlign: 'right' }} />
                    </td>
                  ))}
                  <td style={{ ...tdS, textAlign: 'right', color: 'var(--text-muted)' }}>{cu ? fmt(cu) : '—'}</td>
                  <td style={{ ...tdS, textAlign: 'center' }}><button style={{ ...btnS, padding: '2px 8px', color: 'var(--danger)' }} onClick={() => rmLine(i)} title="Remover ingrediente">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button style={{ ...btnS, marginTop: 8, fontSize: 12 }} onClick={addLine}>+ Ingrediente</button>
    </div>
  );
}
