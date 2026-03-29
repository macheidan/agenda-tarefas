import { useState } from 'react';
import styles from '../styles/SocialProfilesModal.module.css';

const NETWORK_OPTIONS = [
  { key: 'instagram', label: 'Instagram', icon: '📷', color: '#E1306C', bgColor: '#fce4ec' },
  { key: 'facebook', label: 'Facebook', icon: '📘', color: '#1877F2', bgColor: '#e3f2fd' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵', color: '#000000', bgColor: '#f5f5f5' },
];

export default function SocialProfilesModal({ profiles, onAdd, onDelete, onClose }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [network, setNetwork] = useState('instagram');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !network) return;
    onAdd({
      name: name.trim(),
      network,
      username: username.trim() || null,
      avatarUrl: avatarUrl.trim() || null,
    });
    setName('');
    setUsername('');
    setAvatarUrl('');
    setAdding(false);
  };

  const handleRemove = (id, profileName) => {
    if (window.confirm(`Desconectar o perfil "${profileName}"?`)) {
      onDelete(id);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>&times;</button>

        <h3 className={styles.title}>Perfis Conectados</h3>
        <p className={styles.subtitle}>Gerencie as redes sociais conectadas ao Social Calendar.</p>

        <div className={styles.profileList}>
          {profiles.map((p) => {
            const net = NETWORK_OPTIONS.find((n) => n.key === p.network) || NETWORK_OPTIONS[0];
            return (
              <div key={p.id} className={styles.profileCard}>
                <div className={styles.profileAvatar} style={{ background: net.bgColor }}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt={p.name} />
                  ) : (
                    <span className={styles.avatarIcon}>{net.icon}</span>
                  )}
                </div>
                <div className={styles.profileInfo}>
                  <span className={styles.profileName}>{p.name}</span>
                  <span className={styles.profileNetwork} style={{ color: net.color }}>
                    {net.icon} {net.label}
                    {p.username && ` · @${p.username}`}
                  </span>
                </div>
                <button
                  className={styles.disconnectBtn}
                  onClick={() => handleRemove(p.id, p.name)}
                >
                  Desconectar
                </button>
              </div>
            );
          })}

          {profiles.length === 0 && !adding && (
            <div className={styles.empty}>
              Nenhum perfil conectado ainda.
            </div>
          )}
        </div>

        {adding ? (
          <div className={styles.addForm}>
            <h4 className={styles.addTitle}>Adicionar Perfil</h4>
            <div className={styles.addField}>
              <label>Rede social</label>
              <div className={styles.networkPicker}>
                {NETWORK_OPTIONS.map((n) => (
                  <button
                    key={n.key}
                    className={`${styles.networkPickerBtn} ${network === n.key ? styles.networkPickerActive : ''}`}
                    style={network === n.key ? { borderColor: n.color, background: n.color + '15' } : {}}
                    onClick={() => setNetwork(n.key)}
                  >
                    {n.icon} {n.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.addField}>
              <label>Nome do perfil</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Pizzaria do João"
              />
            </div>
            <div className={styles.addField}>
              <label>@ Username (opcional)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: pizzariadojoao"
              />
            </div>
            <div className={styles.addField}>
              <label>URL do avatar (opcional)</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className={styles.addActions}>
              <button className={styles.addSaveBtn} onClick={handleAdd} disabled={!name.trim()}>
                Conectar
              </button>
              <button className={styles.addCancelBtn} onClick={() => setAdding(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button className={styles.addBtn} onClick={() => setAdding(true)}>
            + Conectar novo perfil
          </button>
        )}
      </div>
    </div>
  );
}
