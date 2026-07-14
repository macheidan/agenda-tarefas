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

export default function MotoboysView() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);

  // Permissões por linha/recurso (settings/{uid}). Ver: default ligado.
  // Editar: default desligado; flag legada motoboysEditor libera tudo.
  const legacyEditor = settings?.motoboysEditor === true;
  const canViewGerente = isAdmin || settings?.motoboysVerGerente !== false;
  const canViewAdm = isAdmin || settings?.motoboysVerAdm !== false;
  const canViewResultado = isAdmin || settings?.motoboysVerResultado !== false;
  const canEditGerente = isAdmin || legacyEditor || settings?.motoboysEditGerente === true;
  const canEditAdm = isAdmin || legacyEditor || settings?.motoboysEditAdm === true;
  const canEditResultado = isAdmin || legacyEditor || settings?.motoboysEditResultado === true;
  const canRoster = isAdmin || legacyEditor || settings?.motoboysRoster === true;

  const [loja, setLoja] = useState('dame');
  const [segunda, setSegunda] = useState(() => mondayOf(new Date()));
  // Blocos de motoboy iniciam recolhidos; expande por clique ou "Expandir todos".
  const [expandidos, setExpandidos] = useState(() => new Set());
  const [cadastroAberto, setCadastroAberto] = useState(false);

  const {
    semana, semanaLoading, config, configLoja, extras, error,
    criarSemana, setCelula, setDesconto, addMotoboy, removeMotoboy,
    setObs, addRosterMotoboy, renameMotoboy, setRosterAtivo,
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

  // Extras agregados por motoboy/dia (entram na conferência gerente x Saipos).
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

  // ---- Editor de comentário (sirene) mid+dia ----
  const [obsEdit, setObsEdit] = useState(null); // {mid, di} | null
  const [obsText, setObsText] = useState('');
  const abrirObs = (mid, di) => {
    setObsEdit({ mid, di });
    setObsText(motoboys[mid]?.dias?.[di]?.obs?.t || '');
  };
  const salvarObs = async () => {
    if (!obsEdit) return;
    await setObs(obsEdit.mid, obsEdit.di, obsText);
    setObsEdit(null);
    setObsText('');
  };

  // Comentários da semana (para a listagem abaixo das grades).
  const comentarios = [];
  listaMotoboys.forEach((mb) => {
    for (let di = 0; di < 7; di++) {
      const o = mb.dias?.[di]?.obs;
      if (o?.t) comentarios.push({ mid: mb.mid, nome: mb.nome, di, ...o });
    }
  });
  comentarios.sort((a, b) => a.di - b.di || a.nome.localeCompare(b.nome));

  // ---- Cadastro de motoboys (roster) ----
  const [showArquivados, setShowArquivados] = useState(false);
  const [novoRoster, setNovoRoster] = useState('');
  const [renMid, setRenMid] = useState(null);
  const [renNome, setRenNome] = useState('');
  const rosterEntries = Object.entries(configLoja?.roster || {})
    .map(([mid, r]) => ({ mid, ...r }))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome));
  const rosterAtivos = rosterEntries.filter((r) => r.ativo !== false);
  const rosterArquivados = rosterEntries.filter((r) => r.ativo === false);

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

  const toggleBloco = (mid) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  const todosAbertos = listaMotoboys.length > 0 && listaMotoboys.every((m) => expandidos.has(m.mid));
  const expandirTodos = () =>
    setExpandidos(todosAbertos ? new Set() : new Set(listaMotoboys.map((m) => m.mid)));

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

        <div className={styles.toolbarBtns}>
          {semana && listaMotoboys.length > 0 && (
            <button className={styles.toolBtn} onClick={expandirTodos}>
              {todosAbertos ? 'Recolher todos' : 'Expandir todos'}
            </button>
          )}
          {canRoster && (
            <button className={styles.toolBtn} onClick={() => setCadastroAberto(true)}>
              Cadastro de motoboys
            </button>
          )}
        </div>
      </div>

      {canViewAdm && semana && (
        <p className={styles.importLine}>
          {pa?.importadoEm
            ? `Saipos importado em ${new Date(pa.importadoEm).toLocaleString('pt-BR')} (rodada ${pa.fonte || '—'}).`
            : 'Saipos ainda não importado para esta semana (automático nas quartas de madrugada).'}
        </p>
      )}

      {error && <div className={styles.error}>Erro ao carregar: {error}</div>}

      {!semanaLoading && !semana && (
        <div className={styles.emptyWeek}>
          <p>Semana de {formatDiaCurto(segunda)} a {formatDiaCurto(fim)} ainda não iniciada para {MOTOBOY_LOJAS.find((l) => l.id === loja)?.nome}.</p>
          {canEditGerente ? (
            <button className={styles.primaryBtn} onClick={criarSemana}>Iniciar semana</button>
          ) : (
            <p className={styles.muted}>Peça a um editor para iniciar a semana.</p>
          )}
        </div>
      )}

      {semana && (
        <section className={styles.divisao}>
          {/* ---- Blocos por motoboy: lançamento + conferência + resultado ---- */}
          {listaMotoboys.map((mb) => {
            const r = calcMotoboySemana(mb, config);
            const paDias = pa?.entregas?.[mb.mid] || {};
            const exDias = extrasPorMidDia[mb.mid] || {};
            let totPa = 0;
            let totEx = 0;
            const compCells = diasIso.map((d, i) => {
              const pg = r.dias[i].qtd;
              const paQ = Number(paDias[i]) || 0;
              const ex = exDias[i] || 0;
              totPa += paQ;
              totEx += ex;
              return { pg, paQ, ex, diff: pg - paQ - ex };
            });
            const totDiff = r.total.qtd - totPa - totEx;
            const aberto = expandidos.has(mb.mid);
            const temDiffBloco = compCells.some((c) => c.diff !== 0 && (c.pg || c.paQ));
            return (
              <div key={mb.mid} className={styles.bloco}>
                <div className={styles.blocoHeader} onClick={() => toggleBloco(mb.mid)}>
                  <span className={styles.chevron}>{aberto ? '▾' : '▸'}</span>
                  <strong>{mb.nome}</strong>
                  <span className={styles.blocoBadges}>
                    {r.total.qtd > 0 && <span className={styles.badgeQtd}>{r.total.qtd} entregas</span>}
                    {canViewAdm && temDiffBloco && <span className={styles.badgeDiff}>divergência</span>}
                  </span>
                  {canViewResultado && <span className={styles.blocoTotal}>{formatBRL(r.total.valor)}</span>}
                  {canEditGerente && (
                    <button
                      className={styles.removeBtn}
                      title="Remover motoboy desta semana"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Remover ${mb.nome} desta semana? Os lançamentos serão apagados.`)) removeMotoboy(mb.mid);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {aberto && (
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
                      {canViewGerente && taxas.map((tx, ti) =>
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
                                  disabled={!canEditGerente}
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
                      {canViewGerente && (
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
                                disabled={!canEditGerente}
                                placeholder=""
                                onCommit={(v) => setDesconto(mb.mid, di, v)}
                              />
                            </td>
                          ))}
                          <td className={styles.totalCol}>{r.total.desconto ? formatBRL(r.total.desconto) : ''}</td>
                        </tr>
                      )}
                      {canViewGerente && (
                        <tr className={styles.obsRow}>
                          <td className={styles.stickyCol}>
                            <span className={styles.taxaLabel}>Obs</span>
                            <span className={styles.taxaValor}>comentário do dia</span>
                          </td>
                          {diasIso.map((d, di) => {
                            const o = mb.dias?.[di]?.obs;
                            return (
                              <td key={d}>
                                <button
                                  className={`${styles.obsBtn} ${o?.t ? styles.obsBtnOn : ''}`}
                                  title={o?.t || (canEditGerente ? 'Adicionar comentário' : '')}
                                  disabled={!canEditGerente && !o?.t}
                                  onClick={() => (canEditGerente ? abrirObs(mb.mid, di) : null)}
                                >
                                  {o?.t ? '🚨' : '+'}
                                </button>
                              </td>
                            );
                          })}
                          <td className={styles.totalCol}></td>
                        </tr>
                      )}
                      {canViewGerente && (
                        <tr className={styles.calcRow}>
                          <td className={styles.stickyCol}>Entregas</td>
                          {r.dias.map((d, i) => (
                            <td key={i}>{d.qtd || ''}</td>
                          ))}
                          <td className={styles.totalCol}>{r.total.qtd || ''}</td>
                        </tr>
                      )}
                      {canViewAdm && (
                        <tr className={styles.saiposRow}>
                          <td className={styles.stickyCol}>
                            <span className={styles.taxaLabel}>Saipos</span>
                            <span className={styles.taxaValor}>+ bandas extras</span>
                          </td>
                          {compCells.map((c, i) => (
                            <td key={i} className={c.diff !== 0 && (c.pg || c.paQ) ? styles.cellDiff : ''}>
                              {c.paQ || c.ex ? (
                                <span>
                                  {c.paQ}{c.ex ? `+${c.ex}` : ''}
                                </span>
                              ) : null}
                              {c.diff !== 0 && (c.pg || c.paQ) ? (
                                <span className={c.diff > 0 ? styles.diffMais : styles.diffMenos}>
                                  {c.diff > 0 ? ` +${c.diff}` : ` ${c.diff}`}
                                </span>
                              ) : null}
                            </td>
                          ))}
                          <td className={`${styles.totalCol} ${totDiff !== 0 && (r.total.qtd || totPa) ? styles.cellDiff : ''}`}>
                            {totPa}{totEx ? `+${totEx}` : ''}
                            {totDiff !== 0 && (r.total.qtd || totPa) ? (
                              <span className={totDiff > 0 ? styles.diffMais : styles.diffMenos}>
                                {totDiff > 0 ? ` +${totDiff}` : ` ${totDiff}`}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      )}
                      {canViewResultado && (
                        <tr className={styles.calcRow}>
                          <td className={styles.stickyCol}>
                            <span className={styles.taxaLabel}>Total bandas</span>
                            <span className={styles.taxaValor}>qtde × valor da taxa</span>
                          </td>
                          {r.dias.map((d, i) => (
                            <td key={i}>{d.bandas ? formatBRL(d.bandas) : ''}</td>
                          ))}
                          <td className={styles.totalCol}>{r.total.bandas ? formatBRL(r.total.bandas) : ''}</td>
                        </tr>
                      )}
                      {canViewResultado && (
                        <tr className={styles.acrescimoRow}>
                          <td className={styles.stickyCol}>
                            <span className={styles.taxaLabel}>Acréscimo</span>
                            <span className={styles.taxaValor}>completa a garantia de {formatBRL(config?.garantia)}</span>
                          </td>
                          {r.dias.map((d, i) => (
                            <td key={i} className={d.acrescimo > 0 ? styles.cellAcrescimo : ''}>
                              {d.acrescimo ? formatBRL(d.acrescimo) : ''}
                            </td>
                          ))}
                          <td className={styles.totalCol}>{r.total.acrescimo ? formatBRL(r.total.acrescimo) : ''}</td>
                        </tr>
                      )}
                      {canViewResultado && (
                        <tr className={styles.valorRow}>
                          <td className={styles.stickyCol}>
                            <span className={styles.taxaLabel}>Valor a receber</span>
                            <span className={styles.taxaValor}>bandas + acréscimo + descontos</span>
                          </td>
                          {r.dias.map((d, i) => (
                            <td key={i}>{d.valor ? formatBRL(d.valor) : ''}</td>
                          ))}
                          <td className={`${styles.totalCol} ${styles.valorFinal}`}>{formatBRL(r.total.valor)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                )}
                {aberto && obsEdit?.mid === mb.mid && (
                  <div className={styles.obsEditor}>
                    <span className={styles.obsEditorLabel}>
                      🚨 {mb.nome} · {DIAS_SEMANA[obsEdit.di]} {formatDiaCurto(diasIso[obsEdit.di])}
                    </span>
                    <textarea
                      className={styles.obsTextarea}
                      value={obsText}
                      autoFocus
                      rows={2}
                      placeholder="Comentário do dia (ex.: chegou atrasado, recusou entrega...)"
                      onChange={(e) => setObsText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvarObs(); }
                        if (e.key === 'Escape') { setObsEdit(null); setObsText(''); }
                      }}
                    />
                    <div className={styles.obsEditorActions}>
                      <button className={styles.primaryBtn} onClick={salvarObs}>Salvar</button>
                      {motoboys[obsEdit.mid]?.dias?.[obsEdit.di]?.obs?.t && (
                        <button
                          className={styles.dangerBtn}
                          onClick={async () => { await setObs(obsEdit.mid, obsEdit.di, ''); setObsEdit(null); setObsText(''); }}
                        >
                          Excluir
                        </button>
                      )}
                      <button className={styles.ghostBtn} onClick={() => { setObsEdit(null); setObsText(''); }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {canViewAdm && (
            <p className={styles.legend}>
              Linha <strong>Saipos</strong>: entregas no sistema (+ bandas extras quando houver).
              <span className={styles.diffMais}> +N</span> = gerente lançou N a mais que o Saipos;
              <span className={styles.diffMenos}> -N</span> = lançou N a menos.
              Célula vermelha = divergência que não fecha nem com as bandas extras.
            </p>
          )}

          {canViewAdm && pa?.naoCasados?.length > 0 && (
            <div className={styles.naoCasados}>
              <h4>Nomes da Saipos sem correspondência</h4>
              {pa.naoCasados.map((n) => (
                <div key={n.nome} className={styles.naoCasadoRow}>
                  <span>{n.nome}</span>
                  <span className={styles.muted}>
                    {Object.entries(n.dias || {}).map(([d, q]) => `${DIAS_CURTOS[d]}: ${q}`).join(' · ')}
                  </span>
                  {canEditAdm && (
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

          {canEditGerente && (
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
                  .filter((rr) => rr.ativo !== false)
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

          {/* ---- Comentários da semana ---- */}
          {canViewGerente && comentarios.length > 0 && (
            <div className={styles.obsLista}>
              <h4>🚨 Comentários da semana</h4>
              {comentarios.map((c) => (
                <div key={`${c.mid}_${c.di}`} className={styles.obsListaRow}>
                  <span className={styles.obsListaDia}>{DIAS_CURTOS[c.di]} {formatDiaCurto(diasIso[c.di])}</span>
                  <span className={styles.obsListaNome}>{c.nome}</span>
                  <span className={styles.obsListaTexto}>{c.t}</span>
                  {c.por && <span className={styles.obsListaPor}>por {c.por}</span>}
                  {canEditGerente && (
                    <button className={styles.removeBtn} title="Excluir comentário" onClick={() => setObs(c.mid, c.di, '')}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ---- Bandas extras ---- */}
          {canViewGerente && (
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
                            {canEditGerente && (
                              <button className={styles.removeBtn} onClick={() => deleteExtra(e.id)} title="Excluir">×</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {canEditGerente && (
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
          )}

          {/* ---- Resumo da semana ---- */}
          {canViewResultado && (
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
          )}

          {/* ---- Config da semana ---- */}
          {canViewResultado && (
            <details className={styles.configBox}>
              <summary>Configuração de taxas e garantia</summary>
              <div className={styles.configGrid}>
                {taxas.map((tx, i) => (
                  <div key={i} className={styles.configTaxa}>
                    <span className={styles.taxaLabel}>{tx.label}</span>
                    <MoneyInput
                      className={styles.configInput}
                      value={tx.valor}
                      disabled={!canEditResultado}
                      onCommit={(v) => {
                        const novas = taxas.map((t, j) => (j === i ? { ...t, valor: v } : t));
                        setConfig({ taxas: novas });
                      }}
                    />
                    <input
                      className={styles.configFaixa}
                      placeholder="faixa (ex.: até 3km)"
                      defaultValue={tx.faixa || ''}
                      disabled={!canEditResultado}
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
                    disabled={!canEditResultado}
                    onCommit={(v) => setConfig({ garantia: v || 0 })}
                  />
                </div>
                <div className={styles.configTaxa}>
                  <span className={styles.taxaLabel}>Taxa coop/moto</span>
                  <MoneyInput
                    className={styles.configInput}
                    value={config?.taxaCoop}
                    disabled={!canEditResultado}
                    onCommit={(v) => setConfig({ taxaCoop: v || 0 })}
                  />
                </div>
              </div>
              <p className={styles.muted}>Alterações valem para esta semana e viram padrão das próximas.</p>
            </details>
          )}
        </section>
      )}

      {/* ================= CADASTRO (janela aberta pelo botão do topo) ================= */}
      {canRoster && cadastroAberto && (
        <div className={styles.modalOverlay} onClick={() => setCadastroAberto(false)}>
        <section className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h3>Cadastro de motoboys</h3>
            <span className={styles.divHint}>
              nomes de {MOTOBOY_LOJAS.find((l) => l.id === loja)?.nome}; arquivado não entra em semanas novas
            </span>
            {rosterArquivados.length > 0 && (
              <button className={styles.arquivadosBtn} onClick={() => setShowArquivados((v) => !v)}>
                {showArquivados ? 'Ocultar arquivados' : `Ver arquivados (${rosterArquivados.length})`}
              </button>
            )}
            <button className={styles.modalClose} title="Fechar" onClick={() => setCadastroAberto(false)}>×</button>
          </div>

          <div className={styles.rosterLista}>
            {rosterAtivos.length === 0 && <p className={styles.muted}>Nenhum motoboy cadastrado.</p>}
            {rosterAtivos.map((r) => (
              <div key={r.mid} className={styles.rosterRow}>
                {renMid === r.mid ? (
                  <>
                    <input
                      className={styles.addInput}
                      value={renNome}
                      autoFocus
                      onChange={(e) => setRenNome(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && renNome.trim()) { await renameMotoboy(r.mid, renNome); setRenMid(null); }
                        if (e.key === 'Escape') setRenMid(null);
                      }}
                    />
                    <button
                      className={styles.primaryBtn}
                      disabled={!renNome.trim()}
                      onClick={async () => { await renameMotoboy(r.mid, renNome); setRenMid(null); }}
                    >
                      Salvar
                    </button>
                    <button className={styles.ghostBtn} onClick={() => setRenMid(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className={styles.rosterNome}>{r.nome}</span>
                    <button className={styles.ghostBtn} onClick={() => { setRenMid(r.mid); setRenNome(r.nome); }}>
                      Renomear
                    </button>
                    <button
                      className={styles.ghostBtn}
                      title="Sai das semanas novas; semanas já lançadas não mudam"
                      onClick={() => setRosterAtivo(r.mid, false)}
                    >
                      Arquivar
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {showArquivados && rosterArquivados.length > 0 && (
            <div className={styles.rosterArquivados}>
              <h4>Arquivados</h4>
              {rosterArquivados.map((r) => (
                <div key={r.mid} className={`${styles.rosterRow} ${styles.rosterRowArquivado}`}>
                  <span className={styles.rosterNome}>{r.nome}</span>
                  <button className={styles.ghostBtn} onClick={() => setRosterAtivo(r.mid, true)}>Restaurar</button>
                </div>
              ))}
            </div>
          )}

          <div className={styles.addRow}>
            <input
              className={styles.addInput}
              placeholder="Novo motoboy (só cadastro; não entra na semana atual)"
              value={novoRoster}
              onChange={(e) => setNovoRoster(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && novoRoster.trim()) { await addRosterMotoboy(novoRoster); setNovoRoster(''); }
              }}
            />
            <button
              className={styles.primaryBtn}
              disabled={!novoRoster.trim()}
              onClick={async () => { await addRosterMotoboy(novoRoster); setNovoRoster(''); }}
            >
              + Cadastrar
            </button>
          </div>
        </section>
        </div>
      )}
    </div>
  );
}
