import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { Icon } from './icons';
import { IS_V2 } from '../lib/v2';
import {
  FORNEC_COLORS, ALL, ESTOQUE_LOJAS, norm, isContado, mesAtual, fmtMes,
} from '../lib/suprimentos';
import styles from '../styles/ComprasView.module.css';

// Mapa vazio estável — evita recriar {} a cada render quando não há loja.
const EMPTY = {};

// Sub-seção de Suprimentos: contagem mensal do estoque. Usa o MESMO catálogo de
// Compras (comprasFornecedores/comprasItens) — mesmos produtos, mesma ordem —,
// mas o número digitado vai pro doc de contagem do MÊS escolhido (coleção
// estoqueContagens, um doc por mês e loja), não pro item. Assim a contagem de
// cada mês fica registrada e o Relatório Estoque consegue valorizar qualquer um
// deles. Nada aqui fala de compra: sem dia de entrega e sem cadastro de item ou
// fornecedor (isso continua em Compras).
export default function EstoqueView({ compras, contagens }) {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);

  const { fornecedores, itens, loading } = compras;
  const { qtysDe, setQty, loading: loadingContagens } = contagens;

  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [mes, setMes] = useState(mesAtual);

  // Abas de loja (padrão Motoboys/Depto Pessoal): quem vê cada loja é decidido
  // em Configurações. Ver nasce ligado; editar, desligado. `estoqueEditar` é a
  // permissão antiga (antes da separação por loja) e vale pelas duas.
  const lojasVisiveis = ESTOQUE_LOJAS.filter((l) => isAdmin || settings?.[l.verFlag] !== false);
  const [lojaId, setLojaId] = useState(ESTOQUE_LOJAS[0].id);
  const loja = lojasVisiveis.find((l) => l.id === lojaId) || lojasVisiveis[0] || null;
  const canEdit = !!loja && (isAdmin || settings?.estoqueEditar === true || settings?.[loja.editFlag] === true);

  const qtys = loja ? qtysDe(mes, loja.id) : EMPTY;

  // Valor sendo digitado, por item. O que está no banco só muda no commit
  // (blur ou Enter) — é lá que mora a confirmação de sobrescrita, e digitar
  // sem confirmar não pode alterar nada. Trocar de mês ou de loja descarta o
  // que estava sendo digitado (senão o número apareceria na contagem errada).
  const [draft, setDraft] = useState({});

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

  const contados = Object.values(qtys).filter(isContado).length;

  // Confirma antes de mexer numa contagem que já existe — o valor no banco é o
  // que alguém contou na loja, e trocar por engano (dedo no campo errado) sai
  // caro no relatório. Campo ainda em branco grava direto.
  const commit = async (item) => {
    const digitado = draft[item.id];
    if (digitado === undefined) return;
    const limpar = () => setDraft((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    const salvoRaw = qtys[item.id];
    const salvo = isContado(salvoRaw) ? String(salvoRaw) : '';
    const novo = String(digitado).trim();
    if (novo === salvo) { limpar(); return; }

    if (salvo !== '') {
      const unid = item.unid ? ` ${item.unid}` : '';
      const destino = novo === '' ? 'apagar a contagem' : `trocar para ${novo}${unid}`;
      const ok = window.confirm(
        `${item.produto} já está contado em ${salvo}${unid} neste mês. Deseja ${destino}?`
      );
      if (!ok) { limpar(); return; }
    }

    try {
      await setQty(mes, loja.id, item.id, novo);
    } catch (e) {
      window.alert(`Erro ao salvar a contagem: ${e?.message || e}`);
    }
    limpar();
  };

  const renderItem = (item, fornecId, highlight = false) => {
    const salvo = qtys[item.id];
    const digitado = draft[item.id];
    const valor = digitado !== undefined ? digitado : (isContado(salvo) ? String(salvo) : '');
    const contado = isContado(salvo);
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
            value={valor}
            disabled={!canEdit}
            onChange={(e) => setDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
            onBlur={() => commit(item)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
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

  if (!loja) {
    return (
      <p className={styles.empty}>
        Nenhuma loja liberada pra você no Estoque Mensal. Peça ao admin em
        Configurações → Permissões → Suprimentos.
      </p>
    );
  }

  return (
    <>
      {/* ---- Abas de loja (padrão Motoboys) ---- */}
      {lojasVisiveis.length > 1 && (
        <div className={styles.lojaTabs}>
          {lojasVisiveis.map((l) => (
            <button
              key={l.id}
              className={`${styles.lojaTab} ${loja.id === l.id ? styles.lojaTabActive : ''}`}
              onClick={() => { setLojaId(l.id); setDraft({}); }}
            >
              {l.nome}
            </button>
          ))}
        </div>
      )}

      {/* ---- Mês da contagem ---- */}
      <div className={styles.mesRow}>
        <label className={styles.mesLabel}>
          Mês da contagem
          <input
            className={styles.mesInput}
            type="month"
            value={mes}
            onChange={(e) => { setMes(e.target.value || mesAtual()); setDraft({}); }}
          />
        </label>
        <span className={styles.mesInfo}>
          {contados > 0
            ? `${contados} ${contados === 1 ? 'item contado' : 'itens contados'} em ${fmtMes(mes)}`
            : `Nada contado em ${fmtMes(mes)} ainda`}
        </span>
      </div>

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

      {/* Fornecedor. Não existe "Limpar" aqui: a contagem de um mês é registro
          — apagar tudo de uma vez seria perder o mês inteiro num clique. Item
          errado se corrige no próprio campo, esvaziando o valor. */}
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
        </div>
      )}

      {!canEdit && fornecedores.length > 0 && (
        <p className={styles.readOnlyMsg}>
          Você pode ver a contagem da <strong>{loja.nome}</strong>, mas não editar. Peça ao admin a
          permissão <strong>Estoque Mensal — {loja.nome} edita</strong>.
        </p>
      )}

      {loading || loadingContagens ? (
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
