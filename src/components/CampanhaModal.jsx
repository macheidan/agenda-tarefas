import { useState, useRef } from 'react';
import { enviarLote, novaCampanhaId, LOTE, PAUSA_MS } from '../utils/whatsapp';
import styles from '../styles/CampanhaModal.module.css';

// Limite de destinatários novos por dia. Número novo na Meta começa baixo e
// sobe conforme a qualidade; passar do teto não adianta — a Meta recusa o
// excedente. Aqui o disparo para sozinho e a campanha continua amanhã, porque
// o servidor pula quem já recebeu.
const LIMITE_PADRAO = 250;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export default function CampanhaModal({ open, onClose, loja, lojaLabel, destinatarios, filtroDesc }) {
  const [template, setTemplate] = useState('');
  const [idioma, setIdioma] = useState('pt_BR');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [limite, setLimite] = useState(LIMITE_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState(null);
  const pararRef = useRef(false);

  if (!open) return null;

  const alvo = destinatarios.slice(0, Math.max(0, Number(limite) || 0));
  const exemplo = alvo[0];
  const preview = texto.replace(/\{\{1\}\}/g, exemplo?.nome || 'Fulano');

  const disparar = async () => {
    if (!template.trim()) {
      setErro('Informe o nome do template aprovado na Meta.');
      return;
    }
    const ok = window.confirm(
      `Disparar para ${alvo.length} cliente(s) da ${lojaLabel}?\n\n` +
        'A mensagem sai de verdade e é cobrada por envio. Não tem como desfazer.'
    );
    if (!ok) return;

    pararRef.current = false;
    setErro(null);
    setEnviando(true);
    const campanhaId = novaCampanhaId(loja);
    const totais = { feitos: 0, enviados: 0, falhas: 0, pulados: 0, campanhaId };
    setProgresso({ ...totais });

    try {
      for (let i = 0; i < alvo.length; i += LOTE) {
        if (pararRef.current) break;
        const lote = alvo.slice(i, i + LOTE);
        const r = await enviarLote({
          campanhaId,
          loja,
          template: template.trim(),
          idioma,
          destinatarios: lote,
          meta: {
            titulo: titulo.trim() || template.trim(),
            filtro: filtroDesc,
            texto: texto.trim(),
            totalAlvo: alvo.length,
          },
        });
        totais.feitos += lote.length;
        totais.enviados += r.enviados || 0;
        totais.falhas += r.falhas || 0;
        totais.pulados += r.pulados || 0;
        setProgresso({ ...totais });
        if (i + LOTE < alvo.length) await espera(PAUSA_MS);
      }
    } catch (e) {
      // Erro de lote não perde o que já saiu: o servidor pula quem já recebeu,
      // então reabrir e disparar de novo continua de onde parou.
      setErro(e.message || 'falha no envio');
    } finally {
      setEnviando(false);
    }
  };

  const terminou = progresso && !enviando;

  return (
    <div className={styles.overlay} onClick={enviando ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} disabled={enviando} aria-label="Fechar">
          ×
        </button>
        <h3 className={styles.titulo}>Enviar campanha · {lojaLabel}</h3>
        <p className={styles.subtitulo}>{filtroDesc}</p>

        <div className={styles.resumo}>
          <span>
            <strong>{destinatarios.length}</strong> no recorte
          </span>
          <span>
            <strong>{alvo.length}</strong> neste disparo
          </span>
          {destinatarios.length > alvo.length && (
            <span className={styles.sobra}>
              {destinatarios.length - alvo.length} ficam para o próximo dia
            </span>
          )}
        </div>

        <div className={styles.linha}>
          <div className={styles.campo}>
            <label htmlFor="camp-template">Template aprovado</label>
            <input
              id="camp-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value.toLowerCase())}
              placeholder="ex: volta_promo_agosto"
              disabled={enviando}
            />
            <span className={styles.dica}>O nome exato cadastrado no Gerenciador do WhatsApp.</span>
          </div>
          <div className={styles.campoPequeno}>
            <label htmlFor="camp-idioma">Idioma</label>
            <input
              id="camp-idioma"
              value={idioma}
              onChange={(e) => setIdioma(e.target.value)}
              disabled={enviando}
            />
          </div>
          <div className={styles.campoPequeno}>
            <label htmlFor="camp-limite">Limite hoje</label>
            <input
              id="camp-limite"
              type="number"
              min="1"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              disabled={enviando}
            />
          </div>
        </div>

        <div className={styles.campo}>
          <label htmlFor="camp-titulo">Nome da campanha</label>
          <input
            id="camp-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="ex: Reativação 31-60 dias · agosto"
            disabled={enviando}
          />
        </div>

        <div className={styles.campo}>
          <label htmlFor="camp-texto">Texto do template (só para conferir)</label>
          <textarea
            id="camp-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            placeholder="Cole aqui o texto aprovado, usando {{1}} onde entra o primeiro nome."
            disabled={enviando}
          />
          <span className={styles.dica}>
            Quem manda a mensagem é o template aprovado na Meta — isto aqui é só a conferência do
            que vai chegar, e fica guardado no histórico da campanha.
          </span>
        </div>

        {preview.trim() && (
          <div className={styles.preview}>
            <span className={styles.previewLabel}>Como chega para {exemplo?.nome || 'o cliente'}</span>
            <p>{preview}</p>
          </div>
        )}

        {progresso && (
          <div className={styles.progresso}>
            <div className={styles.barra}>
              <div
                className={styles.barraFill}
                style={{ width: `${Math.round((progresso.feitos / Math.max(1, alvo.length)) * 100)}%` }}
              />
            </div>
            <span>
              {progresso.feitos}/{alvo.length} · {progresso.enviados} enviados
              {progresso.falhas > 0 && ` · ${progresso.falhas} falharam`}
              {progresso.pulados > 0 && ` · ${progresso.pulados} pulados`}
            </span>
            {terminou && <span className={styles.campanhaId}>Campanha {progresso.campanhaId}</span>}
          </div>
        )}

        {erro && <div className={styles.erro}>{erro}</div>}

        <div className={styles.acoes}>
          {enviando ? (
            <button className={styles.ghost} onClick={() => { pararRef.current = true; }}>
              Parar depois deste lote
            </button>
          ) : (
            <button className={styles.ghost} onClick={onClose}>
              {terminou ? 'Fechar' : 'Cancelar'}
            </button>
          )}
          <button
            className={styles.primario}
            onClick={disparar}
            disabled={enviando || alvo.length === 0}
          >
            {enviando ? 'Enviando…' : terminou ? 'Disparar de novo' : `Disparar (${alvo.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
