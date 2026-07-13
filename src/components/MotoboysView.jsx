import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import MoneyInput from './MoneyInput';
import { formatBRL } from '../utils/money';
import {
  useMotoboys,
  MOTOBOY_LOJAS,
  DIAS_CURTOS,
  DIAS_SEMANA,
  mondayOf,
  addDaysIso,
  formatDiaCurto,
  calcMotoboySemana,
  calcResumoSemana,
  normalizarNome,
} from '../hooks/useMotoboys';
import styles from '../styles/MotoboysView.module.css';

// Input de quantidade (inteiro), commit no blur/Enter — mesmo padrão do MoneyInput.
function QtdInput({ value, onCommit, disabled }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value == null ? '' : String(value));
  const [last, setLast] = useState(value);
  if (!editing && value !== last) {
    setLast(value);
    setText(value == null ? '' : String(value));
  }
  const commit = () => {
    setEditing(false);
    let v = text.trim() === '' ? null : Math.max(0, Math.round(Number(text.replace(',', '.'))));
    if (Number.isNaN(v)) v = null;
    if (v === 0) v = null;
    setText(v == null ? '' : String(v));
    const prev = value == null || value === 0 ? null : Number(value);
    if (v !== prev) onCommit(v);
  };
  return (
    <input
      className={styles.qtdInput}
      inputMode="numeric"
      disabled={disabled}
      value={text}
      onFocus={(e) => { setEditing(true); e.target.select(); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setEditing(false); setText(value == null ? '' : String(value)); e.currentTarget.blur(); }
      }}
    />
  );
}

const DIV_LABELS = { gerente: 'Gerente', adm: 'Adm', resultado: 'Resultado' };

export default function MotoboysView() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  const canEdit = isAdmin || settings?.motoboysEditor === true;

  const [loja, setLoja] = useState('dame');
  const [segunda, setSegunda] = useState(() => mondayOf(new Date()));
  const [vis, setVis] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('motoboysDivs'));
      if (saved && typeof saved === 'object') return { gerente: true, adm: true, resultado: true, ...saved };
    } catch { /* ignora */ }
    return { gerente: true, adm: true, resultado: true };
  });
  const toggleVis = (k) => {
    setVis((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { localStorage.setItem('motoboysDivs', JSON.stringify(next)); } catch { /* ignora */ }
      return next;
    });
  };

  const {
    semana, semanaLoading, config, configLoja, extras, error,
    criarSemana, setCelula, setDesconto, addMotoboy, removeMotoboy,
    setConfig, addExtra, deleteExtra, atribuirNaoCasado,
  } = useMotoboys(loja, segunda, user);

  const fim = addDaysIso(segunda, 6);
  const diasIso = Array.from({ length: 7 }, (_, i) => addDaysIso(segunda, i));

  const motoboys = semana?.motoboys || {};
  const listaMotoboys = Object.entries(motoboys)
    .map(([mid, mb]) => ({ mid, ...mb }))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome));

  // Taxas visíveis na grade: as com valor definido + reservas que tenham lançamento.
  const taxas = config?.taxas || [];
  const taxaVisivel = taxas.map((tx, i) => {
    if (tx.valor != null && tx.valor !== '') return true;
    return listaMotoboys.some((mb) =>
      Object.values(mb.dias || {}).some((d) => Number(d?.t?.[i]) > 0)
    );
  });

  // Extras agregados por motoboy/dia (entram na conferência PG x PA).
  const extrasPorMidDia = {};
  extras.forEach((e) => {
    const idx = diasIso.indexOf(e.data);
    if (idx < 0) return;
    const key = e.mid || `nome:${normalizarNome(e.nome)}`;
    if (!extrasPorMidDia[key]) extrasPorMidDia[key] = {};
    extrasPorMidDia[key][idx] = (extrasPorMidDia[key][idx] || 0) + (Number(e.quantidade) || 0);
  });

  const resumo = calcResumoSemana(motoboys, config);
  const pa = semana?.pa || null;

  // ---- Form de nova banda extra ----
  const [novoExtra, setNovoExtra] = useState({ dia: 0, mid: '', quantidade: 1, taxaIdx: 0, justificativa: '' });
  const [novoNome, setNovoNome] = useState('');

  const salvarExtra = async () => {
    if (!novoExtra.mid || !novoExtra.justificativa.trim()) return;
    const mb = motoboys[novoExtra.mid];
    await addExtra({
      data: diasIso[novoExtra.dia],
      mid: novoExtra.mid,
      nome: mb?.nome || '',
      quantidade: novoExtra.quantidade,
      taxaIdx: novoExtra.taxaIdx,
      justificativa: novoExtra.justificativa,
    });
    setNovoExtra((p) => ({ ...p, quantidade: 1, justificativa: '' }));
  };

  const navSemana = (n) => setSegunda((s) => addDaysIso(s, n * 7));

  return (
    <div className={styles.container}>
      {/* ---- Toolbar ---- */}
      <div className={styles.toolbar}>
        <div className={styles.lojaSwitch}>
          {MOTOBOY_LOJAS.map((l) => (
            <button
              key={l.id}
              className={`${styles.lojaBtn} ${loja === l.id ? styles.lojaBtnActive : ''} ${l.id === 'lov' && loja === l.id ? styles.lojaBtnLov : ''}`}
              onClick={() => setLoja(l.id)}
            >
              {l.nome}
            </button>
          ))}
        </div>

        <div className={styles.weekNav}>
          <button className={styles.weekBtn} onClick={() => navSemana(-1)} title="Semana anterior">‹</button>
          <span className={styles.weekLabel}>
            {formatDiaCurto(segunda)} a {formatDiaCurto(fim)}
          </span>
          <button className={styles.weekBtn} onClick={() => navSemana(1)} title="Próxima semana">›</button>
          <button
            className={styles.weekHoje}
            onClick={() => setSegunda(mondayOf(new Date()))}
            disabled={segunda === mondayOf(new Date())}
          >
            Semana atual
          </button>
        </div>

        <div className={styles.divToggles}>
          {Object.keys(DIV_LABELS).map((k) => (
            <button
              key={k}
              className={`${styles.divToggle} ${vis[k] ? styles.divToggleOn : ''}`}
              onClick={() => toggleVis(k)}
              title={vis[k] ? 'Ocultar divisão' : 'Mostrar divisão'}
            >
              {vis[k] ? '👁' : '–'} {DIV_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={styles.error}>Erro ao carregar: {error}</div>}

      {!semanaLoading && !semana && (
        <div className={styles.emptyWeek}>
          <p>Semana de {formatDiaCurto(segunda)} a {formatDiaCurto(fim)} ainda não iniciada para {MOTOBOY_LOJAS.find((l) => l.id === loja)?.nome}.</p>
          {canEdit ? (
            <button className={styles.primaryBtn} onClick={criarSemana}>Iniciar semana</button>
          ) : (
            <p className={styles.muted}>Peça a um editor para iniciar a semana.</p>
          )}
        </div>
      )}

      {semana && (
        <>
          {/* ================= GERENTE ================= */}
          {vis.gerente && (
            <section className={styles.divisao}>
              <div className={styles.divHeader} onClick={() => toggleVis('gerente')}>
                <h3>Gerente</h3>
                <span className={styles.divHint}>entregas e taxas anotadas nas comandas</span>
              </div>

              {listaMotoboys.map((mb) => {
                const r = calcMotoboySemana(mb, config);
                return (
                  <div key={mb.mid} className={styles.bloco}>
                    <div className={styles.blocoHeader}>
                      <strong>{mb.nome}</strong>
                      <span className={styles.blocoTotal}>{formatBRL(r.total.valor)}</span>
                      {canEdit && (
                        <button
                          className={styles.removeBtn}
                          title="Remover motoboy desta semana"
                          onClick={() => {
                            if (window.confirm(`Remover ${mb.nome} desta semana? Os lançamentos serão apagados.`)) removeMotoboy(mb.mid);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.grid}>
                        <thead>
                          <tr>
                            <th className={styles.stickyCol}></th>
                            {diasIso.map((d, i) => (
                              <th key={d}>
                                <span className={styles.diaNome}>{DIAS_CURTOS[i]}</span>
                                <span className={styles.diaData}>{formatDiaCurto(d)}</span>
                              </th>
                            ))}
                            <th className={styles.totalCol}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {taxas.map((tx, ti) =>
                            !taxaVisivel[ti] ? null : (
                              <tr key={ti}>
                                <td className={styles.stickyCol}>
                                  <span className={styles.taxaLabel}>{tx.label}</span>
                                  <span className={styles.taxaValor}>
                                    {tx.valor != null ? formatBRL(tx.valor) : ''} {tx.faixa ? `· ${tx.faixa}` : ''}
                                  </span>
                                </td>
                                {diasIso.map((d, di) => (
                                  <td key={d}>
                                    <QtdInput
                                      value={mb.dias?.[di]?.t?.[ti] ?? null}
                                      disabled={!canEdit}
                                      onCommit={(v) => setCelula(mb.mid, di, ti, v)}
                                    />
                                  </td>
                                ))}
                                <td className={styles.totalCol}>
                                  {diasIso.reduce((acc, _, di) => acc + (Number(mb.dias?.[di]?.t?.[ti]) || 0), 0) || ''}
                                </td>
                              </tr>
                            )
                          )}
                          <tr className={styles.descRow}>
                            <td className={styles.stickyCol}>
                              <span className={styles.taxaLabel}>Descontos</span>
                              <span className={styles.taxaValor}>R$ · use negativo</span>
                            </td>
                            {diasIso.map((d, di) => (
                              <td key={d}>
                                <MoneyInput
                                  className={styles.descInput}
                                  value={mb.dias?.[di]?.desc ?? null}
                                  disabled={!canEdit}
                                  placeholder=""
                                  onCommit={(v) => setDesconto(mb.mid, di, v)}
                                />
                              </td>
                            ))}
                            <td className={styles.totalCol}>{r.total.desconto ? formatBRL(r.total.desconto) : ''}</td>
                          </tr>
                          <tr className={styles.calcRow}>
                            <td className={styles.stickyCol}>Entregas</td>
                            {r.dias.map((d, i) => (
                              <td key={i}>{d.qtd || ''}</td>
                            ))}
                            <td className={styles.totalCol}>{r.total.qtd || ''}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {canEdit && (
                <div className={styles.addRow}>
                  <input
                    className={styles.addInput}
                    list="motoboyRoster"
                    placeholder="Nome do motoboy"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && novoNome.trim()) {
                        await addMotoboy(novoNome);
                        setNovoNome('');
                      }
                    }}
                  />
                  <datalist id="motoboyRoster">
                    {Object.values(configLoja?.roster || {})
                      .filter((rr) => !listaMotoboys.some((m) => normalizarNome(m.nome) === normalizarNome(rr.nome)))
                      .map((rr) => (
                        <option key={rr.nome} value={rr.nome} />
                      ))}
                  </datalist>
                  <button
                    className={styles.primaryBtn}
                    disabled={!novoNome.trim()}
                    onClick={async () => { await addMotoboy(novoNome); setNovoNome(''); }}
                  >
                    + Motoboy
                  </button>
                </div>
              )}

              {/* ---- Bandas extras ---- */}
              <div className={styles.extrasBox}>
                <h4>Bandas extras <span className={styles.divHint}>entregas fora do sistema, com justificativa</span></h4>
                {extras.length === 0 && <p className={styles.muted}>Nenhuma banda extra nesta semana.</p>}
                {extras.length > 0 && (
                  <div className={styles.tableWrap}>
                    <table className={styles.extrasTable}>
                      <thead>
                        <tr><th>Data</th><th>Motoboy</th><th>Qtd</th><th>Taxa</th><th>Justificativa</th><th></th></tr>
                      </thead>
                      <tbody>
                        {extras.map((e) => (
                          <tr key={e.id}>
                            <td>{formatDiaCurto(e.data)}</td>
                            <td>{e.nome || motoboys[e.mid]?.nome || '—'}</td>
                            <td>{e.quantidade}</td>
                            <td>{taxas[e.taxaIdx]?.label || `Taxa ${(e.taxaIdx ?? 0) + 1}`}</td>
                            <td className={styles.justCell}>{e.justificativa}</td>
                            <td>
                              {canEdit && (
                                <button className={styles.removeBtn} onClick={() => deleteExtra(e.id)} title="Excluir">×</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {canEdit && (
                  <div className={styles.extraForm}>
                    <select value={novoExtra.dia} onChange={(e) => setNovoExtra((p) => ({ ...p, dia: Number(e.target.value) }))}>
                      {DIAS_SEMANA.map((d, i) => (
                        <option key={i} value={i}>{d} {formatDiaCurto(diasIso[i])}</option>
                      ))}
                    </select>
                    <select value={novoExtra.mid} onChange={(e) => setNovoExtra((p) => ({ ...p, mid: e.target.value }))}>
                      <option value="">Motoboy…</option>
                      {listaMotoboys.map((m) => (
                        <option key={m.mid} value={m.mid}>{m.nome}</option>
                      ))}
                    </select>
                    <input
                      className={styles.extraQtd}
                      inputMode="numeric"
                      value={novoExtra.quantidade}
                      onChange={(e) => setNovoExtra((p) => ({ ...p, quantidade: Number(e.target.value) || 1 }))}
                    />
                    <select value={novoExtra.taxaIdx} onChange={(e) => setNovoExtra((p) => ({ ...p, taxaIdx: Number(e.target.value) }))}>
                      {taxas.map((tx, i) => (tx.valor != null ? <option key={i} value={i}>{tx.label}</option> : null))}
                    </select>
                    <input
                      className={styles.extraJust}
                      placeholder="Justificativa (ex.: #101340 troca de pedido)"
                      value={novoExtra.justificativa}
                      onChange={(e) => setNovoExtra((p) => ({ ...p, justificativa: e.target.value }))}
                    />
                    <button
                      className={styles.primaryBtn}
                      disabled={!novoExtra.mid || !novoExtra.justificativa.trim()}
                      onClick={salvarExtra}
                    >
                      + Banda extra
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ================= ADM ================= */}
          {vis.adm && (
            <section className={styles.divisao}>
              <div className={styles.divHeader} onClick={() => toggleVis('adm')}>
                <h3>Adm</h3>
                <span className={styles.divHint}>conferência gerente x Saipos</span>
              </div>

              <p className={styles.importStatus}>
                {pa?.importadoEm
                  ? `Saipos importado em ${new Date(pa.importadoEm).toLocaleString('pt-BR')} (rodada ${pa.fonte || '—'}).`
                  : 'Dados da Saipos ainda não importados para esta semana (importação automática nas quartas, 3h da manhã).'}
              </p>

              <div className={styles.tableWrap}>
                <table className={styles.grid}>
                  <thead>
                    <tr>
                      <th className={styles.stickyCol}>Motoboy</th>
                      {diasIso.map((d, i) => (
                        <th key={d}>
                          <span className={styles.diaNome}>{DIAS_CURTOS[i]}</span>
                          <span className={styles.diaData}>{formatDiaCurto(d)}</span>
                        </th>
                      ))}
                      <th className={styles.totalCol}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaMotoboys.map((mb) => {
                      const r = calcMotoboySemana(mb, config);
                      const paDias = pa?.entregas?.[mb.mid] || {};
                      const exDias = extrasPorMidDia[mb.mid] || {};
                      let totPa = 0;
                      let temDiff = false;
                      const cells = diasIso.map((d, i) => {
                        const pg = r.dias[i].qtd;
                        const paQ = Number(paDias[i]) || 0;
                        const ex = exDias[i] || 0;
                        totPa += paQ;
                        const diff = pg - paQ - ex;
                        if (diff !== 0 && (pg || paQ)) temDiff = true;
                        return { pg, paQ, ex, diff };
                      });
                      return (
                        <tr key={mb.mid} className={temDiff ? styles.rowDiff : ''}>
                          <td className={styles.stickyCol}>{mb.nome}</td>
                          {cells.map((c, i) => (
                            <td key={i} className={c.diff !== 0 && (c.pg || c.paQ) ? styles.cellDiff : ''}>
                              {c.pg || c.paQ ? (
                                <div className={styles.compCell}>
                                  <span>{c.pg}</span>
                                  <span className={styles.compPa}>{c.paQ}{c.ex ? `+${c.ex}` : ''}</span>
                                </div>
                              ) : null}
                            </td>
                          ))}
                          <td className={styles.totalCol}>
                            <div className={styles.compCell}>
                              <span>{r.total.qtd}</span>
                              <span className={styles.compPa}>{totPa}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={styles.legend}>
                Em cada célula: <strong>gerente</strong> em cima, <strong>Saipos</strong> embaixo (+ bandas extras quando houver).
                Célula vermelha = divergência que não fecha nem com as bandas extras.
              </p>

              {pa?.naoCasados?.length > 0 && (
                <div className={styles.naoCasados}>
                  <h4>Nomes da Saipos sem correspondência</h4>
                  {pa.naoCasados.map((n) => (
                    <div key={n.nome} className={styles.naoCasadoRow}>
                      <span>{n.nome}</span>
                      <span className={styles.muted}>
                        {Object.entries(n.dias || {}).map(([d, q]) => `${DIAS_CURTOS[d]}: ${q}`).join(' · ')}
                      </span>
                      {canEdit && (
                        <select defaultValue="" onChange={(e) => { if (e.target.value) atribuirNaoCasado(n.nome, e.target.value); }}>
                          <option value="">Atribuir a…</option>
                          {listaMotoboys.map((m) => (
                            <option key={m.mid} value={m.mid}>{m.nome}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ================= RESULTADO ================= */}
          {vis.resultado && (
            <section className={styles.divisao}>
              <div className={styles.divHeader} onClick={() => toggleVis('resultado')}>
                <h3>Resultado</h3>
                <span className={styles.divHint}>valores a pagar, calculados como na planilha</span>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.grid}>
                  <thead>
                    <tr>
                      <th className={styles.stickyCol}>Motoboy</th>
                      {diasIso.map((d, i) => (
                        <th key={d}>
                          <span className={styles.diaNome}>{DIAS_CURTOS[i]}</span>
                          <span className={styles.diaData}>{formatDiaCurto(d)}</span>
                        </th>
                      ))}
                      <th className={styles.totalCol}>Entregas</th>
                      <th className={styles.totalCol}>Acréscimo</th>
                      <th className={styles.totalCol}>Valor a receber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaMotoboys.map((mb) => {
                      const r = calcMotoboySemana(mb, config);
                      return (
                        <tr key={mb.mid}>
                          <td className={styles.stickyCol}>{mb.nome}</td>
                          {r.dias.map((d, i) => (
                            <td key={i} className={d.acrescimo > 0 ? styles.cellAcrescimo : ''} title={d.acrescimo > 0 ? `Acréscimo de ${formatBRL(d.acrescimo)} (garantia)` : ''}>
                              {d.valor ? formatBRL(d.valor) : ''}
                            </td>
                          ))}
                          <td className={styles.totalCol}>{r.total.qtd || ''}</td>
                          <td className={styles.totalCol}>{r.total.acrescimo ? formatBRL(r.total.acrescimo) : ''}</td>
                          <td className={`${styles.totalCol} ${styles.valorFinal}`}>{formatBRL(r.total.valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={styles.resumoCards}>
                <div className={styles.resumoCard}>
                  <span className={styles.resumoLabel}>Entregas</span>
                  <span className={styles.resumoValor}>{resumo.entregas}</span>
                </div>
                <div className={styles.resumoCard}>
                  <span className={styles.resumoLabel}>Motos (diárias)</span>
                  <span className={styles.resumoValor}>{resumo.motoDias}</span>
                </div>
                <div className={styles.resumoCard}>
                  <span className={styles.resumoLabel}>Taxa coop ({formatBRL(config?.taxaCoop)}/moto)</span>
                  <span className={styles.resumoValor}>{formatBRL(resumo.taxaCoopTotal)}</span>
                </div>
                <div className={styles.resumoCard}>
                  <span className={styles.resumoLabel}>Transbordo (acréscimos)</span>
                  <span className={styles.resumoValor}>{formatBRL(resumo.transbordo)}</span>
                </div>
                <div className={`${styles.resumoCard} ${styles.resumoTotal}`}>
                  <span className={styles.resumoLabel}>Total a pagar</span>
                  <span className={styles.resumoValor}>{formatBRL(resumo.totalPagar)}</span>
                </div>
              </div>

              {/* ---- Config da semana ---- */}
              <details className={styles.configBox}>
                <summary>Configuração de taxas e garantia</summary>
                <div className={styles.configGrid}>
                  {taxas.map((tx, i) => (
                    <div key={i} className={styles.configTaxa}>
                      <span className={styles.taxaLabel}>{tx.label}</span>
                      <MoneyInput
                        className={styles.configInput}
                        value={tx.valor}
                        disabled={!canEdit}
                        onCommit={(v) => {
                          const novas = taxas.map((t, j) => (j === i ? { ...t, valor: v } : t));
                          setConfig({ taxas: novas });
                        }}
                      />
                      <input
                        className={styles.configFaixa}
                        placeholder="faixa (ex.: até 3km)"
                        defaultValue={tx.faixa || ''}
                        disabled={!canEdit}
                        onBlur={(e) => {
                          if (e.target.value !== (tx.faixa || '')) {
                            const novas = taxas.map((t, j) => (j === i ? { ...t, faixa: e.target.value } : t));
                            setConfig({ taxas: novas });
                          }
                        }}
                      />
                    </div>
                  ))}
                  <div className={styles.configTaxa}>
                    <span className={styles.taxaLabel}>Garantia/noite</span>
                    <MoneyInput
                      className={styles.configInput}
                      value={config?.garantia}
                      disabled={!canEdit}
                      onCommit={(v) => setConfig({ garantia: v || 0 })}
                    />
                  </div>
                  <div className={styles.configTaxa}>
                    <span className={styles.taxaLabel}>Taxa coop/moto</span>
                    <MoneyInput
                      className={styles.configInput}
                      value={config?.taxaCoop}
                      disabled={!canEdit}
                      onCommit={(v) => setConfig({ taxaCoop: v || 0 })}
                    />
                  </div>
                </div>
                <p className={styles.muted}>Alterações valem para esta semana e viram padrão das próximas.</p>
              </details>
            </section>
          )}
        </>
      )}
    </div>
  );
}
