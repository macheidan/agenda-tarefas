import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ReelsView.module.css';

export default function ReelsView({ reels, addReel, approveReel, archiveReel, unarchiveReel, deleteReel, updateDescription }) {
  const { user, isAdmin } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showStories, setShowStories] = useState(false);
  const [text, setText] = useState('');
  const [itemType, setItemType] = useState('reel');
  const [editingId, setEditingId] = useState(null);
  const [editDescText, setEditDescText] = useState('');

  const startEditDesc = (reel) => {
    setEditingId(reel.id);
    setEditDescText(reel.description || '');
  };

  const saveEditDesc = async (reelId) => {
    await updateDescription(reelId, editDescText);
    setEditingId(null);
    setEditDescText('');
  };

  const cancelEditDesc = () => {
    setEditingId(null);
    setEditDescText('');
  };

  const pending = reels.filter((r) => (r.status === 'pending' || !r.status) && (r.type || 'reel') === 'reel');
  const approved = reels.filter((r) => r.status === 'approved' && (r.type || 'reel') === 'reel');
  const archived = reels.filter((r) => r.status === 'archived');

  const pendingStories = reels.filter((r) => (r.status === 'pending' || !r.status) && r.type === 'story');
  const approvedStories = reels.filter((r) => r.status === 'approved' && r.type === 'story');

  const formatDate = (ts) => {
    if (!ts?.seconds) return '';
    const d = new Date(ts.seconds * 1000);
    return d.toLocaleDateString('pt-BR');
  };

  const parseInput = (raw) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = [...raw.matchAll(urlRegex)];
    if (matches.length === 0) {
      const trimmed = raw.trim();
      if (!trimmed) return [];
      return [{ link: '', description: trimmed }];
    }
    const entries = [];
    const beforeFirst = raw.slice(0, matches[0].index).replace(/^[\s\-–—:|]+/, '').trim();
    if (beforeFirst) {
      entries.push({ link: '', description: beforeFirst });
    }
    for (let i = 0; i < matches.length; i++) {
      const link = matches[i][0];
      const start = matches[i].index + link.length;
      const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
      const description = raw.slice(start, end).replace(/^[\s\-–—:|]+/, '').trim();
      entries.push({ link, description });
    }
    return entries;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const entries = parseInput(text);
    if (entries.length === 0) return;
    for (const { link, description } of entries) {
      await addReel(link, description, user, itemType);
    }
    setText('');
    setShowForm(false);
  };

  const handleDelete = (reelId) => {
    if (window.confirm('Excluir este item?')) {
      deleteReel(reelId);
    }
  };

  const renderTable = (items) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Data</th>
            <th>Autor</th>
            <th>Link</th>
            <th>Descrição</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((reel) => (
            <tr key={reel.id}>
              <td className={styles.cellDate}>{formatDate(reel.createdAt)}</td>
              <td>{reel.authorName}</td>
              <td>
                {reel.link ? (
                  <a className={styles.link} href={reel.link} target="_blank" rel="noopener noreferrer">
                    {reel.link}
                  </a>
                ) : '—'}
              </td>
              <td className={styles.cellDesc}>
                {editingId === reel.id ? (
                  <textarea
                    className={styles.descEdit}
                    value={editDescText}
                    onChange={(e) => setEditDescText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEditDesc(reel.id);
                      if (e.key === 'Escape') cancelEditDesc();
                    }}
                    rows={2}
                    autoFocus
                  />
                ) : (
                  <span
                    className={`${isAdmin ? styles.descClickable : ''} ${reel.descriptionEdited ? styles.descEdited : ''}`}
                    onClick={() => isAdmin && startEditDesc(reel)}
                    title={isAdmin ? 'Clique para editar' : ''}
                  >
                    {reel.description || '—'}
                  </span>
                )}
              </td>
              <td>
                {isAdmin && (
                  <div className={styles.cellActions}>
                    {editingId === reel.id ? (
                      <>
                        <button className={styles.saveBtn} onClick={() => saveEditDesc(reel.id)} title="Salvar">
                          Salvar
                        </button>
                        <button className={styles.archiveBtnSmall} onClick={cancelEditDesc} title="Cancelar">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button className={styles.archiveBtnSmall} onClick={() => archiveReel(reel.id)} title="Arquivar">
                        Arquivar
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Archived sub-view
  if (showArchived) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>📱 Reels / Stories — Arquivados</h2>
          <button className={styles.newBtn} onClick={() => setShowArchived(false)}>
            ← Voltar
          </button>
        </div>

        {archived.length === 0 ? (
          <div className={styles.empty}>Nenhum item arquivado.</div>
        ) : (
          <div className={styles.list}>
            {archived.map((reel) => (
              <div key={reel.id} className={styles.card}>
                <div className={styles.cardMain}>
                  <div className={styles.authorRow}>
                    {reel.authorPhoto && (
                      <img className={styles.authorAvatar} src={reel.authorPhoto} alt={reel.authorName} />
                    )}
                    <div className={styles.authorInfo}>
                      <span className={styles.authorName}>{reel.authorName}</span>
                      <span className={styles.date}>{formatDate(reel.createdAt)}</span>
                    </div>
                    <span className={reel.type === 'story' ? styles.typeBadgeStory : styles.typeBadgeReel}>
                      {reel.type === 'story' ? 'Story' : 'Reel'}
                    </span>
                  </div>
                  {reel.link && (
                    <a className={styles.link} href={reel.link} target="_blank" rel="noopener noreferrer">
                      {reel.link}
                    </a>
                  )}
                  {reel.description && <p className={styles.description}>{reel.description}</p>}
                </div>
                <div className={styles.cardActions}>
                  {isAdmin && (
                    <button className={styles.unarchiveBtn} onClick={() => unarchiveReel(reel.id)} title="Restaurar">
                      ↩ Restaurar
                    </button>
                  )}
                  <button className={styles.deleteBtn} onClick={() => handleDelete(reel.id)} title="Excluir">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Stories sub-view
  if (showStories) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>📱 Stories</h2>
          <button className={styles.newBtn} onClick={() => setShowStories(false)}>
            ← Voltar
          </button>
        </div>

        {pendingStories.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Pendentes ({pendingStories.length})</h3>
            <div className={styles.pendingList}>
              {pendingStories.map((reel) => (
                <div key={reel.id} className={styles.pendingRow}>
                  <span className={styles.pendingDate}>{formatDate(reel.createdAt)}</span>
                  <span className={styles.pendingAuthor}>{reel.authorName}</span>
                  {reel.link && (
                    <a className={styles.pendingLink} href={reel.link} target="_blank" rel="noopener noreferrer">
                      {reel.link}
                    </a>
                  )}
                  {reel.description && <span className={styles.pendingDesc}>{reel.description}</span>}
                  {isAdmin && (
                    <div className={styles.pendingActions}>
                      <button className={styles.approveBtn} onClick={() => approveReel(reel.id)} title="Aprovar">
                        ✓
                      </button>
                      <button className={styles.archiveBtn} onClick={() => archiveReel(reel.id)} title="Arquivar">
                        ✗
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Aprovados ({approvedStories.length})</h3>
          {approvedStories.length === 0 ? (
            <div className={styles.empty}>Nenhum story aprovado.</div>
          ) : (
            renderTable(approvedStories)
          )}
        </div>
      </div>
    );
  }

  // Main view
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>📱 Reels / Stories</h2>
        <div className={styles.headerActions}>
          <button className={styles.storyBtn} onClick={() => setShowStories(true)}>
            Stories ({approvedStories.length + pendingStories.length})
          </button>
          <button className={styles.archivedBtn} onClick={() => setShowArchived(true)}>
            Arquivados ({archived.length})
          </button>
          <button className={styles.newBtn} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancelar' : '+ Novo'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            className={styles.titleInput}
            placeholder="Cole links e/ou texto (um por linha, descrição opcional após '-')..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className={styles.formFooter}>
            <div className={styles.typeSelector}>
              <label className={`${styles.typeOption} ${itemType === 'reel' ? styles.typeOptionActiveReel : ''}`}>
                <input
                  type="radio"
                  name="itemType"
                  value="reel"
                  checked={itemType === 'reel'}
                  onChange={() => setItemType('reel')}
                  hidden
                />
                Reel
              </label>
              <label className={`${styles.typeOption} ${itemType === 'story' ? styles.typeOptionActiveStory : ''}`}>
                <input
                  type="radio"
                  name="itemType"
                  value="story"
                  checked={itemType === 'story'}
                  onChange={() => setItemType('story')}
                  hidden
                />
                Story
              </label>
            </div>
            <button type="submit" className={styles.submitBtn} disabled={!text.trim()}>
              Enviar ({parseInput(text).length || 0})
            </button>
          </div>
        </form>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Pendentes ({pending.length})</h3>
        {pending.length === 0 ? (
          <div className={styles.empty}>Nenhum reel pendente.</div>
        ) : (
          <div className={styles.pendingList}>
            {pending.map((reel) => (
              <div key={reel.id} className={styles.pendingRow}>
                <span className={styles.pendingDate}>{formatDate(reel.createdAt)}</span>
                <span className={styles.pendingAuthor}>{reel.authorName}</span>
                {reel.link && (
                  <a className={styles.pendingLink} href={reel.link} target="_blank" rel="noopener noreferrer">
                    {reel.link}
                  </a>
                )}
                {reel.description && <span className={styles.pendingDesc}>{reel.description}</span>}
                {isAdmin && (
                  <div className={styles.pendingActions}>
                    <button className={styles.approveBtn} onClick={() => approveReel(reel.id)} title="Aprovar">
                      ✓
                    </button>
                    <button className={styles.archiveBtn} onClick={() => archiveReel(reel.id)} title="Arquivar">
                      ✗
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Aprovados ({approved.length})</h3>
        {approved.length === 0 ? (
          <div className={styles.empty}>Nenhum reel aprovado.</div>
        ) : (
          renderTable(approved)
        )}
      </div>
    </div>
  );
}
