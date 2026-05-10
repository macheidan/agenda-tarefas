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

const handleHref = (form) => {
  if (!form.contatoValor) return null;
  if (form.contatoTipo === 'insta') {
    const h = form.contatoValor.replace(/^@/, '').trim();
    return h ? `https://instagram.com/${h}` : null;
  }
  if (form.contatoTipo === 'whatsapp' || form.contatoTipo === 'telefone') {
    const num = form.contatoValor.replace(/\D/g, '');
    return num ? `https://wa.me/55${num}` : null;
  }
  if (form.contatoTipo === 'email') return `mailto:${form.contatoValor}`;
  if (form.contatoValor.startsWith('http')) return form.contatoValor;
  return null;
};

export default function InfluencersView({ influencers, addInfluencer, updateInfluencer, deleteInfluencer }) {
  const { user, isAdmin } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [filterMes, setFilterMes] = useState('all');
  const [filterDivulgou, setFilterDivulgou] = useState('all');
  const [search, setSearch] = useState('');

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setModalOpen(true);
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return influencers.filter((it) => {
      if (filterMes !== 'all' && (it.mes || '') !== filterMes) return false;
      if (filterDivulgou === 'pendente' && it.divulgouEm) return false;
      if (filterDivulgou !== 'all' && filterDivulgou !== 'pendente' && it.divulgouEm !== filterDivulgou) return false;
      if (s) {
        const hay = [it.nome, it.handle, it.segmento, it.contatoValor].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [influencers, filterMes, filterDivulgou, search]);

  const counts = useMemo(() => {
    const total = influencers.length;
    const contatados = influencers.filter((i) => i.contatado).length;
    const retornaram = influencers.filter((i) => i.retornou).length;
    const divulgaram = influencers.filter((i) => i.divulgouEm).length;
    return { total, contatados, retornaram, divulgaram };
  }, [influencers]);

  const toggleField = async (item, field) => {
    await updateInfluencer(item.id, { [field]: !item[field] });
  };

  const setDivulgou = async (item, value) => {
    await updateInfluencer(item.id, { divulgouEm: value });
  };

  const monthsAvailable = useMemo(() => {
    const set = new Set(influencers.map((i) => i.mes).filter(Boolean));
    return MONTHS_ORDER.filter((m) => set.has(m));
  }, [influencers]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Influencers</h2>
        <div className={styles.headerActions}>
          <button className={styles.newBtn} onClick={openNew}>+ Novo influencer</button>
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
                <th>@</th>
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
                const href = handleHref(it);
                return (
                  <tr key={it.id} className={it.divulgouEm ? styles.rowDone : ''}>
                    <td><span className={styles.monthBadge}>{it.mes || '—'}</span></td>
                    <td className={styles.cellName}>{it.nome}</td>
                    <td>
                      {href ? (
                        <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          {it.handle || it.contatoValor || 'LINK'}
                        </a>
                      ) : (it.handle || '—')}
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
                      <button className={styles.editBtn} onClick={() => openEdit(it)}>Editar</button>
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
