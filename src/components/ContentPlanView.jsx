import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ContentPlanView.module.css';

const WEEKDAYS = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];

const FORMAT_CLASSES = {
  STORY: 'fmtStory',
  REEL: 'fmtReel',
  FEED: 'fmtFeed',
};

const PILLAR_CLASSES = {
  red: 'pillarRed',
  blue: 'pillarBlue',
  yellow: 'pillarYellow',
  purple: 'pillarPurple',
  teal: 'pillarTeal',
  green: 'pillarGreen',
};

function parseDate(dateStr) {
  return new Date(dateStr + 'T12:00:00');
}

function dateLabel(dateStr) {
  const d = parseDate(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { day: dd, month: mm, weekday: WEEKDAYS[d.getDay()] };
}

export default function ContentPlanView({ posts, onAddPost, onPostClick }) {
  const { isAdmin } = useAuth();

  const grouped = useMemo(() => {
    const byDate = {};
    for (const post of posts) {
      if (!post.date) continue;
      if (!byDate[post.date]) byDate[post.date] = [];
      byDate[post.date].push(post);
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, items }));
  }, [posts]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Content Plan</h2>
        {isAdmin && (
          <button className={styles.addBtn} onClick={() => onAddPost()}>
            + Novo post
          </button>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className={styles.empty}>
          <p>
            Nenhum post ainda.
            {isAdmin ? ' Clique em "+ Novo post" para começar.' : ''}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {grouped.map(({ date, items }) => {
            const { day, month, weekday } = dateLabel(date);
            return (
              <div key={date} className={styles.dayCard}>
                <div className={styles.weekday}>{weekday}</div>
                <div className={styles.date}>
                  <span className={styles.day}>{day}</span>
                  <span className={styles.month}>/{month}</span>
                </div>
                <div className={styles.posts}>
                  {items.map((post) => (
                    <button
                      key={post.id}
                      className={styles.postItem}
                      onClick={() => onPostClick(post)}
                    >
                      <span
                        className={`${styles.pillarDot} ${styles[PILLAR_CLASSES[post.pillarColor] || 'pillarRed']}`}
                      />
                      <span
                        className={`${styles.formatTag} ${styles[FORMAT_CLASSES[post.format] || 'fmtStory']}`}
                      >
                        {post.format || 'STORY'}
                      </span>
                      <span className={styles.postTitle}>{post.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
