import { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function useTasks(uid) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const colRef = collection(db, 'tasks', uid, 'items');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTasks(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [uid]);

  const addTask = async (taskData, currentUser) => {
    const colRef = collection(db, 'tasks', uid, 'items');

    if (taskData.recurrence !== 'once' && taskData.recurrenceCount > 1) {
      const groupId = crypto.randomUUID();
      const baseDate = new Date(taskData.date);
      const docs = [];

      for (let i = 0; i < taskData.recurrenceCount; i++) {
        const occurrenceDate = new Date(baseDate);
        if (taskData.recurrence === 'daily') occurrenceDate.setDate(baseDate.getDate() + i);
        else if (taskData.recurrence === 'weekly') occurrenceDate.setDate(baseDate.getDate() + i * 7);
        else if (taskData.recurrence === 'monthly') occurrenceDate.setMonth(baseDate.getMonth() + i);

        docs.push({
          title: taskData.title,
          date: occurrenceDate.toISOString().split('T')[0],
          endDate: taskData.endDate || null,
          recurrence: taskData.recurrence,
          recurrenceGroup: groupId,
          status: 'not_started',
          comments: [],
          createdAt: Timestamp.now(),
          createdBy: currentUser.uid,
        });
      }

      return Promise.all(docs.map((d) => addDoc(colRef, d)));
    }

    return addDoc(colRef, {
      title: taskData.title,
      date: taskData.date,
      endDate: taskData.endDate || null,
      recurrence: taskData.recurrence || 'once',
      recurrenceGroup: null,
      status: 'not_started',
      comments: [],
      createdAt: Timestamp.now(),
      createdBy: currentUser.uid,
    });
  };

  const updateTask = async (taskId, updates) => {
    const taskRef = doc(db, 'tasks', uid, 'items', taskId);
    return updateDoc(taskRef, updates);
  };

  const deleteTask = async (taskId) => {
    const taskRef = doc(db, 'tasks', uid, 'items', taskId);
    return deleteDoc(taskRef);
  };

  return { tasks, loading, addTask, updateTask, deleteTask };
}
