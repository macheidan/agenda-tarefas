import styles from '../styles/ClientesView.module.css';

/**
 * Régua de dois pontos para uma janela de dias.
 *
 * Nasceu como "dias sem pedir" e virou componente quando a lista ganhou a
 * segunda régua, de dias sem receber mensagem: são ~45 linhas de JSX com a
 * regra sutil de qual ponto fica por cima, e duas cópias divergiriam no
 * primeiro ajuste.
 *
 * `janela.max === null` é "sem teto" — é o que mantém quem está além do fim da
 * régua dentro do recorte, em vez de sumir sem explicação.
 */
export default function ReguaDias({ label, janela, onChange, max = 365, dica }) {
  const todos = janela.min === 0 && janela.max === null;
  const desc = janela.max === null ? `${janela.min}+ dias` : `${janela.min} a ${janela.max} dias`;

  // Sem teto, o ponto da direita mora no fim da régua.
  const maxValor = janela.max === null ? max : Math.min(janela.max, max);
  const pctMin = (Math.min(janela.min, max) / max) * 100;
  const pctMax = (maxValor / max) * 100;

  // Um ponto nunca passa do outro: o que sobrar do arrasto vira empate.
  const mudarMin = (v) => onChange({ ...janela, min: Math.min(Number(v), maxValor) });
  const mudarMax = (v) => {
    const n = Math.max(Number(v), janela.min);
    onChange({ ...janela, max: n >= max ? null : n });
  };

  return (
    <div className={styles.reguaBox}>
      <div className={styles.reguaTopo}>
        <span className={styles.reguaLabel}>
          {label}
          {dica && <span className={styles.reguaDica} title={dica}> ⓘ</span>}
        </span>
        <strong className={styles.reguaValor}>{todos ? 'todos' : desc}</strong>
      </div>
      <div className={styles.regua}>
        <div className={styles.trilho} />
        <div
          className={styles.trilhoAtivo}
          style={{ left: `${pctMin}%`, width: `${Math.max(0, pctMax - pctMin)}%` }}
        />
        <input
          className={styles.pontoRegua}
          type="range"
          min="0"
          max={max}
          value={janela.min}
          // Os dois pontos podem se encostar; quem fica por cima é sempre o
          // que ainda tem para onde ir, senão um deles fica impossível de pegar.
          style={{ zIndex: pctMin >= 100 ? 3 : 5 }}
          onChange={(e) => mudarMin(e.target.value)}
          aria-label={`Mínimo de ${label.toLowerCase()}`}
          aria-valuetext={`a partir de ${janela.min} dias`}
        />
        <input
          className={styles.pontoRegua}
          type="range"
          min="0"
          max={max}
          value={maxValor}
          style={{ zIndex: pctMin >= 100 ? 5 : 4 }}
          onChange={(e) => mudarMax(e.target.value)}
          aria-label={`Máximo de ${label.toLowerCase()}`}
          aria-valuetext={janela.max === null ? 'sem limite' : `até ${janela.max} dias`}
        />
      </div>
      <div className={styles.reguaEscala}>
        <span>0</span>
        <span>{max}+</span>
      </div>
    </div>
  );
}
