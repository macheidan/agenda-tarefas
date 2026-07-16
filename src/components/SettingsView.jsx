import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { TabIcon } from './tabIcons';
import styles from '../styles/SettingsView.module.css';

const TAB_LABELS = {
  calendar: 'Calendário',
  reels: 'Instagram',
  contentPlan: 'Content Plan',
  influencers: 'Influencers',
  notes: 'Anotações',
  shopping: 'Compras',
  ideas: 'Ideias',
  reviews: 'Avaliações',
  knowledge: 'Conhecimento',
  precosInsumos: 'Preços',
  departamentoPessoal: 'Depto Pessoal',
  motoboys: 'Motoboys',
};

// Seções do menu. `defaultOff` = nasce desmarcada; as demais são visíveis a
// menos que a flag esteja explicitamente em false. O Dashboard repete essa
// polaridade ao ler (`=== true` vs `!== false`) — mexeu aqui, confira lá.
// `tab` é a chave da aba: dá o mesmo ícone que a seção tem no menu (tabIcons).
const SECTIONS = [
  { key: 'calendarEnabled', tab: 'calendar', label: 'Calendário', desc: 'Agenda de tarefas, recorrências e lembretes' },
  { key: 'contentPlanEnabled', tab: 'contentPlan', label: 'Content Plan', desc: 'Planejamento de conteúdo do mês' },
  { key: 'reelsEnabled', tab: 'reels', label: 'Instagram', desc: 'Reels, stories, roteiros e arquivados' },
  { key: 'influencersEnabled', tab: 'influencers', label: 'Influencers', desc: 'Cadastro e acompanhamento de parcerias' },
  { key: 'ideasEnabled', tab: 'ideas', label: 'Ideias', desc: 'Mural de ideias com comentários' },
  { key: 'notesEnabled', tab: 'notes', label: 'Anotações', desc: 'Notas compartilhadas com a equipe' },
  { key: 'shoppingListEnabled', tab: 'shopping', label: 'Compras', desc: 'Lista de compras e fornecedores' },
  { key: 'reviewsEnabled', tab: 'reviews', label: 'Avaliações', desc: 'Pesquisas de satisfação (NPS) do Delivery Direto' },
  { key: 'knowledgeEnabled', tab: 'knowledge', label: 'Conhecimento', desc: 'Base de conhecimento e chat com IA' },
  { key: 'precosInsumosEnabled', tab: 'precosInsumos', label: 'Preços', desc: 'Preços de insumos, fornecedores e fichas técnicas' },
  { key: 'departamentoPessoalEnabled', tab: 'departamentoPessoal', label: 'Depto Pessoal', desc: 'Escala, faltas e folha de pagamento', defaultOff: true },
  { key: 'motoboysEnabled', tab: 'motoboys', label: 'Motoboys', desc: 'Conferência semanal de entregas', defaultOff: true },
];

// Sub-seções de Preços Insumos: visibilidade por usuário (chaves precosSub* em
// settings/{uid}). Default visível (valor != false). Espelha SUBPAGES do PrecosInsumosView.
const PRECOS_SUBSECTIONS = [
  { key: 'precosSubPrecos', label: 'Produtos' },
  { key: 'precosSubLista', label: 'Lista' },
  { key: 'precosSubFornecedores', label: 'Fornecedores' },
  { key: 'precosSubCadastrar', label: 'Cadastrar' },
  { key: 'precosSubSubiram', label: 'Subiram' },
  { key: 'precosSubCmv', label: 'CMV' },
];

// Sub-seções de Motoboys: ver (default ligado) e editar (default desligado)
// por usuário. A flag legada motoboysEditor equivale a editar tudo + cadastro.
const MOTOBOYS_SUBSECTIONS = [
  { view: 'motoboysVerGerente', edit: 'motoboysEditGerente', label: 'Gerente' },
  { view: 'motoboysVerAdm', edit: 'motoboysEditAdm', label: 'Adm' },
  { view: 'motoboysVerResultado', edit: 'motoboysEditResultado', label: 'Resultado' },
  { view: 'motoboysVerTaxas', edit: 'motoboysEditTaxas', label: 'Taxas' },
];
const MOTOBOYS_EDIT_KEYS = ['motoboysEditGerente', 'motoboysEditAdm', 'motoboysEditResultado', 'motoboysEditTaxas', 'motoboysRoster'];

// Lojas por seção — espelham MOTOBOY_LOJAS (MotoboysView) e LOJAS (SurveysView).
const MOTOBOYS_LOJAS = [
  { flag: 'motoboysVerDame', label: 'Dáme' },
  { flag: 'motoboysVerLov', label: 'Lov' },
];
const REVIEWS_LOJAS = [
  { flag: 'reviewsVerDame', label: 'Dáme' },
  { flag: 'reviewsVerLov', label: 'Lov' },
];

/** Switch do TailAdmin: track 36×20, knob 16 que anda 16px. O input fica
 *  visualmente escondido mas continua sendo o alvo de clique e de teclado. */
function Switch({ checked, onChange, disabled, label }) {
  return (
    <label className={styles.switch}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className={styles.switchTrack}>
        <span className={styles.switchKnob} />
      </span>
    </label>
  );
}

/** Linha de configuração: título + descrição à esquerda, controle à direita.
 *  Divisória entre linhas; a última não tem. Empilha no mobile.
 *  `tab` = chave de aba: desenha o mesmo ícone que a seção tem no menu. */
function Row({ title, desc, tab, children }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        {tab && (
          <span className={styles.rowIcon} aria-hidden="true">
            <TabIcon k={tab} />
          </span>
        )}
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{title}</span>
          {desc && <p className={styles.rowDesc}>{desc}</p>}
        </div>
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

/** Card interno de um grupo de configurações. */
function Group({ title, desc, children }) {
  return (
    <section className={styles.group}>
      <h4 className={styles.groupTitle}>{title}</h4>
      {desc && <p className={styles.groupDesc}>{desc}</p>}
      <div className={styles.rows}>{children}</div>
    </section>
  );
}

export default function SettingsView({ onNavigate, geminiKey, updateGeminiKey, tabsOrder = [], updateTabsOrder }) {
  const { user, isAdmin } = useAuth();
  const users = useUsers();
  const [userSettings, setUserSettings] = useState({});
  const [removedUsers, setRemovedUsers] = useState(new Set());
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState('');
  const [dpStores, setDpStores] = useState([]);
  const [permUid, setPermUid] = useState(user.uid);

  // Lojas do Departamento Pessoal (para visibilidade por usuário).
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, 'dpStores'), (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setDpStores(items);
    });
    return unsub;
  }, [isAdmin]);

  // Marca/desmarca a visibilidade de uma loja para um usuário (lista de ocultas).
  const toggleStoreVisibility = async (uid, storeId, visible) => {
    const current = new Set(userSettings[uid]?.dpHiddenStores || []);
    if (visible) current.delete(storeId);
    else current.add(storeId);
    const dpHiddenStores = [...current];
    const ref = doc(db, 'settings', uid);
    await setDoc(ref, { dpHiddenStores }, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], dpHiddenStores },
    }));
  };

  // Chaves de visibilidade definidas como false ao aprovar (default tudo oculto)
  const VISIBILITY_KEYS_FALSE = SECTIONS.reduce(
    (acc, s) => ({ ...acc, [s.key]: false }),
    {}
  );

  // Admin loads settings for all users
  useEffect(() => {
    if (!isAdmin) return;
    const loadAll = async () => {
      const map = {};
      for (const u of users) {
        const ref = doc(db, 'settings', u.uid);
        const snap = await getDoc(ref);
        map[u.uid] = snap.exists() ? snap.data() : {};
      }
      setUserSettings(map);
    };
    loadAll();
  }, [isAdmin, users]);

  const toggleSection = async (uid, key, enabled) => {
    const ref = doc(db, 'settings', uid);
    await setDoc(ref, { [key]: enabled }, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], [key]: enabled },
    }));
  };

  // Permissão de Motoboys: ao mexer numa flag de edição de quem ainda usa a
  // flag legada (motoboysEditor), expande a legada em flags explícitas antes.
  const toggleMotoboyPerm = async (uid, key, enabled) => {
    const s = userSettings[uid] || {};
    const patch = {};
    if (s.motoboysEditor === true && MOTOBOYS_EDIT_KEYS.includes(key)) {
      MOTOBOYS_EDIT_KEYS.forEach((k) => { patch[k] = true; });
      patch.motoboysEditor = false;
    }
    patch[key] = enabled;
    await setDoc(doc(db, 'settings', uid), patch, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], ...patch },
    }));
  };

  const [confirmUid, setConfirmUid] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [editingNameUid, setEditingNameUid] = useState(null);
  const [nameValue, setNameValue] = useState('');

  const removeUser = async (uid) => {
    if (confirmUid === uid && confirmText === 'EXCLUIR') {
      await deleteDoc(doc(db, 'users', uid));
      await deleteDoc(doc(db, 'settings', uid));
      setRemovedUsers((prev) => new Set(prev).add(uid));
      setConfirmUid(null);
      setConfirmText('');
    }
  };

  const approveUser = async (uid) => {
    // Marca o user como aprovado E garante settings com todas as seções desmarcadas
    await setDoc(doc(db, 'users', uid), { approved: true }, { merge: true });
    await setDoc(doc(db, 'settings', uid), VISIBILITY_KEYS_FALSE, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], ...VISIBILITY_KEYS_FALSE },
    }));
  };

  const rejectUser = async (uid) => {
    if (!window.confirm('Rejeitar este usuário? O cadastro será removido.')) return;
    await deleteDoc(doc(db, 'users', uid));
    await deleteDoc(doc(db, 'settings', uid));
    setRemovedUsers((prev) => new Set(prev).add(uid));
  };

  const startRemove = (uid) => {
    setConfirmUid(uid);
    setConfirmText('');
  };

  const cancelRemove = () => {
    setConfirmUid(null);
    setConfirmText('');
  };

  const startRename = (uid) => {
    const s = userSettings[uid] || {};
    const u = users.find((u) => u.uid === uid);
    setEditingNameUid(uid);
    setNameValue(s.customName || u?.displayName || u?.email || '');
  };

  const saveRename = async (uid) => {
    const ref = doc(db, 'settings', uid);
    await setDoc(ref, { customName: nameValue.trim() }, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], customName: nameValue.trim() },
    }));
    setEditingNameUid(null);
    setNameValue('');
  };

  // Sincroniza o input com a prop geminiKey quando ela chega/muda (padrão de
  // ajuste de estado no render, evita setState dentro de useEffect).
  const [prevGeminiKey, setPrevGeminiKey] = useState(geminiKey);
  if (geminiKey !== prevGeminiKey) {
    setPrevGeminiKey(geminiKey);
    if (geminiKey !== undefined) setApiKeyValue(geminiKey);
  }

  const handleSaveApiKey = async () => {
    setApiKeyStatus('Salvando...');
    const ok = await updateGeminiKey(apiKeyValue.trim());
    setApiKeyStatus(ok ? 'Salvo!' : 'Erro ao salvar.');
    setTimeout(() => setApiKeyStatus(''), 2000);
  };

  const allVisibleUsers = users.filter((u) => !removedUsers.has(u.uid));
  const otherUsers = allVisibleUsers.filter((u) => u.uid !== user.uid);
  const pendingUsers = allVisibleUsers.filter((u) => u.uid !== user.uid && u.approved !== true);
  const approvedOtherUsers = otherUsers.filter((u) => u.approved === true);

  const nameOf = (u) => userSettings[u.uid]?.customName || u.displayName || u.email;

  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <h2>Configurações</h2>
        <p className={styles.noAccess}>Apenas o administrador pode alterar as configurações.</p>
      </div>
    );
  }

  // Usuários elegíveis a permissão (o admin inclusive, pra ver a própria conta).
  // Admin primeiro, resto em ordem alfabética — a lista crua vem na ordem do
  // Firestore e enterra o próprio admin no meio.
  const permUsers = allVisibleUsers
    .filter((u) => u.uid === user.uid || u.approved === true)
    .sort((a, b) => {
      if (a.uid === user.uid) return -1;
      if (b.uid === user.uid) return 1;
      return nameOf(a).localeCompare(nameOf(b), 'pt-BR');
    });
  // Se o escolhido sumiu (excluído), cai no admin em vez de renderizar vazio.
  const permTarget = permUsers.some((u) => u.uid === permUid) ? permUid : user.uid;
  const s = userSettings[permTarget] || {};

  return (
    <div className={styles.container}>
      <h2>Configurações</h2>

      {pendingUsers.length > 0 && (
        <section className={`${styles.card} ${styles.cardPending}`}>
          <h3 className={styles.cardTitle}>Aprovações Pendentes ({pendingUsers.length})</h3>
          <p className={styles.cardDesc}>
            Novos usuários precisam ser aprovados antes de acessar a plataforma. Ao aprovar,
            todas as seções nascem desmarcadas — libere uma a uma em Permissões.
          </p>
          <div className={styles.rows}>
            {pendingUsers.map((u) => (
              <div key={u.uid} className={styles.row}>
                <div className={styles.userCell}>
                  <img className={styles.userAvatar} src={u.photoURL || 'https://via.placeholder.com/40'} alt="" />
                  <div className={styles.rowText}>
                    <span className={styles.rowTitle}>{u.displayName || u.email}</span>
                    <p className={styles.rowDesc}>{u.email}</p>
                  </div>
                </div>
                <div className={styles.rowControl}>
                  <button className={styles.btn} onClick={() => approveUser(u.uid)}>Aprovar</button>
                  <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => rejectUser(u.uid)}>Rejeitar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Permissões: um usuário por vez, escolhido no dropdown ---- */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Permissões</h3>
          <label className={styles.userPicker}>
            <span>Usuário</span>
            <select value={permTarget} onChange={(e) => setPermUid(e.target.value)}>
              {permUsers.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.uid === user.uid ? `${nameOf(u)} (você)` : nameOf(u)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Group title="Seções visíveis" desc="O que aparece no menu lateral deste usuário.">
          {SECTIONS.map((sec) => (
            <Row key={sec.key} title={sec.label} desc={sec.desc} tab={sec.tab}>
              <Switch
                label={sec.label}
                checked={sec.defaultOff ? s[sec.key] === true : s[sec.key] !== false}
                onChange={(v) => toggleSection(permTarget, sec.key, v)}
              />
            </Row>
          ))}
        </Group>

        {s.precosInsumosEnabled !== false && (
          <Group title="Preços — sub-seções" desc="Quais abas aparecem dentro de Preços.">
            {PRECOS_SUBSECTIONS.map((sub) => (
              <Row key={sub.key} title={sub.label}>
                <Switch
                  label={sub.label}
                  checked={s[sub.key] !== false}
                  onChange={(v) => toggleSection(permTarget, sub.key, v)}
                />
              </Row>
            ))}
          </Group>
        )}

        {s.motoboysEnabled === true && (
          <Group title="Motoboys" desc="Ver e editar cada quadro da conferência.">
            {MOTOBOYS_SUBSECTIONS.map((sub) => (
              <Row key={sub.view} title={sub.label}>
                <span className={styles.pairCtl}>
                  <span className={styles.pairLabel}>vê</span>
                  <Switch
                    label={`${sub.label} — vê`}
                    checked={s[sub.view] !== false}
                    onChange={(v) => toggleMotoboyPerm(permTarget, sub.view, v)}
                  />
                </span>
                <span className={styles.pairCtl}>
                  <span className={styles.pairLabel}>edita</span>
                  <Switch
                    label={`${sub.label} — edita`}
                    checked={s[sub.edit] === true || s.motoboysEditor === true}
                    onChange={(v) => toggleMotoboyPerm(permTarget, sub.edit, v)}
                  />
                </span>
              </Row>
            ))}
            {MOTOBOYS_LOJAS.map((l) => (
              <Row key={l.flag} title={l.label} desc="Loja visível na conferência">
                <Switch
                  label={`Motoboys — ${l.label}`}
                  checked={s[l.flag] !== false}
                  onChange={(v) => toggleSection(permTarget, l.flag, v)}
                />
              </Row>
            ))}
            <Row title="Cadastro" desc="Adiciona, renomeia e arquiva nomes de motoboys">
              <Switch
                label="Motoboys — cadastro"
                checked={s.motoboysRoster === true || s.motoboysEditor === true}
                onChange={(v) => toggleMotoboyPerm(permTarget, 'motoboysRoster', v)}
              />
            </Row>
          </Group>
        )}

        {s.reviewsEnabled !== false && (
          <Group title="Avaliações — lojas" desc="De quais lojas este usuário vê as pesquisas.">
            {REVIEWS_LOJAS.map((l) => (
              <Row key={l.flag} title={l.label}>
                <Switch
                  label={`Avaliações — ${l.label}`}
                  checked={s[l.flag] !== false}
                  onChange={(v) => toggleSection(permTarget, l.flag, v)}
                />
              </Row>
            ))}
          </Group>
        )}

        {(s.departamentoPessoalEnabled === true || s.shoppingListEnabled !== false) && (
          <Group title="Permissões de edição" desc="Sem isto o usuário só lê.">
            {s.departamentoPessoalEnabled === true && (
              <Row title="Depto Pessoal" desc="Gerencia funcionários, lojas e marca faltas">
                <Switch
                  label="Depto Pessoal — edita"
                  checked={s.dpEditor === true}
                  onChange={(v) => toggleSection(permTarget, 'dpEditor', v)}
                />
              </Row>
            )}
            {s.departamentoPessoalEnabled === true && (
              <Row title="Salários e Funcionários" desc="Dado sensível: só o admin edita, mesmo com isto ligado">
                <Switch
                  label="Depto Pessoal — vê Salários"
                  checked={s.dpSalariosVisible === true}
                  onChange={(v) => toggleSection(permTarget, 'dpSalariosVisible', v)}
                />
              </Row>
            )}
            {s.shoppingListEnabled !== false && (
              <Row title="Compras" desc="Gerencia fornecedores e o catálogo de itens">
                <Switch
                  label="Compras — edita"
                  checked={s.comprasEditor === true}
                  onChange={(v) => toggleSection(permTarget, 'comprasEditor', v)}
                />
              </Row>
            )}
          </Group>
        )}

        {s.departamentoPessoalEnabled === true && dpStores.length > 0 && (
          <Group title="Depto Pessoal — lojas" desc="Quais lojas aparecem na escala deste usuário.">
            {dpStores.map((store) => (
              <Row key={store.id} title={store.name}>
                <Switch
                  label={`Depto Pessoal — ${store.name}`}
                  checked={!(s.dpHiddenStores || []).includes(store.id)}
                  onChange={(v) => toggleStoreVisibility(permTarget, store.id, v)}
                />
              </Row>
            ))}
          </Group>
        )}
      </section>

      {/* ---- Usuários: renomear e remover acesso ---- */}
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Usuários</h3>
        <p className={styles.cardDesc}>Renomear e remover acesso.</p>
        <div className={styles.rows}>
          {approvedOtherUsers.map((u) => (
            <div key={u.uid} className={styles.row}>
              <div className={styles.userCell}>
                <img className={styles.userAvatar} src={u.photoURL || 'https://via.placeholder.com/40'} alt="" />
                {editingNameUid === u.uid ? (
                  <input
                    className={styles.input}
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && saveRename(u.uid)}
                  />
                ) : (
                  <div className={styles.rowText}>
                    <span className={styles.rowTitle}>{nameOf(u)}</span>
                    <p className={styles.rowDesc}>{u.email}</p>
                  </div>
                )}
              </div>

              {editingNameUid === u.uid ? (
                <div className={styles.rowControl}>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => saveRename(u.uid)}>Salvar</button>
                  <button className={styles.btn} onClick={() => setEditingNameUid(null)}>Cancelar</button>
                </div>
              ) : confirmUid === u.uid ? (
                <div className={styles.rowControl}>
                  <span className={styles.confirmText}>
                    Digite <strong>EXCLUIR</strong>:
                  </span>
                  <input
                    className={styles.input}
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="EXCLUIR"
                    autoFocus
                  />
                  <button
                    className={`${styles.btn} ${styles.btnDanger}`}
                    disabled={confirmText !== 'EXCLUIR'}
                    onClick={() => removeUser(u.uid)}
                  >
                    Confirmar
                  </button>
                  <button className={styles.btn} onClick={cancelRemove}>Cancelar</button>
                </div>
              ) : (
                <div className={styles.rowControl}>
                  <button className={styles.btn} onClick={() => startRename(u.uid)}>Renomear</button>
                  <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => startRemove(u.uid)}>
                    Excluir acesso
                  </button>
                </div>
              )}
            </div>
          ))}
          {approvedOtherUsers.length === 0 && (
            <p className={styles.noAccess}>Nenhum usuário cadastrado.</p>
          )}
        </div>
      </section>

      {/* ---- Ordem do Menu ---- */}
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Ordem do Menu</h3>
        <p className={styles.cardDesc}>Vale para todos os usuários.</p>
        <ul className={styles.orderList}>
          {tabsOrder.map((key, idx) => (
            <li key={key} className={styles.orderItem}>
              <span className={styles.orderIndex}>{idx + 1}</span>
              <span className={styles.rowIcon} aria-hidden="true">
                <TabIcon k={key} />
              </span>
              <span className={styles.orderLabel}>{TAB_LABELS[key] || key}</span>
              <div className={styles.orderActions}>
                <button
                  className={styles.orderBtn}
                  disabled={idx === 0}
                  onClick={() => {
                    const next = [...tabsOrder];
                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                    updateTabsOrder(next);
                  }}
                  title="Mover para cima"
                  aria-label="Mover para cima"
                >
                  ↑
                </button>
                <button
                  className={styles.orderBtn}
                  disabled={idx === tabsOrder.length - 1}
                  onClick={() => {
                    const next = [...tabsOrder];
                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                    updateTabsOrder(next);
                  }}
                  title="Mover para baixo"
                  aria-label="Mover para baixo"
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Integrações e atalhos ---- */}
      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Integrações</h3>
        <div className={styles.rows}>
          <Row title="Chave API do Gemini" desc="Usada pelo chat da seção Conhecimento">
            <input
              className={styles.input}
              type="password"
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder="Cole a chave API..."
            />
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSaveApiKey}>Salvar</button>
            {apiKeyStatus && <span className={styles.hint}>{apiKeyStatus}</span>}
          </Row>
          <Row title="Arquivados" desc="Tarefas arquivadas e limpeza de conversas">
            <button className={styles.btn} onClick={() => onNavigate && onNavigate('archived')}>
              Abrir
            </button>
          </Row>
        </div>
      </section>
    </div>
  );
}
