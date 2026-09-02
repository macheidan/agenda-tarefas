import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { useState, useEffect, Fragment } from 'react';
import { COMPRAS_LOJAS, ESTOQUE_LOJAS } from '../lib/suprimentos';
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
  shopping: 'Suprimentos',
  ideas: 'Ideias',
  reviews: 'Avaliações',
  knowledge: 'Conhecimento',
  precosInsumos: 'Preços',
  departamentoPessoal: 'Depto Pessoal',
  motoboys: 'Motoboys',
  clientes: 'Clientes',
  mesaDono: 'Mesa do Dono',
  dash: 'Dash',
  vendas: 'Vendas',
  dre: 'DRE',
  gestaoNotas: 'Anotações (Gestão)',
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
  { key: 'shoppingListEnabled', tab: 'shopping', label: 'Suprimentos', desc: 'Pedido por fornecedor (Compras) e contagem de estoque' },
  { key: 'reviewsEnabled', tab: 'reviews', label: 'Avaliações', desc: 'Pesquisas de satisfação (NPS) do Delivery Direto' },
  { key: 'knowledgeEnabled', tab: 'knowledge', label: 'Conhecimento', desc: 'Base de conhecimento e chat com IA' },
  { key: 'precosInsumosEnabled', tab: 'precosInsumos', label: 'Preços', desc: 'Preços de insumos, fornecedores e fichas técnicas' },
  { key: 'departamentoPessoalEnabled', tab: 'departamentoPessoal', label: 'Depto Pessoal', desc: 'Escala, faltas e folha de pagamento', defaultOff: true },
  { key: 'motoboysEnabled', tab: 'motoboys', label: 'Motoboys', desc: 'Conferência semanal de entregas', defaultOff: true },
  { key: 'clientesEnabled', tab: 'clientes', label: 'Clientes', desc: 'Base de clientes por tempo sem pedir, para campanhas de WhatsApp', defaultOff: true },
  // Categoria Gestão: EXCLUSIVA do admin (soAdmin) — as linhas abaixo só
  // aparecem quando o usuário selecionado em Permissões é o próprio admin, e
  // servem só pra ele esconder seções de si mesmo. Cliente e rules travam o
  // acesso de qualquer outro usuário mesmo com a flag ligada.
  { key: 'mesaDonoEnabled', tab: 'mesaDono', label: 'Mesa do Dono', desc: 'Visão executiva do mês: KPIs, canais e gráficos históricos (só admin)', defaultOff: true, soAdmin: true },
  { key: 'dashEnabled', tab: 'dash', label: 'Dash', desc: 'Board pessoal: foco, agenda, notícias e radar de IA (só admin)', defaultOff: true, soAdmin: true },
  { key: 'vendasEnabled', tab: 'vendas', label: 'Vendas', desc: 'Ranking e evolução de sabores, bordas, combos e tamanhos (só admin)', defaultOff: true, soAdmin: true },
  { key: 'dreEnabled', tab: 'dre', label: 'DRE', desc: 'DRE anual por marca com detalhe dos extratos (só admin)', defaultOff: true, soAdmin: true },
  { key: 'gestaoNotasEnabled', tab: 'gestaoNotas', label: 'Anotações (Gestão)', desc: 'Marcos de negócio por mês, viram 📌 nos gráficos (só admin)', defaultOff: true, soAdmin: true },
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
  { key: 'precosSubMargem', label: 'Margem' },
  { key: 'precosSubSkus', label: 'SKUs' },
];

// Sub-seções de Motoboys: ver (default ligado) e editar (default desligado)
// por usuário. A flag legada motoboysEditor equivale a editar tudo + cadastro.
const MOTOBOYS_SUBSECTIONS = [
  { view: 'motoboysVerGerente', edit: 'motoboysEditGerente', label: 'Gerente' },
  { view: 'motoboysVerAdm', edit: 'motoboysEditAdm', label: 'Adm' },
  { view: 'motoboysVerResultado', edit: 'motoboysEditResultado', label: 'Resultado' },
  { view: 'motoboysVerTaxas', edit: 'motoboysEditTaxas', label: 'Taxas' },
];
const MOTOBOYS_EDIT_KEYS = ['motoboysEditGerente', 'motoboysEditAdm', 'motoboysEditResultado', 'motoboysEditTaxas', 'motoboysRoster', 'motoboysExportar'];

// Lojas por seção — espelham MOTOBOY_LOJAS (MotoboysView) e LOJAS (SurveysView).
const MOTOBOYS_LOJAS = [
  { flag: 'motoboysVerDame', label: 'Dáme' },
  { flag: 'motoboysVerLov', label: 'Lov' },
];
const REVIEWS_LOJAS = [
  { flag: 'reviewsVerDame', label: 'Dáme' },
  { flag: 'reviewsVerLov', label: 'Lov' },
];
const CLIENTES_LOJAS = [
  { flag: 'clientesVerDame', label: 'Dáme' },
  { flag: 'clientesVerLov', label: 'Lov' },
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

// Categorias que têm sub-permissões próprias (sub-seções, lojas ou edição).
// Quando ligadas, a linha expande e mostra esses ajustes aninhados logo abaixo,
// em vez de largá-los num bloco separado longe da categoria.
const HAS_SUB = new Set(['precosInsumos', 'motoboys', 'reviews', 'departamentoPessoal', 'shopping', 'clientes']);

/** Linha de categoria em "Seções visíveis". Quando `expandable`, a parte
 *  esquerda (chevron + ícone + texto) vira botão que abre/fecha o painel
 *  aninhado com as sub-permissões (`children`). O switch fica sempre à direita. */
function SectionRow({ sec, checked, onToggle, expandable, open, onToggleOpen, children }) {
  const head = (
    <>
      <span className={`${styles.chevron} ${expandable && open ? styles.chevronOpen : ''}`} aria-hidden="true">
        {expandable ? '›' : ''}
      </span>
      <span className={styles.rowIcon} aria-hidden="true">
        <TabIcon k={sec.tab} />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{sec.label}</span>
        {sec.desc && <span className={styles.rowDesc}>{sec.desc}</span>}
      </span>
    </>
  );
  return (
    <div className={styles.expandable}>
      <div className={styles.row}>
        {expandable ? (
          <button type="button" className={styles.rowMainBtn} onClick={onToggleOpen} aria-expanded={open}>
            {head}
          </button>
        ) : (
          <div className={styles.rowMain}>{head}</div>
        )}
        <div className={styles.rowControl}>
          <Switch label={sec.label} checked={checked} onChange={onToggle} />
        </div>
      </div>
      {expandable && open && <div className={styles.subPanel}>{children}</div>}
    </div>
  );
}

export default function SettingsView({ onNavigate, tabsOrder = [], updateTabsOrder }) {
  const { user, isAdmin } = useAuth();
  const users = useUsers();
  const [userSettings, setUserSettings] = useState({});
  const [removedUsers, setRemovedUsers] = useState(new Set());
  const [dpStores, setDpStores] = useState([]);
  const [permUid, setPermUid] = useState(user.uid);
  const [openTabs, setOpenTabs] = useState(() => new Set());
  const toggleOpen = (tab) =>
    setOpenTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      return next;
    });

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

  // Permissão de edição do Estoque Mensal: a flag legada `estoqueEditar` (de
  // antes da separação por loja) liberava as duas lojas de uma vez. Enquanto ela
  // estiver ligada, os dois switches aparecem ON e desligar um deles não teria
  // efeito nenhum — então, no primeiro toque, ela vira flags explícitas por loja
  // e sai de cena. Mesmo tratamento que motoboysEditor recebe abaixo.
  const toggleEstoquePerm = async (uid, key, enabled) => {
    const s = userSettings[uid] || {};
    const patch = {};
    if (s.estoqueEditar === true) {
      ESTOQUE_LOJAS.forEach((l) => { patch[l.editFlag] = true; });
      patch.estoqueEditar = false;
    }
    patch[key] = enabled;
    await setDoc(doc(db, 'settings', uid), patch, { merge: true });
    setUserSettings((prev) => ({
      ...prev,
      [uid]: { ...prev[uid], ...patch },
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

  // Sub-permissões aninhadas de cada categoria (renderizadas dentro da linha
  // expandida). Só chamado quando a categoria está ligada.
  const renderSub = (tab) => {
    switch (tab) {
      case 'precosInsumos':
        return PRECOS_SUBSECTIONS.map((sub) => (
          <Row key={sub.key} title={sub.label}>
            <Switch
              label={sub.label}
              checked={s[sub.key] !== false}
              onChange={(v) => toggleSection(permTarget, sub.key, v)}
            />
          </Row>
        ));
      case 'motoboys':
        return (
          <>
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
            <Row title="Cadastro" desc="Renomeia e arquiva nomes de motoboys (adicionar é livre para todos)">
              <Switch
                label="Motoboys — cadastro"
                checked={s.motoboysRoster === true || s.motoboysEditor === true}
                onChange={(v) => toggleMotoboyPerm(permTarget, 'motoboysRoster', v)}
              />
            </Row>
            <Row title="Exportar" desc="Botão que gera o PDF da semana">
              <Switch
                label="Motoboys — exportar"
                checked={s.motoboysExportar === true || s.motoboysEditor === true}
                onChange={(v) => toggleMotoboyPerm(permTarget, 'motoboysExportar', v)}
              />
            </Row>
          </>
        );
      case 'reviews':
        return REVIEWS_LOJAS.map((l) => (
          <Row key={l.flag} title={l.label} desc="Loja visível nas avaliações">
            <Switch
              label={`Avaliações — ${l.label}`}
              checked={s[l.flag] !== false}
              onChange={(v) => toggleSection(permTarget, l.flag, v)}
            />
          </Row>
        ));
      case 'clientes':
        return (
          <>
            {CLIENTES_LOJAS.map((l) => (
              <Row key={l.flag} title={l.label} desc="Loja visível na base de clientes">
                <Switch
                  label={`Clientes — ${l.label}`}
                  checked={s[l.flag] !== false}
                  onChange={(v) => toggleSection(permTarget, l.flag, v)}
                />
              </Row>
            ))}
            <Row
              title="Enviar campanha"
              desc="Dispara mensagem de WhatsApp para a lista e vê o histórico. Nasce desligado — cada envio é cobrado pela Meta"
            >
              <Switch
                label="Clientes — enviar campanha"
                checked={s.clientesEnviar === true}
                onChange={(v) => toggleSection(permTarget, 'clientesEnviar', v)}
              />
            </Row>
          </>
        );
      case 'departamentoPessoal':
        return (
          <>
            <Row title="Edita escala e faltas" desc="Gerencia funcionários, lojas e marca faltas">
              <Switch
                label="Depto Pessoal — edita"
                checked={s.dpEditor === true}
                onChange={(v) => toggleSection(permTarget, 'dpEditor', v)}
              />
            </Row>
            {/* Salários é exclusivo do admin (sem flag de liberação — rules e
                cliente travam no isAdmin), por isso não há switch aqui. O que
                se libera é a Salários Folha: só o campo Banco, por um espelho
                (dpSalariosBanco) que não carrega o resto do salário. */}
            <Row title="Salários Folha" desc="Vê o valor que vai pro banco de cada funcionário, por mês. Nada além do Banco">
              <Switch
                label="Depto Pessoal — vê Salários Folha"
                checked={s.dpFolhaVisible === true || s.dpFolhaEdit === true}
                onChange={(v) => toggleSection(permTarget, 'dpFolhaVisible', v)}
              />
            </Row>
            <Row title="Salários Folha — editar" desc="Preenche o Banco (já inclui ver a subseção). Reflete na aba Salários do admin">
              <Switch
                label="Depto Pessoal — edita Salários Folha"
                checked={s.dpFolhaEdit === true}
                onChange={(v) => toggleSection(permTarget, 'dpFolhaEdit', v)}
              />
            </Row>
            <Row title="Transp" desc="Cálculo de transporte da Rumi e da Patricia. Só o admin edita, mesmo com isto ligado">
              <Switch
                label="Depto Pessoal — vê Transp"
                checked={s.dpTranspVisible === true}
                onChange={(v) => toggleSection(permTarget, 'dpTranspVisible', v)}
              />
            </Row>
            {dpStores.map((store) => (
              <Row key={store.id} title={store.name} desc="Loja visível na escala">
                <Switch
                  label={`Depto Pessoal — ${store.name}`}
                  checked={!(s.dpHiddenStores || []).includes(store.id)}
                  onChange={(v) => toggleStoreVisibility(permTarget, store.id, v)}
                />
              </Row>
            ))}
          </>
        );
      case 'shopping':
        return (
          <>
            {COMPRAS_LOJAS.map((l) => (
              <Row key={l.verFlag} title={`Compras — ${l.nome}`} desc="Loja disponível ao montar e copiar o pedido">
                <Switch
                  label={`Compras — vê ${l.nome}`}
                  checked={s[l.verFlag] !== false}
                  onChange={(v) => toggleSection(permTarget, l.verFlag, v)}
                />
              </Row>
            ))}
            <Row title="Compras — editar" desc="Gerencia fornecedores e o catálogo de itens">
              <Switch
                label="Compras — edita"
                checked={s.comprasEditor === true}
                onChange={(v) => toggleSection(permTarget, 'comprasEditor', v)}
              />
            </Row>
            <Row title="Estoque Mensal" desc="Mostra a sub-seção de contagem de estoque">
              <Switch
                label="Estoque Mensal — vê"
                checked={s.estoqueVer === true}
                onChange={(v) => toggleSection(permTarget, 'estoqueVer', v)}
              />
            </Row>
            {ESTOQUE_LOJAS.map((l) => (
              <Fragment key={l.id}>
                <Row title={`Estoque Mensal — ${l.nome}`} desc="Loja visível na contagem">
                  <Switch
                    label={`Estoque Mensal — vê ${l.nome}`}
                    checked={s[l.verFlag] !== false}
                    onChange={(v) => toggleSection(permTarget, l.verFlag, v)}
                  />
                </Row>
                <Row title={`Estoque Mensal — ${l.nome} edita`} desc={`Digita e limpa a contagem da ${l.nome}`}>
                  <Switch
                    label={`Estoque Mensal — edita ${l.nome}`}
                    checked={s[l.editFlag] === true || s.estoqueEditar === true}
                    onChange={(v) => toggleEstoquePerm(permTarget, l.editFlag, v)}
                  />
                </Row>
              </Fragment>
            ))}
            <Row title="Relatório Estoque" desc="Mostra a sub-seção que valoriza a contagem pelos preços da planilha">
              <Switch
                label="Relatório Estoque — vê"
                checked={s.relatorioEstoqueVer === true}
                onChange={(v) => toggleSection(permTarget, 'relatorioEstoqueVer', v)}
              />
            </Row>
            <Row title="Relatório Estoque — fechar mês" desc="Vincula produtos, salva e reabre o relatório do mês">
              <Switch
                label="Relatório Estoque — fecha o mês"
                checked={s.relatorioEstoqueEditar === true}
                onChange={(v) => toggleSection(permTarget, 'relatorioEstoqueEditar', v)}
              />
            </Row>
            <Row title="Conferir Pedidos" desc="Mostra a sub-seção que confere o pedido do gerente contra a nota fiscal">
              <Switch
                label="Conferir Pedidos — vê"
                checked={s.conferenciaVer === true}
                onChange={(v) => toggleSection(permTarget, 'conferenciaVer', v)}
              />
            </Row>
            <Row title="Conferir Pedidos — conferir" desc="Marca como conferido, liga o fornecedor da nota e ensina as unidades">
              <Switch
                label="Conferir Pedidos — confere"
                checked={s.conferenciaEditar === true}
                onChange={(v) => toggleSection(permTarget, 'conferenciaEditar', v)}
              />
            </Row>
          </>
        );
      default:
        return null;
    }
  };

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

        <Group title="Seções visíveis" desc="O que aparece no menu lateral deste usuário. Categorias com ajustes extras mostram um ›: clique para expandir e configurar sub-seções, lojas e permissões de edição ali mesmo.">
          {SECTIONS.filter((sec) => !sec.soAdmin || permTarget === user.uid).map((sec) => {
            const checked = sec.defaultOff ? s[sec.key] === true : s[sec.key] !== false;
            const expandable = checked && HAS_SUB.has(sec.tab);
            return (
              <SectionRow
                key={sec.key}
                sec={sec}
                checked={checked}
                onToggle={(v) => toggleSection(permTarget, sec.key, v)}
                expandable={expandable}
                open={openTabs.has(sec.tab)}
                onToggleOpen={() => toggleOpen(sec.tab)}
              >
                {expandable && renderSub(sec.tab)}
              </SectionRow>
            );
          })}
        </Group>
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
          <Row title="Chave API do Gemini" desc="Fica no servidor (proxy gemini-proxy-intranet na Vercel) — o navegador não vê a chave">
            <span className={styles.hint}>Gerenciada como variável de ambiente no deploy</span>
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
