import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAllCheckpoints } from '../hooks/useCheckpoints';
import CheckpointModal from './CheckpointModal';
import {
  ESCOPO_CORES, ESCOPO_LABELS, ESCOPO_OPTIONS, TIPO_LABELS, formatAnoMesLong,
} from '../lib/gestao';
import styles from '../styles/GestaoNotasView.module.css';

// Anotações (Gestão): marcos de negócio por mês — mudança de preço, campanha,
// evento externo — com escopo Dáme/Lov/Ambas. Viram dot + tooltip nos gráficos
// da Mesa do Dono e de Vendas. Calendário anual em 12 mini-meses + lista.
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function GestaoNotasView() {
  const { user } = useAuth();
  const { checkpoints, loading, addCheckpoint, updateCheckpoint, deleteCheckpoint } = useAllCheckpoints();
  const [editing, setEditing] = useState(null); // null | 'new' | checkpoint
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [filtroMes, setFiltroMes] = useState(null); // null | 0-11

  const anosDisponiveis = useMemo(() => {
    const anos = new Set([new Date().getFullYear()]);
    for (const c of checkpoints) anos.add(Number(c.ano_mes.slice(0, 4)));
    return [...anos].sort();
  }, [checkpoints]);

  const notasDoAno = useMemo(
    () => checkpoints.filter((c) => c.ano_mes.startsWith(`${ano}-`)),
    [checkpoints, ano]
  );

  const notasFiltradas = useMemo(() => {
    if (filtroMes === null) return notasDoAno;
    const anoMes = `${ano}-${String(filtroMes + 1).padStart(2, '0')}`;
    return notasDoAno.filter((c) => c.ano_mes === anoMes);
  }, [notasDoAno, filtroMes, ano]);

  const handleSave = async (payload) => {
    if (editing === 'new') await addCheckpoint(payload, user.uid);
    else await updateCheckpoint(editing.id, payload);
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Excluir "${c.titulo}"?`)) return;
    await deleteCheckpoint(c.id);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Anotações</h2>
        <div className={styles.headerActions}>
          <button type="button" className={styles.novaBtn} onClick={() => setEditing('new')}>
            + Nova anotação
          </button>
        </div>
      </div>
      <p className={styles.subtitle}>
        Marcos por mês com escopo (Dáme, Lov ou ambas). Aparecem como 📌 nos gráficos da Mesa do Dono e de Vendas.
      </p>

      {loading ? (
        <div className={styles.loading}>Carregando…</div>
      ) : (
        <>
          <CalendarioAnual
            ano={ano}
            anosDisponiveis={anosDisponiveis}
            onAnoChange={(a) => { setAno(a); setFiltroMes(null); }}
            notas={notasDoAno}
            filtroMes={filtroMes}
            onFiltroChange={setFiltroMes}
            onEdit={setEditing}
          />

          <div className={styles.listaHeader}>
            <span>
              {filtroMes !== null ? `Anotações — ${MESES[filtroMes]} de ${ano}` : `Anotações de ${ano}`}
              {' '}({notasFiltradas.length})
            </span>
            {filtroMes !== null && (
              <button type="button" className={styles.limparBtn} onClick={() => setFiltroMes(null)}>
                Limpar filtro
              </button>
            )}
          </div>

          {notasFiltradas.length === 0 ? (
            <div className={styles.loading}>
              {filtroMes !== null ? 'Nenhuma anotação nesse período.' : `Sem anotações em ${ano}. Cria uma pra marcar eventos importantes (ex: "Maio/24 — Enchente RS").`}
            </div>
          ) : (
            <div className={styles.lista}>
              {notasFiltradas.map((c) => (
                <div key={c.id} className={styles.nota}>
                  <div className={styles.notaMain}>
                    <div className={styles.notaMeta}>
                      <span>{c.data ? c.data.split('-').reverse().join('/') : formatAnoMesLong(c.ano_mes)}</span>
                      <span
                        className={styles.badge}
                        style={{ background: `${ESCOPO_CORES[c.escopo]}20`, color: ESCOPO_CORES[c.escopo] }}
                      >
                        {ESCOPO_LABELS[c.escopo]}
                      </span>
                      {c.tipo && <span className={`${styles.badge} ${styles.badgeTipo}`}>{TIPO_LABELS[c.tipo]}</span>}
                    </div>
                    <div className={styles.notaTitulo}>{c.titulo}</div>
                    {c.descricao && <p className={styles.notaDesc}>{c.descricao}</p>}
                  </div>
                  <div className={styles.notaAcoes}>
                    <button type="button" className={styles.acaoBtn} title="Editar" onClick={() => setEditing(c)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`${styles.acaoBtn} ${styles.acaoBtnDanger}`}
                      title="Excluir"
                      onClick={() => handleDelete(c)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing !== null && (
        <CheckpointModal
          checkpoint={editing === 'new' ? null : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CalendarioAnual({ ano, anosDisponiveis, onAnoChange, notas, filtroMes, onFiltroChange, onEdit }) {
  const minAno = anosDisponiveis[0];
  const maxAno = anosDisponiveis[anosDisponiveis.length - 1];

  // Notas com data exata indexadas por "mes-dia"; todas indexadas por mês (0-11).
  const { porDia, porMes } = useMemo(() => {
    const porDia = new Map();
    const porMes = new Map();
    for (const c of notas) {
      const mes = Number(c.ano_mes.slice(5, 7)) - 1;
      if (!porMes.has(mes)) porMes.set(mes, []);
      porMes.get(mes).push(c);
      if (c.data) {
        const dia = Number(c.data.slice(8, 10));
        const key = `${mes}-${dia}`;
        if (!porDia.has(key)) porDia.set(key, []);
        porDia.get(key).push(c);
      }
    }
    return { porDia, porMes };
  }, [notas]);

  const hoje = new Date();

  return (
    <div className={styles.calendario}>
      <div className={styles.anoNav}>
        <button
          type="button"
          className={styles.acaoBtn}
          disabled={ano <= minAno}
          onClick={() => onAnoChange(ano - 1)}
          aria-label="Ano anterior"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className={styles.anoLabel}>{ano}</span>
        <button
          type="button"
          className={styles.acaoBtn}
          disabled={ano >= maxAno}
          onClick={() => onAnoChange(ano + 1)}
          aria-label="Próximo ano"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>

      <div className={styles.meses}>
        {MESES.map((nomeMes, mes) => {
          const notasDoMes = porMes.get(mes) ?? [];
          const selecionado = filtroMes === mes;
          const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
          const totalDias = new Date(ano, mes + 1, 0).getDate();

          return (
            <div key={mes} className={styles.mes}>
              <button
                type="button"
                className={`${styles.mesBtn} ${selecionado ? styles.mesBtnActive : ''}`}
                onClick={() => onFiltroChange(selecionado ? null : mes)}
              >
                <span>{nomeMes}</span>
                {notasDoMes.length > 0 && <span className={styles.mesCount}>{notasDoMes.length}</span>}
              </button>

              <div className={styles.diasGrid}>
                {DIAS_SEMANA.map((d, i) => <span key={i} className={styles.dow}>{d}</span>)}
                {Array.from({ length: primeiroDiaSemana }).map((_, i) => <span key={`v-${i}`} />)}
                {Array.from({ length: totalDias }).map((_, i) => {
                  const dia = i + 1;
                  const notasDoDia = porDia.get(`${mes}-${dia}`) ?? [];
                  const temNota = notasDoDia.length > 0;
                  const ehHoje = ano === hoje.getFullYear() && mes === hoje.getMonth() && dia === hoje.getDate();
                  const corNota = temNota ? ESCOPO_CORES[notasDoDia[0].escopo] : undefined;

                  return (
                    <div key={dia} className={styles.diaWrap}>
                      <button
                        type="button"
                        disabled={!temNota}
                        onClick={() => temNota && onEdit(notasDoDia[0])}
                        className={`${styles.dia} ${temNota ? styles.diaNota : ''} ${ehHoje && !temNota ? styles.diaHoje : ''}`}
                        style={corNota ? { background: corNota } : undefined}
                      >
                        {dia}
                      </button>

                      {temNota && (
                        <div className={styles.popover}>
                          {notasDoDia.map((n) => (
                            <button key={n.id} type="button" className={styles.popItem} onClick={() => onEdit(n)}>
                              <span className={styles.popTitulo}>
                                <span className={styles.legendaDot} style={{ background: ESCOPO_CORES[n.escopo] }} />
                                {n.titulo}
                              </span>
                              <div className={styles.popMeta}>
                                {ESCOPO_LABELS[n.escopo]}
                                {n.tipo && ` • ${TIPO_LABELS[n.tipo]}`}
                              </div>
                              {n.descricao && <p className={styles.popDesc}>{n.descricao}</p>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.legenda}>
        {ESCOPO_OPTIONS.map((e) => (
          <span key={e} className={styles.legendaItem}>
            <span className={styles.legendaDot} style={{ background: ESCOPO_CORES[e] }} />
            {ESCOPO_LABELS[e]}
          </span>
        ))}
        <span>Dia colorido = anotação com data exata • passe o mouse pra ver, clique pra editar</span>
      </div>
    </div>
  );
}
