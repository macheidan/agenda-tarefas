import { useState, useEffect, useMemo } from 'react';
import { useDirtyClose, isFormDirty } from '../hooks/useDirtyClose';
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
  contatos: [{ tipo: 'insta', valor: '' }],
  contatado: false,
  retornou: false,
  divulgouEm: '',
  observacoes: '',
  textoConvite: '',
};

// Migra docs antigos que tinham contatoTipo/contatoValor singular pro novo formato
function normalizeIncoming(it) {
  if (!it) return empty;
  let contatos = Array.isArray(it.contatos) ? it.contatos.filter(Boolean) : [];
  if (contatos.length === 0 && (it.contatoTipo || it.contatoValor)) {
    contatos = [{ tipo: it.contatoTipo || 'insta', valor: it.contatoValor || '' }];
  }
  if (contatos.length === 0) contatos = [{ tipo: 'insta', valor: '' }];
  return { ...empty, ...it, contatos };
}

export default function InfluencersModal({
  influencer,
  onSave,
  onUpdate,
  onDelete,
  onClose,
  isAdmin,
}) {
  const initial = useMemo(() => normalizeIncoming(influencer), [influencer]);
  const [form, setForm] = useState(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const dirty = isFormDirty(form, initial);
  const tryClose = useDirtyClose(dirty, onClose);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateContato = (idx, key, value) => {
    setForm((prev) => {
      const next = prev.contatos.map((c, i) => (i === idx ? { ...c, [key]: value } : c));
      return { ...prev, contatos: next };
    });
  };

  const addContato = () => {
    setForm((prev) => ({
      ...prev,
      contatos: [...prev.contatos, { tipo: 'whatsapp', valor: '' }],
    }));
  };

  const removeContato = (idx) => {
    setForm((prev) => {
      const next = prev.contatos.filter((_, i) => i !== idx);
      return { ...prev, contatos: next.length ? next : [{ tipo: 'insta', valor: '' }] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    const cleanContatos = form.contatos
      .map((c) => ({ tipo: c.tipo || 'outro', valor: (c.valor || '').trim() }))
      .filter((c) => c.valor);
    const payload = { ...form, contatos: cleanContatos };
    if (influencer?.id) {
      // remove campos legados/identificação que não devem entrar no update
      const { id, authorUid, authorName, authorPhoto, createdAt, updatedAt, contatoTipo, contatoValor, ...updates } = payload;
      await onUpdate(influencer.id, updates);
    } else {
      await onSave(payload);
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
    <div className={styles.overlay} onClick={tryClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={tryClose} aria-label="Fechar">×</button>

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
            <div className={styles.sectionHeaderRow}>
              <span className={styles.sectionTitle}>Contatos</span>
              <button type="button" className={styles.addInline} onClick={addContato}>
                + Adicionar contato
              </button>
            </div>
            {form.contatos.map((c, idx) => (
              <div className={styles.contatoRow} key={idx}>
                <div className={styles.fieldSmall}>
                  <label>Tipo</label>
                  <select
                    value={c.tipo}
                    onChange={(e) => updateContato(idx, 'tipo', e.target.value)}
                  >
                    {CONTATO_TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Valor</label>
                  <input
                    type="text"
                    value={c.valor}
                    onChange={(e) => updateContato(idx, 'valor', e.target.value)}
                    placeholder="@usuario, email ou telefone"
                  />
                </div>
                {form.contatos.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeContatoBtn}
                    onClick={() => removeContato(idx)}
                    title="Remover contato"
                    aria-label="Remover contato"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
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
            <button type="button" className={styles.cancelBtn} onClick={tryClose}>
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
