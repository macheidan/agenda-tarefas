import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import RichTextEditor from './RichTextEditor';
import styles from '../styles/IdeasView.module.css';

export default function ReviewsView({ reviews, addReview, addComment, deleteComment, deleteReview, markAsRead, users, allSettings }) {
  const { user, isAdmin } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [expandedReview, setExpandedReview] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [filterUid, setFilterUid] = useState('all');

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    addReview(newTitle, newDescription, user);
    setNewTitle('');
    setNewDescription('');
    setShowForm(false);
  };

  const handleComment = (reviewId, comments) => {
    if (!commentText.trim() && commentText !== '<p></p>') return;
    addComment(reviewId, comments, commentText, user, null);
    setCommentText('');
  };

  const handleReply = (reviewId, comments, parentIdx) => {
    if (!replyText.trim() && replyText !== '<p></p>') return;
    addComment(reviewId, comments, replyText, user, parentIdx);
    setReplyText('');
    setReplyTo(null);
  };

  const handleExpand = (reviewId) => {
    const isExpanding = expandedReview !== reviewId;
    setExpandedReview(isExpanding ? reviewId : null);
    if (isExpanding) markAsRead(reviewId);
  };

  const formatDate = (ts) => {
    if (!ts?.toDate) return '';
    return ts.toDate().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getUserName = (uid) => {
    if (!users) return '';
    const s = allSettings?.[uid];
    if (s?.customName) return s.customName;
    const u = users.find((u) => u.uid === uid);
    return u?.displayName || u?.email || '';
  };

  const getTopLevelComments = (comments) =>
    comments.map((c, i) => ({ ...c, _index: i })).filter((c) => c.parentIndex === null || c.parentIndex === undefined);

  const getReplies = (comments, parentIdx) =>
    comments.map((c, i) => ({ ...c, _index: i })).filter((c) => c.parentIndex === parentIdx);

  const filtered = isAdmin && filterUid !== 'all'
    ? reviews.filter((r) => r.targetUid === filterUid)
    : reviews;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Avaliações</h2>
        <button className={styles.newBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nova Avaliação'}
        </button>
      </div>

      {isAdmin && users && (
        <div style={{ marginBottom: 16 }}>
          <select
            value={filterUid}
            onChange={(e) => setFilterUid(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid var(--input-border)',
              fontSize: 13, background: 'var(--input-bg)', color: 'var(--text)', cursor: 'pointer',
            }}
          >
            <option value="all">Todos</option>
            {[user, ...users.filter((u) => u.uid !== user.uid)].map((u) => (
              <option key={u.uid} value={u.uid}>
                {allSettings?.[u.uid]?.customName || u.displayName || u.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {showForm && (
        <div className={styles.form}>
          <input
            className={styles.titleInput}
            type="text"
            placeholder="Título da avaliação"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <RichTextEditor value={newDescription} onChange={setNewDescription} placeholder="Descreva a avaliação..." resizable />
          <button className={styles.submitBtn} onClick={handleCreate}>Publicar Avaliação</button>
        </div>
      )}

      {filtered.length === 0 && !showForm && (
        <div className={styles.empty}>
          <p>Nenhuma avaliação publicada ainda.</p>
        </div>
      )}

      <div className={styles.list}>
        {filtered.map((review) => {
          const isExpanded = expandedReview === review.id;
          const topComments = getTopLevelComments(review.comments || []);
          const isUnread = !review.readBy?.includes(user.uid);

          return (
            <div key={review.id} className={`${styles.card} ${isUnread ? styles.cardUnread : ''}`}>
              <div className={styles.cardHeader} onClick={() => handleExpand(review.id)}>
                <div className={styles.authorRow}>
                  <img className={styles.authorAvatar} src={review.authorPhoto || 'https://via.placeholder.com/32'} alt={review.authorName} />
                  <div>
                    <span className={styles.authorName}>{review.authorName}</span>
                    <span className={styles.date}>{formatDate(review.createdAt)}</span>
                  </div>
                  {isUnread && <span className={styles.unreadDot} />}
                </div>
                <div className={styles.cardTitleRow}>
                  <h3 className={styles.cardTitle}>
                    {isAdmin && review.targetUid && (
                      <span style={{ color: '#ff9800', fontWeight: 600, fontSize: 12, marginRight: 8 }}>
                        {getUserName(review.targetUid)}
                      </span>
                    )}
                    {review.title}
                  </h3>
                  <span className={styles.commentCount}>
                    {(review.comments || []).length} comentário{(review.comments || []).length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className={styles.cardBody}>
                  {review.description && (
                    <div className={styles.description} dangerouslySetInnerHTML={{ __html: review.description }} />
                  )}

                  {isAdmin && (
                    <button className={styles.deleteBtn} onClick={() => {
                      if (window.confirm('Excluir esta avaliação?')) { deleteReview(review.id); setExpandedReview(null); }
                    }}>
                      Excluir avaliação
                    </button>
                  )}

                  <div className={styles.comments}>
                    <h4>Comentários</h4>
                    {topComments.length === 0 && <p className={styles.noComments}>Nenhum comentário ainda.</p>}

                    {topComments.map((comment) => {
                      const replies = getReplies(review.comments || [], comment._index);
                      return (
                        <div key={comment._index} className={styles.commentThread}>
                          <div className={styles.comment}>
                            <img className={styles.commentAvatar} src={comment.authorPhoto || 'https://via.placeholder.com/28'} alt={comment.authorName} />
                            <div className={styles.commentContent}>
                              <div className={styles.commentMeta}>
                                <span className={styles.commentAuthor}>{comment.authorName}</span>
                                <span className={styles.commentDate}>{formatDate(comment.createdAt)}</span>
                                {isAdmin && (
                                  <button className={styles.deleteCommentBtn} onClick={() => {
                                    if (window.confirm('Excluir este comentário?')) deleteComment(review.id, review.comments, comment._index);
                                  }}>✕</button>
                                )}
                              </div>
                              <div className={styles.commentText} dangerouslySetInnerHTML={{ __html: comment.text }} />
                              <button className={styles.replyBtn} onClick={() => setReplyTo(replyTo === `${review.id}-${comment._index}` ? null : `${review.id}-${comment._index}`)}>
                                Responder
                              </button>
                            </div>
                          </div>

                          {replies.map((reply) => (
                            <div key={reply._index} className={`${styles.comment} ${styles.reply}`}>
                              <img className={styles.commentAvatar} src={reply.authorPhoto || 'https://via.placeholder.com/28'} alt={reply.authorName} />
                              <div className={styles.commentContent}>
                                <div className={styles.commentMeta}>
                                  <span className={styles.commentAuthor}>{reply.authorName}</span>
                                  <span className={styles.commentDate}>{formatDate(reply.createdAt)}</span>
                                  {isAdmin && (
                                    <button className={styles.deleteCommentBtn} onClick={() => {
                                      if (window.confirm('Excluir esta resposta?')) deleteComment(review.id, review.comments, reply._index);
                                    }}>✕</button>
                                  )}
                                </div>
                                <div className={styles.commentText} dangerouslySetInnerHTML={{ __html: reply.text }} />
                              </div>
                            </div>
                          ))}

                          {replyTo === `${review.id}-${comment._index}` && (
                            <div className={styles.replyForm}>
                              <RichTextEditor value={replyText} onChange={setReplyText} placeholder="Escreva sua resposta..." />
                              <button className={styles.submitBtn} onClick={() => handleReply(review.id, review.comments || [], comment._index)}>Responder</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.commentForm}>
                    <RichTextEditor value={commentText} onChange={setCommentText} placeholder="Escreva um comentário..." />
                    <button className={styles.submitBtn} onClick={() => handleComment(review.id, review.comments || [])}>Comentar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
