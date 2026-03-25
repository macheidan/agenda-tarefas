import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../hooks/useTasks';
import { useUsers } from '../hooks/useUsers';
import { useChat } from '../hooks/useChat';
import { useSettings } from '../hooks/useSettings';
import { useTaskAlarm } from '../hooks/useTaskAlarm';
import Header from '../components/Header';
import CalendarView from '../components/CalendarView';
import KanbanView from '../components/KanbanView';
import ArchivedView from '../components/ArchivedView';
import ChatView from '../components/ChatView';
import SettingsView from '../components/SettingsView';
import IdeasView from '../components/IdeasView';
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

  const viewingOther = isAdmin && selectedUid !== user.uid;
  const viewingUser = users.find((u) => u.uid === selectedUid);

  const ideasEnabled = isAdmin || settings.ideasEnabled;

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
        totalUnread={totalUnread}
        ideasEnabled={ideasEnabled}
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
        {activeTab === 'chat' && (
          <ChatView
            users={users}
            conversations={conversations}
            onSendMessage={sendMessage}
            onMarkAsRead={markAsRead}
          />
        )}
        {activeTab === 'ideas' && ideasEnabled && <IdeasView />}
        {activeTab === 'archived' && isAdmin && (
          <ArchivedView
            archivedTasks={archivedTasks}
            onUnarchive={unarchiveTask}
            onDelete={deleteTask}
            onClearChat={clearAllChats}
          />
        )}
        {activeTab === 'settings' && isAdmin && <SettingsView />}
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
