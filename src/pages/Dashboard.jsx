import { useState, useEffect, Suspense, lazy } from 'react';
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
import { useStickyNotes } from '../hooks/useStickyNotes';
import { useSurveys } from '../hooks/useSurveys';
import { useCompletedTasks } from '../hooks/useCompletedTasks';
import { useAllSettings } from '../hooks/useAllSettings';
import Header from '../components/Header';
import AppShellV2 from '../components/v2/AppShellV2';
import { IS_V2 } from '../lib/v2';
import BottomNav from '../components/BottomNav';
import NoteModal from '../components/NoteModal';
import AdminMessageModal from '../components/AdminMessageModal';
import MessageOverlay from '../components/MessageOverlay';
import MobileCalendarView from '../components/MobileCalendarView';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTabsOrder } from '../hooks/useTabsOrder';
import { useVersionCheck } from '../hooks/useVersionCheck';
import { useInfluencers } from '../hooks/useInfluencers';
import { useKnowledge } from '../hooks/useKnowledge';
import TaskModal from '../components/TaskModal';
import styles from '../styles/Dashboard.module.css';

// Views carregadas sob demanda (code splitting por aba). Reduz o bundle inicial:
// FullCalendar (Calendar/ContentPlan), Supabase (Preços) e views grandes só
// baixam quando a aba é aberta.
const CalendarView = lazy(() => import('../components/CalendarView'));
const StickyNotes = lazy(() => import('../components/StickyNotes'));
const NotesView = lazy(() => import('../components/NotesView'));
const ArchivedView = lazy(() => import('../components/ArchivedView'));
const CompletedView = lazy(() => import('../components/CompletedView'));
const SettingsView = lazy(() => import('../components/SettingsView'));
const IdeasView = lazy(() => import('../components/IdeasView'));
const ReelsView = lazy(() => import('../components/ReelsView'));
const ContentPlanView = lazy(() => import('../components/ContentPlanView'));
const InfluencersView = lazy(() => import('../components/InfluencersView'));
const SurveysView = lazy(() => import('../components/SurveysView'));
const KnowledgeView = lazy(() => import('../components/KnowledgeView'));
const PrecosInsumosView = lazy(() => import('../components/PrecosInsumosView'));
const DepartamentoPessoalView = lazy(() => import('../components/DepartamentoPessoalView'));
const ComprasView = lazy(() => import('../components/ComprasView'));
const MotoboysView = lazy(() => import('../components/MotoboysView'));

// Rótulos curtos das abas — usados na barra de navegação mobile e no título da
// janela do navegador (assim a aba do Chrome mostra em que página a pessoa está).
const NAV_LABELS = {
  calendar: 'Agenda', reels: 'Instagram', contentPlan: 'Conteúdo', influencers: 'Influencers',
  notes: 'Notas', shopping: 'Compras', ideas: 'Ideias', reviews: 'Avaliações',
  knowledge: 'Conhecimento', precosInsumos: 'Preços', departamentoPessoal: 'Depto',
  motoboys: 'Motoboys',
};

// Abas que só existem pro admin (não entram no menu/nav comum).
const ADMIN_TABS = { completed: 'Concluídas', archived: 'Arquivadas', settings: 'Configurações' };

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const users = useUsers();
  const isMobile = useIsMobile(768);
  const { order: tabsOrder, updateOrder: updateTabsOrder } = useTabsOrder();
  const { updateAvailable, reload } = useVersionCheck();

  const [selectedUid, setSelectedUid] = useState(user.uid);
  // Deep-link por query param (?tab=...): permite abrir uma aba especifica numa
  // nova aba do navegador (ex: clicar num item em "Subiram" abre Preços filtrado).
  // A aba ativa também é ESCRITA de volta na URL (efeito mais abaixo), então F5
  // volta pra onde a pessoa estava em vez de cair na Agenda.
  // `tabEscolhida` é o que a pessoa clicou; `activeTab` (derivado mais abaixo) é
  // o que de fato aparece — pode diferir se a aba escolhida não estiver mais
  // disponível.
  const [tabEscolhida, setActiveTab] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('tab') || 'calendar'; }
    catch { return 'calendar'; }
  });
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

  const { notes, addNote, updateNote, deleteNote, reorderNotes } = useNotes(selectedUid);
  const { stickyNotes, addStickyNote, updateStickyNote, deleteStickyNote, reorderStickyNotes } =
    useStickyNotes(selectedUid);
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
  // Motoboys (conferência semanal): default OFF, admin habilita por usuário.
  const motoboysEnabled = !settingsLoading && settings.motoboysEnabled === true;
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
  const { surveys, loading: surveysLoading, error: surveysError, setArchived: setSurveyArchived } = useSurveys();

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

  // Abas para a barra de navegação mobile (rótulos em NAV_LABELS, no topo do
  // arquivo). Segue a mesma ordem/visibilidade do menu; as 4 primeiras ficam
  // fixas, o resto vai em "Mais".
  const NAV_ENABLED = {
    calendar: calendarEnabled, reels: reelsEnabled, contentPlan: contentPlanEnabled,
    influencers: influencersEnabled, notes: notesEnabled, shopping: shoppingListEnabled,
    ideas: ideasEnabled, reviews: reviewsEnabled, knowledge: knowledgeEnabled,
    precosInsumos: precosInsumosEnabled, departamentoPessoal: departamentoPessoalEnabled,
    motoboys: motoboysEnabled,
  };
  const navDot = <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block' }} />;
  const bottomTabs = (tabsOrder && tabsOrder.length ? tabsOrder : Object.keys(NAV_LABELS))
    .filter((k) => NAV_ENABLED[k])
    .map((k) => ({
      key: k,
      label: NAV_LABELS[k] || k,
      badge: k === 'ideas' && ideasUnread > 0 ? navDot : null,
    }));

  // ── Onde eu estou / F5 não me joga pra Agenda ─────────────────────────────
  // A aba que veio da URL pode não valer mais: feature desligada nas
  // Configurações, usuário sem permissão de admin, ou chave antiga de uma
  // versão anterior. Sem isso o conteúdo abriria em branco. Nesse caso cai na 1ª
  // aba visível — derivando, sem corrigir o estado num efeito.
  const abaOk = settingsLoading
    || (tabEscolhida in NAV_ENABLED ? NAV_ENABLED[tabEscolhida] : tabEscolhida in ADMIN_TABS ? isAdmin : false);
  const activeTab = abaOk ? tabEscolhida : (bottomTabs[0]?.key || 'calendar');

  // Sem router: a aba ativa é escrita de volta na URL (?tab=…) com replaceState
  // — replace e não push, pra não encher o histórico do botão Voltar com cada
  // troca de aba. Recarregar a página cai no mesmo lugar, o link fica
  // compartilhável e a barra de endereço mostra em que página se está.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') === activeTab) return;
      url.searchParams.set('tab', activeTab);
      window.history.replaceState(null, '', url);
    } catch { /* URL malformada: navegação por estado segue funcionando */ }
  }, [activeTab]);

  // O nome da página também vai pro título da janela — é o que identifica a aba
  // no navegador quando há várias abertas.
  useEffect(() => {
    const nome = NAV_LABELS[activeTab] || ADMIN_TABS[activeTab];
    document.title = nome ? `${nome} · Intranet` : 'Intranet';
  }, [activeTab]);

  // Props do shell — o Header (v1) e o AppShellV2 (v2) consomem as MESMAS.
  const shellProps = {
    activeTab,
    onTabChange: setActiveTab,
    users,
    selectedUid,
    onSelectUser: setSelectedUid,
    calendarEnabled,
    ideasEnabled,
    reelsEnabled,
    contentPlanEnabled,
    notesEnabled,
    shoppingListEnabled,
    reviewsEnabled,
    knowledgeEnabled,
    influencersEnabled,
    precosInsumosEnabled,
    departamentoPessoalEnabled,
    motoboysEnabled,
    ideasUnread,
    onOpenMessage: () => setMessageModalOpen(true),
    completedCount: completedTasks.length,
    customName: settings.customName,
    allSettings,
    tabsOrder,
  };

  const bannerEl = viewingOther && viewingUser && (
    <div className={styles.banner}>
      Visualizando agenda de <strong>{allSettings[viewingUser.uid]?.customName || viewingUser.displayName || viewingUser.email}</strong>
    </div>
  );

  const mainEl = (
      <main className={`${styles.main} ${activeTab === 'calendar' && !isMobile ? styles.mainCalendar : ''} ${IS_V2 ? styles.mainV2 : ''}`}>
        <Suspense fallback={<div className={styles.suspenseFallback}>Carregando…</div>}>
        {activeTab === 'calendar' && calendarEnabled && (
          isMobile ? (
            <MobileCalendarView
              tasks={tasks}
              onDateClick={handleDateClick}
              onTaskClick={handleTaskClick}
            />
          ) : (
            <div className={styles.calendarLayout}>
              <StickyNotes
                side="left"
                stickyNotes={stickyNotes}
                addStickyNote={addStickyNote}
                updateStickyNote={updateStickyNote}
                deleteStickyNote={deleteStickyNote}
                reorderStickyNotes={reorderStickyNotes}
              />
              <div className={styles.calendarMain}>
                <CalendarView
                  tasks={tasks}
                  onDateClick={handleDateClick}
                  onTaskClick={handleTaskClick}
                />
              </div>
              <StickyNotes
                side="right"
                stickyNotes={stickyNotes}
                addStickyNote={addStickyNote}
                updateStickyNote={updateStickyNote}
                deleteStickyNote={deleteStickyNote}
                reorderStickyNotes={reorderStickyNotes}
              />
            </div>
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
            onReorder={reorderNotes}
          />
        )}
        {activeTab === 'shopping' && shoppingListEnabled && <ComprasView />}
        {activeTab === 'reviews' && reviewsEnabled && (
          <SurveysView
            surveys={surveys}
            loading={surveysLoading}
            error={surveysError}
            setArchived={setSurveyArchived}
            settings={settings}
            isAdmin={isAdmin}
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
        {activeTab === 'motoboys' && motoboysEnabled && <MotoboysView />}
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
  );

  const overlays = (
    <>
      {updateAvailable && (
        <button
          onClick={reload}
          style={{
            position: 'fixed', bottom: isMobile ? 96 : 20, right: 20, zIndex: 2000,
            padding: '10px 16px', border: 'none', borderRadius: 8,
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 14px rgba(16,24,40,.25)', cursor: 'pointer',
          }}
        >
          Nova versão disponível · Atualizar
        </button>
      )}

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
    </>
  );

  // v2: shell com sidebar + topbar (spec-kit). Mobile usa o drawer da sidebar,
  // por isso não monta a BottomNav.
  if (IS_V2) {
    return (
      <AppShellV2 {...shellProps}>
        {bannerEl}
        {mainEl}
        {overlays}
      </AppShellV2>
    );
  }

  return (
    <div className={styles.container}>
      <Header {...shellProps} />
      {bannerEl}
      {mainEl}
      {isMobile && <BottomNav tabs={bottomTabs} activeTab={activeTab} onTabChange={setActiveTab} />}
      {overlays}
    </div>
  );
}
