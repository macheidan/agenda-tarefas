import { useState } from 'react';
import styles from '../../styles/Gestao.module.css';

/**
 * Botão "Atualizar da planilha": dispara o Web App do Apps Script que puxa o
 * Google Sheets pro Firestore (DRE ou VENDAS LOJAS). O sync roda na planilha
 * (~segundos a 1-2 min) e o onSnapshot reflete ao vivo, sem reload — a
 * planilha também sincroniza sozinha ~1 min após cada edição (gatilho onChange).
 */
export default function SyncSheetButton({ onSync, title }) {
  const [estado, setEstado] = useState('idle');

  const handleClick = async () => {
    setEstado('syncing');
    const ok = await onSync();
    setEstado(ok ? 'ok' : 'erro');
    setTimeout(() => setEstado('idle'), 4000);
  };

  return (
    <button
      type="button"
      className={styles.syncBtn}
      onClick={handleClick}
      disabled={estado === 'syncing'}
      title={title}
    >
      {estado === 'syncing' ? 'Sincronizando…'
        : estado === 'ok' ? '✓ Atualizado'
        : estado === 'erro' ? 'Falhou, tenta de novo'
        : '⟳ Atualizar da planilha'}
    </button>
  );
}
