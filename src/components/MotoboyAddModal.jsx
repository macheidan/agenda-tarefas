import { useState } from 'react';
import styles from '../styles/MotoboyAddModal.module.css';

// Modal "Adicionar motoboys" (seção Semana): lista o roster ativo da loja com
// checkbox e adiciona os selecionados à semana aberta de uma vez. Quem já está
// na semana aparece marcado e travado.
export default function MotoboyAddModal({ roster, onAdd, onClose }) {
  const [sel, setSel] = useState([]);
  const [saving, setSaving] = useState(false);
  const disponiveis = roster.filter((r) => !r.naSemana);

  const toggle = (mid) =>
    setSel((prev) => (prev.includes(mid) ? prev.filter((m) => m !== mid) : [...prev, mid]));

  const selectAll = () =>
    setSel(sel.length === disponiveis.length ? [] : disponiveis.map((r) => r.mid));

  const handleAdd = async () => {
    if (sel.length === 0 || saving) return;
    setSaving(true);
    try {
      await onAdd(sel);
      onClose();
    } catch (e) {
      window.alert(`Não foi possível adicionar: ${e?.message || e}`);
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Adicionar motoboys à semana</h3>

        {roster.length === 0 && (
          <p className={styles.muted}>
            Nenhum motoboy cadastrado. Cadastre primeiro pela aba <strong>Cadastro</strong>.
          </p>
        )}

        {roster.length > 0 && (
          <div className={styles.lista}>
            {disponiveis.length > 1 && (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={sel.length === disponiveis.length}
                  onChange={selectAll}
                />
                <span className={styles.nome}>Selecionar todos</span>
              </label>
            )}
            {roster.map((r) => (
              <label
                key={r.mid}
                className={`${styles.check} ${r.naSemana ? styles.checkDisabled : ''}`}
              >
                <input
                  type="checkbox"
                  checked={r.naSemana || sel.includes(r.mid)}
                  disabled={r.naSemana}
                  onChange={() => toggle(r.mid)}
                />
                <span className={styles.nome}>{r.nome}</span>
                {r.naSemana && <span className={styles.jaHint}>já na semana</span>}
              </label>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.addBtn}
            disabled={sel.length === 0 || saving}
            onClick={handleAdd}
          >
            {saving ? 'Adicionando…' : `Adicionar${sel.length ? ` (${sel.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
