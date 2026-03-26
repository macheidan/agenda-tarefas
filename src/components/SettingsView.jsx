import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { useSettings } from '../hooks/useSettings';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import styles from '../styles/SettingsView.module.css';

export default function SettingsView() {
  const { user, isAdmin } = useAuth();
  const users = useUsers();
  const [userSettings, setUserSettings] = useState({});
  const [removedUsers, setRemovedUsers] = useState(new Set());

  // Admin loads settings for all users
  useEffect(() => {
    if (!isAdmin) return;
    const loadAll = async () => {
      const map = {};
      for (const u of users) {
        const ref = doc(db, 'settings', u.uid);
        const snap = await getDoc(ref);
        map[u.uid] = snap.exists() ? snap.data() : { ideasEnabled: false };
      }
      setUserSettings(map);
    };
    loadAll();
  }, [isAdmin, users]);

  const toggleIdeas = async (uid, enabled) => {
    const ref = doc(db, 'settings', uid);
    await setDoc(ref, { ideasEnabled: enabled }, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], ideasEnabled: enabled },
    }));
  };

  const removeUser = async (uid) => {
    if (!window.confirm('Excluir o acesso deste usuário? Ele será removido da lista.')) return;
    await deleteDoc(doc(db, 'users', uid));
    await deleteDoc(doc(db, 'settings', uid));
    setRemovedUsers((prev) => new Set(prev).add(uid));
  };

  const visibleUsers = users.filter((u) => u.uid !== user.uid && !removedUsers.has(u.uid));

  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <h2>Configurações</h2>
        <p className={styles.noAccess}>Apenas o administrador pode alterar as configurações.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2>Configurações</h2>

      <div className={styles.section}>
        <h3>Módulo "Ideias"</h3>
        <p className={styles.sectionDesc}>Ative ou desative o menu Ideias para cada usuário.</p>

        <div className={styles.userList}>
          {visibleUsers.map((u) => {
            const s = userSettings[u.uid] || {};
            return (
              <div key={u.uid} className={styles.userRow}>
                <img
                  className={styles.userAvatar}
                  src={u.photoURL || 'https://via.placeholder.com/32'}
                  alt={u.displayName || u.email}
                />
                <span className={styles.userName}>{u.displayName || u.email}</span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={!!s.ideasEnabled}
                    onChange={(e) => toggleIdeas(u.uid, e.target.checked)}
                  />
                  <span className={styles.slider} />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Gerenciar Usuários</h3>
        <p className={styles.sectionDesc}>Remova o acesso de usuários da plataforma.</p>

        <div className={styles.userList}>
          {visibleUsers.map((u) => (
            <div key={u.uid} className={styles.userRow}>
              <img
                className={styles.userAvatar}
                src={u.photoURL || 'https://via.placeholder.com/32'}
                alt={u.displayName || u.email}
              />
              <span className={styles.userName}>{u.displayName || u.email}</span>
              <button
                className={styles.removeBtn}
                onClick={() => removeUser(u.uid)}
              >
                Excluir acesso
              </button>
            </div>
          ))}
          {visibleUsers.length === 0 && (
            <p className={styles.noAccess}>Nenhum usuário cadastrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}
