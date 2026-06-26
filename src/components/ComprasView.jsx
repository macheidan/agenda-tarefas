import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useCompras } from '../hooks/useCompras';
import styles from '../styles/ComprasView.module.css';

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const FORNEC_COLORS = ['#465fff', '#ff9800', '#12b76a', '#9c27b0', '#f04438', '#3949ab', '#0d9488'];

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
    seedInitialData,
  } = useCompras();

  const [selectedId, setSelectedId] = useState(null);
  const [day, setDay] = useState('Segunda');
  const [copied, setCopied] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Gerência de fornecedores.
  const [managing, setManaging] = useState(false);
  const [newFornecName, setNewFornecName] = useState('');
  const [editingFornec, setEditingFornec] = useState(null);
  const [editingFornecName, setEditingFornecName] = useState('');

  // Formulário de item (add / editar).
  const [formMode, setFormMode] = useState(null); // null | 'add' | 'edit'
  const [formId, setFormId] = useState(null);
  const [fProduto, setFProduto] = useState('');
  const [fMarca, setFMarca] = useState('');
  const [fUnid, setFUnid] = useState('');

  const cor = (idx) => FORNEC_COLORS[idx % FORNEC_COLORS.length];

  const activeId =
    selectedId && fornecedores.some((f) => f.id === selectedId)
      ? selectedId
      : fornecedores[0]?.id || null;
  const activeFornec = fornecedores.find((f) => f.id === activeId) || null;
  const activeIdx = fornecedores.findIndex((f) => f.id === activeId);

  const fornecItems = useMemo(
    () => itens.filter((i) => i.fornecedorId === activeId),
    [itens, activeId]
  );

  const closeForm = () => setFormMode(null);

  const openAdd = () => {
    if (formMode === 'add') { closeForm(); return; }
    setFormMode('add');
    setFormId(null);
    setFProduto(''); setFMarca(''); setFUnid('');
  };

  const openEdit = (item) => {
    setFormMode('edit');
    setFormId(item.id);
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

  // Texto do pedido (somente itens com quantidade > 0).
  const copyOrder = () => {
    if (!activeFornec) return;
    const ativos = fornecItems.filter((i) => Number(i.qty) > 0);
    const linhas = ativos.map((i) => {
      const qty = Number(i.qty);
      const q = Number.isInteger(qty) ? qty : qty.toString().replace('.', ',');
      const marca = i.marca ? ` ${i.marca}` : '';
      const unid = i.unid ? ` (${i.unid})` : '';
      return `${q}x ${i.produto}${marca}${unid}`;
    });
    const txt = [
      `*PEDIDO ${activeFornec.name}*`,
      '*Dáme & Lov*',
      `*Entrega ${day} após 16:30*`,
      '',
      ...(linhas.length ? linhas : ['(nenhum item selecionado)']),
    ].join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
        () => {}
      );
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>🛒 Compras</h2>
      </div>

      {/* Abas de fornecedores + gerenciar */}
      <div className={styles.fornecBar}>
        <div className={styles.fornecTabs}>
          {fornecedores.map((f, idx) => {
            const color = cor(idx);
            const active = f.id === activeId;
            return (
              <button
                key={f.id}
                className={styles.fornecTab}
                style={{
                  borderColor: color,
                  background: active ? color : 'var(--card)',
                  color: active ? '#fff' : color,
                }}
                onClick={() => setSelectedId(f.id)}
              >
                {f.name}
              </button>
            );
          })}
          {canEdit && (
            <button
              className={styles.manageBtn}
              onClick={() => setManaging((v) => !v)}
              title="Gerenciar fornecedores"
            >
              {managing ? 'Fechar' : '⚙ Fornecedores'}
            </button>
          )}
        </div>
      </div>

      {managing && canEdit && (
        <div className={styles.manageBox}>
          <h4>Fornecedores</h4>
          <div className={styles.manageList}>
            {fornecedores.map((f) => (
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
                        if (window.confirm(`Remover o fornecedor "${f.name}"? Todos os itens dele serão apagados.`)) deleteFornecedor(f.id);
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

      {/* Barra de ações */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <label className={styles.dayLabel}>
            Entrega
            <select className={styles.daySelect} value={day} onChange={(e) => setDay(e.target.value)}>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.toolbarActions}>
          {activeFornec && (
            <button className={styles.copyBtn} onClick={copyOrder}>
              {copied ? 'Copiado!' : 'Copiar pedido'}
            </button>
          )}
          {canEdit && activeFornec && (
            <button className={styles.newBtn} onClick={openAdd}>
              {formMode === 'add' ? 'Cancelar' : '+ Item'}
            </button>
          )}
        </div>
      </div>

      {formMode && canEdit && activeFornec && (
        <div className={styles.itemForm}>
          <div className={styles.itemFormTitle}>
            {formMode === 'add' ? 'Novo item' : 'Editar item'} — {activeFornec.name}
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
      ) : fornecItems.length === 0 ? (
        <p className={styles.empty}>
          Nenhum item em <strong>{activeFornec?.name}</strong>.
          {canEdit && <> Clique em <strong>+ Item</strong> para começar.</>}
        </p>
      ) : (
        <div className={styles.list}>
          {fornecItems.map((item) => {
            const ativo = Number(item.qty) > 0;
            return (
              <div key={item.id} className={`${styles.row} ${ativo ? styles.rowActive : ''}`}>
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
                    style={{ borderColor: cor(activeIdx) }}
                  />
                  {canEdit && (
                    <>
                      <button className={styles.iconBtn} onClick={() => openEdit(item)} title="Editar item">✎</button>
                      <button
                        className={styles.iconBtnDanger}
                        onClick={() => {
                          if (window.confirm(`Apagar o item "${item.produto}"?`)) deleteItem(item.id);
                        }}
                        title="Apagar item"
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
