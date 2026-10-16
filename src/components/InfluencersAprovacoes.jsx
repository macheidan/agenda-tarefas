import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/InfluencersAprovacoes.module.css';

// Fila de aprovação do bot de influencers (pedido do Fábio, 15/10/2026): o bot não abre mais abas no
// Chrome dele; cada mensagem pronta cai aqui. Quem tem a permissão edita, aprova ou descarta, e o
// despachante (Pizzarias/bot ig influencers/despachante.py) envia o aprovado por e-mail ou direct.
// 16/10/2026 (Fábio): botões Enviar / Rejeitar / Arquivar, e nada expira — fica na fila até alguém decidir.
// Arquivada sai da fila sem enviar e sem rejeitar; dá pra devolver à fila depois.

const TIPO_LABEL = { convite: 'Convite', resposta: 'Resposta', lembrete: 'Lembrete' };
const CANAL_LABEL = { email: 'E-mail', direct: 'Direct IG' };
const STATUS_LABEL = {
  pendente: 'Aguardando aprovação',
  aprovado: 'Aprovado — na fila de envio',
  enviando: 'Enviando…',
  enviado: 'Enviado',
  erro: 'Erro no envio',
  descartado: 'Descartado',
  rejeitado: 'Rejeitado',
  arquivado: 'Arquivado',
};

const fmt = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const fmtNum = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : n || '—');

function Print({ id, carregarPrint }) {
  const [img, setImg] = useState(null);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    let vivo = true;
    carregarPrint(id).then((x) => { if (vivo) setImg(x); }).catch(() => {});
    return () => { vivo = false; };
  }, [id, carregarPrint]);
  if (!img) return <div className={styles.printVazio}>carregando feed…</div>;
  return (
    <>
      <button type="button" className={styles.printBtn} onClick={() => setAberto(true)} title="Ampliar">
        <img src={img} alt="Feed do perfil" className={styles.print} />
      </button>
      {aberto && (
        <div className={styles.overlay} onClick={() => setAberto(false)} role="presentation">
          <img src={img} alt="Feed do perfil" className={styles.printGrande} />
        </div>
      )}
    </>
  );
}

function Cartao({ m, decidir, carregarPrint, user }) {
  const editavel = m.status === 'pendente' || m.status === 'erro';
  const temEmail = !!(m.para || '').trim();
  const [canal, setCanal] = useState(m.canalFinal || m.canal);
  const [texto, setTexto] = useState(m.textoFinal || m.texto || '');
  const [para, setPara] = useState(m.paraFinal || m.para || '');
  const [assunto, setAssunto] = useState(m.assuntoFinal || m.assunto || '');
  const [salvando, setSalvando] = useState(false);
  const ctx = m.contexto || {};

  const aprovar = async () => {
    if (!texto.trim()) return;
    if (canal === 'email' && !para.trim()) { window.alert('Falta o e-mail de destino.'); return; }
    const onde = canal === 'email' ? `por e-mail para ${para}` : `por direct para @${m.u}`;
    if (!window.confirm(`Enviar agora ${onde}?`)) return;
    setSalvando(true);
    try {
      const final = { textoFinal: texto.trim(), canalFinal: canal };
      if (canal === 'email') { final.paraFinal = para.trim().toLowerCase(); final.assuntoFinal = assunto.trim(); }
      await decidir(m.id, 'aprovado', user, final);
    } finally { setSalvando(false); }
  };

  const rejeitar = async () => {
    if (!window.confirm(`Rejeitar a mensagem para ${m.nome || m.u}? Não será enviada e o bot não volta a procurar essa pessoa.`)) return;
    setSalvando(true);
    try { await decidir(m.id, 'rejeitado', user); } finally { setSalvando(false); }
  };

  const arquivar = async () => {
    setSalvando(true);
    try { await decidir(m.id, 'arquivado', user); } finally { setSalvando(false); }
  };

  const devolver = async () => {
    setSalvando(true);
    try { await decidir(m.id, 'pendente', user); } finally { setSalvando(false); }
  };

  return (
    <article className={`${styles.card} ${styles['st_' + m.status] || ''}`}>
      <div className={styles.cardTop}>
        {m.temPrint && editavel ? <Print id={m.id} carregarPrint={carregarPrint} /> : null}
        <div className={styles.info}>
          <div className={styles.nomeLinha}>
            <strong className={styles.nome}>{m.nome || m.u}</strong>
            <a className={styles.handle} href={`https://www.instagram.com/${m.u}/`} target="_blank" rel="noopener noreferrer">@{m.u}</a>
          </div>
          <div className={styles.chips}>
            <span className={styles.chip}>{TIPO_LABEL[m.tipo] || m.tipo}</span>
            <span className={styles.chip}>{CANAL_LABEL[m.canalFinal || m.canal] || m.canal}</span>
            {m.marca && <span className={styles.chip}>{m.marca}</span>}
            <span className={`${styles.status} ${styles['s_' + m.status] || ''}`}>{STATUS_LABEL[m.status] || m.status}</span>
          </div>
          <div className={styles.meta}>
            {ctx.seguidores != null && <span>{fmtNum(ctx.seguidores)} seguidores</span>}
            {ctx.nota != null && <span>nota {ctx.nota}</span>}
            <span>preparado {fmt(m.criadoEm)}</span>
          </div>
          {ctx.motivo && <p className={styles.motivo}><b>Por que:</b> {ctx.motivo}</p>}
          {ctx.bio && <p className={styles.bio}>{ctx.bio}</p>}
        </div>
      </div>

      {m.original && (
        <div className={styles.original}>
          <span className={styles.label}>O que {m.nome || m.u} escreveu</span>
          <div className={styles.originalTexto}>{m.original}</div>
        </div>
      )}

      {editavel ? (
        <div className={styles.form}>
          {temEmail && (
            <div className={styles.canalPicker}>
              <span className={styles.label}>Enviar por</span>
              {['email', 'direct'].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.canalBtn} ${canal === c ? styles.canalBtnOn : ''}`}
                  onClick={() => setCanal(c)}
                >
                  {CANAL_LABEL[c]}
                </button>
              ))}
            </div>
          )}
          {canal === 'email' && (
            <div className={styles.emailCampos}>
              <label className={styles.campo}>
                <span className={styles.label}>Para</span>
                <input value={para} onChange={(e) => setPara(e.target.value)} />
              </label>
              <label className={styles.campo}>
                <span className={styles.label}>Assunto</span>
                <input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
              </label>
            </div>
          )}
          <label className={styles.campo}>
            <span className={styles.label}>Mensagem {canal === 'direct' && <small>(no direct vai numa linha só)</small>}</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={canal === 'email' ? 12 : 5}
            />
          </label>
          {m.status === 'erro' && <p className={styles.erro}>{m.erro}</p>}
          <div className={styles.acoes}>
            <button type="button" className={styles.aprovarBtn} onClick={aprovar} disabled={salvando}>
              {m.status === 'erro' ? 'Tentar de novo' : 'Enviar'}
            </button>
            <button type="button" className={styles.descartarBtn} onClick={rejeitar} disabled={salvando}>Rejeitar</button>
            <button type="button" className={styles.arquivarBtn} onClick={arquivar} disabled={salvando}>Arquivar</button>
          </div>
        </div>
      ) : (
        <div className={styles.final}>
          <div className={styles.finalTexto}>{m.textoFinal || m.texto}</div>
          <div className={styles.meta}>
            {m.decididoPor?.nome && <span>{['descartado', 'rejeitado', 'arquivado'].includes(m.status) ? STATUS_LABEL[m.status].toLowerCase() : 'aprovado'} por {m.decididoPor.nome} {fmt(m.decididoEm)}</span>}
            {m.enviadoEm && <span>enviado {fmt(m.enviadoEm)}</span>}
          </div>
          {m.status === 'arquivado' && (
            <div className={styles.acoes}>
              <button type="button" className={styles.arquivarBtn} onClick={devolver} disabled={salvando}>Voltar para a fila</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function InfluencersAprovacoes({ mensagens, loading, decidir, carregarPrint }) {
  const { user } = useAuth();
  const [verHistorico, setVerHistorico] = useState(false);
  const [verArquivadas, setVerArquivadas] = useState(false);

  const { abertas, arquivadas, historico } = useMemo(() => {
    const abertas = mensagens.filter((m) => ['pendente', 'aprovado', 'enviando', 'erro'].includes(m.status));
    const arquivadas = mensagens.filter((m) => m.status === 'arquivado');
    const historico = mensagens.filter((m) => ['enviado', 'descartado', 'rejeitado'].includes(m.status));
    return { abertas, arquivadas, historico };
  }, [mensagens]);

  if (loading) return <div className={styles.vazio}>Carregando…</div>;

  return (
    <div>
      <p className={styles.dica}>
        Mensagens que o bot preparou. Confira o feed, ajuste o texto se quiser e clique em Enviar: sai sozinho em
        segundos (e-mail pela marketing@lovpizza.com.br, direct pela conta @lovpizza). Rejeitar descarta a pessoa;
        Arquivar tira da fila sem enviar e dá pra voltar depois. Nada expira: fica aqui até alguém decidir.
      </p>
      {abertas.length === 0 ? (
        <div className={styles.vazio}>Nada esperando aprovação agora.</div>
      ) : (
        <div className={styles.lista}>
          {abertas.map((m) => (
            <Cartao key={m.id} m={m} decidir={decidir} carregarPrint={carregarPrint} user={user} />
          ))}
        </div>
      )}
      {arquivadas.length > 0 && (
        <div className={styles.historicoBox}>
          <button type="button" className={styles.historicoBtn} onClick={() => setVerArquivadas((v) => !v)}>
            {verArquivadas ? 'Esconder arquivadas' : `Arquivadas (${arquivadas.length})`}
          </button>
          {verArquivadas && (
            <div className={styles.lista}>
              {arquivadas.map((m) => (
                <Cartao key={m.id} m={m} decidir={decidir} carregarPrint={carregarPrint} user={user} />
              ))}
            </div>
          )}
        </div>
      )}
      {historico.length > 0 && (
        <div className={styles.historicoBox}>
          <button type="button" className={styles.historicoBtn} onClick={() => setVerHistorico((v) => !v)}>
            {verHistorico ? 'Esconder histórico' : `Histórico recente (${historico.length})`}
          </button>
          {verHistorico && (
            <div className={styles.lista}>
              {historico.map((m) => (
                <Cartao key={m.id} m={m} decidir={decidir} carregarPrint={carregarPrint} user={user} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
