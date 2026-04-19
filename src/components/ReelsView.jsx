import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ReelsView.module.css';

export default function ReelsView({ reels, addReel, approveReel, archiveReel, unarchiveReel, deleteReel }) {
  const { user, isAdmin } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [text, setText] = useState('');

  const pending = reels.filter((r) => r.status === 'pending' || !r.status);
  const approved = reels.filter((r) => r.status === 'approved');
  const archived = reels.filter((r) => r.status === 'archived');

  const formatDate = (ts) => {
    if (!ts?.seconds) return '';
    const d = new Date(ts.seconds * 1000);
    return d.toLocaleDateString('pt-BR');
  };

  const parseInput = (raw) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = raw.match(urlRegex) || [];
    const link = urls[0] || '';
    const description = raw.replace(urlRegex, '').trim();
    return { link, description };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { link, description } = parseInput(text);
    if (!link) return;
    await addReel(link, description, user);
    setText('');
    setShowForm(false);
  };

  const handleDelete = (reelId) => {
    if (window.confirm('Excluir este reel?')) {
      deleteReel(reelId);
    }
  };

  if (showArchived) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>📱 Reels — Arquivados</h2>
          <button className={styles.newBtn} onClick={() => setShowArchived(false)}>
            ← Voltar
          </button>
        </div>

        {archived.length === 0 ? (
          <div className={styles.empty}>Nenhum reel arquivado.</div>
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
                  </div>
                  <a className={styles.link} href={reel.link} target="_blank" rel="noopener noreferrer">
                    {reel.link}
                  </a>
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>📱 Reels</h2>
        <div className={styles.headerActions}>
          <button className={styles.archivedBtn} onClick={() => setShowArchived(true)}>
            Arquivados ({archived.length})
          </button>
          <button className={styles.newBtn} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancelar' : '+ Novo Reel'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.titleInput}
            type="text"
            placeholder="Cole o link e um comentário (opcional)..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <button type="submit" className={styles.submitBtn} disabled={!parseInput(text).link}>
            Enviar
          </button>
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
                <a className={styles.pendingLink} href={reel.link} target="_blank" rel="noopener noreferrer">
                  {reel.link}
                </a>
                {reel.description && <span className={styles.pendingDesc}>{reel.description}</span>}
                <div className={styles.pendingActions}>
                  {isAdmin && (
                    <>
                      <button className={styles.approveBtn} onClick={() => approveReel(reel.id)} title="Aprovar">
                        ✓
                      </button>
                      <button className={styles.archiveBtn} onClick={() => archiveReel(reel.id)} title="Arquivar">
                        ✗
                      </button>
                    </>
                  )}
                  <button className={styles.deleteBtnSmall} onClick={() => handleDelete(reel.id)} title="Excluir">
                    ×
                  </button>
                </div>
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
                {approved.map((reel) => (
                  <tr key={reel.id}>
                    <td className={styles.cellDate}>{formatDate(reel.createdAt)}</td>
                    <td>{reel.authorName}</td>
                    <td>
                      <a className={styles.link} href={reel.link} target="_blank" rel="noopener noreferrer">
                        {reel.link}
                      </a>
                    </td>
                    <td className={styles.cellDesc}>{reel.description || '—'}</td>
                    <td>
                      <div className={styles.cellActions}>
                        {isAdmin && (
                          <button className={styles.archiveBtnSmall} onClick={() => archiveReel(reel.id)} title="Arquivar">
                            Arquivar
                          </button>
                        )}
                        <button className={styles.deleteBtnSmall} onClick={() => handleDelete(reel.id)} title="Excluir">
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
