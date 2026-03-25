import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { useSettings } from '../hooks/useSettings';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import styles from '../styles/SettingsView.module.css';

export default function SettingsView() {
  const { isAdmin } = useAuth();
  const users = useUsers();
  const [userSettings, setUserSettings] = useState({});

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
          {users.map((u) => {
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
    </div>
  );
}
