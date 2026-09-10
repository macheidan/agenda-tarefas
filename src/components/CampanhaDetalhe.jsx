import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import styles from '../styles/ClientesView.module.css';

// Uma linha por mensagem: é a única tela que abre `campanhaEnvios`, e só da
// campanha aberta. O painel de campanhas nunca carrega esta coleção — são
// centenas de documentos por disparo, e lá só interessam os totais.

const LOJA_LABELS = { dame: 'Dáme', lov: 'Lov' };

const STATUS = {
  enviado: { label: 'Enviado', classe: 'stEnviado' },
  entregue: { label: 'Entregue', classe: 'stEntregue' },
  lido: { label: 'Lido', classe: 'stLido' },
  erro: { label: 'Falhou', classe: 'stErro' },
};

// Ordem de leitura: o que precisa de ação primeiro. Quem falhou é o que alguém
// pode querer reenviar ou corrigir no cadastro; quem leu é só resultado.
const PESO = { erro: 0, enviado: 1, entregue: 2, lido: 3 };

function formatarTelefone(t) {
  const s = String(t || '').replace(/\D/g, '');
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return t || '—';
}

function quando(ts) {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function CampanhaDetalhe({ campanha, onVoltar }) {
  const [envios, setEnvios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState(null);

  useEffect(() => {
    if (!campanha?.id) return undefined;
    setCarregando(true);
    return onSnapshot(
      query(collection(db, 'campanhaEnvios'), where('campanhaId', '==', campanha.id)),
      (snap) => {
        setEnvios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      (err) => {
        console.error('Firestore campanhaEnvios error:', err);
        setCarregando(false);
      }
    );
  }, [campanha?.id]);

  const contagem = useMemo(() => {
    const out = { enviado: 0, entregue: 0, lido: 0, erro: 0 };
    envios.forEach((e) => { if (out[e.status] !== undefined) out[e.status] += 1; });
    return out;
  }, [envios]);

  const lista = useMemo(() => {
    const base = filtro ? envios.filter((e) => e.status === filtro) : envios;
    return [...base].sort(
      (a, b) => (PESO[a.status] ?? 9) - (PESO[b.status] ?? 9) || (a.nome || '').localeCompare(b.nome || '')
    );
  }, [envios, filtro]);

  // Entregue e lido são acumulativos: quem leu passou por entregue, e é isso que
  // faz a taxa de leitura ser sobre o que CHEGOU, não sobre o que foi disparado.
  const chegaram = contagem.entregue + contagem.lido;
  const taxa = chegaram ? Math.round((contagem.lido / chegaram) * 100) : 0;

  return (
    <>
      <div className={styles.detalheTopo}>
        <button className={styles.ghostBtn} onClick={onVoltar} type="button">
          ← Campanhas
        </button>
        <h3 className={styles.subTitulo}>
          {campanha.titulo || campanha.template}
          <span className={styles.brandChip}>{LOJA_LABELS[campanha.loja] || campanha.loja}</span>
        </h3>
      </div>

      <p className={styles.subInfoBloco}>
        Template <code>{campanha.template}</code> · disparada em {quando(campanha.criadoEm)}
        {campanha.criadoPor ? ` por ${campanha.criadoPor}` : ''}
        {campanha.filtro ? ` · recorte: ${campanha.filtro}` : ''}
      </p>

      <div className={styles.detalheCards}>
        {Object.entries(STATUS).map(([key, s]) => (
          <button
            key={key}
            className={`${styles.detalheCard} ${filtro === key ? styles.detalheCardAtivo : ''}`}
            onClick={() => setFiltro(filtro === key ? null : key)}
            type="button"
          >
            <strong>{contagem[key]}</strong>
            <span>{s.label}</span>
          </button>
        ))}
        <div className={styles.detalheCard}>
          <strong>{taxa}%</strong>
          <span>leram (de {chegaram} que chegaram)</span>
        </div>
      </div>

      {carregando && <p className={styles.subInfoBloco}>Carregando os envios…</p>}

      {!carregando && lista.length === 0 && (
        <div className={styles.empty}>
          <p>Nenhum envio {filtro ? `com status "${STATUS[filtro].label}"` : 'registrado'}.</p>
        </div>
      )}

      {lista.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th className={styles.colTel}>Telefone</th>
              <th className={styles.colData}>Status</th>
              <th className={styles.colData}>Quando</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td data-label="Cliente" className={styles.nome}>
                  {e.nome || <span className={styles.semNome}>Sem nome</span>}
                </td>
                <td data-label="Telefone" className={styles.colTel}>
                  <a
                    className={styles.telLink}
                    href={`https://wa.me/55${String(e.telefone || '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatarTelefone(e.telefone)}
                  </a>
                </td>
                <td data-label="Status" className={styles.colData}>
                  <span className={`${styles.stChip} ${styles[STATUS[e.status]?.classe] || ''}`}>
                    {STATUS[e.status]?.label || e.status}
                  </span>
                </td>
                <td data-label="Quando" className={styles.colData}>{quando(e.criadoEm)}</td>
                <td data-label="Detalhe" className={styles.subInfo}>
                  {e.erro || (e.status === 'lido' ? 'abriu a mensagem' : '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
