import { useState, useMemo } from 'react';
import { NPS_TIERS, NPS_TIER_ORDER, npsTier, joinAnswers } from '../utils/nps';
import { Icon } from './icons';
import SurveyModal from './SurveyModal';
import styles from '../styles/SurveysView.module.css';

// As duas lojas são fixas, não derivadas dos dados: a Lov precisa aparecer na
// barra mesmo com zero pesquisas importadas, senão o filtro some justo quando
// alguém quer saber por que a Lov está vazia. Espelha MOTOBOY_LOJAS.
const LOJAS = [
  { brand: 'dame', label: 'Dáme', flag: 'reviewsVerDame' },
  { brand: 'lov', label: 'Lov', flag: 'reviewsVerLov' },
];
const BRAND_LABELS = Object.fromEntries(LOJAS.map((l) => [l.brand, l.label]));

const formatDate = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
};

export default function SurveysView({ surveys, loading, error, setArchived, settings, isAdmin }) {
  const [tierFilter, setTierFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState(null);

  // Lojas liberadas pro usuário (default: as duas). Admin vê tudo.
  const lojas = useMemo(
    () => LOJAS.filter((l) => isAdmin || settings?.[l.flag] !== false),
    [settings, isAdmin]
  );

  // Quem só pode ver uma loja nunca escapa dela: o filtro é travado na permissão,
  // não no que o usuário clicou. Quem vê todas não passa pelo filtro — assim uma
  // pesquisa com brand inesperado (ou sem brand) continua aparecendo pra quem tem
  // acesso total, em vez de sumir sem deixar rastro.
  const permitidas = useMemo(() => new Set(lojas.map((l) => l.brand)), [lojas]);
  const daLoja = useMemo(
    () => (lojas.length === LOJAS.length ? surveys : surveys.filter((s) => permitidas.has(s.brand))),
    [surveys, permitidas, lojas]
  );

  const archivedCount = useMemo(() => daLoja.filter((s) => s.archived === true).length, [daLoja]);

  // O chip de marca na linha é cosmético: só faz sentido quando há mesmo pesquisa
  // de mais de uma loja na tela. A barra de lojas em cima é que segue a permissão
  // (e aparece mesmo com a loja zerada, pra dizer que ela existe).
  const marcasComDados = useMemo(
    () => new Set(daLoja.map((s) => s.brand).filter(Boolean)),
    [daLoja]
  );

  // Arquivar é o "já tratei": some da lista principal e só aparece na aba
  // Arquivadas. Os contadores por faixa seguem a aba em que se está.
  const visible = useMemo(
    () => daLoja.filter((s) => (showArchived ? s.archived === true : s.archived !== true)),
    [daLoja, showArchived]
  );

  const byBrand = useMemo(
    () => (brandFilter === 'all' ? visible : visible.filter((s) => s.brand === brandFilter)),
    [visible, brandFilter]
  );

  const tierCounts = useMemo(() => {
    const counts = { detrator: 0, neutro: 0, promotor: 0 };
    for (const s of byBrand) {
      const t = npsTier(s.nota);
      if (t) counts[t] += 1;
    }
    return counts;
  }, [byBrand]);

  // Prioridade de insatisfação: nota mais baixa primeiro; empate = mais recente antes.
  const rows = useMemo(() => {
    const list = tierFilter === 'all' ? byBrand : byBrand.filter((s) => npsTier(s.nota) === tierFilter);
    return [...list].sort((a, b) => {
      const notaA = typeof a.nota === 'number' ? a.nota : 99;
      const notaB = typeof b.nota === 'number' ? b.nota : 99;
      if (notaA !== notaB) return notaA - notaB;
      return (b.respondedAt?.toMillis?.() || 0) - (a.respondedAt?.toMillis?.() || 0);
    });
  }, [byBrand, tierFilter]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>{showArchived ? 'Avaliações — Arquivadas' : 'Avaliações'}</h2>
        <div className={styles.headerActions}>
          <button
            className={`${styles.sectionTab} ${tierFilter === 'all' ? styles.sectionTabActive : ''}`}
            onClick={() => setTierFilter('all')}
          >
            Todas ({byBrand.length})
          </button>
          {NPS_TIER_ORDER.map((key) => (
            <button
              key={key}
              className={`${styles.sectionTab} ${tierFilter === key ? styles.sectionTabActive : ''}`}
              onClick={() => setTierFilter(key)}
            >
              {NPS_TIERS[key].label} ({tierCounts[key]})
            </button>
          ))}
          <button
            className={`${styles.sectionTab} ${showArchived ? styles.sectionTabActive : ''}`}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Voltar' : `Arquivadas (${archivedCount})`}
          </button>
        </div>
      </div>

      {lojas.length > 1 && (
        <div className={styles.storeBar}>
          <button
            className={`${styles.sectionTab} ${brandFilter === 'all' ? styles.sectionTabActive : ''}`}
            onClick={() => setBrandFilter('all')}
          >
            Todas as lojas
          </button>
          {lojas.map((l) => (
            <button
              key={l.brand}
              className={`${styles.sectionTab} ${brandFilter === l.brand ? styles.sectionTabActive : ''}`}
              onClick={() => setBrandFilter(l.brand)}
            >
              {l.label} ({daLoja.filter((s) => s.brand === l.brand && s.archived !== true).length})
            </button>
          ))}
        </div>
      )}

      {loading && <div className={styles.empty}><p>Carregando avaliações…</p></div>}

      {!loading && error && (
        <div className={styles.empty}>
          <p>Não foi possível carregar as avaliações.</p>
          <span>
            {error.code === 'permission-denied'
              ? 'Sem permissão para ler a coleção surveys — publique as firestore.rules.'
              : error.message}
          </span>
        </div>
      )}

      {!loading && !error && daLoja.length === 0 && (
        <div className={styles.empty}>
          <p>Nenhuma avaliação importada ainda.</p>
          <span>Rode <code>npm run import:surveys</code> para puxar as pesquisas do Delivery Direto.</span>
        </div>
      )}

      {!loading && !error && daLoja.length > 0 && rows.length === 0 && (
        <div className={styles.empty}>
          <p>
            {showArchived
              ? 'Nenhuma avaliação arquivada.'
              : brandFilter !== 'all' && tierFilter === 'all'
                ? `Nenhuma avaliação da ${BRAND_LABELS[brandFilter]} importada ainda.`
                : 'Nenhuma avaliação nesse filtro.'}
          </p>
          {!showArchived && brandFilter === 'lov' && tierFilter === 'all' && (
            <span>
              O import da Lov ainda não está ligado — falta o número da pesquisa
              (<code>pesquisa-N</code>) no admin do Delivery Direto.
            </span>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colDate}>Data</th>
              <th>Cliente</th>
              <th className={styles.colNota}>Nota</th>
              <th>Comentário</th>
              <th className={styles.colAcao} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const tier = npsTier(s.nota);
              const comment = joinAnswers(s.answers);
              return (
                <tr key={s.id} className={tier ? styles[`row_${tier}`] : ''}>
                  <td data-label="Data" className={styles.colDate}>{formatDate(s.respondedAt)}</td>
                  <td data-label="Cliente">
                    <button className={styles.customerBtn} onClick={() => setSelected(s)}>
                      {s.customerName || 'Sem nome'}
                    </button>
                    {brandFilter === 'all' && marcasComDados.size > 1 && s.brand && (
                      <span className={styles.brandChip}>{BRAND_LABELS[s.brand] || s.brand}</span>
                    )}
                  </td>
                  <td data-label="Nota" className={styles.colNota}>
                    <span className={`${styles.nota} ${tier ? styles[`nota_${tier}`] : ''}`}>
                      {typeof s.nota === 'number' ? s.nota : '—'}
                    </span>
                  </td>
                  <td data-label="Comentário" className={styles.comment}>
                    {comment || <span className={styles.noComment}>—</span>}
                  </td>
                  <td className={styles.colAcao}>
                    <button
                      className={styles.acaoBtn}
                      title={showArchived ? 'Desarquivar' : 'Arquivar'}
                      aria-label={showArchived ? 'Desarquivar' : 'Arquivar'}
                      onClick={() => setArchived(s.id, !showArchived)}
                    >
                      <Icon k={showArchived ? 'archiveRestore' : 'archive'} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <SurveyModal survey={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
