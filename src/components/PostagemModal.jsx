import { useEffect } from 'react';
import { MARCA_LABEL, TIPO_LABEL, FORMATO_LABEL, statusDe, hora } from '../utils/postagens';
import styles from '../styles/PostagensView.module.css';

const ehVideo = (u) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u || '');

/** Detalhe de uma postagem (só leitura): prévia, informações e link do post publicado. */
export default function PostagemModal({ post, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const st = statusDe(post.status);
  const midias = Array.isArray(post.midias) ? post.midias : [];
  const principal = midias[0];
  const d = post.data;
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const link = /^https:\/\/(www\.)?instagram\.com\//.test(post.resultado || '') ? post.resultado : null;
  // Depois do `social.py limpar` a mídia sai do servidor e a prévia some.
  const onErroMidia = (e) => { e.currentTarget.style.display = 'none'; };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.preview}>
          {principal && ehVideo(principal) ? (
            <video src={principal} poster={post.capa_url || undefined} controls playsInline preload="none" onError={onErroMidia} />
          ) : principal ? (
            <img src={principal} alt="" onError={onErroMidia} />
          ) : null}
          <span className={styles.previewVazio}>prévia indisponível</span>
          {midias.length > 1 && <span className={styles.previewConta}>1/{midias.length}</span>}
        </div>

        <div className={styles.info}>
          <div className={styles.infoTopo}>
            <h3>{MARCA_LABEL[post.marca] || post.marca} · {TIPO_LABEL[post.tipo] || post.tipo}</h3>
            <button type="button" className={styles.fechar} onClick={onClose} aria-label="Fechar">×</button>
          </div>
          <span className={`${styles.chip} ${styles[st.cls]}`}>{st.label}</span>

          <dl className={styles.dl}>
            <dt>Quando</dt>
            <dd>{dia} · {hora(d)}</dd>
            <dt>Formato</dt>
            <dd>{FORMATO_LABEL[post.formato] || post.formato}{midias.length > 1 ? ` (${midias.length} mídias)` : ''}</dd>
            <dt>Destino</dt>
            <dd>Instagram</dd>
            {post.status === 'erro' && post.resultado && (
              <>
                <dt>Erro</dt>
                <dd className={styles.erroTxt}>{post.resultado}</dd>
              </>
            )}
          </dl>

          {post.legenda && (
            <div className={styles.legendaBox}>
              <div className={styles.label}>Legenda</div>
              <p>{post.legenda}</p>
            </div>
          )}

          {link && (
            <a className={styles.primaryBtn} href={link} target="_blank" rel="noopener noreferrer">Ver no Instagram</a>
          )}
        </div>
      </div>
    </div>
  );
}
