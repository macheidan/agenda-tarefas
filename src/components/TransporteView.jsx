import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MoneyInput from './MoneyInput';
import { formatBRL } from '../utils/money';
import { transporteDetalhe } from '../utils/transporte';
import { transporteDocId } from '../hooks/useDepartamentoPessoal';
import styles from '../styles/TransporteView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// As duas "abas" O1:R13 das planilhas de salário viram perfis aqui. Cada uma tem
// um cálculo próprio (Rumi = transporte + alimentação por dia; Patricia = quatro
// trechos de ônibus + Uber), então a estrutura é fixa em código e só os campos
// amarelos da planilha são editáveis/gravados.
const PERFIS = [
  {
    key: 'rumi',
    label: 'Rumi',
    loja: 'Lov',
    // Nome do funcionário na Escala (pra sugerir os dias do ciclo).
    empName: 'rumi',
    defaults: { vTransporte: 15.9, vAlimentacao: 22.7 },
  },
  {
    key: 'patricia',
    label: 'Patricia',
    loja: 'Dáme',
    empName: 'paty',
    defaults: { vTeu: 8.5, vTri: 5.3, vUber: 35 },
    // Linhas anotadas na planilha que não entram na conta (referência de trajeto).
    notas: [
      ['t8 — 11:15 e 12h o último, vai até Antônio Carvalho', 5.3],
      ['monte alegre castelinho', 7.85],
    ],
  },
];

const n = (v) => Number(v) || 0;
const norm = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

export default function TransporteView({ employees, absences, transportes, setTransporte, isAdmin }) {
  const { user } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [perfilKey, setPerfilKey] = useState(PERFIS[0].key);

  const perfil = PERFIS.find((p) => p.key === perfilKey) || PERFIS[0];
  const canEdit = isAdmin;

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };

  const doc = useMemo(
    () => transportes.find((t) => t.id === transporteDocId(perfil.key, year, month)) || null,
    [transportes, perfil.key, year, month]
  );

  // Tarifas seguem valendo nos meses seguintes: se o mês ainda não tem valor
  // próprio, herda do lançamento anterior mais recente e, por fim, do padrão da
  // planilha. Só o que é digitado vira campo gravado.
  const herdado = useMemo(() => {
    const anteriores = transportes
      .filter((t) => t.perfil === perfil.key && (t.year < year || (t.year === year && t.month < month)))
      .sort((a, b) => (b.year - a.year) || (b.month - a.month));
    return anteriores[0] || null;
  }, [transportes, perfil.key, year, month]);

  // dias/uber/rascunho são do mês (não herdam); tarifas herdam.
  const doMes = (f) => (doc?.[f] == null ? null : Number(doc[f]));
  const tarifa = (f) => {
    if (doc?.[f] != null) return Number(doc[f]);
    if (herdado?.[f] != null) return Number(herdado[f]);
    return perfil.defaults[f] ?? null;
  };

  const commit = (field, value) => {
    if (!canEdit) return;
    setTransporte(perfil.key, year, month, { [field]: value }, user);
  };

  // Sugestão de dias vinda da Escala (mesmo número do resumo do mês).
  const emp = useMemo(
    () => employees.find((e) => e.active !== false && norm(e.name).startsWith(perfil.empName)) || null,
    [employees, perfil.empName]
  );
  const diasEscala = emp ? transporteDetalhe(emp, absences, year, month).dias : null;

  const dias = doMes('dias');
  const uber = doMes('uber');

  // ---- Fórmulas (espelho de O1:R13) ----
  const linhas = [];
  let total = 0;
  if (perfil.key === 'rumi') {
    const vT = tarifa('vTransporte');
    const vA = tarifa('vAlimentacao');
    linhas.push({ label: 'Transporte', qtd: n(dias), valor: n(dias) * n(vT) });
    linhas.push({ label: 'Alimentação', qtd: n(dias), valor: n(dias) * n(vA) });
    total = linhas.reduce((t, l) => t + l.valor, 0);
  } else {
    const vTri = tarifa('vTri');
    const vTeu = tarifa('vTeu');
    const vUber = tarifa('vUber');
    const comUber = Math.max(0, n(dias) - n(uber)); // dias em que não usou Uber
    linhas.push({ label: 'tri ida', qtd: n(dias), valor: n(dias) * n(vTri) });
    linhas.push({ label: 'tri volta', qtd: comUber, valor: comUber * n(vTri) });
    linhas.push({ label: 'teu ida', qtd: n(dias), valor: n(dias) * n(vTeu) });
    linhas.push({ label: 'teu volta', qtd: comUber, valor: comUber * n(vTeu) });
    linhas.push({ label: 'uber', qtd: n(uber), valor: n(uber) * n(vUber), campo: 'uber' });
    total = linhas.reduce((t, l) => t + l.valor, 0);
  }
  // Patricia: o que sai em dinheiro (teu + uber) e o que vai de recarga no Tri.
  const noTri = perfil.key === 'patricia' ? linhas[0].valor + linhas[1].valor : 0;
  const emDinheiro = total - noTri;

  // Rascunho (coluna R da planilha): dois somatórios encadeados.
  const r1 = doMes('rasc1');
  const r2 = doMes('rasc2');
  const r3 = doMes('rasc3');
  const rSub1 = n(r1) + n(r2);
  const rSub2 = rSub1 + n(r3);

  const inputCls = `${styles.cellInput} ${styles.editavel}`;

  return (
    <div className={styles.container}>
      <div className={styles.bar}>
        <div className={styles.perfis}>
          {PERFIS.map((p) => (
            <button
              type="button"
              key={p.key}
              className={`${styles.perfilTab} ${p.key === perfil.key ? styles.perfilTabActive : ''}`}
              onClick={() => setPerfilKey(p.key)}
            >
              {p.label} <span className={styles.perfilLoja}>{p.loja}</span>
            </button>
          ))}
        </div>
        <div className={styles.monthNav}>
          <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">‹</button>
          <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
          <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">›</button>
        </div>
      </div>

      {!canEdit && (
        <p className={styles.hint}>Somente leitura — os campos em amarelo são editáveis pelo admin.</p>
      )}

      <div className={styles.card}>
        {/* O1:P3 da aba da Rumi é o mesmo resumo salarial que já vive no cadastro
            do funcionário (editável em Salários) — aqui entra só como referência. */}
        {perfil.key === 'rumi' && emp && (
          <p className={styles.cadastro}>
            Cadastro: Salário <strong>{emp.salaryMode === 'fora' ? 'por fora' : 'folha'}</strong>
            {emp.transporteRef != null && <> · Transporte <strong>{formatBRL(emp.transporteRef)}</strong></>}
            {emp.feriadoUnit != null && <> · Feriado <strong>{formatBRL(emp.feriadoUnit)}</strong></>}
          </p>
        )}

        <div className={styles.diasRow}>
          <span className={styles.diasLabel}>Dias</span>
          <MoneyInput
            className={inputCls}
            value={dias}
            disabled={!canEdit}
            normalize={(v) => (v == null ? null : Math.round(v))}
            onCommit={(v) => commit('dias', v)}
          />
          {diasEscala != null && (
            <span className={styles.diasEscala}>
              Escala: <strong>{diasEscala}</strong> dias
              {canEdit && diasEscala !== dias && (
                <button type="button" className={styles.applyBtn} onClick={() => commit('dias', diasEscala)}>usar</button>
              )}
            </span>
          )}
        </div>

        <table className={styles.tabela}>
          <thead>
            <tr>
              <th className={styles.colLabel} />
              <th className={styles.colQtd}>Qtd</th>
              <th className={styles.colValor}>Pagar</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.label}>
                <td className={styles.colLabel}>{l.label}</td>
                <td className={styles.colQtd}>
                  {l.campo === 'uber' ? (
                    <MoneyInput
                      className={inputCls}
                      value={uber}
                      disabled={!canEdit}
                      normalize={(v) => (v == null ? null : Math.round(v))}
                      onCommit={(v) => commit('uber', v)}
                    />
                  ) : (
                    l.qtd
                  )}
                </td>
                <td className={styles.colValor}>{formatBRL(l.valor)}</td>
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td className={styles.colLabel} />
              <td className={styles.colQtd} />
              <td className={styles.colValor}>{formatBRL(total)}</td>
            </tr>
          </tbody>
        </table>

        {perfil.key === 'patricia' && (
          <div className={styles.splitRow}>
            <div className={styles.splitBox}>
              <span className={styles.splitLabel}>em dinheiro</span>
              <strong className={styles.splitValor}>{formatBRL(emDinheiro)}</strong>
            </div>
            <div className={styles.splitBox}>
              <span className={styles.splitLabel}>tri</span>
              <strong className={styles.splitValor}>{formatBRL(noTri)}</strong>
            </div>
          </div>
        )}

        <div className={styles.tarifas}>
          <span className={styles.blocoTitulo}>Valores unitários</span>
          {perfil.key === 'rumi' ? (
            <>
              <label className={styles.tarifaRow}>
                Transporte
                <MoneyInput className={inputCls} value={tarifa('vTransporte')} disabled={!canEdit} onCommit={(v) => commit('vTransporte', v)} />
              </label>
              <label className={styles.tarifaRow}>
                Alimentação
                <MoneyInput className={inputCls} value={tarifa('vAlimentacao')} disabled={!canEdit} onCommit={(v) => commit('vAlimentacao', v)} />
              </label>
            </>
          ) : (
            <>
              <label className={styles.tarifaRow}>
                teu <span className={styles.tarifaNota}>monte alegre castelinho viamão</span>
                <MoneyInput className={inputCls} value={tarifa('vTeu')} disabled={!canEdit} onCommit={(v) => commit('vTeu', v)} />
              </label>
              <label className={styles.tarifaRow}>
                tri <span className={styles.tarifaNota}>t8 ou antônio carvalho 441</span>
                <MoneyInput className={inputCls} value={tarifa('vTri')} disabled={!canEdit} onCommit={(v) => commit('vTri', v)} />
              </label>
              <label className={styles.tarifaRow}>
                uber
                <MoneyInput className={inputCls} value={tarifa('vUber')} disabled={!canEdit} onCommit={(v) => commit('vUber', v)} />
              </label>
            </>
          )}
        </div>

        {perfil.notas && (
          <div className={styles.notas}>
            {perfil.notas.map(([txt, valor]) => (
              <span key={txt} className={styles.nota}>{txt} — {formatBRL(valor)}</span>
            ))}
          </div>
        )}

        <details className={styles.rascunho}>
          <summary>Rascunho</summary>
          <div className={styles.rascunhoGrid}>
            <MoneyInput className={inputCls} value={r1} disabled={!canEdit} onCommit={(v) => commit('rasc1', v)} />
            <MoneyInput className={inputCls} value={r2} disabled={!canEdit} onCommit={(v) => commit('rasc2', v)} />
            <span className={styles.rascSub}>{rSub1.toLocaleString('pt-BR')}</span>
            <MoneyInput className={inputCls} value={r3} disabled={!canEdit} onCommit={(v) => commit('rasc3', v)} />
            <span className={styles.rascSub}>{rSub2.toLocaleString('pt-BR')}</span>
          </div>
        </details>
      </div>
    </div>
  );
}
