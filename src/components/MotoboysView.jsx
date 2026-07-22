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
  isoDate,
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

// Desconto nunca é positivo: 50 vira -50 e 0 limpa a célula.
const soNegativo = (v) => (v == null || v === 0 ? null : -Math.abs(v));

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
  const canViewTaxas = isAdmin || settings?.motoboysVerTaxas !== false;
  const canEditTaxas = isAdmin || legacyEditor || settings?.motoboysEditTaxas === true;
  const canRoster = isAdmin || legacyEditor || settings?.motoboysRoster === true;
  // Lojas visíveis por usuário (default: as duas).
  const lojasVisiveis = MOTOBOY_LOJAS.filter((l) =>
    isAdmin || (l.id === 'dame' ? settings?.motoboysVerDame !== false : settings?.motoboysVerLov !== false)
  );

  const [loja, setLoja] = useState('dame');
  const [segunda, setSegunda] = useState(() => mondayOf(new Date()));
  // Se a loja selecionada não está liberada pro usuário, pula pra primeira liberada.
  if (lojasVisiveis.length > 0 && !lojasVisiveis.some((l) => l.id === loja)) {
    setLoja(lojasVisiveis[0].id);
  }
  // Blocos de motoboy iniciam recolhidos; expande por clique ou "Expandir todos".
  const [expandidos, setExpandidos] = useState(() => new Set());
  // Seções no submenu do título (padrão Depto Pessoal): Semana | Taxas | Cadastro.
  const [secao, setSecao] = useState('semana');
  const secaoEfetiva =
    (secao === 'taxas' && canViewTaxas) || (secao === 'cadastro' && canRoster) ? secao : 'semana';

  const {
    semana, semanaLoading, config, configLoja, extras, error,
    criarSemana, setCelula, setDiaSemGarantia, setConferido, setDesconto, addMotoboy, removeMotoboy,
    addRosterMotoboy, renameMotoboy, setRosterAtivo,
    setConfig, addExtra, deleteExtra, atribuirNaoCasado,
  } = useMotoboys(loja, segunda, user);

  const fim = addDaysIso(segunda, 6);
  const diasIso = Array.from({ length: 7 }, (_, i) => addDaysIso(segunda, i));
  const hojeIso = isoDate(new Date());

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
  // O segundo mapa quebra também por taxa, para detectar a divergência que existe
  // dentro das taxas mesmo quando o total do motoboy fecha.
  const extrasPorMidDia = {};
  const extrasPorMidDiaTaxa = {};
  extras.forEach((e) => {
    const idx = diasIso.indexOf(e.data);
    if (idx < 0) return;
    const key = e.mid || `nome:${normalizarNome(e.nome)}`;
    const qtd = Number(e.quantidade) || 0;
    const ti = Number(e.taxaIdx) || 0;
    if (!extrasPorMidDia[key]) extrasPorMidDia[key] = {};
    extrasPorMidDia[key][idx] = (extrasPorMidDia[key][idx] || 0) + qtd;
    if (!extrasPorMidDiaTaxa[key]) extrasPorMidDiaTaxa[key] = {};
    if (!extrasPorMidDiaTaxa[key][idx]) extrasPorMidDiaTaxa[key][idx] = {};
    extrasPorMidDiaTaxa[key][idx][ti] = (extrasPorMidDiaTaxa[key][idx][ti] || 0) + qtd;
  });

  const resumo = calcResumoSemana(motoboys, config);
  const pa = semana?.pa || null;

  // ---- Form de nova banda extra ----
  const [novoExtra, setNovoExtra] = useState({ dia: 0, mid: '', quantidade: 1, taxaIdx: 0, justificativa: '' });
  const [novoNome, setNovoNome] = useState('');

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
      {/* ---- Header: título + submenu de seções (padrão Depto Pessoal) ---- */}
      <div className={styles.header}>
        <h2>🛵 Motoboys</h2>
        <div className={styles.headerActions}>
          <button
            className={`${styles.sectionTab} ${secaoEfetiva === 'semana' ? styles.sectionTabActive : ''}`}
            onClick={() => setSecao('semana')}
          >
            Semana
          </button>
          {canViewTaxas && (
            <button
              className={`${styles.sectionTab} ${secaoEfetiva === 'taxas' ? styles.sectionTabActive : ''}`}
              onClick={() => setSecao('taxas')}
            >
              Taxas
            </button>
          )}
          {canRoster && (
            <button
              className={`${styles.sectionTab} ${secaoEfetiva === 'cadastro' ? styles.sectionTabActive : ''}`}
              onClick={() => setSecao('cadastro')}
            >
              Cadastro
            </button>
          )}
        </div>
      </div>

      {/* ---- Abas de loja (padrão Depto Pessoal) ---- */}
      <div className={styles.storeBar}>
        <div className={styles.storeTabs}>
          {lojasVisiveis.map((l) => (
            <button
              key={l.id}
              className={`${styles.sectionTab} ${loja === l.id ? styles.sectionTabActive : ''}`}
              onClick={() => setLoja(l.id)}
            >
              {l.nome}
            </button>
          ))}
        </div>
      </div>

      {secaoEfetiva === 'semana' && (<>
      {/* ---- Filtros: navegação de semana + status da importação ---- */}
      <div className={styles.filters}>
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
        {semana && canEditGerente && (
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
              title="Adicionar motoboy na semana"
              onClick={async () => { await addMotoboy(novoNome); setNovoNome(''); }}
            >
              +
            </button>
          </div>
        )}
        {semana && listaMotoboys.length > 0 && (
          <button className={styles.toolBtn} onClick={expandirTodos}>
            {todosAbertos ? 'Recolher todos' : 'Expandir todos'}
          </button>
        )}
        {canViewAdm && semana && (
          <span className={styles.importLine}>
            {pa?.importadoEm
              ? `Saipos importado em ${new Date(pa.importadoEm).toLocaleString('pt-BR')} (rodada ${pa.fonte || '—'})`
              : 'Saipos ainda não importado (automático nas quartas de madrugada)'}
          </span>
        )}
      </div>

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
          {listaMotoboys.length === 0 && (
            <p className={styles.muted}>
              Nenhum motoboy nesta semana. Adicione pelo campo "Nome do motoboy" acima.
            </p>
          )}
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
            // Comparação taxa a taxa (lançado × Saipos + extras). Só vale quando
            // a Saipos trouxe o detalhe por taxa deste motoboy — sem isso, tudo
            // "divergiria" contra zero. `diffTaxaCel` pinta a célula; o badge usa
            // a MESMA conta, então os dois nunca discordam.
            const exTaxaDias = extrasPorMidDiaTaxa[mb.mid] || {};
            const taxasPa = canViewAdm ? pa?.taxas?.[mb.mid] : null;
            const diffTaxaCel = (di, ti) => {
              if (!taxasPa) return false;
              const pg = Number(mb.dias?.[di]?.t?.[ti]) || 0;
              const paT = Number(taxasPa?.[di]?.[ti]) || 0;
              return pg !== paT + (exTaxaDias[di]?.[ti] || 0);
            };
            // Taxas trocadas entre si: alguma célula diverge, mas a soma fecha —
            // o valor a receber muda mesmo com a contagem batendo.
            const temDiffTaxa =
              !!taxasPa && taxas.some((_, ti) => diasIso.some((_, di) => diffTaxaCel(di, ti)));
            const diffSoNasTaxas = temDiffTaxa && totDiff === 0 && (r.total.qtd || totPa);
            // Checkbox de exceção do dia: marcado, a coluna fica amarela e o
            // dia não gera acréscimo nem moto-dia (padrão desmarcado = normal).
            const diaSemGar = diasIso.map((_, di) => mb.dias?.[di]?.semGarantia === true);
            const colCls = (di, extra = '') =>
              [
                diaSemGar[di] ? styles.colPend : '',
                diasIso[di] === hojeIso ? styles.colHoje : '',
                extra,
              ].filter(Boolean).join(' ');
            return (
              <div key={mb.mid} className={styles.bloco}>
                <div className={styles.blocoHeader} onClick={() => toggleBloco(mb.mid)}>
                  <span className={styles.chevron}>{aberto ? '▾' : '▸'}</span>
                  <strong>{mb.nome}</strong>
                  <span className={styles.blocoBadges}>
                    {r.total.qtd > 0 && (
                      <span
                        className={`${styles.badgeQtd} ${diffSoNasTaxas ? styles.badgeQtdTaxa : ''}`}
                        title={diffSoNasTaxas ? 'O total bate com a Saipos, mas há diferença entre as taxas' : undefined}
                      >
                        {r.total.qtd} entregas
                      </span>
                    )}
                    {canViewAdm && temDiffBloco && <span className={styles.badgeDiff}>divergência</span>}
                  </span>
                  <label
                    className={styles.conferidoLabel}
                    title="Conferido — vale para todos os usuários"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className={styles.diaCheck}
                      checked={(semana?.conferidos?.[mb.mid] ?? mb.conferido) === true}
                      onChange={(e) => setConferido(mb.mid, e.target.checked)}
                    />
                    Conferido
                  </label>
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
                          <th key={d} className={colCls(i)}>
                            <label className={styles.diaHead} title="Marcado: dia sem acréscimo (garantia) e sem moto-dia (taxa coop)">
                              <input
                                type="checkbox"
                                className={styles.diaCheck}
                                checked={diaSemGar[i]}
                                disabled={!canEditGerente}
                                onChange={(e) => setDiaSemGarantia(mb.mid, i, e.target.checked)}
                              />
                              <span>
                                <span className={styles.diaNome}>{DIAS_CURTOS[i]}</span>
                                <span className={styles.diaData}>{formatDiaCurto(d)}</span>
                              </span>
                            </label>
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
                            {diasIso.map((d, di) => {
                              const paT = canViewAdm ? pa?.taxas?.[mb.mid]?.[di]?.[ti] : null;
                              return (
                                <td
                                  key={d}
                                  className={colCls(di, diffTaxaCel(di, ti) ? styles.cellTaxaDiff : '')}
                                  title={diffTaxaCel(di, ti) ? 'Lançado diferente da Saipos nesta taxa' : undefined}
                                >
                                  <QtdInput
                                    value={mb.dias?.[di]?.t?.[ti] ?? null}
                                    disabled={!canEditGerente}
                                    onCommit={(v) => setCelula(mb.mid, di, ti, v)}
                                  />
                                  {paT != null && (
                                    <span className={styles.paTaxa}>
                                      <span className={styles.paSlash}>/ </span>{paT}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className={styles.totalCol}>
                              {diasIso.reduce((acc, _, di) => acc + (Number(mb.dias?.[di]?.t?.[ti]) || 0), 0) || ''}
                              {canViewAdm && (() => {
                                const totPa = diasIso.reduce(
                                  (acc, _, di) => acc + (Number(pa?.taxas?.[mb.mid]?.[di]?.[ti]) || 0), 0
                                );
                                return totPa ? (
                                  <span className={styles.paTaxa}>
                                    <span className={styles.paSlash}>/ </span>{totPa}
                                  </span>
                                ) : null;
                              })()}
                            </td>
                          </tr>
                        )
                      )}
                      {canViewGerente && (
                        <tr className={styles.descRow}>
                          <td className={styles.stickyCol}>
                            <span className={styles.taxaLabel}>Descontos</span>
                            <span className={styles.taxaValor}>R$ · sempre negativo</span>
                          </td>
                          {diasIso.map((d, di) => (
                            <td key={d} className={colCls(di)}>
                              <MoneyInput
                                className={styles.descInput}
                                value={mb.dias?.[di]?.desc ?? null}
                                disabled={!canEditGerente}
                                placeholder=""
                                normalize={soNegativo}
                                onCommit={(v) => setDesconto(mb.mid, di, v)}
                              />
                            </td>
                          ))}
                          <td className={styles.totalCol}>{r.total.desconto ? formatBRL(r.total.desconto) : ''}</td>
                        </tr>
                      )}
                      {canViewGerente && (
                        <tr className={styles.calcRow}>
                          <td className={styles.stickyCol}>Entregas</td>
                          {r.dias.map((d, i) => (
                            <td key={i} className={colCls(i)}>{d.qtd || ''}</td>
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
                            <td key={i} className={colCls(i, c.diff !== 0 && (c.pg || c.paQ) ? styles.cellDiff : '')}>
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
                            <td key={i} className={colCls(i)}>{d.bandas ? formatBRL(d.bandas) : ''}</td>
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
                            <td key={i} className={colCls(i, d.acrescimo > 0 ? styles.cellAcrescimo : '')}>
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
                            <td key={i} className={colCls(i)}>{d.valor ? formatBRL(d.valor) : ''}</td>
                          ))}
                          <td className={`${styles.totalCol} ${styles.valorFinal}`}>{formatBRL(r.total.valor)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            );
          })}


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

        </section>
      )}
      </>)}

      {/* ================= TAXAS (seção do submenu) ================= */}
      {secaoEfetiva === 'taxas' && canViewTaxas && (
        <section className={`${styles.inlinePanel} ${styles.taxasPanel}`}>
          <table className={styles.taxasTable}>
            <thead>
              <tr><th>Taxa</th><th>Valor</th><th>Faixa</th></tr>
            </thead>
            <tbody>
              {taxas.map((tx, i) => (
                <tr key={i}>
                  <td className={styles.taxasNome}>{tx.label}</td>
                  <td>
                    <MoneyInput
                      className={styles.configInput}
                      value={tx.valor}
                      disabled={!canEditTaxas}
                      onCommit={(v) => {
                        const novas = taxas.map((t, j) => (j === i ? { ...t, valor: v } : t));
                        setConfig({ taxas: novas });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.configFaixa}
                      placeholder="ex.: até 3km"
                      defaultValue={tx.faixa || ''}
                      disabled={!canEditTaxas}
                      onBlur={(e) => {
                        if (e.target.value !== (tx.faixa || '')) {
                          const novas = taxas.map((t, j) => (j === i ? { ...t, faixa: e.target.value } : t));
                          setConfig({ taxas: novas });
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
              <tr className={styles.taxasSep}>
                <td className={styles.taxasNome}>Garantia/noite</td>
                <td>
                  <MoneyInput
                    className={styles.configInput}
                    value={config?.garantia}
                    disabled={!canEditTaxas}
                    onCommit={(v) => setConfig({ garantia: v || 0 })}
                  />
                </td>
                <td className={styles.muted}>mínimo por noite trabalhada</td>
              </tr>
              <tr>
                <td className={styles.taxasNome}>Taxa coop/moto</td>
                <td>
                  <MoneyInput
                    className={styles.configInput}
                    value={config?.taxaCoop}
                    disabled={!canEditTaxas}
                    onCommit={(v) => setConfig({ taxaCoop: v || 0 })}
                  />
                </td>
                <td className={styles.muted}>por moto-diária trabalhada</td>
              </tr>
            </tbody>
          </table>
          <p className={styles.muted}>
            {canEditTaxas
              ? 'Alterações valem para a semana aberta e viram padrão das próximas.'
              : 'Somente visualização.'}
          </p>
        </section>
      )}

      {/* ================= CADASTRO (seção do submenu) ================= */}
      {secaoEfetiva === 'cadastro' && canRoster && (
        <section className={styles.inlinePanel}>
          {rosterArquivados.length > 0 && (
            <div className={styles.inlinePanelActions}>
              <button className={styles.primaryBtn} onClick={() => setShowArquivados((v) => !v)}>
                <svg className={styles.btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
                Arquivados
              </button>
            </div>
          )}

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
      )}
    </div>
  );
}
