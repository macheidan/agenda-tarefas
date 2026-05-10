import { useState } from 'react';
import { useDirtyClose } from '../hooks/useDirtyClose';
import styles from '../styles/AdminMessageModal.module.css';

export default function AdminMessageModal({ users, onSend, onClose }) {
  const [text, setText] = useState('');
  const [selectedUids, setSelectedUids] = useState([]);

  const isDirty = text.trim() !== '' || selectedUids.length > 0;
  const handleClose = useDirtyClose(isDirty, onClose);

  const toggleUser = (uid) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const selectAll = () => {
    if (selectedUids.length === users.length) {
      setSelectedUids([]);
    } else {
      setSelectedUids(users.map((u) => u.uid));
    }
  };

  const handleSend = () => {
    if (!text.trim() || selectedUids.length === 0) return;
    onSend(text.trim(), selectedUids);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Enviar Mensagem</h3>

        <label className={styles.label}>Mensagem:</label>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Digite a mensagem..."
          rows={5}
        />

        <label className={styles.label}>Enviar para:</label>
        <div className={styles.userList}>
          <label className={styles.userCheck}>
            <input
              type="checkbox"
              checked={selectedUids.length === users.length && users.length > 0}
              onChange={selectAll}
            />
            <span className={styles.checkName}>Selecionar todos</span>
          </label>
          {users.map((u) => (
            <label key={u.uid} className={styles.userCheck}>
              <input
                type="checkbox"
                checked={selectedUids.includes(u.uid)}
                onChange={() => toggleUser(u.uid)}
              />
              <img
                className={styles.checkAvatar}
                src={u.photoURL || 'https://via.placeholder.com/20'}
                alt=""
              />
              <span className={styles.checkName}>{u.displayName || u.email}</span>
            </label>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={handleClose}>
            Cancelar
          </button>
          <button
            className={styles.sendBtn}
            disabled={!text.trim() || selectedUids.length === 0}
            onClick={handleSend}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
