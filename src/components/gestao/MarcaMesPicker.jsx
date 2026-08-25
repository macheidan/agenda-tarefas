import { MARCAS, formatAnoMesLong, previousAnoMes, nextAnoMes, currentAnoMes } from '../../lib/gestao';
import styles from '../../styles/Gestao.module.css';

// Seletor de marca (Dáme / Lov / Ambas) + navegador de mês, usado no header
// das views de Gestão. Estado vem do useMarcaMes (compartilhado entre elas).
export default function MarcaMesPicker({ marca, setMarca, anoMes, setAnoMes, showMes = true }) {
  const podeAvancar = anoMes < currentAnoMes();
  return (
    <div className={styles.picker}>
      <div className={styles.marcaTabs}>
        {MARCAS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`${styles.marcaTab} ${marca === m.id ? styles.marcaTabActive : ''}`}
            onClick={() => setMarca(m.id)}
          >
            <span className={styles.marcaDot} style={{ background: m.cor }} />
            {m.nome}
          </button>
        ))}
      </div>
      {showMes && (
        <div className={styles.mesNav}>
          <button
            type="button"
            className={styles.miniBtn}
            onClick={() => setAnoMes(previousAnoMes(anoMes))}
            aria-label="Mês anterior"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className={styles.mesLabel}>{formatAnoMesLong(anoMes)}</span>
          <button
            type="button"
            className={styles.miniBtn}
            onClick={() => setAnoMes(nextAnoMes(anoMes))}
            disabled={!podeAvancar}
            aria-label="Próximo mês"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
