import { labelToAnoMes } from '../../lib/gestao';
import styles from '../../styles/Gestao.module.css';

// Tooltip que anexa as anotações (checkpoints 📌) do mês nos gráficos da
// Mesa do Dono e de Vendas. O dot correspondente vive em checkpointDot.jsx
// (arquivo próprio: aqui só componente, pro fast refresh do Vite).

/**
 * Content de <Tooltip> que lista as séries e anexa os checkpoints (📌) do mês.
 * `singleAnoMes`: um bloco de checkpoints pro label inteiro; senão por série
 * (EvolucaoAnual, onde cada série é um ano diferente).
 */
export function CheckpointTooltip({
  active, payload, label, byMes, formatValue, resolveAnoMes, singleAnoMes = true,
}) {
  if (!active || !payload || !payload.length || typeof label !== 'string') return null;

  const resolve = resolveAnoMes ?? ((l) => labelToAnoMes(l));
  const headerAnoMes = singleAnoMes ? resolve(label, payload[0]) : null;
  const headerCheckpoints = headerAnoMes ? byMes.get(headerAnoMes) ?? [] : [];

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      {payload.map((p, i) => {
        const itemAnoMes = !singleAnoMes ? resolve(label, p) : null;
        const itemCheckpoints = itemAnoMes ? byMes.get(itemAnoMes) ?? [] : [];
        return (
          <div key={i}>
            <div className={styles.tooltipRow}>
              <span className={styles.tooltipDot} style={{ background: p.color }} />
              <span className={styles.tooltipName}>{String(p.name ?? p.dataKey ?? '')}</span>
              <span className={styles.tooltipValue}>
                {typeof p.value === 'number' ? formatValue(p.value) : '—'}
              </span>
            </div>
            {itemCheckpoints.map((c) => (
              <div key={c.id} className={styles.tooltipCheckpoint}>📌 {c.titulo}</div>
            ))}
          </div>
        );
      })}
      {headerCheckpoints.length > 0 && (
        <div className={styles.tooltipCheckpoints}>
          {headerCheckpoints.map((c) => (
            <div key={c.id}>
              <div className={styles.tooltipCheckpoint}>📌 {c.titulo}</div>
              {c.descricao && <div className={styles.tooltipCheckpointDesc}>{c.descricao}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
