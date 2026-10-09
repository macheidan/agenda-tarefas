import { useMemo, useState } from 'react';
import { usePostagens } from '../hooks/usePostagens';
import PostagemModal from './PostagemModal';
import {
  MARCA_LABEL, TIPO_LABEL, FORMATO_LABEL, STATUS, statusDe, hora, pad,
} from '../utils/postagens';
import styles from '../styles/PostagensView.module.css';

// Calendário só de leitura da fila do /mkt-social-agendamento, no molde do
// mLabs (publish.mlabs.io/schedules). Agendar continua sendo pela skill.

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MARCAS = [
  { key: 'todas', label: 'Todas' },
  { key: 'dame', label: 'Dáme' },
  { key: 'lov', label: 'Lov' },
];

const VIEWS = [
  { key: 'mes', label: 'Mês' },
  { key: 'semana', label: 'Semana' },
  { key: 'lista', label: 'Lista' },
];

const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

/** Dias exibidos: semanas inteiras cobrindo o mês, ou a semana da âncora. */
function diasDaGrade(anchor, view) {
  const ini = view === 'semana'
    ? startOfWeek(anchor)
    : startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const fimMes = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const total = view === 'semana'
    ? 7
    : Math.ceil(((fimMes - ini) / 86400000 + 1) / 7) * 7;
  return Array.from({ length: total }, (_, i) => new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i));
}

function Icone({ tipo, formato }) {
  // Story = círculo (anel do story); post = quadrado; vídeo leva o "play".
  const video = formato === 'VIDEO';
  return (
    <svg className={styles.icone} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {tipo === 'story'
        ? <circle cx="8" cy="8" r="6.2" strokeDasharray="3 1.6" />
        : <rect x="2" y="2" width="12" height="12" rx="3.2" />}
      {video
        ? <path d="M6.6 5.6v4.8L10.4 8z" fill="currentColor" stroke="none" />
        : formato === 'CARROSSEL'
          ? <path d="M5.5 6.5h5M5.5 9.5h5" />
          : <circle cx="8" cy="8" r="2" />}
    </svg>
  );
}

function Item({ p, onOpen }) {
  const st = statusDe(p.status);
  return (
    <button type="button" className={`${styles.item} ${styles[`marca_${p.marca}`] || ''}`} onClick={() => onOpen(p)} title={`${MARCA_LABEL[p.marca] || p.marca} · ${TIPO_LABEL[p.tipo] || p.tipo} · ${st.label}`}>
      <Icone tipo={p.tipo} formato={p.formato} />
      <span className={styles.itemMarca}>{MARCA_LABEL[p.marca] || p.marca}</span>
      <span className={`${styles.itemHora} ${styles[st.cls]}`}>{hora(p.data)}</span>
      <span className={`${styles.stIcon} ${styles[st.cls]}`}>{st.icon}</span>
    </button>
  );
}

export default function PostagensView() {
  const { itens, lido, loading, error, reload } = usePostagens();
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState(() => (window.matchMedia?.('(max-width: 768px)').matches ? 'lista' : 'mes'));
  const [marca, setMarca] = useState('todas');
  const [aberto, setAberto] = useState(null);

  const posts = useMemo(() => itens
    .map((p) => ({ ...p, data: new Date(p.quando) }))
    .filter((p) => !Number.isNaN(p.data.getTime()))
    .filter((p) => marca === 'todas' || p.marca === marca)
    .sort((a, b) => a.data - b.data), [itens, marca]);

  const porDia = useMemo(() => {
    const m = new Map();
    for (const p of posts) {
      const k = dayKey(p.data);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    return m;
  }, [posts]);

  const contagem = useMemo(() => {
    const c = { todas: 0, dame: 0, lov: 0 };
    for (const p of itens) {
      const d = new Date(p.quando);
      if (d.getFullYear() !== anchor.getFullYear() || d.getMonth() !== anchor.getMonth()) continue;
      c.todas += 1;
      if (c[p.marca] !== undefined) c[p.marca] += 1;
    }
    return c;
  }, [itens, anchor]);

  const dias = useMemo(() => diasDaGrade(anchor, view), [anchor, view]);
  const hoje = dayKey(new Date());

  const doMes = useMemo(() => posts.filter((p) =>
    p.data.getFullYear() === anchor.getFullYear() && p.data.getMonth() === anchor.getMonth()), [posts, anchor]);

  const mover = (dir) => {
    const d = new Date(anchor);
    if (view === 'semana') d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir, 1);
    setAnchor(d);
  };

  const titulo = view === 'semana'
    ? (() => {
      const a = dias[0];
      const b = dias[6];
      return `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3).toLowerCase()} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3).toLowerCase()} ${b.getFullYear()}`;
    })()
    : `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Postagens</h2>
        <div className={styles.headerActions}>
          {MARCAS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`${styles.subBtn} ${marca === m.key ? styles.subBtnActive : ''}`}
              onClick={() => setMarca(m.key)}
            >
              {m.label} ({contagem[m.key]})
            </button>
          ))}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button type="button" className={styles.navBtn} onClick={() => mover(-1)} aria-label="Anterior">‹</button>
          <span className={styles.titleText}>{titulo}</span>
          <button type="button" className={styles.navBtn} onClick={() => mover(1)} aria-label="Próximo">›</button>
          <button type="button" className={styles.ghostBtn} onClick={() => setAnchor(new Date())}>Hoje</button>
          <code className={styles.skillHint} title="Para agendar, rode no Claude Code">/skill mkt-social-agendamento</code>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.viewToggle}>
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                className={`${styles.viewBtn} ${view === v.key ? styles.viewBtnActive : ''}`}
                onClick={() => setView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.ghostBtn} onClick={reload} disabled={loading}>
            {loading ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className={styles.legend}>
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k}><span className={`${styles.stIcon} ${styles[s.cls]}`}>{s.icon}</span> {s.label}</span>
        ))}
        <span className={styles.legendSep} />
        <span><Icone tipo="post" formato="IMAGEM" /> Post</span>
        <span><Icone tipo="story" formato="IMAGEM" /> Story</span>
        <span><Icone tipo="post" formato="VIDEO" /> Vídeo</span>
        {lido && <span className={styles.lido}>lido às {hora(new Date(lido))}</span>}
      </div>

      {error && <div className={styles.erro}>Não deu para ler a fila: {error}</div>}

      {view === 'lista' ? (
        doMes.length === 0 ? (
          <div className={styles.empty}>{loading ? 'Carregando…' : 'Nenhuma postagem neste mês.'}</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Marca</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Legenda</th>
              </tr>
            </thead>
            <tbody>
              {doMes.map((p) => {
                const st = statusDe(p.status);
                return (
                  <tr key={p.id} onClick={() => setAberto(p)}>
                    <td data-label="Quando">{WEEKDAYS[p.data.getDay()]} {pad(p.data.getDate())}/{pad(p.data.getMonth() + 1)} · {hora(p.data)}</td>
                    <td data-label="Marca">{MARCA_LABEL[p.marca] || p.marca}</td>
                    <td data-label="Tipo"><span className={styles.tipoCell}><Icone tipo={p.tipo} formato={p.formato} /> {TIPO_LABEL[p.tipo] || p.tipo} · {FORMATO_LABEL[p.formato] || p.formato}</span></td>
                    <td data-label="Status"><span className={`${styles.chip} ${styles[st.cls]}`}>{st.label}</span></td>
                    <td data-label="Legenda" className={styles.legendaCell}>{p.legenda || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : (
        <div className={`${styles.grid} ${view === 'semana' ? styles.gridSemana : ''}`}>
          {WEEKDAYS.map((w) => <div key={w} className={styles.weekday}>{w}</div>)}
          {dias.map((d) => {
            const k = dayKey(d);
            const lista = porDia.get(k) || [];
            const pub = lista.filter((p) => statusDe(p.status) === STATUS.publicado).length;
            const fora = view === 'mes' && d.getMonth() !== anchor.getMonth();
            return (
              <div key={k} className={`${styles.cell} ${fora ? styles.cellFora : ''} ${k === hoje ? styles.cellHoje : ''} ${k < hoje ? styles.cellPassado : ''}`}>
                <div className={styles.cellNum}>{d.getDate()}</div>
                <div className={styles.cellItens}>
                  {lista.map((p) => <Item key={p.id} p={p} onOpen={setAberto} />)}
                </div>
                {lista.length > 0 && <div className={styles.cellRodape}>{pub}/{lista.length}</div>}
              </div>
            );
          })}
        </div>
      )}

      {aberto && <PostagemModal post={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
