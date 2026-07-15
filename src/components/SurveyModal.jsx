import { NPS_TIERS, npsTier } from '../utils/nps';
import styles from '../styles/SurveysView.module.css';

const BRAND_LABELS = { dame: 'Dáme', lov: 'Lov' };

const formatFullDate = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatPhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw || '';
};

export default function SurveyModal({ survey, open, onClose }) {
  if (!open || !survey) return null;

  const tier = npsTier(survey.nota);
  const phone = formatPhone(survey.phone);
  const waNumber = String(survey.phone || '').replace(/\D/g, '');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{survey.customerName || 'Sem nome'}</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalTop}>
            <span className={`${styles.nota} ${tier ? styles[`nota_${tier}`] : ''}`}>
              {typeof survey.nota === 'number' ? survey.nota : '—'}
            </span>
            {tier && <span className={styles.tierLabel}>{NPS_TIERS[tier].singular}</span>}
            {survey.brand && <span className={styles.brandChip}>{BRAND_LABELS[survey.brand] || survey.brand}</span>}
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label>Pedido</label>
              <span className={styles.fieldValue}>{survey.orderId || '—'}</span>
            </div>
            <div className={styles.field}>
              <label>Respondido em</label>
              <span className={styles.fieldValue}>{formatFullDate(survey.respondedAt) || '—'}</span>
            </div>
            <div className={styles.field}>
              <label>Telefone</label>
              {waNumber ? (
                <a className={styles.fieldLink} href={`https://wa.me/55${waNumber}`} target="_blank" rel="noreferrer">
                  {phone}
                </a>
              ) : (
                <span className={styles.fieldValue}>—</span>
              )}
            </div>
            <div className={styles.field}>
              <label>Email</label>
              {survey.email ? (
                <a className={styles.fieldLink} href={`mailto:${survey.email}`}>{survey.email}</a>
              ) : (
                <span className={styles.fieldValue}>—</span>
              )}
            </div>
          </div>

          <div className={styles.answers}>
            <h4>Respostas</h4>
            {(survey.answers || []).length === 0 && (
              <p className={styles.noComment}>O cliente deu só a nota, sem comentário.</p>
            )}
            {(survey.answers || []).map((a, i) => (
              <div key={i} className={styles.answerBlock}>
                <span className={styles.answerQuestion}>{a.question}</span>
                <p className={styles.answerText}>{a.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
