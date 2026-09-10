import { useState, useRef, useMemo } from 'react';
import { enviarLote, novaCampanhaId, LOTE, PAUSA_MS } from '../utils/whatsapp';
import { auth } from '../firebase';
import styles from '../styles/CampanhaModal.module.css';

// Limite de destinatários novos por dia. Número novo na Meta começa baixo e
// sobe conforme a qualidade; passar do teto não adianta — a Meta recusa o
// excedente. Aqui o disparo para sozinho e a campanha continua amanhã, porque
// o servidor pula quem já recebeu.
const LIMITE_PADRAO = 250;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Só oferece retomar campanha recente: mais que isso e a lista de destinatários
// já é outra, então "continuar" enganaria mais do que ajudaria.
const PRAZO_RETOMADA_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Campanha da loja que parou no meio.
 *
 * O disparo roda no navegador, de 20 em 20: aba fechada, PC desligado ou queda
 * de rede param a campanha onde estava. Retomar precisa reusar o MESMO
 * `campanhaId`, porque é por `campanhaId__telefone` que o servidor sabe quem já
 * recebeu. Com id novo — que é o que um clique em "Disparar" gera — ninguém é
 * reconhecido e quem já recebeu recebe de novo, cobrado de novo.
 */
function campanhaPendente(campanhas, loja) {
  const agora = Date.now();
  return (
    (campanhas || []).find((c) => {
      if (c.loja !== loja || !c.totalAlvo) return false;
      const feitos = (c.enviados || 0) + (c.falhas || 0) + (c.pulados || 0);
      if (feitos >= c.totalAlvo || feitos === 0) return false;
      const quando = c.ultimoEnvioEm?.toMillis?.() || c.criadoEm?.toMillis?.() || 0;
      return quando > 0 && agora - quando < PRAZO_RETOMADA_MS;
    }) || null
  );
}

export default function CampanhaModal({
  open,
  onClose,
  loja,
  lojaLabel,
  destinatarios,
  filtroDesc,
  campanhas,
}) {
  const [template, setTemplate] = useState('');
  const [idioma, setIdioma] = useState('pt_BR');
  const [cupom, setCupom] = useState('');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [limite, setLimite] = useState(LIMITE_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState(null);
  const pararRef = useRef(false);
  const [testeTel, setTesteTel] = useState('');
  const [testando, setTestando] = useState(false);
  const [testeOk, setTesteOk] = useState(null);

  const pendente = useMemo(() => campanhaPendente(campanhas, loja), [campanhas, loja]);
  const feitosPendente = pendente
    ? (pendente.enviados || 0) + (pendente.falhas || 0) + (pendente.pulados || 0)
    : 0;

  if (!open) return null;

  const alvo = destinatarios.slice(0, Math.max(0, Number(limite) || 0));
  const exemplo = alvo[0];
  const preview = texto.replace(/\{\{1\}\}/g, exemplo?.nome || 'Fulano');

  /**
   * Um envio só, para um número digitado na hora.
   *
   * Existe porque o disparo normal manda para o RECORTE da lista, e quem vai
   * conferir se o template ficou bom quase nunca está na base de clientes.
   * Vai pelo mesmo caminho do disparo de verdade — proxy, template, webhook —
   * senão não seria teste de nada: cria campanha própria, marcada como teste,
   * e o status dela no painel é a prova de que o webhook está de pé.
   */
  const enviarTeste = async () => {
    const tel = testeTel.replace(/\D/g, '');
    if (tel.length < 10) {
      setTesteOk({ erro: 'Telefone incompleto. Digite com DDD.' });
      return;
    }
    if (!template.trim()) {
      setTesteOk({ erro: 'Informe o nome do template aprovado na Meta.' });
      return;
    }
    setTestando(true);
    setTesteOk(null);
    try {
      const nome = (auth.currentUser?.displayName || '').trim().split(/\s+/)[0] || 'Fábio';
      const r = await enviarLote({
        campanhaId: `teste-${novaCampanhaId(loja)}`,
        loja,
        template: template.trim(),
        idioma,
        cupom: cupom.trim(),
        destinatarios: [{ telefone: tel, nome }],
        meta: {
          titulo: `Teste · ${tel}`,
          filtro: 'envio de teste',
          texto: texto.trim(),
          totalAlvo: 1,
        },
      });
      const pulou = r.pulados > 0;
      setTesteOk({
        ok: r.enviados > 0,
        msg: r.enviados > 0
          ? 'Enviado! Confira o celular.'
          : pulou
            ? 'Pulado: esse número pediu para sair ou já recebeu este teste.'
            : r.resultados?.[0]?.erro || 'não saiu',
      });
    } catch (e) {
      setTesteOk({ erro: e.message || 'falha no envio' });
    } finally {
      setTestando(false);
    }
  };

  const disparar = async (campanha = null) => {
    // Só é retomada se veio um doc de campanha com id. Sem esta guarda, um
    // `onClick={disparar}` distraído passaria o evento do clique aqui e o
    // usuário veria a confirmação de RETOMADA no lugar da que avisa que a
    // mensagem sai de verdade e é cobrada.
    const retomar = campanha && campanha.id ? campanha : null;
    const nomeTemplate = (retomar?.template || template).trim();
    if (!nomeTemplate) {
      setErro('Informe o nome do template aprovado na Meta.');
      return;
    }
    const ok = window.confirm(
      retomar
        ? `Retomar "${retomar.titulo || retomar.id}"?\n\n` +
            'Quem já recebeu nesta campanha é pulado sem custo. Os demais recebem de verdade.'
        : `Disparar para ${alvo.length} cliente(s) da ${lojaLabel}?\n\n` +
            'A mensagem sai de verdade e é cobrada por envio. Não tem como desfazer.'
    );
    if (!ok) return;

    pararRef.current = false;
    setErro(null);
    setEnviando(true);
    // Retomar reusa o id: é a única coisa que faz o servidor reconhecer quem já
    // recebeu. Id novo aqui significaria mensagem repetida e cobrada de novo.
    const campanhaId = retomar?.id || novaCampanhaId(loja);
    const totais = { feitos: 0, enviados: 0, falhas: 0, pulados: 0, campanhaId };
    setProgresso({ ...totais });

    try {
      for (let i = 0; i < alvo.length; i += LOTE) {
        if (pararRef.current) break;
        const lote = alvo.slice(i, i + LOTE);
        const r = await enviarLote({
          campanhaId,
          loja,
          template: nomeTemplate,
          idioma: retomar?.idioma || idioma,
          cupom: cupom.trim(),
          destinatarios: lote,
          meta: {
            titulo: retomar?.titulo || titulo.trim() || nomeTemplate,
            filtro: filtroDesc,
            texto: texto.trim(),
            // O recorte inteiro, não a fatia de hoje: é `totalAlvo` que diz se a
            // campanha ficou pela metade. Gravando só o lote do dia, uma
            // campanha de 800 com limite 250 fecharia como "completa" e o
            // botão Retomar nunca apareceria — justamente no caso mais comum,
            // o do limite diário, em que continuar no dia seguinte com id novo
            // reenviaria (e recobraria) os 250 do primeiro dia.
            totalAlvo: destinatarios.length,
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
      // Erro de lote não perde o que já saiu, MAS continuar exige o botão
      // Retomar (que reusa o campanhaId). "Disparar" de novo cria campanha
      // nova, e o servidor só reconhece quem já recebeu dentro do mesmo id.
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

        {pendente && !enviando && !progresso && (
          <div className={styles.pendente}>
            <strong>Campanha interrompida</strong>
            <p>
              &quot;{pendente.titulo || pendente.id}&quot; parou em {feitosPendente} de 
              {pendente.totalAlvo}. Retomar continua de onde parou: quem já recebeu é pulado sem
              custo. Disparar de novo criaria outra campanha e mandaria tudo outra vez.
            </p>
            <button className={styles.retomarBtn} onClick={() => disparar(pendente)}>
              Retomar {pendente.template}
            </button>
          </div>
        )}

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
          <div className={styles.campoPequeno}>
            <label htmlFor="camp-cupom">Cupom</label>
            <input
              id="camp-cupom"
              value={cupom}
              onChange={(e) => setCupom(e.target.value.toUpperCase())}
              placeholder="DAME20"
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

        <div className={styles.teste}>
          <label htmlFor="camp-teste">Enviar um teste antes</label>
          <div className={styles.testeLinha}>
            <input
              id="camp-teste"
              value={testeTel}
              onChange={(e) => setTesteTel(e.target.value)}
              placeholder="51 99999-9999"
              disabled={testando || enviando}
            />
            <button
              className={styles.testeBtn}
              onClick={enviarTeste}
              disabled={testando || enviando || !testeTel.trim()}
              type="button"
            >
              {testando ? 'Enviando…' : 'Enviar teste'}
            </button>
          </div>
          <span className={styles.dica}>
            Uma mensagem só, para o número que você digitar — mesmo caminho do disparo de
            verdade, e cobrada como qualquer outra. Não precisa estar na lista de clientes.
          </span>
          {testeOk && (
            <span className={testeOk.ok ? styles.testeOk : styles.testeErro}>
              {testeOk.erro || testeOk.msg}
            </span>
          )}
        </div>

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
            onClick={() => disparar()}
            disabled={enviando || alvo.length === 0}
          >
            {enviando ? 'Enviando…' : terminou ? 'Disparar de novo' : `Disparar (${alvo.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
