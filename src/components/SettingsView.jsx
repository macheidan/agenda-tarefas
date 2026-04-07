import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { useSettings } from '../hooks/useSettings';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import styles from '../styles/SettingsView.module.css';

export default function SettingsView({ onNavigate }) {
  const { user, isAdmin } = useAuth();
  const users = useUsers();
  const [userSettings, setUserSettings] = useState({});
  const [removedUsers, setRemovedUsers] = useState(new Set());

  const SECTIONS = [
    { key: 'calendarEnabled', label: 'Calendário' },
    { key: 'kanbanEnabled', label: 'Kanban' },
    { key: 'ideasEnabled', label: 'Ideias' },
    { key: 'notesEnabled', label: 'Anotações' },
    { key: 'shoppingListEnabled', label: 'Lista de Compras' },
    { key: 'reviewsEnabled', label: 'Avaliações' },
  ];

  // Admin loads settings for all users
  useEffect(() => {
    if (!isAdmin) return;
    const loadAll = async () => {
      const map = {};
      for (const u of users) {
        const ref = doc(db, 'settings', u.uid);
        const snap = await getDoc(ref);
        map[u.uid] = snap.exists() ? snap.data() : {};
      }
      setUserSettings(map);
    };
    loadAll();
  }, [isAdmin, users]);

  const toggleSection = async (uid, key, enabled) => {
    const ref = doc(db, 'settings', uid);
    await setDoc(ref, { [key]: enabled }, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], [key]: enabled },
    }));
  };

  const [confirmUid, setConfirmUid] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [editingNameUid, setEditingNameUid] = useState(null);
  const [nameValue, setNameValue] = useState('');

  const removeUser = async (uid) => {
    if (confirmUid === uid && confirmText === 'EXCLUIR') {
      await deleteDoc(doc(db, 'users', uid));
      await deleteDoc(doc(db, 'settings', uid));
      setRemovedUsers((prev) => new Set(prev).add(uid));
      setConfirmUid(null);
      setConfirmText('');
    }
  };

  const startRemove = (uid) => {
    setConfirmUid(uid);
    setConfirmText('');
  };

  const cancelRemove = () => {
    setConfirmUid(null);
    setConfirmText('');
  };

  const startRename = (uid) => {
    const s = userSettings[uid] || {};
    const u = users.find((u) => u.uid === uid);
    setEditingNameUid(uid);
    setNameValue(s.customName || u?.displayName || u?.email || '');
  };

  const saveRename = async (uid) => {
    const ref = doc(db, 'settings', uid);
    await setDoc(ref, { customName: nameValue.trim() }, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], customName: nameValue.trim() },
    }));
    setEditingNameUid(null);
    setNameValue('');
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
        <button
          className={styles.removeBtn}
          style={{ background: 'var(--card)', color: 'var(--text-secondary)', borderColor: 'var(--input-border)', padding: '8px 16px', fontSize: 13 }}
          onClick={() => onNavigate && onNavigate('archived')}
        >
          Arquivados
        </button>
      </div>

      <div className={styles.section}>
        <h3>Visibilidade de Seções</h3>
        <p className={styles.sectionDesc}>Escolha quais seções cada usuário pode ver.</p>

        <div className={styles.userList}>
          {visibleUsers.map((u) => {
            const s = userSettings[u.uid] || {};
            return (
              <div key={u.uid} className={styles.userRowSections}>
                <div className={styles.userInfo}>
                  <img
                    className={styles.userAvatar}
                    src={u.photoURL || 'https://via.placeholder.com/32'}
                    alt={u.displayName || u.email}
                  />
                  <span className={styles.userName}>{u.displayName || u.email}</span>
                </div>
                <div className={styles.sectionToggles}>
                  {SECTIONS.map((sec) => (
                    <label key={sec.key} className={styles.sectionToggle}>
                      <input
                        type="checkbox"
                        checked={s[sec.key] !== false}
                        onChange={(e) => toggleSection(u.uid, sec.key, e.target.checked)}
                      />
                      <span className={styles.sectionLabel}>{sec.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Renomear Usuários</h3>
        <p className={styles.sectionDesc}>Altere o nome exibido de cada usuário (login permanece o mesmo).</p>

        <div className={styles.userList}>
          {visibleUsers.map((u) => {
            const s = userSettings[u.uid] || {};
            const displayName = s.customName || u.displayName || u.email;
            return (
              <div key={u.uid} className={styles.userRow}>
                <img
                  className={styles.userAvatar}
                  src={u.photoURL || 'https://via.placeholder.com/32'}
                  alt={displayName}
                />
                {editingNameUid === u.uid ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <input
                      className={styles.confirmInput}
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && saveRename(u.uid)}
                    />
                    <button className={styles.cancelBtn} style={{ background: '#4caf50', color: '#fff', border: 'none' }} onClick={() => saveRename(u.uid)}>
                      Salvar
                    </button>
                    <button className={styles.cancelBtn} onClick={() => setEditingNameUid(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <span className={styles.userName}>{displayName}</span>
                    <button className={styles.removeBtn} style={{ background: 'var(--card)', color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={() => startRename(u.uid)}>
                      Renomear
                    </button>
                  </>
                )}
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
              {confirmUid === u.uid ? (
                <div className={styles.confirmBox}>
                  <p className={styles.confirmText}>
                    Digite <strong>EXCLUIR</strong> para confirmar:
                  </p>
                  <input
                    className={styles.confirmInput}
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="EXCLUIR"
                    autoFocus
                  />
                  <div className={styles.confirmActions}>
                    <button
                      className={styles.removeBtn}
                      disabled={confirmText !== 'EXCLUIR'}
                      onClick={() => removeUser(u.uid)}
                    >
                      Confirmar
                    </button>
                    <button
                      className={styles.cancelBtn}
                      onClick={cancelRemove}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className={styles.removeBtn}
                  onClick={() => startRemove(u.uid)}
                >
                  Excluir acesso
                </button>
              )}
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
