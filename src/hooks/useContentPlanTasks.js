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

function isWeekday(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function nextWeekday(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  while (!isWeekday(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function useContentPlanTasks(uid) {
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setAllTasks([]);
      setLoading(false);
      return;
    }

    const colRef = collection(db, 'contentPlanTasks', uid, 'items');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllTasks(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [uid]);

  const tasks = allTasks.filter((t) => !t.archived);
  const archivedTasks = allTasks.filter((t) => t.archived);

  const addTask = async (taskData, currentUser) => {
    const colRef = collection(db, 'contentPlanTasks', uid, 'items');

    if (taskData.recurrence !== 'once' && taskData.recurrenceCount > 1) {
      const groupId = crypto.randomUUID();
      const baseDate = new Date(taskData.date + 'T12:00:00');
      const docs = [];

      if (taskData.recurrence === 'daily') {
        let current = new Date(baseDate);
        if (!isWeekday(current)) {
          current = nextWeekday(current);
        }
        for (let i = 0; i < taskData.recurrenceCount; i++) {
          docs.push(buildTaskDoc(taskData, current, groupId, currentUser));
          current = nextWeekday(current);
        }
      } else {
        for (let i = 0; i < taskData.recurrenceCount; i++) {
          const occurrenceDate = new Date(baseDate);
          if (taskData.recurrence === 'weekly') {
            occurrenceDate.setDate(baseDate.getDate() + i * 7);
          } else if (taskData.recurrence === 'monthly') {
            occurrenceDate.setMonth(baseDate.getMonth() + i);
          }
          docs.push(buildTaskDoc(taskData, occurrenceDate, groupId, currentUser));
        }
      }

      return Promise.all(docs.map((d) => addDoc(colRef, d)));
    }

    return addDoc(colRef, {
      title: taskData.title,
      description: taskData.description || '',
      date: taskData.date,
      finishDate: taskData.finishDate || null,
      endDate: taskData.endDate || null,
      recurrence: taskData.recurrence || 'once',
      recurrenceGroup: null,
      status: 'not_started',
      priority: taskData.priority ?? 5,
      archived: false,
      comments: [],
      createdAt: Timestamp.now(),
      createdBy: currentUser.uid,
    });
  };

  function buildTaskDoc(taskData, date, groupId, currentUser) {
    return {
      title: taskData.title,
      description: taskData.description || '',
      date: date.toISOString().split('T')[0],
      finishDate: taskData.finishDate || null,
      endDate: taskData.endDate || null,
      recurrence: taskData.recurrence,
      recurrenceGroup: groupId,
      status: 'not_started',
      priority: taskData.priority ?? 5,
      archived: false,
      comments: [],
      createdAt: Timestamp.now(),
      createdBy: currentUser.uid,
    };
  }

  const updateTask = async (taskId, updates) => {
    const taskRef = doc(db, 'contentPlanTasks', uid, 'items', taskId);
    return updateDoc(taskRef, updates);
  };

  const updateTaskGroup = async (recurrenceGroup, updates) => {
    const groupTasks = allTasks.filter((t) => t.recurrenceGroup === recurrenceGroup);
    return Promise.all(
      groupTasks.map((t) => {
        const taskRef = doc(db, 'contentPlanTasks', uid, 'items', t.id);
        return updateDoc(taskRef, updates);
      })
    );
  };

  const deleteTask = async (taskId) => {
    const taskRef = doc(db, 'contentPlanTasks', uid, 'items', taskId);
    return deleteDoc(taskRef);
  };

  const archiveTask = async (taskId) => {
    const taskRef = doc(db, 'contentPlanTasks', uid, 'items', taskId);
    return updateDoc(taskRef, { archived: true });
  };

  const unarchiveTask = async (taskId) => {
    const taskRef = doc(db, 'contentPlanTasks', uid, 'items', taskId);
    return updateDoc(taskRef, { archived: false });
  };

  return { tasks, archivedTasks, loading, addTask, updateTask, updateTaskGroup, deleteTask, archiveTask, unarchiveTask };
}
