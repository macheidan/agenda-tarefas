import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/InfluencersAprovacoes.module.css';

// Fila de aprovação do bot de influencers (pedido do Fábio, 15/10/2026): o bot não abre mais abas no
// Chrome dele; cada mensagem pronta cai aqui. Quem tem a permissão edita, aprova ou descarta, e o
// despachante (Pizzarias/bot ig influencers/despachante.py) envia o aprovado por e-mail ou direct.
// Regra do bot: o que não for aprovado até a próxima rodada (08:00 / 16:00) é descartado.

const TIPO_LABEL = { convite: 'Convite', resposta: 'Resposta', lembrete: 'Lembrete' };
const CANAL_LABEL = { email: 'E-mail', direct: 'Direct IG' };
const STATUS_LABEL = {
  pendente: 'Aguardando aprovação',
  aprovado: 'Aprovado — na fila de envio',
  enviando: 'Enviando…',
  enviado: 'Enviado',
  erro: 'Erro no envio',
  descartado: 'Descartado',
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

  const descartar = async () => {
    if (!window.confirm(`Descartar a mensagem para ${m.nome || m.u}? Não será enviada.`)) return;
    setSalvando(true);
    try { await decidir(m.id, 'descartado', user); } finally { setSalvando(false); }
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
              {m.status === 'erro' ? 'Tentar de novo' : 'Aprovar e enviar'}
            </button>
            <button type="button" className={styles.descartarBtn} onClick={descartar} disabled={salvando}>Descartar</button>
          </div>
        </div>
      ) : (
        <div className={styles.final}>
          <div className={styles.finalTexto}>{m.textoFinal || m.texto}</div>
          <div className={styles.meta}>
            {m.decididoPor?.nome && <span>{m.status === 'descartado' ? 'descartado' : 'aprovado'} por {m.decididoPor.nome} {fmt(m.decididoEm)}</span>}
            {m.enviadoEm && <span>enviado {fmt(m.enviadoEm)}</span>}
          </div>
        </div>
      )}
    </article>
  );
}

export default function InfluencersAprovacoes({ mensagens, loading, decidir, carregarPrint }) {
  const { user } = useAuth();
  const [verHistorico, setVerHistorico] = useState(false);

  const { abertas, historico } = useMemo(() => {
    const abertas = mensagens.filter((m) => ['pendente', 'aprovado', 'enviando', 'erro'].includes(m.status));
    const historico = mensagens.filter((m) => ['enviado', 'descartado'].includes(m.status));
    return { abertas, historico };
  }, [mensagens]);

  if (loading) return <div className={styles.vazio}>Carregando…</div>;

  return (
    <div>
      <p className={styles.dica}>
        Mensagens que o bot preparou. Confira o feed, ajuste o texto se quiser e aprove: o envio sai sozinho em
        segundos (e-mail pela marketing@lovpizza.com.br, direct pela conta @lovpizza). O que não for aprovado até a
        próxima rodada do bot (08:00 e 16:00) é descartado.
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
