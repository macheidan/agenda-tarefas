import { useState } from 'react';
import {
  ESCOPO_CORES, ESCOPO_LABELS, ESCOPO_OPTIONS, TIPO_LABELS, TIPO_OPTIONS,
} from '../lib/gestao';
import styles from '../styles/GestaoNotasView.module.css';

/**
 * Modal de criação/edição de anotação (checkpoint da Gestão).
 * `checkpoint` null = nova. onSave(payload) resolve create/update no chamador.
 */
export default function CheckpointModal({ checkpoint, onSave, onClose }) {
  const isNew = !checkpoint;
  const [anoMes, setAnoMes] = useState(checkpoint?.ano_mes ?? '');
  const [titulo, setTitulo] = useState(checkpoint?.titulo ?? '');
  const [descricao, setDescricao] = useState(checkpoint?.descricao ?? '');
  const [escopo, setEscopo] = useState(checkpoint?.escopo ?? 'consolidado');
  const [data, setData] = useState(checkpoint?.data ?? '');
  const [tipo, setTipo] = useState(checkpoint?.tipo ?? '');
  const [custo, setCusto] = useState(checkpoint?.custo !== undefined ? String(checkpoint.custo) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(anoMes)) {
      setError('Mês inválido (formato YYYY-MM)');
      return;
    }
    if (!titulo.trim()) {
      setError('Título obrigatório');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ano_mes: anoMes,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        escopo,
        data: data || undefined,
        tipo: tipo || undefined,
        custo: custo ? parseFloat(custo) : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>{isNew ? 'Nova anotação' : 'Editar anotação'}</h3>
        <p className={styles.modalHint}>Aparece como tooltip nos gráficos do mês selecionado.</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="cp-mes">Mês</label>
              <input id="cp-mes" type="month" value={anoMes} onChange={(e) => setAnoMes(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label htmlFor="cp-escopo">Escopo</label>
              <select
                id="cp-escopo"
                value={escopo}
                onChange={(e) => setEscopo(e.target.value)}
                style={{ color: ESCOPO_CORES[escopo], fontWeight: 600 }}
              >
                {ESCOPO_OPTIONS.map((e2) => (
                  <option key={e2} value={e2}>{ESCOPO_LABELS[e2]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.formRow3}>
            <div className={styles.field}>
              <label htmlFor="cp-data">Data exata (opcional)</label>
              <input
                id="cp-data"
                type="date"
                value={data}
                onChange={(e) => {
                  setData(e.target.value);
                  if (e.target.value) setAnoMes(e.target.value.slice(0, 7));
                }}
              />
              <span className={styles.fieldHint}>Marca o dia no calendário anual</span>
            </div>
            <div className={styles.field}>
              <label htmlFor="cp-tipo">Tipo (opcional)</label>
              <select id="cp-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">—</option>
                {TIPO_OPTIONS.map((t) => (
                  <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="cp-custo">Custo R$ (opcional)</label>
              <input
                id="cp-custo"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="cp-titulo">Título</label>
            <input
              id="cp-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Enchente RS"
              required
              maxLength={80}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="cp-desc">Descrição (opcional)</label>
            <textarea
              id="cp-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes do que aconteceu nesse mês"
              rows={3}
              maxLength={500}
            />
          </div>

          {error && <p className={styles.erro}>{error}</p>}
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Salvando…' : isNew ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
