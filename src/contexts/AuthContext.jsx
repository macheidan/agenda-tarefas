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
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            const isAdminUser = firebaseUser.email === adminEmail;
            await setDoc(userRef, {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              approved: isAdminUser ? true : false,
              createdAt: new Date().toISOString(),
            });
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

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      setUserDoc(snap.exists() ? snap.data() : null);
    }, (err) => {
      console.error('[Auth] Erro ao escutar doc do usuário:', err);
    });
    return unsubscribe;
  }, [user]);

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);
  const isAdmin = user?.email === adminEmail;
  // Legacy users (sem o campo approved) são tratados como aprovados.
  const approved = isAdmin || (userDoc ? userDoc.approved !== false : null);

  const value = { user, userDoc, loading, login, logout, isAdmin, adminEmail, approved };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
