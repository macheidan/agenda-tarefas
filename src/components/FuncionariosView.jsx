import { useState, useMemo } from 'react';
import MoneyInput from './MoneyInput';
import { formatBRL } from '../utils/money';
import styles from '../styles/FuncionariosView.module.css';

const ALL_STORES = '__all__';

// Cadastro-mestre salarial (resumo O1:P4 das planilhas). Base pro cálculo de Salários.
// salaryMode: 'folha' (recebe tudo na folha) | 'fora' (parte por fora, usa salaryBase).
export default function FuncionariosView({ visibleStores, storeMeta, employees, updateEmployee, isAdmin }) {
  const [selectedStore, setSelectedStore] = useState(visibleStores[0]?.id || ALL_STORES);
  const activeStore = visibleStores.some((s) => s.id === selectedStore) || selectedStore === ALL_STORES
    ? selectedStore
    : visibleStores[0]?.id || ALL_STORES;
  const isAmbas = activeStore === ALL_STORES;

  const relevantSet = useMemo(
    () => new Set(isAmbas ? visibleStores.map((s) => s.id) : [activeStore]),
    [isAmbas, visibleStores, activeStore]
  );

  const list = useMemo(
    () =>
      employees
        .filter((e) => relevantSet.has(e.store) && e.active !== false)
        .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())),
    [employees, relevantSet]
  );

  const set = (empId, field, value) => {
    if (!isAdmin) return;
    updateEmployee(empId, { [field]: value });
  };

  return (
    <div className={styles.container}>
      <p className={styles.hint}>
        Cadastro-mestre de cada funcionário (o resumo fixo das planilhas). Esses valores são a
        base do cálculo em <strong>Salários</strong>: <em>Recebe</em> define se o salário sai todo
        na folha ou tem parte por fora; <em>Feriado (unit.)</em> é o valor de 1 feriado trabalhado.
        {!isAdmin && ' Somente leitura — apenas o admin edita.'}
      </p>

      {visibleStores.length > 1 && (
        <div className={styles.storeTabs}>
          {visibleStores.map((s) => {
            const color = storeMeta[s.id]?.color || 'var(--accent)';
            const active = s.id === activeStore;
            return (
              <button
                key={s.id}
                className={styles.storeTab}
                style={{ borderColor: color, background: active ? color : 'var(--card)', color: active ? '#fff' : color }}
                onClick={() => setSelectedStore(s.id)}
              >
                {s.name}
              </button>
            );
          })}
          <button
            className={styles.storeTab}
            style={{
              borderColor: 'var(--text-secondary)',
              background: isAmbas ? 'var(--text-secondary)' : 'var(--card)',
              color: isAmbas ? '#fff' : 'var(--text-secondary)',
            }}
            onClick={() => setSelectedStore(ALL_STORES)}
          >
            Ambas
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className={styles.empty}>Nenhum funcionário cadastrado. Adicione na aba <strong>Escala</strong>.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.nameCol}>Funcionário</th>
                {isAmbas && <th>Loja</th>}
                <th>Recebe</th>
                <th>Salário base</th>
                <th>Transporte (mês)</th>
                <th>Feriado (unit.)</th>
                <th>Adiantamento</th>
              </tr>
            </thead>
            <tbody>
              {list.map((emp) => {
                const mode = emp.salaryMode === 'fora' ? 'fora' : 'folha';
                return (
                  <tr key={emp.id}>
                    <td className={styles.nameCol}>{emp.name}</td>
                    {isAmbas && <td>{storeMeta[emp.store]?.name || ''}</td>}
                    <td>
                      {isAdmin ? (
                        <select
                          className={styles.modeSelect}
                          value={mode}
                          onChange={(e) => set(emp.id, 'salaryMode', e.target.value)}
                        >
                          <option value="folha">Tudo na folha</option>
                          <option value="fora">Parte por fora</option>
                        </select>
                      ) : (
                        mode === 'fora' ? 'Parte por fora' : 'Tudo na folha'
                      )}
                    </td>
                    <td>
                      {isAdmin ? (
                        <MoneyInput
                          className={styles.moneyInput}
                          value={emp.salaryBase}
                          disabled={mode === 'folha'}
                          onCommit={(v) => set(emp.id, 'salaryBase', v)}
                          placeholder={mode === 'folha' ? 'folha' : '—'}
                        />
                      ) : (
                        mode === 'folha' ? <span className={styles.muted}>folha</span> : formatBRL(emp.salaryBase)
                      )}
                    </td>
                    <td>
                      {isAdmin ? (
                        <MoneyInput className={styles.moneyInput} value={emp.transporteRef} onCommit={(v) => set(emp.id, 'transporteRef', v)} />
                      ) : formatBRL(emp.transporteRef)}
                    </td>
                    <td>
                      {isAdmin ? (
                        <MoneyInput className={styles.moneyInput} value={emp.feriadoUnit} onCommit={(v) => set(emp.id, 'feriadoUnit', v)} />
                      ) : formatBRL(emp.feriadoUnit)}
                    </td>
                    <td>
                      {isAdmin ? (
                        <MoneyInput className={styles.moneyInput} value={emp.adiantamento} onCommit={(v) => set(emp.id, 'adiantamento', v)} />
                      ) : formatBRL(emp.adiantamento)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
