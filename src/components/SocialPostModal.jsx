import { useState, useEffect } from 'react';
import RichTextEditor from './RichTextEditor';
import styles from '../styles/TaskModal.module.css';
import postStyles from '../styles/SocialPostModal.module.css';

const NETWORK_OPTIONS = [
  { key: 'instagram', label: 'Instagram', icon: '📷', color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', icon: '📘', color: '#1877F2' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵', color: '#000000' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'scheduled', label: 'Agendado' },
  { value: 'published', label: 'Publicado' },
];

export default function SocialPostModal({ post, initialDate, onSave, onUpdate, onDelete, onClose }) {
  const isEditing = !!post;

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [networks, setNetworks] = useState([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState('scheduled');

  useEffect(() => {
    if (post) {
      setTitle(post.title || '');
      setText(post.text || '');
      setNetworks(post.networks || []);
      setScheduledDate(post.scheduledDate || '');
      setScheduledTime(post.scheduledTime || '');
      setImageUrl(post.imageUrl || '');
      setStatus(post.status || 'scheduled');
    } else if (initialDate) {
      setScheduledDate(initialDate);
    }
  }, [post, initialDate]);

  const toggleNetwork = (key) => {
    setNetworks((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSave = () => {
    if (!title.trim() || !scheduledDate) return;
    const data = {
      title: title.trim(),
      text,
      networks,
      scheduledDate,
      scheduledTime: scheduledTime || null,
      imageUrl: imageUrl.trim() || null,
      status,
    };
    if (isEditing) {
      onUpdate(post.id, data);
    } else {
      onSave(data);
    }
    onClose();
  };

  const handleDelete = () => {
    if (post && window.confirm('Excluir este agendamento?')) {
      onDelete(post.id);
      onClose();
    }
  };

  const hasUnsavedContent = () => {
    if (isEditing) {
      return title !== (post.title || '') || text !== (post.text || '');
    }
    return title.trim() !== '' || (text.trim() !== '' && text !== '<p></p>');
  };

  const handleClose = () => {
    if (hasUnsavedContent()) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const convertDriveUrl = (url) => {
    if (!url) return url;
    const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
    const match2 = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (match2) return `https://drive.google.com/thumbnail?id=${match2[1]}&sz=w1000`;
    return url;
  };

  const previewUrl = convertDriveUrl(imageUrl);

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={handleClose}>
          &times;
        </button>

        <input
          className={styles.titleInput}
          type="text"
          placeholder="Título do post"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className={styles.field} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#888', marginBottom: 4, display: 'block' }}>
            Legenda / Descrição
          </label>
          <RichTextEditor value={text} onChange={setText} placeholder="Escreva a legenda do seu post..." resizable />
        </div>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label>Publicar em</label>
            <div className={postStyles.networkList}>
              {NETWORK_OPTIONS.map((n) => (
                <button
                  key={n.key}
                  className={`${postStyles.networkBtn} ${networks.includes(n.key) ? postStyles.networkActive : ''}`}
                  style={networks.includes(n.key) ? { borderColor: n.color, background: n.color + '15' } : {}}
                  onClick={() => toggleNetwork(n.key)}
                  type="button"
                >
                  <span className={postStyles.networkBtnIcon}>{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label>Data</label>
            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>Horário</label>
            <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>URL da imagem ou vídeo (opcional)</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Cole o link do Google Drive ou URL direta"
            />
            {imageUrl && (
              <div className={postStyles.imagePreview}>
                <img src={previewUrl} alt="Preview" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave}>
            {isEditing ? 'Salvar' : 'Agendar'}
          </button>
          {isEditing && (
            <button className={styles.deleteBtn} onClick={handleDelete}>
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
