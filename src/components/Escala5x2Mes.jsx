import { useMemo } from 'react';
import {
  CORES, WD, pad, dkey, addDays, mondayOf, weekDays, fmt, hm, shiftLabel, nightClock, validar,
} from '../utils/escala5x2';
import styles from '../styles/Escala5x2View.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WD_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // getDay()
const POSTIT_INK = '#1a1d26';

// Mapa do mês da Escala 5x2: funcionário × dia, com entrada/horas de cada turno,
// os alertas de cada semana marcados na célula e pessoas por dia no rodapé.
export default function Escala5x2Mes({ year, month, emps, dayOf, r, onOpenDay }) {
  const days = useMemo(() => {
    const n = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1));
  }, [year, month]);

  // Conferência de todas as semanas que tocam o mês (a semana é a unidade da lei).
  const issues = useMemo(() => {
    const out = {};
    for (let w = mondayOf(days[0]); w <= days[days.length - 1]; w = addDays(w, 7)) {
      const weekKeys = weekDays(dkey(w)).map(dkey);
      const { issues: wk } = validar({ emps, weekKeys, dayOf, r });
      Object.assign(out, wk);
    }
    return out;
  }, [days, emps, dayOf, r]);

  const rows = useMemo(() => emps.map((emp) => {
    let mins = 0, dias = 0, noite = 0, dom = 0, domFolga = 0;
    const cells = days.map((d) => {
      const t = dayOf(dkey(d)).find((x) => x.e === emp.id) || null;
      if (d.getDay() === 0) { dom++; if (!t) domFolga++; }
      if (t) { dias++; mins += t.mins; noite += nightClock(t); }
      return t;
    });
    return { emp, cells, mins, dias, noite, dom, domFolga };
  }), [emps, days, dayOf]);

  const perDay = days.map((d) => dayOf(dkey(d)).length);

  if (!emps.length) return <div className={styles.empty}>Nenhum funcionário ativo nesta loja.</div>;

  return (
    <div className={styles.mesWrap}>
      <table className={styles.mes}>
        <thead>
          <tr>
            <th className={styles.mesName}>{MONTHS[month]} {year}</th>
            {days.map((d) => {
              const mon = d.getDay() === 1, wkend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <th key={d.getDate()}
                  className={`${styles.mesDay} ${mon ? styles.mesMon : ''} ${wkend ? styles.mesWkend : ''}`}
                  onClick={() => onOpenDay(d)} title="Abrir a semana deste dia">
                  <span>{pad(d.getDate())}</span>
                  <small className={d.getDay() === 0 ? styles.sun : ''}>{WD_LETTER[d.getDay()]}</small>
                </th>
              );
            })}
            <th className={styles.mesSum}>Horas</th>
            <th className={styles.mesSum}>Dias</th>
            <th className={styles.mesSum}>Folgas</th>
            <th className={styles.mesSum} title="Domingos de folga no mês">Dom.</th>
            <th className={styles.mesSum} title="Horas de relógio entre 22h e 5h — adicional noturno">Após 22h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ emp, cells, mins, dias, noite, dom, domFolga }) => (
            <tr key={emp.id}>
              <td className={styles.mesName}>
                <span className={styles.chip} style={{ background: CORES[emp.cor], color: POSTIT_INK }}>{emp.name}</span>
              </td>
              {cells.map((t, i) => {
                const d = days[i], k = dkey(d), st = issues[k]?.[emp.id];
                const mon = d.getDay() === 1, wkend = d.getDay() === 0 || d.getDay() === 6;
                const cls = [styles.mesCell, mon ? styles.mesMon : '', wkend ? styles.mesWkend : '',
                  st === 'bad' ? styles.mesBad : st === 'warn' ? styles.mesWarn : ''].join(' ');
                return (
                  <td key={k} className={cls} onClick={() => onOpenDay(d)}
                    title={t ? `${emp.name} · ${WD[(d.getDay() + 6) % 7]} ${pad(d.getDate())} · ${shiftLabel(t)} · intervalo ${t.pd ? `${fmt(t.pi)}–${fmt(t.pi + t.pd)}` : '—'} · ${hm(t.mins)}` : `${emp.name} · folga`}>
                    {t ? (
                      <span className={styles.mesTurno} style={{ background: CORES[emp.cor], color: POSTIT_INK }}>
                        <b>{fmt(t.ini)}</b>
                        <small>{hm(t.mins)}</small>
                      </span>
                    ) : <span className={styles.mesFolga}>FG</span>}
                  </td>
                );
              })}
              <td className={`${styles.mesSum} ${styles.num}`}><b>{hm(mins)}</b></td>
              <td className={`${styles.mesSum} ${styles.num}`}>{dias}</td>
              <td className={`${styles.mesSum} ${styles.num}`}>{days.length - dias}</td>
              <td className={`${styles.mesSum} ${styles.num}`}>{domFolga}/{dom}</td>
              <td className={`${styles.mesSum} ${styles.num}`}>{noite ? hm(noite) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={styles.mesName}>Pessoas no dia</td>
            {perDay.map((n, i) => {
              const d = days[i], min = r.mins[(d.getDay() + 6) % 7];
              const mon = d.getDay() === 1, wkend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <td key={i} className={`${styles.mesCount} ${mon ? styles.mesMon : ''} ${wkend ? styles.mesWkend : ''} ${min && n < min ? styles.mesShort : ''}`}
                  title={min ? `mínimo ${min}` : ''}>{n}</td>
              );
            })}
            <td className={styles.mesSum} colSpan={5} />
          </tr>
        </tfoot>
      </table>
      <p className={styles.hint}>
        Célula com borda vermelha = quebra de regra naquela semana (folgas, teto, 8 h/dia, interjornada, trava do intervalo); tracejada = aviso (domingos seguidos, horas diferentes do contrato).
        Clique num dia para abrir a semana dele.
      </p>
    </div>
  );
}
