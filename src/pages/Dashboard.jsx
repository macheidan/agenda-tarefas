import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../hooks/useTasks';
import { useUsers } from '../hooks/useUsers';
import { useChat } from '../hooks/useChat';
import { useSettings } from '../hooks/useSettings';
import { useTaskAlarm } from '../hooks/useTaskAlarm';
import { useIdeas } from '../hooks/useIdeas';
import { useReels } from '../hooks/useReels';
import { useScripts } from '../hooks/useScripts';
import { useContentPlan } from '../hooks/useContentPlan';
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
import MobileCalendarView from '../components/MobileCalendarView';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTabsOrder } from '../hooks/useTabsOrder';
import ArchivedView from '../components/ArchivedView';
import CompletedView from '../components/CompletedView';
import SettingsView from '../components/SettingsView';
import IdeasView from '../components/IdeasView';
import ReelsView from '../components/ReelsView';
import ContentPlanView from '../components/ContentPlanView';
import ReviewsView from '../components/ReviewsView';
import KnowledgeView from '../components/KnowledgeView';
import { useKnowledge } from '../hooks/useKnowledge';
import TaskModal from '../components/TaskModal';
import styles from '../styles/Dashboard.module.css';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const users = useUsers();
  const isMobile = useIsMobile(768);
  const { order: tabsOrder, updateOrder: updateTabsOrder } = useTabsOrder();

  const [selectedUid, setSelectedUid] = useState(user.uid);
  const [activeTab, setActiveTab] = useState('calendar');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [initialDate, setInitialDate] = useState(null);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const { tasks, archivedTasks, addTask, updateTask, updateTaskGroup, deleteTask, archiveTask, unarchiveTask } =
    useTasks(selectedUid);
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

  // calendarEnabled é o kill switch único: se ele estiver false, todas as seções ficam ocultas
  const calendarEnabled = settings.calendarEnabled !== false;
  const ideasEnabled = calendarEnabled;
  const reelsEnabled = calendarEnabled;
  const contentPlanEnabled = calendarEnabled;
  const notesEnabled = calendarEnabled;
  const shoppingListEnabled = calendarEnabled;
  const reviewsEnabled = calendarEnabled;
  const knowledgeEnabled = calendarEnabled;
  const { messages: kbMessages, loading: kbLoading, sendMessage: sendKbMessage, knowledgeBase, updateKnowledgeBase, updateGeminiKey, geminiKey: kbGeminiKey, persona: kbPersona, ready: kbReady, error: kbError } = useKnowledge();
  const { ideas, unreadCount: ideasUnread, addIdea, addComment, deleteComment, deleteIdea, archiveIdea, markAsRead: markIdeaAsRead } =
    useIdeas(isAdmin ? null : user.uid, user, isAdmin);
  const { reels, addReel, approveReel, archiveReel: archiveReelItem, unarchiveReel, deleteReel, updateDescription: updateReelDescription } = useReels();
  const { scripts, addScript, updateScript, archiveScript, unarchiveScript, deleteScript } = useScripts();
  const { items: contentPlanItems, addItem: addContentPlanItem, updateItem: updateContentPlanItem, deleteItem: deleteContentPlanItem } = useContentPlan();
  const { reviews, unreadCount: reviewsUnread, addReview, addComment: addReviewComment, deleteComment: deleteReviewComment, deleteReview, archiveReview, markAsRead: markReviewAsRead } =
    useReviews(null, user, true);

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

  return (
    <div className={styles.container}>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        users={users}
        selectedUid={selectedUid}
        onSelectUser={setSelectedUid}
        calendarEnabled={calendarEnabled}
        ideasEnabled={ideasEnabled}
        reelsEnabled={reelsEnabled}
        contentPlanEnabled={contentPlanEnabled}
        notesEnabled={notesEnabled}
        shoppingListEnabled={shoppingListEnabled}
        reviewsEnabled={reviewsEnabled}
        knowledgeEnabled={knowledgeEnabled}
        ideasUnread={ideasUnread}
        reviewsUnread={reviewsUnread}
        onOpenMessage={() => setMessageModalOpen(true)}
        completedCount={completedTasks.length}
        customName={settings.customName}
        allSettings={allSettings}
        tabsOrder={tabsOrder}
      />

      {viewingOther && viewingUser && (
        <div className={styles.banner}>
          Visualizando agenda de <strong>{allSettings[viewingUser.uid]?.customName || viewingUser.displayName || viewingUser.email}</strong>
        </div>
      )}

      <main className={styles.main}>
        {activeTab === 'calendar' && calendarEnabled && (
          isMobile ? (
            <MobileCalendarView
              tasks={tasks}
              onDateClick={handleDateClick}
              onTaskClick={handleTaskClick}
            />
          ) : (
            <CalendarView
              tasks={tasks}
              onDateClick={handleDateClick}
              onTaskClick={handleTaskClick}
            />
          )
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
        {activeTab === 'reels' && reelsEnabled && (
          <ReelsView
            reels={reels}
            addReel={addReel}
            approveReel={approveReel}
            archiveReel={archiveReelItem}
            unarchiveReel={unarchiveReel}
            deleteReel={deleteReel}
            updateDescription={updateReelDescription}
            scripts={scripts}
            addScript={addScript}
            updateScript={updateScript}
            archiveScript={archiveScript}
            unarchiveScript={unarchiveScript}
            deleteScript={deleteScript}
          />
        )}
        {activeTab === 'contentPlan' && contentPlanEnabled && (
          <ContentPlanView
            items={contentPlanItems}
            addItem={addContentPlanItem}
            updateItem={updateContentPlanItem}
            deleteItem={deleteContentPlanItem}
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
            style={{ width: '100%', height: isMobile ? 'calc(100dvh - 110px)' : 'calc(100vh - 120px)', border: 'none' }}
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
        {activeTab === 'settings' && isAdmin && <SettingsView onNavigate={setActiveTab} geminiKey={kbGeminiKey} updateGeminiKey={updateGeminiKey} tabsOrder={tabsOrder} updateTabsOrder={updateTabsOrder} />}
      </main>

      {modalOpen && (
        <TaskModal
          task={editingTask}
          initialDate={initialDate}
          onSave={(data) => addTask(data, user)}
          onUpdate={updateTask}
          onUpdateGroup={updateTaskGroup}
          onDelete={deleteTask}
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
