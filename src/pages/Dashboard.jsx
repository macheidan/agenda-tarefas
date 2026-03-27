import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../hooks/useTasks';
import { useUsers } from '../hooks/useUsers';
import { useChat } from '../hooks/useChat';
import { useSettings } from '../hooks/useSettings';
import { useTaskAlarm } from '../hooks/useTaskAlarm';
import { useIdeas } from '../hooks/useIdeas';
import { useTheme } from '../hooks/useTheme';
import Header from '../components/Header';
import CalendarView from '../components/CalendarView';
import KanbanView from '../components/KanbanView';
import ArchivedView from '../components/ArchivedView';
import SettingsView from '../components/SettingsView';
import IdeasView from '../components/IdeasView';
import ThemeView from '../components/ThemeView';
import TaskModal from '../components/TaskModal';
import styles from '../styles/Dashboard.module.css';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const users = useUsers();

  const [selectedUid, setSelectedUid] = useState(user.uid);
  const [activeTab, setActiveTab] = useState('calendar');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [initialDate, setInitialDate] = useState(null);

  const { tasks, archivedTasks, addTask, updateTask, deleteTask, archiveTask, unarchiveTask } =
    useTasks(selectedUid);
  const { conversations, totalUnread, sendMessage, markAsRead, clearChat, clearAllChats } =
    useChat(user, isAdmin);
  const { settings } = useSettings(user.uid);
  useTaskAlarm(tasks);
  const { theme, changeTheme } = useTheme(user.uid);

  const ideasEnabled = isAdmin || settings.ideasEnabled;
  const ideasTargetUid = selectedUid;
  const { ideas, unreadCount: ideasUnread, addIdea, addComment, deleteComment, deleteIdea, markAsRead: markIdeaAsRead } =
    useIdeas(ideasTargetUid, user);

  const viewingOther = isAdmin && selectedUid !== user.uid;
  const viewingUser = users.find((u) => u.uid === selectedUid);

  const handleDateClick = (dateStr) => {
    setEditingTask(null);
    setInitialDate(dateStr);
    setModalOpen(true);
  };

  const handleTaskClick = (task) => {
    setEditingTask(task);
    setInitialDate(null);
    setModalOpen(true);
  };

  const handleNewTask = () => {
    setEditingTask(null);
    setInitialDate(new Date().toISOString().split('T')[0]);
    setModalOpen(true);
  };

  const handleUpdateStatus = (taskId, newStatus) => {
    updateTask(taskId, { status: newStatus });
  };

  return (
    <div className={styles.container}>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewTask={handleNewTask}
        users={users}
        selectedUid={selectedUid}
        onSelectUser={setSelectedUid}
        ideasEnabled={ideasEnabled}
        ideasUnread={ideasUnread}
      />

      {viewingOther && viewingUser && (
        <div className={styles.banner}>
          Visualizando agenda de <strong>{viewingUser.displayName || viewingUser.email}</strong>
        </div>
      )}

      <main className={styles.main}>
        {activeTab === 'calendar' && (
          <CalendarView
            tasks={tasks}
            onDateClick={handleDateClick}
            onTaskClick={handleTaskClick}
          />
        )}
        {activeTab === 'kanban' && (
          <KanbanView
            tasks={tasks}
            onUpdateStatus={handleUpdateStatus}
            onTaskClick={handleTaskClick}
            onArchive={archiveTask}
            onDelete={deleteTask}
          />
        )}
        {activeTab === 'ideas' && ideasEnabled && (
          <IdeasView
            ideas={ideas}
            addIdea={addIdea}
            addComment={addComment}
            deleteComment={deleteComment}
            deleteIdea={deleteIdea}
            markAsRead={markIdeaAsRead}
          />
        )}
        {activeTab === 'archived' && isAdmin && (
          <ArchivedView
            archivedTasks={archivedTasks}
            onUnarchive={unarchiveTask}
            onDelete={deleteTask}
            onClearChat={clearAllChats}
          />
        )}
        {activeTab === 'settings' && isAdmin && <SettingsView />}
        {activeTab === 'themes' && (
          <ThemeView currentTheme={theme} onChangeTheme={changeTheme} />
        )}
      </main>

      {modalOpen && (
        <TaskModal
          task={editingTask}
          initialDate={initialDate}
          onSave={(data) => addTask(data, user)}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
