import { useState, useMemo } from 'react';
import { NPS_TIERS, NPS_TIER_ORDER, npsTier, joinAnswers } from '../utils/nps';
import SurveyModal from './SurveyModal';
import styles from '../styles/SurveysView.module.css';

const BRAND_LABELS = { dame: 'Dáme', lov: 'Lov' };

const formatDate = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
};

export default function SurveysView({ surveys, loading, error }) {
  const [tierFilter, setTierFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const brands = useMemo(() => {
    const set = new Set(surveys.map((s) => s.brand).filter(Boolean));
    return [...set].sort();
  }, [surveys]);

  const byBrand = useMemo(
    () => (brandFilter === 'all' ? surveys : surveys.filter((s) => s.brand === brandFilter)),
    [surveys, brandFilter]
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
        <h2>Avaliações</h2>
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
        </div>
      </div>

      {brands.length > 1 && (
        <div className={styles.storeBar}>
          <button
            className={`${styles.sectionTab} ${brandFilter === 'all' ? styles.sectionTabActive : ''}`}
            onClick={() => setBrandFilter('all')}
          >
            Todas as lojas
          </button>
          {brands.map((b) => (
            <button
              key={b}
              className={`${styles.sectionTab} ${brandFilter === b ? styles.sectionTabActive : ''}`}
              onClick={() => setBrandFilter(b)}
            >
              {BRAND_LABELS[b] || b}
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

      {!loading && !error && surveys.length === 0 && (
        <div className={styles.empty}>
          <p>Nenhuma avaliação importada ainda.</p>
          <span>Rode <code>npm run import:surveys</code> para puxar as pesquisas do Delivery Direto.</span>
        </div>
      )}

      {!loading && !error && surveys.length > 0 && rows.length === 0 && (
        <div className={styles.empty}>
          <p>Nenhuma avaliação nesse filtro.</p>
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
                    {brandFilter === 'all' && brands.length > 1 && s.brand && (
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
