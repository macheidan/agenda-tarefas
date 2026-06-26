import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useCompras } from '../hooks/useCompras';
import styles from '../styles/ComprasView.module.css';

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const LOJAS = ['Lov', 'Dáme'];
const FORNEC_COLORS = ['#465fff', '#ff9800', '#12b76a', '#9c27b0', '#f04438', '#3949ab', '#0d9488'];
const ALL = '__all__';
const LOJA_KEY = 'comprasLoja';

// Normaliza para busca: minúsculas e sem acentos.
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function ComprasView() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  // Editores (e o admin) gerenciam fornecedores e o catálogo de itens.
  // Qualquer usuário com a seção visível pode ajustar as quantidades do pedido.
  const canEdit = isAdmin || settings?.comprasEditor === true;

  const {
    fornecedores,
    itens,
    loading,
    error,
    addFornecedor,
    renameFornecedor,
    deleteFornecedor,
    addItem,
    updateItem,
    deleteItem,
    resetAllQuantities,
    seedInitialData,
  } = useCompras();

  const [selectedId, setSelectedId] = useState(null);
  const [day, setDay] = useState(''); // '' = não selecionado (entrega obrigatória)
  // Loja escolhida fica memorizada no navegador (localStorage).
  const [loja, setLoja] = useState(() => {
    try { return localStorage.getItem(LOJA_KEY) || ''; } catch { return ''; }
  });
  const [copied, setCopied] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [query, setQuery] = useState('');

  // Gerência de fornecedores.
  const [managing, setManaging] = useState(false);
  const [newFornecName, setNewFornecName] = useState('');
  const [editingFornec, setEditingFornec] = useState(null);
  const [editingFornecName, setEditingFornecName] = useState('');

  // Formulário de item (add / editar).
  const [formMode, setFormMode] = useState(null); // null | 'add' | 'edit'
  const [formId, setFormId] = useState(null);
  const [formFornecId, setFormFornecId] = useState(null); // fornecedor do item em edição
  const [fProduto, setFProduto] = useState('');
  const [fMarca, setFMarca] = useState('');
  const [fUnid, setFUnid] = useState('');

  useEffect(() => {
    try { localStorage.setItem(LOJA_KEY, loja); } catch { /* ignore */ }
  }, [loja]);

  // Fornecedores em ordem alfabética (usado em todo lugar que exibe a lista).
  const sortedFornecedores = useMemo(
    () => [...fornecedores].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' })),
    [fornecedores]
  );
  // Índice estável de cor por fornecedor (segue a ordem alfabética).
  const colorIndex = useMemo(() => {
    const m = {};
    sortedFornecedores.forEach((f, i) => { m[f.id] = i; });
    return m;
  }, [sortedFornecedores]);
  const cor = (fornecId) => FORNEC_COLORS[(colorIndex[fornecId] ?? 0) % FORNEC_COLORS.length];

  const validIds = [...sortedFornecedores.map((f) => f.id), ALL];
  // Seleção de fornecedor é obrigatória: sem escolha, nada é exibido.
  const activeId = selectedId && validIds.includes(selectedId) ? selectedId : null;
  const isAll = activeId === ALL;
  const activeFornec = isAll ? null : sortedFornecedores.find((f) => f.id === activeId) || null;

  const fornecItems = useMemo(
    () => itens.filter((i) => i.fornecedorId === activeId),
    [itens, activeId]
  );

  // Todos os fornecedores com seus itens (para a opção "Todos").
  const allGroups = useMemo(
    () => sortedFornecedores.map((f) => ({ fornec: f, items: itens.filter((i) => i.fornecedorId === f.id) })),
    [sortedFornecedores, itens]
  );

  // Busca por produto (em todos os fornecedores). Ao digitar, mostra a lista
  // inteira de cada fornecedor que tem algum produto correspondente.
  const searching = query.trim().length > 0;
  const matchesQuery = (item) => {
    const nq = norm(query.trim());
    return norm(item.produto).includes(nq) || norm(item.marca).includes(nq);
  };
  const searchGroups = useMemo(() => {
    if (!searching) return [];
    const nq = norm(query.trim());
    return sortedFornecedores
      .map((f) => ({ fornec: f, items: itens.filter((i) => i.fornecedorId === f.id) }))
      .filter((g) => g.items.some((i) => norm(i.produto).includes(nq) || norm(i.marca).includes(nq)));
  }, [searching, query, sortedFornecedores, itens]);
  const matchCount = useMemo(() => {
    if (!searching) return 0;
    const nq = norm(query.trim());
    return itens.filter((i) => norm(i.produto).includes(nq) || norm(i.marca).includes(nq)).length;
  }, [searching, query, itens]);

  // Renderiza uma linha de item, reaproveitada na lista normal e na busca.
  const renderItem = (item, fornecId, highlight = false) => {
    const ativo = Number(item.qty) > 0;
    return (
      <div
        key={item.id}
        className={`${styles.row} ${ativo ? styles.rowActive : ''} ${highlight ? styles.rowMatch : ''}`}
      >
        <div className={styles.rowInfo}>
          <span className={styles.produto}>{item.produto}</span>
          <span className={styles.meta}>
            {item.marca && <span className={styles.marca}>{item.marca}</span>}
            {item.unid && <span className={styles.unid}>{item.unid}</span>}
          </span>
        </div>
        <div className={styles.rowActions}>
          <input
            className={styles.qtyInput}
            type="number"
            min="0"
            step="any"
            value={item.qty ?? 0}
            onChange={(e) => updateItem(item.id, { qty: e.target.value })}
            style={{ borderColor: cor(fornecId) }}
          />
          {canEdit && (
            <>
              <button className={styles.iconBtn} onClick={() => openEdit(item)} title="Editar item">✎</button>
              <button
                className={styles.iconBtnDanger}
                onClick={() => {
                  if (window.confirm(`Tem certeza que deseja apagar o item "${item.produto}"? Esta ação não pode ser desfeita.`)) {
                    deleteItem(item.id);
                  }
                }}
                title="Apagar item"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Renderiza o bloco de um fornecedor (cabeçalho clicável + lista de itens),
  // usado na busca e na opção "Todos". highlightFn opcional destaca os que casam.
  const renderGroup = ({ fornec, items }, highlightFn, showHeader = true) => (
    <div key={fornec.id} className={styles.group}>
      {showHeader && (
        <button
          className={styles.groupHead}
          style={{ borderColor: cor(fornec.id), color: cor(fornec.id) }}
          onClick={() => { setSelectedId(fornec.id); setQuery(''); }}
          title="Abrir fornecedor"
        >
          {fornec.name}
        </button>
      )}
      <div className={styles.list}>
        {items.length === 0 ? (
          <p className={styles.emptyGroup}>Sem itens.</p>
        ) : (
          items.map((item) => renderItem(item, fornec.id, highlightFn ? highlightFn(item) : false))
        )}
      </div>
    </div>
  );

  const closeForm = () => setFormMode(null);

  const openAdd = () => {
    if (formMode === 'add') { closeForm(); return; }
    setFormMode('add');
    setFormId(null);
    setFormFornecId(activeId);
    setFProduto(''); setFMarca(''); setFUnid('');
  };

  const openEdit = (item) => {
    setFormMode('edit');
    setFormId(item.id);
    setFormFornecId(item.fornecedorId);
    setFProduto(item.produto || '');
    setFMarca(item.marca || '');
    setFUnid(item.unid || '');
  };

  const submitForm = () => {
    const produto = fProduto.trim();
    if (!produto || !activeId) return;
    if (formMode === 'edit' && formId) {
      updateItem(formId, { produto, marca: fMarca, unid: fUnid });
    } else {
      addItem(activeId, { produto, marca: fMarca, unid: fUnid, qty: 0 });
    }
    closeForm();
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedInitialData();
    } catch (e) {
      window.alert(`Erro ao importar: ${e?.message || e}`);
    } finally {
      setSeeding(false);
    }
  };

  // Monta o bloco de pedido de um fornecedor (só itens com quantidade > 0).
  // Retorna null se o fornecedor não tem nenhum item selecionado.
  const buildBlock = (fornec, items) => {
    const ativos = items.filter((i) => Number(i.qty) > 0);
    if (!ativos.length) return null;
    const linhas = ativos.map((i) => {
      const qty = Number(i.qty);
      const q = Number.isInteger(qty) ? qty : qty.toString().replace('.', ',');
      const marca = i.marca ? ` ${i.marca}` : '';
      const unid = i.unid ? ` (${i.unid})` : '';
      return `${q}x ${i.produto}${marca}${unid}`;
    });
    return [
      `*PEDIDO ${fornec.name}*`,
      `*${loja}*`,
      `*Entrega ${day} após 16:30*`,
      '',
      ...linhas,
    ].join('\n');
  };

  // Copia o pedido. Seleção do dia de entrega e da loja são obrigatórias.
  const copyOrder = () => {
    if (!day) {
      window.alert('Selecione o dia da entrega antes de copiar o pedido.');
      return;
    }
    if (!loja) {
      window.alert('Selecione a loja (Lov ou Dáme) antes de copiar o pedido.');
      return;
    }
    let txt;
    if (isAll) {
      const blocks = allGroups.map((g) => buildBlock(g.fornec, g.items)).filter(Boolean);
      if (!blocks.length) {
        window.alert('Nenhum item selecionado em nenhum fornecedor.');
        return;
      }
      txt = blocks.join('\n\n———\n\n');
    } else {
      if (!activeFornec) return;
      txt = buildBlock(activeFornec, fornecItems);
      if (!txt) {
        window.alert(`Nenhum item selecionado em ${activeFornec.name}.`);
        return;
      }
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
        () => {}
      );
    }
  };

  // Zera todas as quantidades de todos os fornecedores (com confirmação).
  const handleReset = async () => {
    if (!window.confirm('Tem certeza que deseja ZERAR todas as quantidades de TODOS os fornecedores? Esta ação não pode ser desfeita.')) {
      return;
    }
    setResetting(true);
    try {
      await resetAllQuantities();
    } catch (e) {
      window.alert(`Erro ao zerar: ${e?.message || e}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>🛒 Compras</h2>
        {fornecedores.length > 0 && (
          <div className={styles.headerActions}>
            {canEdit && activeFornec && (
              <button className={styles.newBtn} onClick={openAdd}>
                {formMode === 'add' ? 'Cancelar' : '+ Item'}
              </button>
            )}
            {canEdit && (
              <button
                className={styles.manageBtn}
                onClick={() => setManaging((v) => !v)}
                title="Gerenciar fornecedores"
              >
                {managing ? 'Fechar' : '+ Fornecedores'}
              </button>
            )}
          </div>
        )}
      </div>

      {fornecedores.length > 0 && (
        <div className={styles.searchRow}>
          <span className={styles.searchIcon}>🔎</span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Buscar produto em todos os fornecedores..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && (
            <button className={styles.clearSearch} onClick={() => setQuery('')} title="Limpar busca">
              ✕
            </button>
          )}
        </div>
      )}

      {managing && canEdit && (
        <div className={styles.manageBox}>
          <h4>Fornecedores</h4>
          <div className={styles.manageList}>
            {sortedFornecedores.map((f) => (
              <div key={f.id} className={styles.manageRow}>
                {editingFornec === f.id ? (
                  <>
                    <input
                      className={styles.inlineInput}
                      value={editingFornecName}
                      autoFocus
                      onChange={(e) => setEditingFornecName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { renameFornecedor(f.id, editingFornecName); setEditingFornec(null); }
                      }}
                    />
                    <button className={styles.smallBtn} onClick={() => { renameFornecedor(f.id, editingFornecName); setEditingFornec(null); }}>Salvar</button>
                    <button className={styles.smallBtnGhost} onClick={() => setEditingFornec(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className={styles.manageName}>{f.name}</span>
                    <button className={styles.smallBtnGhost} onClick={() => { setEditingFornec(f.id); setEditingFornecName(f.name); }}>Renomear</button>
                    <button
                      className={styles.smallBtnDanger}
                      onClick={() => {
                        if (window.confirm(`Tem certeza que deseja remover o fornecedor "${f.name}"? Todos os itens dele serão apagados. Esta ação não pode ser desfeita.`)) deleteFornecedor(f.id);
                      }}
                    >
                      Remover
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className={styles.addFornecRow}>
            <input
              className={styles.inlineInput}
              placeholder="Novo fornecedor..."
              value={newFornecName}
              onChange={(e) => setNewFornecName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFornecName.trim()) { addFornecedor(newFornecName); setNewFornecName(''); }
              }}
            />
            <button
              className={styles.smallBtn}
              onClick={() => { if (newFornecName.trim()) { addFornecedor(newFornecName); setNewFornecName(''); } }}
            >
              + Adicionar fornecedor
            </button>
          </div>
        </div>
      )}

      {/* Fornecedor (esquerda) + Zerar · Entrega · Loja · Copiar (direita) */}
      {fornecedores.length > 0 && (
        <div className={styles.toolbar}>
          <select
            className={`${styles.fornecSelect} ${!activeId ? styles.selectEmpty : ''}`}
            style={{ borderColor: !activeId ? 'var(--accent)' : (isAll ? 'var(--text-secondary)' : cor(activeId)) }}
            value={isAll ? ALL : (activeId || '')}
            onChange={(e) => { setSelectedId(e.target.value); setQuery(''); }}
            required
          >
            <option value="">Selecione o fornecedor</option>
            {sortedFornecedores.length > 1 && <option value={ALL}>Todos</option>}
            {sortedFornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {(activeFornec || isAll) && (
            <div className={styles.toolbarActions}>
              <button className={styles.resetBtn} onClick={handleReset} disabled={resetting}>
                {resetting ? 'Zerando...' : 'Zerar'}
              </button>
              <select
                className={`${styles.daySelect} ${!day ? styles.selectEmpty : ''}`}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                required
              >
                <option value="">Entrega</option>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                className={`${styles.daySelect} ${!loja ? styles.selectEmpty : ''}`}
                value={loja}
                onChange={(e) => setLoja(e.target.value)}
                required
              >
                <option value="">Loja</option>
                {LOJAS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button className={styles.copyBtn} onClick={copyOrder}>
                {copied ? 'Copiado!' : 'Copiar pedido'}
              </button>
            </div>
          )}
        </div>
      )}

      {formMode && canEdit && (activeFornec || formMode === 'edit') && (
        <div className={styles.itemForm}>
          <div className={styles.itemFormTitle}>
            {formMode === 'add' ? 'Novo item' : 'Editar item'}
            {(() => {
              const nome = sortedFornecedores.find((f) => f.id === formFornecId)?.name;
              return nome ? ` — ${nome}` : '';
            })()}
          </div>
          <div className={styles.itemFormFields}>
            <input
              className={styles.inlineInput}
              placeholder="Produto"
              value={fProduto}
              autoFocus
              onChange={(e) => setFProduto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitForm()}
            />
            <input
              className={styles.inlineInput}
              placeholder="Marca (opcional)"
              value={fMarca}
              onChange={(e) => setFMarca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitForm()}
            />
            <input
              className={styles.inlineInputSm}
              placeholder="Unid."
              value={fUnid}
              onChange={(e) => setFUnid(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitForm()}
            />
            <button className={styles.smallBtn} onClick={submitForm}>
              {formMode === 'add' ? 'Adicionar' : 'Salvar'}
            </button>
            <button className={styles.smallBtnGhost} onClick={closeForm}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de itens */}
      {loading ? (
        <p className={styles.empty}>Carregando...</p>
      ) : fornecedores.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhum fornecedor cadastrado ainda.</p>
          {canEdit && (
            <button className={styles.newBtn} onClick={handleSeed} disabled={seeding}>
              {seeding ? 'Importando...' : 'Importar lista de compras (dados iniciais)'}
            </button>
          )}
          {error && (
            <p className={styles.errorMsg}>
              Erro ao acessar o banco: {error}. Pode ser necessário publicar as regras do
              Firestore (coleções comprasFornecedores/comprasItens).
            </p>
          )}
        </div>
      ) : searching ? (
        searchGroups.length === 0 ? (
          <p className={styles.empty}>
            Nenhum produto encontrado para &quot;<strong>{query.trim()}</strong>&quot;.
          </p>
        ) : (
          <div className={styles.searchResults}>
            <p className={styles.searchInfo}>
              {matchCount} {matchCount === 1 ? 'produto encontrado' : 'produtos encontrados'} em{' '}
              {searchGroups.length} {searchGroups.length === 1 ? 'fornecedor' : 'fornecedores'}
            </p>
            {searchGroups.map((g) => renderGroup(g, matchesQuery))}
          </div>
        )
      ) : !activeId ? (
        <p className={styles.empty}>Selecione um fornecedor para ver os itens.</p>
      ) : isAll ? (
        <div className={styles.searchResults}>
          {allGroups.map((g) => renderGroup(g, null, false))}
        </div>
      ) : fornecItems.length === 0 ? (
        <p className={styles.empty}>
          Nenhum item em <strong>{activeFornec?.name}</strong>.
          {canEdit && <> Clique em <strong>+ Item</strong> para começar.</>}
        </p>
      ) : (
        <div className={styles.list}>
          {fornecItems.map((item) => renderItem(item, activeId))}
        </div>
      )}
    </div>
  );
}
