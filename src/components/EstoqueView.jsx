import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { Icon } from './icons';
import { IS_V2 } from '../lib/v2';
import { FORNEC_COLORS, ALL, norm, isContado, fmtQty } from '../lib/suprimentos';
import styles from '../styles/ComprasView.module.css';

// Sub-seção de Suprimentos: contagem mensal do estoque. Usa o MESMO catálogo de
// Compras (comprasFornecedores/comprasItens) — mesmos produtos, mesma ordem —,
// só que o número digitado vai pro campo `estoqueQty` do item, separado do `qty`
// do pedido. Nada aqui fala de compra: sem dia de entrega e sem cadastro de
// item/fornecedor (isso continua em Compras).
export default function EstoqueView({ compras }) {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  // Quem vê a sub-seção é decidido em Configurações (estoqueVer); editar a
  // contagem é uma permissão à parte (estoqueEditar). Sem ela, os campos ficam
  // só de leitura.
  const canEdit = isAdmin || settings?.estoqueEditar === true;

  const { fornecedores, itens, loading, updateEstoque, clearAllEstoque } = compras;

  const [selectedId, setSelectedId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [query, setQuery] = useState('');

  // Mesma ordem de Compras: fornecedores em ordem alfabética, itens na ordem do
  // catálogo (o hook já entrega ordenado por `order`).
  const sortedFornecedores = useMemo(
    () => [...fornecedores].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' })),
    [fornecedores]
  );
  const colorIndex = useMemo(() => {
    const m = {};
    sortedFornecedores.forEach((f, i) => { m[f.id] = i; });
    return m;
  }, [sortedFornecedores]);
  const cor = (fornecId) => FORNEC_COLORS[(colorIndex[fornecId] ?? 0) % FORNEC_COLORS.length];

  const validIds = [...sortedFornecedores.map((f) => f.id), ALL];
  const defaultId = sortedFornecedores.length > 1 ? ALL : (sortedFornecedores[0]?.id || null);
  const activeId = selectedId && validIds.includes(selectedId) ? selectedId : defaultId;
  const isAll = activeId === ALL;
  const activeFornec = isAll ? null : sortedFornecedores.find((f) => f.id === activeId) || null;

  const fornecItems = useMemo(
    () => itens.filter((i) => i.fornecedorId === activeId),
    [itens, activeId]
  );

  const allGroups = useMemo(
    () => sortedFornecedores.map((f) => ({ fornec: f, items: itens.filter((i) => i.fornecedorId === f.id) })),
    [sortedFornecedores, itens]
  );

  // Busca por produto em todos os fornecedores (idêntica à de Compras).
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

  const renderItem = (item, fornecId, highlight = false) => {
    const contado = isContado(item);
    return (
      <div
        key={item.id}
        className={`${styles.row} ${contado ? styles.rowActive : ''} ${highlight ? styles.rowMatch : ''}`}
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
            placeholder="—"
            value={contado ? item.estoqueQty : ''}
            disabled={!canEdit}
            onChange={(e) => updateEstoque(item.id, e.target.value)}
            style={{ borderColor: cor(fornecId) }}
          />
        </div>
      </div>
    );
  };

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

  // Bloco de contagem de um fornecedor: entra só o que foi DIGITADO — inclusive
  // o que foi contado como 0 (acabou). Item em branco fica de fora.
  const buildBlock = (fornec, items) => {
    const contados = items.filter(isContado);
    if (!contados.length) return null;
    const linhas = contados.map((i) => {
      const marca = i.marca ? ` ${i.marca}` : '';
      return `${fmtQty(i.estoqueQty)}${i.unid || ''} - ${i.produto}${marca}`;
    });
    const hoje = new Date().toLocaleDateString('pt-BR');
    return [
      `*ESTOQUE ${fornec.name}*`,
      `*Contagem ${hoje}*`,
      '',
      ...linhas,
    ].join('\n');
  };

  const copyCount = () => {
    let txt;
    if (isAll) {
      const blocks = allGroups.map((g) => buildBlock(g.fornec, g.items)).filter(Boolean);
      if (!blocks.length) {
        window.alert('Nenhum item contado ainda.');
        return;
      }
      txt = blocks.join('\n\n———\n\n');
    } else {
      if (!activeFornec) return;
      txt = buildBlock(activeFornec, fornecItems);
      if (!txt) {
        window.alert(`Nenhum item contado em ${activeFornec.name}.`);
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

  // Limpa a contagem de todos os fornecedores (começar o mês do zero).
  const handleClear = async () => {
    if (!window.confirm('Tem certeza que deseja LIMPAR a contagem de TODOS os fornecedores? Esta ação não pode ser desfeita.')) {
      return;
    }
    setClearing(true);
    try {
      await clearAllEstoque();
    } catch (e) {
      window.alert(`Erro ao limpar: ${e?.message || e}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      {fornecedores.length > 0 && (
        <div className={styles.topRow}>
          <div className={styles.searchRow}>
            <span className={styles.searchIcon}>{IS_V2 ? <Icon k="search" /> : '🔎'}</span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Buscar produto em todos os fornecedores..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searching && (
              <button className={styles.clearSearch} onClick={() => setQuery('')} title="Limpar busca">
                {IS_V2 ? <Icon k="x" /> : '✕'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fornecedor (esquerda) + Limpar · Loja · Copiar (direita) */}
      {fornecedores.length > 0 && (
        <div className={styles.toolbar}>
          <select
            className={`${styles.fornecSelect} ${!activeId ? styles.selectEmpty : ''}`}
            style={{ borderColor: !activeId ? 'var(--accent)' : (isAll ? 'var(--text-secondary)' : cor(activeId)) }}
            value={isAll ? ALL : (activeId || '')}
            onChange={(e) => { setSelectedId(e.target.value); setQuery(''); }}
            required
          >
            {sortedFornecedores.length > 1 && <option value={ALL}>Todos</option>}
            {sortedFornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {(activeFornec || isAll) && (
            <div className={styles.toolbarActions}>
              {canEdit && (
                <button className={styles.resetBtn} onClick={handleClear} disabled={clearing}>
                  {clearing ? 'Limpando...' : 'Limpar'}
                </button>
              )}
              <button className={styles.copyBtn} onClick={copyCount}>
                {copied ? 'Copiado!' : '+ Copiar'}
              </button>
            </div>
          )}
        </div>
      )}

      {!canEdit && fornecedores.length > 0 && (
        <p className={styles.readOnlyMsg}>
          Você pode ver a contagem, mas não editar. Peça ao admin a permissão
          <strong> Estoque Mensal — edita</strong>.
        </p>
      )}

      {loading ? (
        <p className={styles.empty}>Carregando...</p>
      ) : fornecedores.length === 0 ? (
        <p className={styles.empty}>
          Nenhum fornecedor cadastrado ainda. Cadastre em <strong>Compras</strong> — a lista de
          produtos é a mesma nas duas telas.
        </p>
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
        <p className={styles.empty}>Selecione um fornecedor para contar os itens.</p>
      ) : isAll ? (
        <div className={styles.searchResults}>
          {allGroups.map((g) => renderGroup(g, null, false))}
        </div>
      ) : fornecItems.length === 0 ? (
        <p className={styles.empty}>
          Nenhum item em <strong>{activeFornec?.name}</strong>.
        </p>
      ) : (
        <div className={styles.list}>
          {fornecItems.map((item) => renderItem(item, activeId))}
        </div>
      )}
    </>
  );
}
