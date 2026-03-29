import { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from '../styles/SocialCalendarView.module.css';

const NETWORK_COLORS = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#000000',
};

const NETWORK_ICONS = {
  instagram: '📷',
  facebook: '📘',
  tiktok: '🎵',
};

const STATUS_LABELS = {
  scheduled: 'Agendado',
  published: 'Publicado',
  draft: 'Rascunho',
};

const STATUS_COLORS = {
  scheduled: '#2196f3',
  published: '#4caf50',
  draft: '#9e9e9e',
};

export default function SocialCalendarView({
  posts,
  profiles,
  onNewPost,
  onEditPost,
  onDeletePost,
  onManageProfiles,
}) {
  const [view, setView] = useState('calendar');
  const today = new Date().toISOString().split('T')[0];

  const events = posts.map((post) => {
    const networks = post.networks || [];
    const color = networks.length === 1 ? NETWORK_COLORS[networks[0]] : '#6366f1';
    return {
      id: post.id,
      title: post.text ? post.text.substring(0, 40) : 'Sem texto',
      start: post.scheduledDate,
      backgroundColor: color + '22',
      borderColor: 'transparent',
      textColor: color,
      classNames: ['social-event'],
      extendedProps: { post },
    };
  });

  const upcomingPosts = [...posts]
    .filter((p) => p.scheduledDate >= today || p.status === 'draft')
    .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

  const pastPosts = [...posts]
    .filter((p) => p.scheduledDate < today && p.status !== 'draft')
    .sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || ''));

  const formatDateTime = (date, time) => {
    if (!date) return '';
    const d = new Date(date + 'T' + (time || '00:00'));
    return d.toLocaleDateString('pt-BR') + (time ? ' às ' + time : '');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>Social Calendar</h2>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${view === 'calendar' ? styles.viewActive : ''}`}
              onClick={() => setView('calendar')}
            >
              Calendário
            </button>
            <button
              className={`${styles.viewBtn} ${view === 'list' ? styles.viewActive : ''}`}
              onClick={() => setView('list')}
            >
              Lista
            </button>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.profilesBtn} onClick={onManageProfiles}>
            Perfis Conectados ({profiles.length})
          </button>
          <button className={styles.newPostBtn} onClick={() => onNewPost(null)}>
            + Agendar Post
          </button>
        </div>
      </div>

      {profiles.length === 0 && (
        <div className={styles.profileAlert}>
          Nenhum perfil conectado.
          <button className={styles.alertBtn} onClick={onManageProfiles}>
            Conectar perfis
          </button>
        </div>
      )}

      {view === 'calendar' ? (
        <div className={styles.calendarWrap}>
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="pt-br"
            headerToolbar={{
              left: 'title',
              center: '',
              right: 'prev,next today',
            }}
            events={events}
            dateClick={(info) => onNewPost(info.dateStr)}
            eventClick={(info) => {
              info.jsEvent.preventDefault();
              onEditPost(info.event.extendedProps.post);
            }}
            height="auto"
            dayMaxEvents={3}
            buttonText={{ today: 'Hoje' }}
            fixedWeekCount={false}
          />
        </div>
      ) : (
        <div className={styles.listView}>
          {upcomingPosts.length > 0 && (
            <div className={styles.listSection}>
              <h3 className={styles.listSectionTitle}>Próximos</h3>
              {upcomingPosts.map((post) => (
                <div key={post.id} className={styles.postCard} onClick={() => onEditPost(post)}>
                  <div className={styles.postNetworks}>
                    {(post.networks || []).map((n) => (
                      <span key={n} className={styles.networkIcon} style={{ color: NETWORK_COLORS[n] }}>
                        {NETWORK_ICONS[n]}
                      </span>
                    ))}
                  </div>
                  <div className={styles.postInfo}>
                    <p className={styles.postText}>
                      {post.text ? post.text.substring(0, 80) + (post.text.length > 80 ? '...' : '') : 'Sem texto'}
                    </p>
                    <span className={styles.postDate}>
                      {formatDateTime(post.scheduledDate, post.scheduledTime)}
                    </span>
                  </div>
                  <span
                    className={styles.postStatus}
                    style={{ background: STATUS_COLORS[post.status] }}
                  >
                    {STATUS_LABELS[post.status]}
                  </span>
                  <button
                    className={styles.postDeleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Excluir este agendamento?')) onDeletePost(post.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {pastPosts.length > 0 && (
            <div className={styles.listSection}>
              <h3 className={styles.listSectionTitle}>Histórico</h3>
              {pastPosts.map((post) => (
                <div key={post.id} className={styles.postCard} onClick={() => onEditPost(post)}>
                  <div className={styles.postNetworks}>
                    {(post.networks || []).map((n) => (
                      <span key={n} className={styles.networkIcon} style={{ color: NETWORK_COLORS[n] }}>
                        {NETWORK_ICONS[n]}
                      </span>
                    ))}
                  </div>
                  <div className={styles.postInfo}>
                    <p className={styles.postText}>
                      {post.text ? post.text.substring(0, 80) + (post.text.length > 80 ? '...' : '') : 'Sem texto'}
                    </p>
                    <span className={styles.postDate}>
                      {formatDateTime(post.scheduledDate, post.scheduledTime)}
                    </span>
                  </div>
                  <span
                    className={styles.postStatus}
                    style={{ background: STATUS_COLORS[post.status] }}
                  >
                    {STATUS_LABELS[post.status]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {posts.length === 0 && (
            <div className={styles.empty}>
              <p>Nenhum post agendado. Clique em "+ Agendar Post" para começar.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
