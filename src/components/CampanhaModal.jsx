import { useState, useRef, useMemo, useEffect } from 'react';
import { enviarLote, LOTE, PAUSA_MS } from '../utils/whatsapp';
import { ehTeste } from '../hooks/useCampanhas';
import CampanhaPreview from './CampanhaPreview';
import CampanhaTeste from './CampanhaTeste';
import styles from '../styles/CampanhaModal.module.css';

// Limite de destinatários novos por dia. Número novo na Meta começa baixo e
// sobe conforme a qualidade; passar do teto não adianta — a Meta recusa o
// excedente. Aqui o disparo para sozinho e a campanha continua amanhã, porque
// o servidor pula quem já recebeu.
const LIMITE_PADRAO = 250;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Disparo da Lista: escolhe UMA campanha salva (cadastrada na sub-aba
 * Campanhas) e manda para os clientes marcados.
 *
 * O `campanhaId` do disparo é o id da campanha salva, sempre. É por
 * `campanhaId__telefone` que o servidor sabe quem já recebeu, então escolher
 * a mesma campanha de novo — no dia seguinte, depois do limite diário, ou
 * depois de a aba ter fechado no meio — continua de onde parou sem repetir
 * mensagem. Foi isso que substituiu o antigo botão "Retomar".
 */
export default function CampanhaModal({
  open,
  onClose,
  loja,
  lojaLabel,
  destinatarios,
  filtroDesc,
  campanhas,
  onNovaCampanha,
}) {
  const [selId, setSelId] = useState(null);
  const [limite, setLimite] = useState(LIMITE_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState(null);
  const pararRef = useRef(false);

  const opcoes = useMemo(
    () =>
      (campanhas || []).filter(
        (c) => c.loja === loja && c.template && !ehTeste(c) && c.arquivada !== true
      ),
    [campanhas, loja]
  );
  const sel = opcoes.find((c) => c.id === selId) || null;

  // Cada abertura começa limpa: o progresso de um disparo anterior não pode
  // aparecer como se fosse deste recorte.
  useEffect(() => {
    if (open) {
      setProgresso(null);
      setErro(null);
    }
  }, [open]);

  if (!open) return null;

  const alvo = destinatarios.slice(0, Math.max(0, Number(limite) || 0));
  const exemplo = alvo[0];
  const jaEnviados = sel?.enviados || 0;

  const disparar = async () => {
    if (!sel) {
      setErro('Escolha a campanha.');
      return;
    }
    const ok = window.confirm(
      `Disparar "${sel.titulo || sel.template}" para ${alvo.length} cliente(s) da ${lojaLabel}?\n\n` +
        (jaEnviados
          ? `Esta campanha já foi enviada para ${jaEnviados}: quem já recebeu é pulado sem custo.\n\n`
          : '') +
        'A mensagem sai de verdade e é cobrada por envio. Não tem como desfazer.'
    );
    if (!ok) return;

    pararRef.current = false;
    setErro(null);
    setEnviando(true);
    const totais = { feitos: 0, enviados: 0, falhas: 0, pulados: 0 };
    setProgresso({ ...totais });

    try {
      for (let i = 0; i < alvo.length; i += LOTE) {
        if (pararRef.current) break;
        const lote = alvo.slice(i, i + LOTE);
        const r = await enviarLote({
          campanhaId: sel.id,
          loja,
          template: sel.template,
          idioma: sel.idioma || 'pt_BR',
          cupom: sel.cupom || '',
          botaoUrl: sel.botaoUrl || '',
          destinatarios: lote,
          meta: { titulo: sel.titulo || sel.template, filtro: filtroDesc },
        });
        totais.feitos += lote.length;
        totais.enviados += r.enviados || 0;
        totais.falhas += r.falhas || 0;
        totais.pulados += r.pulados || 0;
        setProgresso({ ...totais });
        if (i + LOTE < alvo.length) await espera(PAUSA_MS);
      }
    } catch (e) {
      // Erro de lote não perde o que já saiu, e disparar a mesma campanha de
      // novo continua de onde parou — o id é o da campanha salva.
      setErro(e.message || 'falha no envio');
    } finally {
      setEnviando(false);
    }
  };

  const terminou = progresso && !enviando;

  const fechar = () => {
    if (!enviando) onClose();
  };

  return (
    <div className={styles.overlay} onClick={fechar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={fechar} disabled={enviando} aria-label="Fechar">
          ×
        </button>
        <h3 className={styles.titulo}>Enviar campanha · {lojaLabel}</h3>
        <p className={styles.subtitulo}>{filtroDesc}</p>

        <div className={styles.resumo}>
          <span>
            <strong>{destinatarios.length}</strong> selecionado{destinatarios.length === 1 ? '' : 's'}
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

        <span className={styles.rotulo}>Campanha</span>
        {opcoes.length === 0 ? (
          <div className={styles.vazio}>
            <p>Nenhuma campanha salva para a {lojaLabel}.</p>
            {onNovaCampanha && (
              <button
                className={styles.ghost}
                onClick={() => { onClose(); onNovaCampanha(); }}
                type="button"
              >
                Criar em Campanhas
              </button>
            )}
          </div>
        ) : (
          <div className={styles.listaCampanhas} role="radiogroup" aria-label="Campanha">
            {opcoes.map((c) => (
              <label
                key={c.id}
                className={`${styles.itemCampanha} ${selId === c.id ? styles.itemCampanhaAtivo : ''}`}
              >
                <input
                  type="radio"
                  name="campanha-envio"
                  checked={selId === c.id}
                  onChange={() => setSelId(c.id)}
                  disabled={enviando}
                />
                <span className={styles.itemCampanhaCorpo}>
                  <strong>{c.titulo || c.template}</strong>
                  <span className={styles.itemCampanhaInfo}>
                    {c.template}
                    {c.cupom ? ` · código ${c.cupom}` : ''}
                    {' · '}
                    {c.enviados ? `já enviada para ${c.enviados}` : 'ainda não enviada'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {sel && (
          <>
            {jaEnviados > 0 && (
              <p className={styles.aviso}>
                Esta campanha já foi para {jaEnviados} cliente{jaEnviados === 1 ? '' : 's'}. Quem já
                recebeu é pulado sem custo — para mandar de novo a essas pessoas, copie a campanha em
                Campanhas.
              </p>
            )}

            <CampanhaPreview
              texto={sel.texto}
              nome={exemplo?.nome}
              botaoTexto={sel.botaoTexto}
              botaoUrl={sel.botaoUrl}
              cupom={sel.cupom}
            />

            <div className={styles.linha}>
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

            <CampanhaTeste loja={loja} campanha={sel} disabled={enviando} />
          </>
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
          </div>
        )}

        {erro && <div className={styles.erro}>{erro}</div>}

        <div className={styles.acoes}>
          {enviando ? (
            <button className={styles.ghost} onClick={() => { pararRef.current = true; }}>
              Parar depois deste lote
            </button>
          ) : (
            <button className={styles.ghost} onClick={fechar}>
              {terminou ? 'Fechar' : 'Cancelar'}
            </button>
          )}
          <button
            className={styles.primario}
            onClick={disparar}
            disabled={enviando || !sel || alvo.length === 0}
          >
            {enviando ? 'Enviando…' : `Disparar (${alvo.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
