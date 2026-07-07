import { useState, Suspense, lazy } from 'react';
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
import BottomNav from '../components/BottomNav';
import NoteModal from '../components/NoteModal';
import AdminMessageModal from '../components/AdminMessageModal';
import MessageOverlay from '../components/MessageOverlay';
import MobileCalendarView from '../components/MobileCalendarView';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTabsOrder } from '../hooks/useTabsOrder';
import { useInfluencers } from '../hooks/useInfluencers';
import { useKnowledge } from '../hooks/useKnowledge';
import TaskModal from '../components/TaskModal';
import styles from '../styles/Dashboard.module.css';

// Views carregadas sob demanda (code splitting por aba). Reduz o bundle inicial:
// FullCalendar (Calendar/ContentPlan), Supabase (Preços) e views grandes só
// baixam quando a aba é aberta.
const CalendarView = lazy(() => import('../components/CalendarView'));
const NotesView = lazy(() => import('../components/NotesView'));
const ArchivedView = lazy(() => import('../components/ArchivedView'));
const CompletedView = lazy(() => import('../components/CompletedView'));
const SettingsView = lazy(() => import('../components/SettingsView'));
const IdeasView = lazy(() => import('../components/IdeasView'));
const ReelsView = lazy(() => import('../components/ReelsView'));
const ContentPlanView = lazy(() => import('../components/ContentPlanView'));
const InfluencersView = lazy(() => import('../components/InfluencersView'));
const ReviewsView = lazy(() => import('../components/ReviewsView'));
const KnowledgeView = lazy(() => import('../components/KnowledgeView'));
const PrecosInsumosView = lazy(() => import('../components/PrecosInsumosView'));
const DepartamentoPessoalView = lazy(() => import('../components/DepartamentoPessoalView'));
const ComprasView = lazy(() => import('../components/ComprasView'));

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
  const { tasks, archivedTasks, addTask, updateTask, updateTaskGroup, deleteTask, deleteTaskAndFuture, unarchiveTask } =
    useTasks(selectedUid);
  // Só clearAllChats é usado aqui (ArchivedView); a UI de chat não é montada.
  // subscribe:false evita abrir 1+N listeners de mensagens no login.
  const { clearAllChats } = useChat(user, isAdmin, { subscribe: false });
  const { settings, loading: settingsLoading } = useSettings(user.uid);
  useTaskAlarm(tasks);
  const { messages: adminMessages, sendMessage: sendAdminMessage, markAsRead: markMessageRead, getUnreadForUser, deleteMessage: deleteAdminMessage } =
    useAdminMessages(user);
  const unreadMessage = getUnreadForUser(user.uid);

  const { notes, addNote, updateNote, deleteNote } = useNotes(selectedUid);
  const { completedTasks, archiveCompletedTask } = useCompletedTasks(isAdmin ? users : []);
  const allSettings = useAllSettings(users);

  // Enquanto o doc de settings ainda carrega, `settings` está vazio e todos os
  // `xEnabled !== false` dariam `true` — isso fazia o menu piscar com TODAS as
  // abas antes de o filtro real chegar. Segura tudo desabilitado até carregar.
  const calendarEnabled = !settingsLoading && settings.calendarEnabled !== false;
  const ideasEnabled = !settingsLoading && settings.ideasEnabled !== false;
  const reelsEnabled = !settingsLoading && settings.reelsEnabled !== false;
  const contentPlanEnabled = !settingsLoading && settings.contentPlanEnabled !== false;
  const notesEnabled = !settingsLoading && settings.notesEnabled !== false;
  const shoppingListEnabled = !settingsLoading && settings.shoppingListEnabled !== false;
  const reviewsEnabled = !settingsLoading && settings.reviewsEnabled !== false;
  const knowledgeEnabled = !settingsLoading && settings.knowledgeEnabled !== false;
  const influencersEnabled = !settingsLoading && settings.influencersEnabled !== false;
  const precosInsumosEnabled = !settingsLoading && settings.precosInsumosEnabled !== false;
  // Departamento Pessoal: desmarcado por padrão (default OFF).
  const departamentoPessoalEnabled = !settingsLoading && settings.departamentoPessoalEnabled === true;
  const {
    influencers,
    addInfluencer,
    updateInfluencer,
    deleteInfluencer,
    archiveInfluencer,
    unarchiveInfluencer,
  } = useInfluencers();
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

  // Abas para a barra de navegação mobile (rótulos curtos). Segue a mesma
  // ordem/visibilidade do menu; as 4 primeiras ficam fixas, o resto vai em "Mais".
  const NAV_LABELS = {
    calendar: 'Agenda', reels: 'Instagram', contentPlan: 'Conteúdo', influencers: 'Influencers',
    notes: 'Notas', shopping: 'Compras', ideas: 'Ideias', reviews: 'Avaliações',
    knowledge: 'Conhecimento', precosInsumos: 'Preços', departamentoPessoal: 'Depto',
  };
  const NAV_ENABLED = {
    calendar: calendarEnabled, reels: reelsEnabled, contentPlan: contentPlanEnabled,
    influencers: influencersEnabled, notes: notesEnabled, shopping: shoppingListEnabled,
    ideas: ideasEnabled, reviews: reviewsEnabled, knowledge: knowledgeEnabled,
    precosInsumos: precosInsumosEnabled, departamentoPessoal: departamentoPessoalEnabled,
  };
  const navDot = <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block' }} />;
  const bottomTabs = (tabsOrder && tabsOrder.length ? tabsOrder : Object.keys(NAV_LABELS))
    .filter((k) => NAV_ENABLED[k])
    .map((k) => ({
      key: k,
      label: NAV_LABELS[k] || k,
      badge: (k === 'ideas' && ideasUnread > 0) || (k === 'reviews' && reviewsUnread > 0) ? navDot : null,
    }));

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
        influencersEnabled={influencersEnabled}
        precosInsumosEnabled={precosInsumosEnabled}
        departamentoPessoalEnabled={departamentoPessoalEnabled}
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
        <Suspense fallback={<div className={styles.suspenseFallback}>Carregando…</div>}>
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
        {activeTab === 'influencers' && influencersEnabled && (
          <InfluencersView
            influencers={influencers}
            addInfluencer={addInfluencer}
            updateInfluencer={updateInfluencer}
            deleteInfluencer={deleteInfluencer}
            archiveInfluencer={archiveInfluencer}
            unarchiveInfluencer={unarchiveInfluencer}
          />
        )}
        {activeTab === 'notes' && notesEnabled && (
          <NotesView
            notes={notes}
            onNewNote={() => { setEditingNote(null); setNoteModalOpen(true); }}
            onNoteClick={(note) => { setEditingNote(note); setNoteModalOpen(true); }}
          />
        )}
        {activeTab === 'shopping' && shoppingListEnabled && <ComprasView />}
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
        {activeTab === 'precosInsumos' && precosInsumosEnabled && <PrecosInsumosView />}
        {activeTab === 'departamentoPessoal' && departamentoPessoalEnabled && <DepartamentoPessoalView />}
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
        </Suspense>
      </main>

      {isMobile && <BottomNav tabs={bottomTabs} activeTab={activeTab} onTabChange={setActiveTab} />}

      {modalOpen && (
        <TaskModal
          task={editingTask}
          initialDate={initialDate}
          onSave={(data) => addTask(data, user)}
          onUpdate={updateTask}
          onUpdateGroup={updateTaskGroup}
          onDelete={deleteTask}
          onDeleteAndFuture={deleteTaskAndFuture}
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
