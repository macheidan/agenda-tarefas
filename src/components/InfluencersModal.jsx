import { useState, useEffect } from 'react';
import styles from '../styles/InfluencersModal.module.css';

const MONTHS = [
  '', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
];

const DIVULGOU_OPTIONS = [
  { value: '', label: 'Não divulgou' },
  { value: 'lov', label: 'LOV' },
  { value: 'dame', label: 'DAME' },
  { value: 'ambas', label: 'Ambas' },
];

const CONTATO_TIPOS = [
  { value: 'insta', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'outro', label: 'Outro' },
];

const empty = {
  mes: '',
  ano: new Date().getFullYear(),
  nome: '',
  handle: '',
  alcance: '',
  txEngaj: '',
  segmento: '',
  midiaKitUrl: '',
  contatoTipo: 'insta',
  contatoValor: '',
  contatado: false,
  retornou: false,
  divulgouEm: '',
  observacoes: '',
  textoConvite: '',
};

export default function InfluencersModal({
  influencer,
  onSave,
  onUpdate,
  onDelete,
  onClose,
  isAdmin,
}) {
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (influencer) {
      setForm({ ...empty, ...influencer });
    } else {
      setForm(empty);
    }
  }, [influencer]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    if (influencer?.id) {
      const { id, authorUid, authorName, authorPhoto, createdAt, updatedAt, ...updates } = form;
      await onUpdate(influencer.id, updates);
    } else {
      await onSave(form);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!influencer?.id) return;
    if (window.confirm(`Excluir ${form.nome}?`)) {
      await onDelete(influencer.id);
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">×</button>

        <form onSubmit={handleSubmit}>
          <input
            className={styles.titleInput}
            type="text"
            placeholder="Nome do influencer..."
            value={form.nome}
            onChange={set('nome')}
            autoFocus
            required
          />

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Identidade</span>
            <div className={styles.row}>
              <div className={styles.field}>
                <label>@ Handle</label>
                <input type="text" value={form.handle} onChange={set('handle')} placeholder="@usuario" />
              </div>
              <div className={styles.fieldSmall}>
                <label>Alcance</label>
                <input type="text" value={form.alcance} onChange={set('alcance')} placeholder="13,5K" />
              </div>
              <div className={styles.fieldSmall}>
                <label>Engajamento</label>
                <input type="text" value={form.txEngaj} onChange={set('txEngaj')} placeholder="3,58%" />
              </div>
            </div>
            <div className={styles.field}>
              <label>Segmento (separe por /)</label>
              <input type="text" value={form.segmento} onChange={set('segmento')} placeholder="GASTRONOMIA / VIAGENS" />
            </div>
            <div className={styles.field}>
              <label>Mídia Kit (URL)</label>
              <input type="text" value={form.midiaKitUrl} onChange={set('midiaKitUrl')} placeholder="https://..." />
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Pipeline</span>
            <div className={styles.row}>
              <div className={styles.fieldSmall}>
                <label>Mês</label>
                <select value={form.mes} onChange={set('mes')}>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m || '—'}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldSmall}>
                <label>Ano</label>
                <input type="number" value={form.ano} onChange={set('ano')} min="2024" max="2100" />
              </div>
              <div className={styles.fieldSmall}>
                <label>Divulgou</label>
                <select value={form.divulgouEm} onChange={set('divulgouEm')}>
                  {DIVULGOU_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.checkRow}>
              <label className={styles.checkOption}>
                <input type="checkbox" checked={form.contatado} onChange={set('contatado')} />
                <span>Contatado</span>
              </label>
              <label className={styles.checkOption}>
                <input type="checkbox" checked={form.retornou} onChange={set('retornou')} />
                <span>Retornou</span>
              </label>
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Contato</span>
            <div className={styles.row}>
              <div className={styles.fieldSmall}>
                <label>Tipo</label>
                <select value={form.contatoTipo} onChange={set('contatoTipo')}>
                  {CONTATO_TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Valor</label>
                <input type="text" value={form.contatoValor} onChange={set('contatoValor')} placeholder="@usuario, email ou telefone" />
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Mensagens</span>
            <div className={styles.field}>
              <label>Texto convite</label>
              <textarea
                rows={6}
                value={form.textoConvite}
                onChange={set('textoConvite')}
                placeholder="Mensagem inicial enviada ao influencer..."
              />
            </div>
            <div className={styles.field}>
              <label>Observações</label>
              <textarea
                rows={3}
                value={form.observacoes}
                onChange={set('observacoes')}
                placeholder="Notas internas (em viagem, sem stories no dia, etc)"
              />
            </div>
          </div>

          <div className={styles.actions}>
            {influencer?.id && isAdmin && (
              <button type="button" className={styles.deleteBtn} onClick={handleDelete}>
                Excluir
              </button>
            )}
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={styles.saveBtn} disabled={!form.nome.trim()}>
              {influencer?.id ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
