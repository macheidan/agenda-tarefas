import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function useCompletedTasks(users) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (!users || users.length === 0) return;

    const unsubscribes = users.map((u) => {
      const colRef = collection(db, 'tasks', u.uid, 'items');
      return onSnapshot(colRef, (snapshot) => {
        const items = snapshot.docs
          .map((d) => ({ id: d.id, uid: u.uid, userName: u.displayName || u.email, ...d.data() }))
          .filter((t) => t.status === 'complete_notify' && !t.archived);

        setTasks((prev) => {
          const others = prev.filter((t) => t.uid !== u.uid);
          return [...others, ...items];
        });
      });
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [users]);

  const archiveTask = async (uid, taskId) => {
    const taskRef = doc(db, 'tasks', uid, 'items', taskId);
    return updateDoc(taskRef, { archived: true, status: 'done' });
  };

  return { completedTasks: tasks, archiveCompletedTask: archiveTask };
}
