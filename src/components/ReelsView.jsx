import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ReelsView.module.css';

export default function ReelsView({ reels, addReel, approveReel, archiveReel, unarchiveReel, deleteReel, updateDescription }) {
  const { user, isAdmin } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showStories, setShowStories] = useState(false);
  const [text, setText] = useState('');
  const [itemType, setItemType] = useState(null);
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

  const parseReelInput = (raw) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = [...raw.matchAll(urlRegex)];
    if (matches.length === 0) return [];
    const entries = [];
    for (let i = 0; i < matches.length; i++) {
      const link = matches[i][0];
      const start = matches[i].index + link.length;
      const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
      const description = raw.slice(start, end).replace(/^[\s\-–—:|]+/, '').trim();
      entries.push({ link, description });
    }
    return entries;
  };

  const parseStoryInput = (raw) => {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          const link = urlMatch[0];
          const description = line.replace(link, '').replace(/^[\s\-–—:|]+/, '').trim();
          return { link, description };
        }
        return { link: '', description: line };
      });
  };

  const getEntries = () => {
    if (!itemType || !text.trim()) return [];
    return itemType === 'reel' ? parseReelInput(text) : parseStoryInput(text);
  };

  const canSubmit = () => {
    if (!itemType || !text.trim()) return false;
    const entries = getEntries();
    if (entries.length === 0) return false;
    if (itemType === 'reel') return entries.every((e) => e.link);
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit()) return;
    const entries = getEntries();
    for (const { link, description } of entries) {
      await addReel(link, description, user, itemType);
    }
    setText('');
    setItemType(null);
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
          <h2>📱 Instagram — Arquivados</h2>
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
        <h2>📱 Instagram</h2>
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
            placeholder={itemType === 'story'
              ? 'Um story por linha (link e/ou texto)...'
              : 'Cole links dos reels (um por linha, descrição opcional após \'-\')...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className={styles.formFooter}>
            <label className={styles.checkOption}>
              <input
                type="checkbox"
                checked={itemType === 'reel'}
                onChange={() => setItemType(itemType === 'reel' ? null : 'reel')}
              />
              Reel
            </label>
            <label className={styles.checkOption}>
              <input
                type="checkbox"
                checked={itemType === 'story'}
                onChange={() => setItemType(itemType === 'story' ? null : 'story')}
              />
              Story
            </label>
            <button type="submit" className={styles.submitBtn} disabled={!canSubmit()}>
              Enviar ({getEntries().length})
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
