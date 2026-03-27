import styles from '../styles/ThemeView.module.css';

const THEME_OPTIONS = [
  {
    id: 'notion',
    name: 'Notion',
    description: 'Tema claro inspirado no Notion com tons neutros e tipografia limpa.',
    preview: { bg: '#f7f7f5', card: '#ffffff', accent: '#2563eb', text: '#37352f', sidebar: '#fbfbfa' },
  },
  {
    id: 'dark',
    name: 'Escuro',
    description: 'Tema escuro com contraste suave, ideal para uso noturno.',
    preview: { bg: '#191919', card: '#202020', accent: '#4a9eff', text: '#e0e0e0', sidebar: '#252525' },
  },
  {
    id: 'clean',
    name: 'Clean',
    description: 'Tema minimalista com fundo branco puro e detalhes sutis em azul.',
    preview: { bg: '#ffffff', card: '#f8fafc', accent: '#3b82f6', text: '#1e293b', sidebar: '#f1f5f9' },
  },
];

export default function ThemeView({ currentTheme, onChangeTheme }) {
  return (
    <div className={styles.container}>
      <h2>Temas</h2>
      <p className={styles.subtitle}>Escolha a aparência da sua agenda.</p>

      <div className={styles.grid}>
        {THEME_OPTIONS.map((t) => {
          const isActive = currentTheme === t.id;
          return (
            <button
              key={t.id}
              className={`${styles.card} ${isActive ? styles.active : ''}`}
              onClick={() => onChangeTheme(t.id)}
            >
              <div className={styles.preview} style={{ background: t.preview.bg }}>
                <div className={styles.previewHeader} style={{ background: t.preview.card, borderBottom: `1px solid ${t.preview.bg}` }}>
                  <span className={styles.previewDot} style={{ background: t.preview.accent }} />
                  <span className={styles.previewLine} style={{ background: t.preview.text, opacity: 0.3 }} />
                </div>
                <div className={styles.previewBody}>
                  <div className={styles.previewSidebar} style={{ background: t.preview.sidebar }}>
                    <span className={styles.previewSmLine} style={{ background: t.preview.text, opacity: 0.15 }} />
                    <span className={styles.previewSmLine} style={{ background: t.preview.accent, opacity: 0.4 }} />
                    <span className={styles.previewSmLine} style={{ background: t.preview.text, opacity: 0.15 }} />
                  </div>
                  <div className={styles.previewContent}>
                    <div className={styles.previewCard} style={{ background: t.preview.card }}>
                      <span className={styles.previewSmLine} style={{ background: t.preview.text, opacity: 0.2, width: '60%' }} />
                      <span className={styles.previewSmLine} style={{ background: t.preview.text, opacity: 0.1, width: '80%' }} />
                    </div>
                    <div className={styles.previewCard} style={{ background: t.preview.card }}>
                      <span className={styles.previewSmLine} style={{ background: t.preview.accent, opacity: 0.3, width: '40%' }} />
                      <span className={styles.previewSmLine} style={{ background: t.preview.text, opacity: 0.1, width: '70%' }} />
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.info}>
                <h3>{t.name}</h3>
                <p>{t.description}</p>
              </div>
              {isActive && <span className={styles.badge}>Ativo</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
