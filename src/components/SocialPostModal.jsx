import { useState, useEffect } from 'react';
import styles from '../styles/SocialPostModal.module.css';

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

export default function SocialPostModal({ post, profiles, initialDate, onSave, onUpdate, onDelete, onClose }) {
  const isEditing = !!post;

  const [text, setText] = useState('');
  const [networks, setNetworks] = useState([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState('scheduled');

  useEffect(() => {
    if (post) {
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
    if (!text.trim() || networks.length === 0 || !scheduledDate) return;
    const data = {
      text: text.trim(),
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

  const availableNetworks = NETWORK_OPTIONS.filter((n) =>
    profiles.some((p) => p.network === n.key)
  );

  const charCount = text.length;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>&times;</button>

        <h3 className={styles.title}>
          {isEditing ? 'Editar Agendamento' : 'Agendar Post'}
        </h3>

        <div className={styles.section}>
          <label className={styles.label}>Publicar em:</label>
          <div className={styles.networkList}>
            {availableNetworks.length > 0 ? (
              availableNetworks.map((n) => (
                <button
                  key={n.key}
                  className={`${styles.networkBtn} ${networks.includes(n.key) ? styles.networkActive : ''}`}
                  style={networks.includes(n.key) ? { borderColor: n.color, background: n.color + '15' } : {}}
                  onClick={() => toggleNetwork(n.key)}
                >
                  <span className={styles.networkBtnIcon}>{n.icon}</span>
                  {n.label}
                </button>
              ))
            ) : (
              <p className={styles.noProfiles}>
                Nenhum perfil conectado. Adicione perfis antes de agendar.
              </p>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>
            Texto do post
            <span className={styles.charCount}>{charCount}/2200</span>
          </label>
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva a legenda do seu post..."
            rows={6}
            maxLength={2200}
          />
        </div>

        <div className={styles.section}>
          <label className={styles.label}>URL da imagem (opcional)</label>
          <input
            className={styles.input}
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://exemplo.com/imagem.jpg"
          />
          {imageUrl && (
            <div className={styles.imagePreview}>
              <img src={imageUrl} alt="Preview" onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
          )}
        </div>

        <div className={styles.row}>
          <div className={styles.section}>
            <label className={styles.label}>Data</label>
            <input
              className={styles.input}
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          <div className={styles.section}>
            <label className={styles.label}>Horário</label>
            <input
              className={styles.input}
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </div>
          <div className={styles.section}>
            <label className={styles.label}>Status</label>
            <select
              className={styles.input}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!text.trim() || networks.length === 0 || !scheduledDate}
          >
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
