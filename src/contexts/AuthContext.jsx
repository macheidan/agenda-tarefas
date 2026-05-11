import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const isAdminUser = firebaseUser.email === adminEmail;
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            // Novo usuário: admin é auto-aprovado, demais ficam pendentes
            await setDoc(userRef, {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              approved: isAdminUser,
              createdAt: new Date().toISOString(),
            });
          } else if (isAdminUser && userSnap.data().approved !== true) {
            // Admin existente sem flag: aprovar retroativamente
            await setDoc(userRef, { approved: true }, { merge: true });
          }
        } catch (err) {
          console.error('[Auth] Erro ao registrar usuário no Firestore:', err);
        }
        setUser(firebaseUser);
      } else {
        setUser(null);
        setUserDoc(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [adminEmail]);

  // Assina o doc do user logado pra reagir em tempo real à aprovação
  useEffect(() => {
    if (!user) {
      setUserDoc(null);
      return undefined;
    }
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => setUserDoc(snap.exists() ? snap.data() : null),
      (err) => console.error('[Auth] Erro ao ouvir users doc:', err)
    );
    return unsub;
  }, [user]);

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);
  const isAdmin = user?.email === adminEmail;
  const approved = isAdmin || userDoc?.approved === true;

  const value = { user, userDoc, loading, login, logout, isAdmin, adminEmail, approved };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
