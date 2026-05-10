import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import InfluencersModal from './InfluencersModal';
import styles from '../styles/InfluencersView.module.css';

const MONTHS_ORDER = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const DIVULGOU_LABEL = { lov: 'LOV', dame: 'DAME', ambas: 'AMBAS', '': '—' };
const DIVULGOU_CLASS = {
  lov: styles.tagLov,
  dame: styles.tagDame,
  ambas: styles.tagAmbas,
};

const contatoHref = (c) => {
  if (!c?.valor) return null;
  const v = c.valor.trim();
  if (c.tipo === 'insta') {
    const h = v.replace(/^@/, '').trim();
    return h ? `https://instagram.com/${h}` : null;
  }
  if (c.tipo === 'whatsapp' || c.tipo === 'telefone') {
    const num = v.replace(/\D/g, '');
    return num ? `https://wa.me/55${num}` : null;
  }
  if (c.tipo === 'email') return `mailto:${v}`;
  if (v.startsWith('http')) return v;
  return null;
};

const TIPO_LABEL = { insta: 'IG', whatsapp: 'WA', email: 'E-MAIL', telefone: 'TEL', outro: 'LINK' };

// Devolve a lista normalizada de contatos (com fallback pro formato singular antigo)
const getContatos = (it) => {
  if (Array.isArray(it.contatos) && it.contatos.length) return it.contatos;
  if (it.contatoValor || it.contatoTipo) {
    return [{ tipo: it.contatoTipo || 'insta', valor: it.contatoValor || '' }];
  }
  return [];
};

export default function InfluencersView({
  influencers,
  addInfluencer,
  updateInfluencer,
  deleteInfluencer,
  archiveInfluencer,
  unarchiveInfluencer,
  bulkUpdateHandles,
}) {
  const { user, isAdmin } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [updatingHandles, setUpdatingHandles] = useState(false);

  const [filterMes, setFilterMes] = useState('all');
  const [filterDivulgou, setFilterDivulgou] = useState('all');
  const [search, setSearch] = useState('');

  const handleArchive = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`Arquivar ${item.nome}?`)) return;
    await archiveInfluencer(item.id);
  };

  const handleUnarchive = async (e, item) => {
    e.stopPropagation();
    await unarchiveInfluencer(item.id);
  };

  const handleUpdateHandles = async () => {
    if (updatingHandles) return;
    if (!window.confirm('Buscar @ handles na planilha e atualizar todos os influencers já cadastrados?')) return;
    try {
      setUpdatingHandles(true);
      const mod = await import('../data/handles-import.json');
      const list = mod.default || mod;
      const { matched, notFound } = await bulkUpdateHandles(list);
      window.alert(`${matched} atualizados.\n${notFound} sem match (provavelmente influencers cadastrados manualmente).`);
    } catch (err) {
      console.error('Update handles error:', err);
      window.alert(`Erro: ${err.message || err}`);
    } finally {
      setUpdatingHandles(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setModalOpen(true);
  };

  const activeList = useMemo(
    () => influencers.filter((i) => (showArchived ? i.archived === true : i.archived !== true)),
    [influencers, showArchived]
  );

  const archivedCount = useMemo(
    () => influencers.filter((i) => i.archived === true).length,
    [influencers]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return activeList.filter((it) => {
      if (filterMes !== 'all' && (it.mes || '') !== filterMes) return false;
      if (filterDivulgou === 'pendente' && it.divulgouEm) return false;
      if (filterDivulgou !== 'all' && filterDivulgou !== 'pendente' && it.divulgouEm !== filterDivulgou) return false;
      if (s) {
        const contatos = getContatos(it).map((c) => c.valor).join(' ');
        const hay = [it.nome, it.handle, it.segmento, contatos].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [activeList, filterMes, filterDivulgou, search]);

  const counts = useMemo(() => {
    const base = influencers.filter((i) => i.archived !== true);
    const total = base.length;
    const contatados = base.filter((i) => i.contatado).length;
    const retornaram = base.filter((i) => i.retornou).length;
    const divulgaram = base.filter((i) => i.divulgouEm).length;
    return { total, contatados, retornaram, divulgaram };
  }, [influencers]);

  const toggleField = async (item, field) => {
    await updateInfluencer(item.id, { [field]: !item[field] });
  };

  const setDivulgou = async (item, value) => {
    await updateInfluencer(item.id, { divulgouEm: value });
  };

  const monthsAvailable = useMemo(() => {
    const set = new Set(activeList.map((i) => i.mes).filter(Boolean));
    return MONTHS_ORDER.filter((m) => set.has(m));
  }, [activeList]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>{showArchived ? 'Influencers — Arquivados' : 'Influencers'}</h2>
        <div className={styles.headerActions}>
          {isAdmin && (
            <button
              className={`${styles.archivedBtn} ${showArchived ? styles.archivedBtnActive : ''}`}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? 'Voltar' : `Arquivados (${archivedCount})`}
            </button>
          )}
          {isAdmin && !showArchived && (
            <button
              className={styles.handlesBtn}
              onClick={handleUpdateHandles}
              disabled={updatingHandles}
              title="Importa @ handles da planilha pros influencers já cadastrados"
            >
              {updatingHandles ? 'Atualizando…' : '@ Atualizar handles'}
            </button>
          )}
          {!showArchived && (
            <button className={styles.newBtn} onClick={openNew}>+ Novo influencer</button>
          )}
        </div>
      </div>

      <div className={styles.stats}>
        <span><strong>{counts.total}</strong> total</span>
        <span><strong>{counts.contatados}</strong> contatados</span>
        <span><strong>{counts.retornaram}</strong> retornaram</span>
        <span><strong>{counts.divulgaram}</strong> divulgaram</span>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Buscar por nome, @, segmento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={filterMes}
          onChange={(e) => setFilterMes(e.target.value)}
        >
          <option value="all">Todos os meses</option>
          {monthsAvailable.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={filterDivulgou}
          onChange={(e) => setFilterDivulgou(e.target.value)}
        >
          <option value="all">Todos</option>
          <option value="pendente">Pendentes</option>
          <option value="lov">Divulgou LOV</option>
          <option value="dame">Divulgou DAME</option>
          <option value="ambas">Divulgou Ambas</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {influencers.length === 0
            ? 'Nenhum influencer cadastrado. Clique em + Novo influencer.'
            : 'Nenhum resultado para os filtros atuais.'}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Nome</th>
                <th>Contatos</th>
                <th>Alcance</th>
                <th>Eng.</th>
                <th>Segmento</th>
                <th className={styles.colCenter}>Cont.</th>
                <th className={styles.colCenter}>Ret.</th>
                <th>Divulgou</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const contatos = getContatos(it);
                return (
                  <tr key={it.id} className={it.divulgouEm ? styles.rowDone : ''}>
                    <td><span className={styles.monthBadge}>{it.mes || '—'}</span></td>
                    <td className={styles.cellName}>{it.nome}</td>
                    <td>
                      {contatos.length === 0 && '—'}
                      {contatos.length > 0 && (
                        <div className={styles.contatosCell}>
                          {contatos.map((c, idx) => {
                            const href = contatoHref(c);
                            const label = TIPO_LABEL[c.tipo] || 'LINK';
                            return href ? (
                              <a
                                key={idx}
                                className={styles.link}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={c.valor}
                              >
                                {label}
                              </a>
                            ) : (
                              <span key={idx} className={styles.linkInactive} title={c.valor}>{label}</span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className={styles.cellNum}>{it.alcance || '—'}</td>
                    <td className={styles.cellNum}>{it.txEngaj || '—'}</td>
                    <td className={styles.cellSeg}>{it.segmento || '—'}</td>
                    <td className={styles.colCenter}>
                      <input
                        type="checkbox"
                        className={styles.check}
                        checked={!!it.contatado}
                        onChange={(e) => { e.stopPropagation(); toggleField(it, 'contatado'); }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Contatado"
                      />
                    </td>
                    <td className={styles.colCenter}>
                      <input
                        type="checkbox"
                        className={styles.check}
                        checked={!!it.retornou}
                        onChange={(e) => { e.stopPropagation(); toggleField(it, 'retornou'); }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Retornou"
                      />
                    </td>
                    <td>
                      <select
                        className={`${styles.divulgouSelect} ${DIVULGOU_CLASS[it.divulgouEm] || ''}`}
                        value={it.divulgouEm || ''}
                        onChange={(e) => { e.stopPropagation(); setDivulgou(it, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="">—</option>
                        <option value="lov">LOV</option>
                        <option value="dame">DAME</option>
                        <option value="ambas">AMBAS</option>
                      </select>
                    </td>
                    <td>
                      <div className={styles.cellActions}>
                        <button className={styles.editBtn} onClick={() => openEdit(it)}>Editar</button>
                        {showArchived ? (
                          <button
                            className={styles.archiveBtn}
                            onClick={(e) => handleUnarchive(e, it)}
                          >
                            ↩ Restaurar
                          </button>
                        ) : (
                          <button
                            className={styles.archiveBtn}
                            onClick={(e) => handleArchive(e, it)}
                          >
                            Arquivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <InfluencersModal
          influencer={editing}
          onSave={(data) => addInfluencer(data, user)}
          onUpdate={updateInfluencer}
          onDelete={deleteInfluencer}
          onClose={() => setModalOpen(false)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
