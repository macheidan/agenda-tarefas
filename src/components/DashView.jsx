import {
  createContext, Fragment, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useDashFeed } from '../hooks/useDashFeed';
import gStyles from '../styles/Gestao.module.css';
import styles from '../styles/DashView.module.css';

// Dash (Gestão): board pessoal em 4 colunas (ops | mercado | social | ia) com
// cards arrastáveis entre colunas. Fonte: JSON do coletor Python (useDashFeed)
// + localStorage (foco, frases, layout). Port do /dash do dashboard_pizzarias.

// ── helpers ───────────────────────────────────────────────────────────────
function ago(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const m = Math.floor((Date.now() - d.getTime()) / 6e4);
  if (m < 2) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const Icon = ({ path }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

const I = {
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  quote: <path d="M9 7H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v4l4-4V9a2 2 0 0 0-2-2zM21 7h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v4" />,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  radar: <><path d="M19.07 4.93A10 10 0 0 0 6.99 3.34M4 6h.01M2.29 9.62a10 10 0 1 0 19.02-1.27" /><path d="M16.24 7.76a6 6 0 1 0 1.07 7.44M12 18h.01M17.99 11.66a6 6 0 0 1-2.22 5.01" /><circle cx="12" cy="12" r="2" /><path d="m13.41 10.59 5.66-5.66" /></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></>,
  github: <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  rss: <><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></>,
  instagram: <><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></>,
  youtube: <><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" /><path d="m10 15 5-3-5-3z" /></>,
  grip: <><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  archive: <><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" /></>,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  left: <path d="M15 18l-6-6 6-6" />,
  right: <path d="M9 6l6 6-6 6" />,
  up: <path d="M18 15l-6-6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  ext: <><path d="M15 3h6v6M10 14L21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  star: <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 21.4l1.4-6.8L2.2 9.9l6.9-.8L12 2z" />,
  cloud: <path d="M17.5 19a4.5 4.5 0 1 0-.42-8.98 6 6 0 1 0-11.06 3.1A3.5 3.5 0 0 0 7 19.5h10.5z" />,
  retry: <><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>,
};

const MiniBtn = ({ children, onClick, disabled, title }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={title} className={gStyles.miniBtn}>
    {children}
  </button>
);

// ── drag & drop de cards (grip no cabeçalho, arrasta entre colunas) ───────
const CardDndContext = createContext(null);

function CardGrip() {
  const ctx = useContext(CardDndContext);
  if (!ctx) return null;
  return (
    <span draggable onDragStart={ctx.onDragStart} title="Arrastar card" className={styles.grip}>
      <Icon path={I.grip} />
    </span>
  );
}

function SectionCard({ icon, label, sub, right, foco, bodyStyle, children }) {
  return (
    <div className={`${styles.card} ${foco ? styles.cardFoco : ''}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardLabel}>
          <CardGrip />
          <Icon path={icon} />
          <span>{label}</span>
          {sub && <span className={styles.cardSub}>{sub}</span>}
        </div>
        {right && <div className={styles.cardRight}>{right}</div>}
      </div>
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}

const Empty = ({ children }) => <div className={styles.empty}>{children}</div>;

// ── Foco (lista de itens/lembretes em localStorage) ───────────────────────
const FOCO_KEY = 'pizzas-foco-itens';
const fid = () => `f${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

function focoLoad() {
  try {
    const raw = localStorage.getItem(FOCO_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch { /* usa vazio */ }
  return [];
}

function FocoCard() {
  const [items, setItems] = useState(focoLoad);
  const [showArch, setShowArch] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState(null);
  const [menuId, setMenuId] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(FOCO_KEY, JSON.stringify(items)); } catch { /* só não persiste */ }
  }, [items]);

  useEffect(() => {
    if (!menuId) return undefined;
    const h = () => setMenuId(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuId]);

  const ativos = items.filter((x) => !x.arch);
  const arq = items.filter((x) => x.arch);
  const show = showArch ? items : ativos;

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setItems((p) => [{ id: fid(), text: t, arch: false, ts: Date.now() }, ...p]);
    setDraft('');
  };

  return (
    <SectionCard
      icon={I.target}
      label="Foco"
      foco
      sub={ativos.length ? `${ativos.length} ${ativos.length > 1 ? 'itens' : 'item'}` : undefined}
    >
      <div className={styles.focoInputRow}>
        <input
          className={styles.focoInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="novo item ou lembrete…"
          maxLength={200}
        />
        <MiniBtn onClick={add} title="Adicionar"><Icon path={I.plus} /></MiniBtn>
      </div>

      <div className={styles.focoList}>
        {show.length ? show.map((it) => (
          <div key={it.id} className={styles.focoRow}>
            <button
              type="button"
              className={`${styles.focoCheck} ${it.arch ? styles.focoCheckDone : ''}`}
              title={it.arch ? 'desarquivar' : 'arquivar'}
              onClick={() => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, arch: !x.arch } : x)))}
            >
              <Icon path={I.check} />
            </button>
            {editId === it.id ? (
              <input
                autoFocus
                className={styles.focoEdit}
                defaultValue={it.text}
                maxLength={200}
                onBlur={(e) => {
                  setEditId(null);
                  const t = e.target.value.trim();
                  if (t && t !== it.text) {
                    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, text: t } : x)));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') { e.currentTarget.value = it.text; e.currentTarget.blur(); }
                }}
              />
            ) : (
              <div
                className={`${styles.focoText} ${it.arch ? styles.focoTextDone : ''}`}
                onClick={() => setEditId(it.id)}
              >
                {it.text}
              </div>
            )}
            <button
              type="button"
              className={styles.focoMenuBtn}
              onClick={(e) => { e.stopPropagation(); setMenuId((m) => (m === it.id ? null : it.id)); }}
            >
              <Icon path={I.more} />
            </button>
            {menuId === it.id && (
              <div className={styles.focoMenu} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={styles.focoMenuItem}
                  onClick={() => {
                    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, arch: !x.arch } : x)));
                    setMenuId(null);
                  }}
                >
                  <Icon path={I.archive} /> {it.arch ? 'desarquivar' : 'arquivar'}
                </button>
                <button
                  type="button"
                  className={`${styles.focoMenuItem} ${styles.focoMenuItemDanger}`}
                  onClick={() => {
                    if (!window.confirm('Excluir este item?')) return;
                    setItems((p) => p.filter((x) => x.id !== it.id));
                    setMenuId(null);
                  }}
                >
                  <Icon path={I.trash} /> excluir
                </button>
              </div>
            )}
          </div>
        )) : (
          <Empty>tudo limpo ✦</Empty>
        )}
      </div>

      {arq.length > 0 && (
        <button type="button" className={styles.focoArquivados} onClick={() => setShowArch((v) => !v)}>
          {showArch ? 'ocultar' : 'ver'} arquivados ({arq.length})
        </button>
      )}
    </SectionCard>
  );
}

// ── Frase do dia (rotação diária, editável, localStorage) ─────────────────
const FRASES_DEFAULT = [
  'Quantos vencem se eu vencer?',
  'Não perca tempo olhando para o passado.',
  'Focalize soluções.',
  'Faça!',
  'Se tiver duas coisas para fazer hoje, escolha a mais arriscada.',
  'Jogue para ganhar!!',
  'Where the focus goes the energy flows.',
];
const FRASES_KEY = 'dash-frases-v1';

function fraseHoje() {
  let list = FRASES_DEFAULT;
  try {
    const raw = localStorage.getItem(FRASES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.list) && parsed.list.length) list = parsed.list;
    }
  } catch { /* usa default */ }
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 864e5);
  return { frase: list[dayOfYear % list.length], total: list.length };
}

function FraseCard() {
  const [{ frase, total }, setState] = useState(fraseHoje);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const openEdit = () => {
    let list = FRASES_DEFAULT;
    try {
      const raw = localStorage.getItem(FRASES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.list)) list = parsed.list;
      }
    } catch { /* default */ }
    setDraft(list.join('\n'));
    setEditing(true);
  };
  const save = () => {
    const list = draft.split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      localStorage.setItem(FRASES_KEY, JSON.stringify({ list: list.length ? list : FRASES_DEFAULT }));
    } catch { /* só não persiste */ }
    setEditing(false);
    setState(fraseHoje());
  };

  return (
    <SectionCard
      icon={I.quote}
      label="Frase do dia"
      right={!editing && (
        <button type="button" className={styles.linkBtn} onClick={openEdit}>editar</button>
      )}
    >
      {editing ? (
        <div>
          <textarea
            className={styles.fraseTextarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            placeholder="uma frase por linha"
          />
          <div className={styles.fraseAcoes}>
            <button type="button" className={styles.voltarBtn} onClick={() => setEditing(false)}>cancelar</button>
            <button type="button" className={styles.lerBtn} onClick={save}>salvar</button>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.frase}>“{frase}”</p>
          <div className={styles.fraseTotal}>{total} frases no sorteio</div>
        </>
      )}
    </SectionCard>
  );
}

// ── Agenda ────────────────────────────────────────────────────────────────
const DOW_ABBR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function AgendaCard({ agenda }) {
  const [ag, setAg] = useState(0);
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const day = new Date(base);
  day.setDate(base.getDate() + ag);
  const label = ag === 0 ? 'hoje' : ag === 1 ? 'amanhã'
    : `${DOW_ABBR[day.getDay()]} ${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`;
  const evs = (agenda || []).filter((e) => e.data === ymd(day));

  return (
    <SectionCard
      icon={I.calendar}
      label="Agenda"
      sub={label}
      right={(
        <>
          <MiniBtn dir="left" onClick={() => setAg((v) => Math.max(0, v - 1))} disabled={ag === 0}><Icon path={I.left} /></MiniBtn>
          <MiniBtn onClick={() => setAg((v) => Math.min(7, v + 1))} disabled={ag === 7}><Icon path={I.right} /></MiniBtn>
        </>
      )}
    >
      <div className={styles.agendaBody}>
        {evs.length ? evs.map((e, i) => (
          <div key={i} className={styles.agendaRow}>
            <div className={styles.agendaHora}>{e.h}</div>
            <div className={styles.agendaDesc}>{e.d}</div>
          </div>
        )) : (
          <Empty>sem compromissos</Empty>
        )}
      </div>
    </SectionCard>
  );
}

// ── Lista de notícias com resumo-no-card ──────────────────────────────────
function NewsRow({ n, onOpen }) {
  const title = n.t || n.h || '';
  const src = n.src || n.n || '';
  const inner = (
    <>
      {n.img ? (
        <img
          src={n.img}
          alt=""
          loading="lazy"
          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          className={styles.newsThumb}
        />
      ) : (
        <span className={styles.newsThumbPlaceholder}><Icon path={I.rss} /></span>
      )}
      <div className={styles.newsMain}>
        <div className={styles.newsTitle}>{title}</div>
        <div className={styles.newsMeta}>
          {n.cat && <span className={styles.newsTag}>{n.cat}</span>}
          <span>{src}</span>
          {n.data && <span>· {ago(n.data)}</span>}
        </div>
      </div>
    </>
  );

  if (n.resumo) {
    return <button type="button" onClick={onOpen} className={styles.newsRow}>{inner}</button>;
  }
  return <a href={n.url || '#'} target="_blank" rel="noopener noreferrer" className={styles.newsRow}>{inner}</a>;
}

function NewsList({ items, maxH }) {
  const [sel, setSel] = useState(null);
  if (sel) {
    return (
      <div className={styles.newsDetail}>
        <button type="button" className={styles.voltarBtn} onClick={() => setSel(null)}>
          <Icon path={I.back} /> voltar
        </button>
        <div className={styles.newsDetailTitle}>{sel.t || sel.h}</div>
        <div className={styles.newsMeta}>
          {sel.cat && <span className={styles.newsTag}>{sel.cat}</span>}
          <span>{sel.src || sel.n}</span>
          {sel.data && <span>· {ago(sel.data)}</span>}
        </div>
        <p className={styles.newsDetailResumo}>{sel.resumo}</p>
        {sel.url && sel.url !== '#' && (
          <a href={sel.url} target="_blank" rel="noopener noreferrer" className={styles.lerBtn}>
            ler no original <Icon path={I.ext} />
          </a>
        )}
      </div>
    );
  }
  return (
    <div className={styles.newsList} style={maxH ? { maxHeight: maxH } : undefined}>
      {items.length
        ? items.map((n, i) => <NewsRow key={i} n={n} onOpen={() => setSel(n)} />)
        : <Empty>nada por aqui agora</Empty>}
    </div>
  );
}

// ── Radar IA (abas Fronteira / GitHub / News / Feeds) ─────────────────────
function GithubList({ github }) {
  const [per, setPer] = useState('day');
  const repos = github[per] || [];
  return (
    <div>
      <div className={styles.ghTabs}>
        {['day', 'week', 'month'].map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.ghTab} ${per === p ? styles.ghTabActive : ''}`}
            onClick={() => setPer(p)}
          >
            {p === 'day' ? 'dia' : p === 'week' ? 'sem' : 'mês'}
          </button>
        ))}
      </div>
      <div className={styles.ghList}>
        {repos.length ? repos.map((g, i) => (
          <a key={i} href={`https://github.com/${g.r}`} target="_blank" rel="noopener noreferrer" className={styles.ghRow}>
            <div style={{ minWidth: 0 }}>
              <div className={styles.ghRepo}>{g.r}</div>
              <div className={styles.ghDesc}>{g.d}</div>
              <div className={styles.ghLang}>{g.lang}</div>
            </div>
            <span className={styles.ghStars}><Icon path={I.star} />{g.s}</span>
          </a>
        )) : (
          <Empty>nada por aqui agora</Empty>
        )}
      </div>
    </div>
  );
}

const RADAR_TABS = [
  { k: 'ia', label: 'Fronteira', icon: I.cpu },
  { k: 'github', label: 'GitHub', icon: I.github },
  { k: 'news', label: 'News', icon: I.mail },
  { k: 'feeds', label: 'Feeds', icon: I.rss },
];

function RadarIA({ data }) {
  const [tab, setTab] = useState('ia');
  return (
    <div className={styles.card} style={{ minHeight: 430 }}>
      <div className={styles.radarTabs}>
        <CardGrip />
        {RADAR_TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            className={`${styles.radarTab} ${tab === t.k ? styles.radarTabActive : ''}`}
            onClick={() => setTab(t.k)}
          >
            <Icon path={t.icon} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'ia' && <NewsList items={data.ai || []} maxH={540} />}
      {tab === 'news' && <NewsList items={data.newsletters || []} maxH={540} />}
      {tab === 'feeds' && <NewsList items={(data.feeds || []).slice(0, 24)} maxH={540} />}
      {tab === 'github' && <GithubList github={data.github || { day: [], week: [], month: [] }} />}
    </div>
  );
}

// ── Instagram (1 post por vez + navegação de conta/post) ──────────────────
function InstagramCard({ contas }) {
  const valid = useMemo(() => contas.filter((c) => c?.conta && c.posts?.length), [contas]);
  // Conta inicial aleatória a cada carregamento (seed fixa por montagem, sem
  // efeito): ai null = "ainda na aleatória".
  const [seed] = useState(() => Math.random());
  const [ai, setAi] = useState(null);
  const [pi, setPi] = useState(0);

  if (!valid.length) {
    return <SectionCard icon={I.instagram} label="Instagram"><Empty>sem contas</Empty></SectionCard>;
  }

  const aiAtual = ai ?? Math.floor(seed * valid.length);
  const a = Math.max(0, Math.min(valid.length - 1, aiAtual));
  const conta = valid[a];
  const posts = conta.posts;
  const p = Math.max(0, Math.min(posts.length - 1, pi));
  const code = posts[p]?.code;

  return (
    <SectionCard icon={I.instagram} label="Instagram">
      <div className={styles.igNav}>
        <MiniBtn disabled={a === 0} onClick={() => { setAi(Math.max(0, a - 1)); setPi(0); }} title="Conta anterior">
          <Icon path={I.up} />
        </MiniBtn>
        <span className={styles.igConta}>
          @{conta.conta}
          {valid.length > 1 && <span className={styles.igContaPos}>{a + 1}/{valid.length}</span>}
        </span>
        <MiniBtn disabled={a === valid.length - 1} onClick={() => { setAi(Math.min(valid.length - 1, a + 1)); setPi(0); }} title="Próxima conta">
          <Icon path={I.down} />
        </MiniBtn>
      </div>

      <div className={styles.igFrame}>
        {code ? (
          <iframe
            title={`@${conta.conta}`}
            src={`https://www.instagram.com/p/${code}/embed/captioned/`}
            loading="lazy"
            scrolling="no"
          />
        ) : (
          <Empty>sem posts novos</Empty>
        )}
      </div>

      <div className={styles.igFooter}>
        <MiniBtn disabled={p === 0} onClick={() => setPi((v) => Math.max(0, v - 1))} title="Post anterior">
          <Icon path={I.left} />
        </MiniBtn>
        <span>post {posts.length ? p + 1 : 0} / {posts.length}</span>
        <MiniBtn disabled={p >= posts.length - 1} onClick={() => setPi((v) => Math.min(posts.length - 1, v + 1))} title="Próximo post">
          <Icon path={I.right} />
        </MiniBtn>
      </div>
    </SectionCard>
  );
}

function MercadoCard({ items }) {
  return (
    <SectionCard icon={I.radar} label="Mercado" sub="food-service · delivery · foodtech" bodyStyle={{ minHeight: 320 }}>
      <NewsList items={items} maxH={560} />
    </SectionCard>
  );
}

function YoutubeCard({ videos }) {
  return (
    <SectionCard
      icon={I.youtube}
      label="YouTube"
      sub={videos.length ? `${videos.length} vídeos` : undefined}
      bodyStyle={{ maxHeight: 440, overflowY: 'auto' }}
    >
      {videos.length ? (
        <div className={styles.newsList}>
          {videos.map((v, i) => (
            <a key={i} href={v.url || '#'} target="_blank" rel="noopener noreferrer" className={styles.newsRow}>
              {v.img && <img src={v.img} alt="" loading="lazy" className={styles.ytThumb} />}
              <div className={styles.newsMain}>
                <div className={styles.newsTitle}>{v.t}</div>
                <div className={styles.newsMeta}>{v.canal} {v.data && `· ${ago(v.data)}`}</div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <Empty>Sem vídeos novos — a coleta ainda não trouxe vídeos deste ciclo.</Empty>
      )}
    </SectionCard>
  );
}

// ── Chips do topo (clima POA ao vivo + USD + BTC do coletor) ──────────────
const POA_WEATHER = 'https://api.open-meteo.com/v1/forecast?latitude=-30.0331&longitude=-51.2300&current=temperature_2m&timezone=America/Sao_Paulo';

function useTempPOA() {
  const [temp, setTemp] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(POA_WEATHER, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => {
          const t = j?.current?.temperature_2m;
          if (alive && typeof t === 'number') setTemp(Math.round(t));
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 600_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return temp;
}

function MarketChips({ topbar }) {
  const t = topbar ?? {};
  const tempPOA = useTempPOA();
  const temp = tempPOA ?? t.clima?.temp ?? null;
  const delta = (pct) => (
    <span className={pct >= 0 ? styles.chipDeltaUp : styles.chipDeltaDown}>
      {pct >= 0 ? '▲' : '▼'}{Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </span>
  );
  return (
    <div className={styles.chips}>
      <span className={styles.chip}>
        <Icon path={I.cloud} /> <b>{temp ?? '–'}°</b> <span className={styles.chipMuted}>POA</span>
      </span>
      <span className={styles.chip}>
        <span className={styles.chipMuted}>USD</span>
        <b>{t.usd ? t.usd.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '–'}</b>
        {t.usd && delta(t.usd.pct)}
      </span>
      <span className={styles.chip}>
        <span className={styles.chipMuted}>BTC</span>
        <b>{t.btc ? `${(t.btc.valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : '–'}</b>
        {t.btc && delta(t.btc.pct)}
      </span>
    </div>
  );
}

// ── registro de cards + layout das colunas (com persistência) ─────────────
const ZONES = ['ops', 'market', 'social', 'ia'];

const CARD_META = {
  foco: { render: () => <FocoCard /> },
  frase: { render: () => <FraseCard /> },
  mercado: { render: (d) => <MercadoCard items={d.biz || []} /> },
  youtube: { render: (d) => <YoutubeCard videos={d.youtube || []} /> },
  instagram: { render: (d) => <InstagramCard contas={d.instagram || []} /> },
  agenda: { render: (d) => <AgendaCard agenda={d.agenda} /> },
  radar: { render: (d) => <RadarIA data={d} /> },
};

const DEFAULT_LAYOUT = {
  ops: ['foco', 'agenda'],
  market: ['mercado', 'youtube'],
  social: ['frase', 'instagram'],
  ia: ['radar'],
};
// Mesma chave do dashboard antigo: o layout que o Fábio já arrumou migra junto.
const LAYOUT_KEY = 'pizzas-dash-layout-v1';

function loadLayout() {
  const known = Object.keys(CARD_META);
  let saved = null;
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch { /* usa default */ }
  const out = { ops: [], market: [], social: [], ia: [] };
  const placed = new Set();
  for (const z of ZONES) {
    for (const id of saved?.[z] ?? DEFAULT_LAYOUT[z]) {
      if (known.includes(id) && !placed.has(id)) {
        out[z].push(id);
        placed.add(id);
      }
    }
  }
  for (const id of known) {
    if (!placed.has(id)) {
      const z = ZONES.find((zz) => DEFAULT_LAYOUT[zz].includes(id)) ?? 'ops';
      out[z].push(id);
      placed.add(id);
    }
  }
  return out;
}

function CardHost({ id, data, dragId, onDragStart, onDragEnd }) {
  const ref = useRef(null);
  const meta = CARD_META[id];
  const ctx = useMemo(() => ({ onDragStart: (e) => onDragStart(id, ref.current, e) }), [id, onDragStart]);
  if (!meta) return null;
  return (
    <div
      ref={ref}
      data-card-id={id}
      onDragEnd={onDragEnd}
      className={`${styles.cardHost} ${dragId === id ? styles.cardHostDragging : ''}`}
    >
      <CardDndContext.Provider value={ctx}>{meta.render(data)}</CardDndContext.Provider>
    </div>
  );
}

// ── página ────────────────────────────────────────────────────────────────
export default function DashView() {
  const { data, loading, error, reload } = useDashFeed();
  const [layout, setLayout] = useState(loadLayout);
  const [dragId, setDragId] = useState(null);
  const [dropAt, setDropAt] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* só não persiste */ }
  }, [layout]);

  const handleDragStart = (id, el, e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    if (el) e.dataTransfer.setDragImage(el, 24, 24);
    setDragId(id);
  };
  const handleDragEnd = () => { setDragId(null); setDropAt(null); };
  const handleZoneDragOver = (zone, e) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const hosts = Array.from(e.currentTarget.querySelectorAll(':scope > [data-card-id]'));
    let index = hosts.length;
    for (let i = 0; i < hosts.length; i++) {
      const r = hosts[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { index = i; break; }
    }
    setDropAt((prev) => (prev && prev.zone === zone && prev.index === index ? prev : { zone, index }));
  };
  const handleDrop = (zone, e) => {
    e.preventDefault();
    const target = dropAt && dropAt.zone === zone ? dropAt : { zone, index: layout[zone].length };
    const id = dragId;
    setDragId(null);
    setDropAt(null);
    if (!id) return;
    setLayout((prev) => {
      const next = { ops: [...prev.ops], market: [...prev.market], social: [...prev.social], ia: [...prev.ia] };
      let sameZoneRemoved = -1;
      for (const z of ZONES) {
        const idx = next[z].indexOf(id);
        if (idx >= 0) {
          next[z].splice(idx, 1);
          if (z === target.zone) sameZoneRemoved = idx;
        }
      }
      let insert = target.index;
      if (sameZoneRemoved >= 0 && sameZoneRemoved < insert) insert--;
      insert = Math.max(0, Math.min(next[target.zone].length, insert));
      next[target.zone].splice(insert, 0, id);
      return next;
    });
  };

  const d = data || {};

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Dash</h2>
        <MarketChips topbar={d.topbar} />
      </div>

      {loading && !data ? (
        <div className={styles.loading}>Carregando…</div>
      ) : error && !data ? (
        <div className={styles.erroCard}>
          <div className={styles.erroTitulo}>Não deu pra carregar o Dash</div>
          <p className={styles.erroDesc}>
            {error}. O JSON é publicado por scripts/dash/runner.py em fabiomachado.com.br/pizzas/data/.
          </p>
          <button type="button" className={styles.retryBtn} onClick={() => reload()}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className={styles.board}>
          {ZONES.map((zone) => (
            <div
              key={zone}
              className={styles.zone}
              onDragOver={(e) => handleZoneDragOver(zone, e)}
              onDrop={(e) => handleDrop(zone, e)}
            >
              {layout[zone].map((id, i) => (
                <Fragment key={id}>
                  {dragId && dropAt?.zone === zone && dropAt.index === i && <div className={styles.dropLine} />}
                  <CardHost id={id} data={d} dragId={dragId} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
                </Fragment>
              ))}
              {dragId && dropAt?.zone === zone && dropAt.index === layout[zone].length && (
                <div className={styles.dropLine} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
