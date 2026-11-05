import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { formatBRL } from '../utils/money';
import { lerFolhaTexto, casarFuncionario, normNome } from '../utils/folhaTexto';
import { montarLancamento, mesAlvo } from '../utils/importarFolha';
import styles from '../styles/SalariosView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const COLS = {
  dia5: [
    ['salario', 'Salário'], ['transporte', 'Transp.'], ['feriado', 'Feriado'], ['adiantamento', 'Adiant.'],
    ['falta', 'Faltas'], ['empres', 'Empr.'], ['banco', 'Banco'], ['flash', 'Flash'],
  ],
  dia20: [['salario', 'Salário (bruto)'], ['empres', 'Empr.'], ['banco', 'Banco']],
};

// Loja dona do CNPJ da folha (só para desempatar homônimos, ex.: dois Julios).
function storeDaEmpresa(empresa, storeMeta) {
  const e = normNome(empresa);
  const alvo = /teixeira/.test(e) ? 'dame' : /pizzas muito/.test(e) ? 'lov' : null;
  if (!alvo) return null;
  return Object.keys(storeMeta).find((id) => normNome(storeMeta[id]?.name).startsWith(alvo)) || null;
}

function Bloco({ tipo, titulo, ajuda, employees, absences, salarios, transportes, storeMeta, setSalario, setTransporte }) {
  const { user } = useAuth();
  const [texto, setTexto] = useState('');
  const [lidos, setLidos] = useState(null);
  const [alvo, setAlvo] = useState(null); // { year, month }
  const [escolha, setEscolha] = useState({}); // nome da folha → employeeId ('' = não lançar)
  const [status, setStatus] = useState('');
  const [salvando, setSalvando] = useState(false);

  const ativos = useMemo(() => employees.filter((e) => e.active !== false), [employees]);

  const ler = () => {
    const r = lerFolhaTexto(texto);
    setLidos(r);
    setStatus(r.length ? '' : 'Não achei nenhum recibo nesse texto.');
    const ref = r.find((x) => x.ano != null);
    setAlvo(ref ? mesAlvo(tipo, ref.ano, ref.mes) : null);
    const ini = {};
    for (const x of r) {
      const pular = x.rescisao || !x.liquido;
      const emp = pular ? null : casarFuncionario(x.nome, ativos, storeDaEmpresa(x.empresa, storeMeta));
      ini[x.nome] = emp?.id || '';
    }
    setEscolha(ini);
  };

  const linhas = useMemo(() => {
    if (!lidos || !alvo) return [];
    return lidos.map((item) => {
      const emp = employees.find((e) => e.id === escolha[item.nome]) || null;
      const lanc = emp && item.liquido
        ? montarLancamento({ tipo, item, emp, employees, absences, salarios, transportes, ...alvo })
        : null;
      return { item, emp, lanc };
    });
  }, [lidos, alvo, escolha, employees, absences, salarios, transportes, tipo]);

  const aLancar = linhas.filter((l) => l.lanc);

  const mudarMes = (d) => setAlvo((a) => {
    const m = a.month + d;
    return { year: a.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  });

  const lancar = async () => {
    if (!aLancar.length) return;
    if (!window.confirm(`Lançar ${tipo === 'dia5' ? 'Dia 5' : 'Dia 20'} de ${MONTHS[alvo.month]} ${alvo.year} para ${aLancar.length} funcionário(s)? Os campos calculados são sobrescritos.`)) return;
    setSalvando(true);
    try {
      for (const { emp, lanc } of aLancar) {
        const cur = salarios.find((d) => d.employeeId === emp.id && d.year === alvo.year && d.month === alvo.month);
        await setSalario(emp.id, emp.store, alvo.year, alvo.month, lanc.line, { ...(cur?.[lanc.line] || {}), ...lanc.patch }, user);
        for (const x of lanc.extras) {
          const d = salarios.find((s) => s.employeeId === emp.id && s.year === x.year && s.month === x.month);
          await setSalario(emp.id, emp.store, x.year, x.month, x.line, { ...(d?.[x.line] || {}), ...x.patch }, user);
        }
        if (lanc.transp && setTransporte) {
          await setTransporte(lanc.transp.perfil, alvo.year, alvo.month, lanc.transp.patch, user);
        }
      }
      setStatus(`Lançado: ${aLancar.length} funcionário(s) em ${MONTHS[alvo.month]} ${alvo.year}.`);
    } catch (e) {
      setStatus(`Erro ao gravar: ${e?.message || e}`);
    } finally {
      setSalvando(false);
    }
  };

  const cols = COLS[tipo];
  return (
    <div className={styles.importCard}>
      <div className={styles.importHead}>
        <span className={styles.cadastroTitle}>{titulo}</span>
        <span className={styles.transpInfo}>{ajuda}</span>
      </div>
      <textarea
        className={styles.importTextarea}
        rows={5}
        value={texto}
        placeholder="Cole aqui o texto da folha (abra o PDF, Ctrl+A, Ctrl+C)…"
        onChange={(e) => setTexto(e.target.value)}
      />
      <div className={styles.importBar}>
        <button type="button" className={styles.applyBtn} onClick={ler} disabled={!texto.trim()}>Ler folha</button>
        {alvo && (
          <div className={styles.monthNav}>
            <span className={styles.transpInfo}>Lançar em</span>
            <button type="button" className={styles.navBtn} onClick={() => mudarMes(-1)} aria-label="Mês anterior">‹</button>
            <span className={styles.monthLabel}>{MONTHS[alvo.month]} {alvo.year}</span>
            <button type="button" className={styles.navBtn} onClick={() => mudarMes(1)} aria-label="Próximo mês">›</button>
          </div>
        )}
        {status && <span className={styles.transpInfo}>{status}</span>}
      </div>

      {linhas.length > 0 && (
        <>
          <div className={styles.resumoWrap}>
            <table className={styles.resumoTable}>
              <thead>
                <tr>
                  <th className={styles.resumoNameCol}>Na folha</th>
                  <th className={styles.resumoNameCol}>Funcionário</th>
                  <th>Líquido</th>
                  {cols.map(([f, l]) => <th key={f}>{l}</th>)}
                  <th className={styles.resumoNameCol}>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ item, lanc }) => {
                  const motivo = item.rescisao ? 'rescisão' : !item.liquido ? 'sem líquido' : '';
                  return (
                    <tr key={item.nome} className={lanc ? '' : styles.importSkip}>
                      <td className={styles.resumoNameCol}>{item.nome}</td>
                      <td className={styles.resumoNameCol}>
                        <select
                          className={styles.modeSelect}
                          value={escolha[item.nome] || ''}
                          onChange={(e) => setEscolha((s) => ({ ...s, [item.nome]: e.target.value }))}
                        >
                          <option value="">— não lançar —</option>
                          {ativos.map((e) => (
                            <option key={e.id} value={e.id}>{storeMeta[e.store]?.name ? `${storeMeta[e.store].name} — ${e.name}` : e.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>{item.liquido != null ? formatBRL(item.liquido) : '—'}</td>
                      {cols.map(([f]) => {
                        const v = lanc?.patch[f];
                        return <td key={f} className={v < 0 ? styles.neg : ''}>{v != null && f in (lanc?.patch || {}) ? formatBRL(v) || '—' : '—'}</td>;
                      })}
                      <td className={styles.resumoNameCol}>{[motivo, ...(lanc?.notas || [])].filter(Boolean).join(' · ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.importBar}>
            <button type="button" className={styles.importBtn} onClick={lancar} disabled={salvando || !aLancar.length}>
              {salvando ? 'Lançando…' : `Lançar ${aLancar.length} funcionário(s)`}
            </button>
            {tipo === 'dia20' && <span className={styles.transpInfo}>Também grava o Adiantamento (negativo) no Dia 5 do mês seguinte.</span>}
          </div>
        </>
      )}
    </div>
  );
}

export default function ImportarFolhaView(props) {
  return (
    <div className={styles.importGrid}>
      <Bloco
        {...props}
        tipo="dia5"
        titulo="Folha do dia 5"
        ajuda="Folha mensal: lança no Dia 5 do mês seguinte ao da folha."
      />
      <Bloco
        {...props}
        tipo="dia20"
        titulo="Folha do dia 20"
        ajuda="Adiantamento: lança no Dia 20 do mesmo mês."
      />
    </div>
  );
}
