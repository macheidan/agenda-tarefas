import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../hooks/useTasks';
import { useContentPlanTasks } from '../hooks/useContentPlanTasks';
import { useUsers } from '../hooks/useUsers';
import { useChat } from '../hooks/useChat';
import { useSettings } from '../hooks/useSettings';
import { useTaskAlarm } from '../hooks/useTaskAlarm';
import { useIdeas } from '../hooks/useIdeas';
import { useAdminMessages } from '../hooks/useAdminMessages';
import { useNotes } from '../hooks/useNotes';
import { useReviews } from '../hooks/useReviews';
import { useCompletedTasks } from '../hooks/useCompletedTasks';
import { useAllSettings } from '../hooks/useAllSettings';
import Header from '../components/Header';
import NotesView from '../components/NotesView';
import NoteModal from '../components/NoteModal';
import AdminMessageModal from '../components/AdminMessageModal';
import MessageOverlay from '../components/MessageOverlay';
import CalendarView from '../components/CalendarView';
import KanbanView from '../components/KanbanView';
import ArchivedView from '../components/ArchivedView';
import CompletedView from '../components/CompletedView';
import SettingsView from '../components/SettingsView';
import IdeasView from '../components/IdeasView';
import ReviewsView from '../components/ReviewsView';
import KnowledgeView from '../components/KnowledgeView';
import { useKnowledge } from '../hooks/useKnowledge';
import { useContentPlans } from '../hooks/useContentPlans';
import ContentPlansView from '../components/ContentPlansView';
import TaskModal from '../components/TaskModal';
import styles from '../styles/Dashboard.module.css';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const users = useUsers();

  const [selectedUid, setSelectedUid] = useState(user.uid);
  const [activeTab, setActiveTab] = useState('calendar');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalScope, setModalScope] = useState('tasks');
  const [editingTask, setEditingTask] = useState(null);
  const [initialDate, setInitialDate] = useState(null);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const { tasks, archivedTasks, addTask, updateTask, updateTaskGroup, deleteTask, archiveTask, unarchiveTask } =
    useTasks(selectedUid);
  const {
    tasks: contentPlanTasks,
    addTask: addContentPlanTask,
    updateTask: updateContentPlanTask,
    updateTaskGroup: updateContentPlanTaskGroup,
    deleteTask: deleteContentPlanTask,
  } = useContentPlanTasks(selectedUid);
  const { conversations, totalUnread, sendMessage, markAsRead, clearChat, clearAllChats } =
    useChat(user, isAdmin);
  const { settings } = useSettings(user.uid);
  useTaskAlarm(tasks);
  const { messages: adminMessages, sendMessage: sendAdminMessage, markAsRead: markMessageRead, getUnreadForUser, deleteMessage: deleteAdminMessage } =
    useAdminMessages(user);
  const unreadMessage = getUnreadForUser(user.uid);

  const { notes, addNote, updateNote, deleteNote } = useNotes(selectedUid);
  const { completedTasks, archiveCompletedTask } = useCompletedTasks(isAdmin ? users : []);
  const allSettings = useAllSettings(users);

  const calendarEnabled = settings.calendarEnabled !== false;
  const contentPlanEnabled = settings.contentPlanEnabled !== false;
  const kanbanEnabled = settings.kanbanEnabled !== false;
  const ideasEnabled = settings.ideasEnabled !== false;
  const notesEnabled = settings.notesEnabled !== false;
  const shoppingListEnabled = settings.shoppingListEnabled !== false;
  const reviewsEnabled = settings.reviewsEnabled !== false;
  const knowledgeEnabled = settings.knowledgeEnabled !== false;
  const contentPlansEnabled = settings.contentPlansEnabled !== false;
  const { messages: kbMessages, loading: kbLoading, sendMessage: sendKbMessage, knowledgeBase, updateKnowledgeBase, updateGeminiKey, geminiKey: kbGeminiKey, persona: kbPersona, ready: kbReady, error: kbError } = useKnowledge();
  const { plans, loading: plansLoading, uploadPlan, deletePlan } = useContentPlans();
  const { ideas, unreadCount: ideasUnread, addIdea, addComment, deleteComment, deleteIdea, archiveIdea, markAsRead: markIdeaAsRead } =
    useIdeas(isAdmin ? null : user.uid, user, isAdmin);
  const { reviews, unreadCount: reviewsUnread, addReview, addComment: addReviewComment, deleteComment: deleteReviewComment, deleteReview, archiveReview, markAsRead: markReviewAsRead } =
    useReviews(null, user, true);

  const viewingOther = isAdmin && selectedUid !== user.uid;
  const viewingUser = users.find((u) => u.uid === selectedUid);

  const handleDateClick = (dateStr) => {
    setModalScope('tasks');
    setEditingTask(null);
    setInitialDate(dateStr);
    setModalOpen(true);
  };

  const handleTaskClick = (task) => {
    setModalScope('tasks');
    setEditingTask(task);
    setInitialDate(null);
    setModalOpen(true);
  };

  const handleContentPlanDateClick = (dateStr) => {
    setModalScope('contentPlan');
    setEditingTask(null);
    setInitialDate(dateStr);
    setModalOpen(true);
  };

  const handleContentPlanTaskClick = (task) => {
    setModalScope('contentPlan');
    setEditingTask(task);
    setInitialDate(null);
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
        users={users}
        selectedUid={selectedUid}
        onSelectUser={setSelectedUid}
        calendarEnabled={calendarEnabled}
        contentPlanEnabled={contentPlanEnabled}
        kanbanEnabled={kanbanEnabled}
        ideasEnabled={ideasEnabled}
        notesEnabled={notesEnabled}
        shoppingListEnabled={shoppingListEnabled}
        reviewsEnabled={reviewsEnabled}
        knowledgeEnabled={knowledgeEnabled}
        contentPlansEnabled={contentPlansEnabled}
        ideasUnread={ideasUnread}
        reviewsUnread={reviewsUnread}
        onOpenMessage={() => setMessageModalOpen(true)}
        completedCount={completedTasks.length}
        customName={settings.customName}
        allSettings={allSettings}
      />

      {viewingOther && viewingUser && (
        <div className={styles.banner}>
          Visualizando agenda de <strong>{allSettings[viewingUser.uid]?.customName || viewingUser.displayName || viewingUser.email}</strong>
        </div>
      )}

      <main className={styles.main}>
        {activeTab === 'calendar' && calendarEnabled && (
          <CalendarView
            tasks={tasks}
            onDateClick={handleDateClick}
            onTaskClick={handleTaskClick}
          />
        )}
        {activeTab === 'contentPlan' && contentPlanEnabled && (
          <CalendarView
            tasks={contentPlanTasks}
            onDateClick={handleContentPlanDateClick}
            onTaskClick={handleContentPlanTaskClick}
          />
        )}
        {activeTab === 'kanban' && kanbanEnabled && (
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
            archiveIdea={archiveIdea}
            markAsRead={markIdeaAsRead}
            users={users}
            allSettings={allSettings}
          />
        )}
        {activeTab === 'notes' && notesEnabled && (
          <NotesView
            notes={notes}
            onNewNote={() => { setEditingNote(null); setNoteModalOpen(true); }}
            onNoteClick={(note) => { setEditingNote(note); setNoteModalOpen(true); }}
          />
        )}
        {activeTab === 'shopping' && shoppingListEnabled && (
          <iframe
            src="https://macheidan.github.io/lista_compras/insumos.html"
            title="Lista de Compras"
            style={{ width: '100%', height: 'calc(100vh - 120px)', border: 'none' }}
            onLoad={(e) => {
              try {
                const doc = e.target.contentDocument;
                const input = doc.querySelector('input[type="password"], input[type="text"]');
                const btn = doc.querySelector('button');
                if (input && btn && !input.value) {
                  input.value = '54321';
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  btn.click();
                }
              } catch (err) {
                // cross-origin fallback
              }
            }}
          />
        )}
        {activeTab === 'reviews' && reviewsEnabled && (
          <ReviewsView
            reviews={reviews}
            addReview={addReview}
            addComment={addReviewComment}
            deleteComment={deleteReviewComment}
            deleteReview={deleteReview}
            archiveReview={archiveReview}
            markAsRead={markReviewAsRead}
            users={users}
            allSettings={allSettings}
          />
        )}
        {activeTab === 'knowledge' && knowledgeEnabled && (
          <KnowledgeView
            messages={kbMessages}
            loading={kbLoading}
            sendMessage={sendKbMessage}
            knowledgeBase={knowledgeBase}
            updateKnowledgeBase={updateKnowledgeBase}
            persona={kbPersona}
            ready={kbReady}
            error={kbError}
          />
        )}
        {activeTab === 'contentPlans' && contentPlansEnabled && (
          <ContentPlansView
            plans={plans}
            loading={plansLoading}
            uploadPlan={uploadPlan}
            deletePlan={deletePlan}
          />
        )}
        {activeTab === 'completed' && isAdmin && (
          <CompletedView
            completedTasks={completedTasks}
            onArchive={archiveCompletedTask}
          />
        )}
        {activeTab === 'archived' && isAdmin && (
          <ArchivedView
            archivedTasks={archivedTasks}
            onUnarchive={unarchiveTask}
            onDelete={deleteTask}
            onClearChat={clearAllChats}
            adminMessages={adminMessages}
            onDeleteMessage={deleteAdminMessage}
          />
        )}
        {activeTab === 'settings' && isAdmin && <SettingsView onNavigate={setActiveTab} geminiKey={kbGeminiKey} updateGeminiKey={updateGeminiKey} />}
      </main>

      {modalOpen && (
        <TaskModal
          task={editingTask}
          initialDate={initialDate}
          onSave={(data) =>
            modalScope === 'contentPlan'
              ? addContentPlanTask(data, user)
              : addTask(data, user)
          }
          onUpdate={modalScope === 'contentPlan' ? updateContentPlanTask : updateTask}
          onUpdateGroup={
            modalScope === 'contentPlan' ? updateContentPlanTaskGroup : updateTaskGroup
          }
          onDelete={modalScope === 'contentPlan' ? deleteContentPlanTask : deleteTask}
          onClose={() => setModalOpen(false)}
        />
      )}

      {noteModalOpen && (
        <NoteModal
          note={editingNote}
          onSave={addNote}
          onUpdate={updateNote}
          onDelete={deleteNote}
          onClose={() => setNoteModalOpen(false)}
        />
      )}

      {messageModalOpen && isAdmin && (
        <AdminMessageModal
          users={users.filter((u) => u.uid !== user.uid)}
          onSend={sendAdminMessage}
          onClose={() => setMessageModalOpen(false)}
        />
      )}

      <MessageOverlay
        message={unreadMessage}
        onDismiss={(msgId) => markMessageRead(msgId, user.uid)}
      />
    </div>
  );
}
