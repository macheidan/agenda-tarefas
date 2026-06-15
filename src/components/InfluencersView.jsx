import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import InfluencersModal from './InfluencersModal';
import styles from '../styles/InfluencersView.module.css';

const MONTHS_ORDER = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MONTH_INDEX = MONTHS_ORDER.reduce((acc, m, i) => ({ ...acc, [m]: i + 1 }), {});

// Converte (ano, mes) num inteiro YYYYMM pra ordenação. Sem mês = 0 (vai pro fim em desc).
const monthKey = (it) => {
  const m = MONTH_INDEX[it.mes];
  if (!m) return 0;
  const y = Number(it.ano) || new Date().getFullYear();
  return y * 100 + m;
};

// "13,5K" / "147k" / "1,2M" → número
const parseAlcance = (s) => {
  if (!s) return -1;
  const clean = String(s).trim().replace(/\./g, '').replace(',', '.').toLowerCase();
  const m = clean.match(/^([\d.]+)\s*([km]?)/);
  if (!m) return -1;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return -1;
  if (m[2] === 'k') return n * 1000;
  if (m[2] === 'm') return n * 1_000_000;
  return n;
};

// "0,41%" → 0.0041
const parsePct = (s) => {
  if (!s) return -1;
  const clean = String(s).trim().replace('%', '').replace(',', '.');
  const n = parseFloat(clean);
  return Number.isNaN(n) ? -1 : n;
};

const DIVULGOU_LABEL = { lov: 'LOV', dame: 'DAME', ambas: 'AMBAS', '': '—' };
const DIVULGOU_RANK = { ambas: 3, lov: 2, dame: 2, '': 0 };

// Define como cada coluna é comparada
const SORT_KEYS = {
  mes: (it) => monthKey(it),
  nome: (it) => (it.nome || '').toLowerCase(),
  alcance: (it) => parseAlcance(it.alcance),
  txEngaj: (it) => parsePct(it.txEngaj),
  segmento: (it) => (it.segmento || '').toLowerCase(),
  contatado: (it) => (it.contatado ? 1 : 0),
  retornou: (it) => (it.retornou ? 1 : 0),
  divulgouEm: (it) => DIVULGOU_RANK[it.divulgouEm || ''] ?? 0,
};
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
}) {
  const { user, isAdmin } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const [filterMes, setFilterMes] = useState('all');
  const [filterDivulgou, setFilterDivulgou] = useState('all');
  const [search, setSearch] = useState('');
  // Default: mês atual no topo, mais antigo embaixo (desc)
  const [sort, setSort] = useState({ col: 'mes', dir: 'desc' });

  const toggleSort = (col) => {
    setSort((prev) => {
      if (prev.col !== col) {
        // Numéricos / mês começam em desc (mais alto/recente primeiro);
        // texto começa em asc.
        const numericCols = ['mes', 'alcance', 'txEngaj', 'contatado', 'retornou', 'divulgouEm'];
        return { col, dir: numericCols.includes(col) ? 'desc' : 'asc' };
      }
      return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  const sortIndicator = (col) => {
    if (sort.col !== col) return null;
    return <span className={styles.sortArrow}>{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const handleArchive = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`Arquivar ${item.nome}?`)) return;
    await archiveInfluencer(item.id);
  };

  const handleUnarchive = async (e, item) => {
    e.stopPropagation();
    await unarchiveInfluencer(item.id);
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
    const list = activeList.filter((it) => {
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

    const accessor = SORT_KEYS[sort.col] || SORT_KEYS.mes;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      // Desempate: nome asc, sempre
      const an = (a.nome || '').toLowerCase();
      const bn = (b.nome || '').toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });
  }, [activeList, filterMes, filterDivulgou, search, sort]);

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
                <th className={styles.thSort} onClick={() => toggleSort('mes')}>Mês{sortIndicator('mes')}</th>
                <th className={styles.thSort} onClick={() => toggleSort('nome')}>Nome{sortIndicator('nome')}</th>
                <th>Contatos</th>
                <th className={styles.thSort} onClick={() => toggleSort('alcance')}>Alcance{sortIndicator('alcance')}</th>
                <th className={styles.thSort} onClick={() => toggleSort('txEngaj')}>Eng.{sortIndicator('txEngaj')}</th>
                <th className={styles.thSort} onClick={() => toggleSort('segmento')}>Segmento{sortIndicator('segmento')}</th>
                <th className={`${styles.colCenter} ${styles.thSort}`} onClick={() => toggleSort('contatado')}>Cont.{sortIndicator('contatado')}</th>
                <th className={`${styles.colCenter} ${styles.thSort}`} onClick={() => toggleSort('retornou')}>Ret.{sortIndicator('retornou')}</th>
                <th className={styles.thSort} onClick={() => toggleSort('divulgouEm')}>Divulgou{sortIndicator('divulgouEm')}</th>
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
                    <td className={styles.cellNum} data-label="Alcance">{it.alcance || '—'}</td>
                    <td className={styles.cellNum} data-label="Eng.">{it.txEngaj || '—'}</td>
                    <td className={styles.cellSeg} data-label="Seg.">{it.segmento || '—'}</td>
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
