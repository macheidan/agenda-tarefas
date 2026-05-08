import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/Login.module.css';

export default function PendingApproval() {
  const { user, logout } = useAuth();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Aguardando aprovação</h1>
        <p className={styles.subtitle}>
          Sua conta ({user?.email}) foi registrada e está aguardando aprovação do administrador.
          Você receberá acesso assim que for aprovado.
        </p>
        <button className={styles.googleBtn} onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  );
}
