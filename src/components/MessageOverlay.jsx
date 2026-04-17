import { useState } from 'react';
import RichContent from './RichContent';
import styles from '../styles/MessageOverlay.module.css';

export default function MessageOverlay({ message, onDismiss }) {
  const [checked, setChecked] = useState(false);

  if (!message) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.title}>Mensagem do Administrador</h3>
        <RichContent className={styles.content} html={message.text} />
        <div className={styles.footer}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            Lido
          </label>
          <button
            className={styles.closeBtn}
            disabled={!checked}
            onClick={() => onDismiss(message.id)}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
