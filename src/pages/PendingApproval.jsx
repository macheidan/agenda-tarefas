import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/Login.module.css';

export default function PendingApproval() {
  const { user, logout } = useAuth();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>⏳</div>
        <h1 className={styles.title}>Aguardando aprovação</h1>
        <p className={styles.subtitle}>
          Olá, <strong>{user?.displayName || user?.email}</strong>!
          <br />
          Sua conta foi registrada e está aguardando o administrador
          aprovar o acesso. Você receberá acesso assim que isso for feito.
        </p>
        <button className={styles.googleBtn} onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  );
}
