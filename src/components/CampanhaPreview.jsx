import styles from '../styles/CampanhaModal.module.css';

/**
 * Conferência do que chega no celular: corpo com o {{1}} trocado pelo nome e
 * os dois botões do modelo. É só conferência — quem manda o conteúdo é o
 * template aprovado na Meta.
 */
export default function CampanhaPreview({ texto, nome, botaoUrl, cupom }) {
  const corpo = String(texto || '').replace(/\{\{1\}\}/g, nome || 'Fulano');
  const url = String(botaoUrl || '').trim();
  const codigo = String(cupom || '').trim();
  if (!corpo.trim() && !url && !codigo) return null;

  return (
    <div className={styles.preview}>
      <span className={styles.previewLabel}>Como chega para {nome || 'o cliente'}</span>
      {corpo.trim() && <p>{corpo}</p>}
      {(url || codigo) && (
        <div className={styles.previewBotoes}>
          {url && (
            <span className={styles.previewBotao} title={url}>
              Acessar o site
            </span>
          )}
          {codigo && <span className={styles.previewBotao}>Copiar código da oferta · {codigo}</span>}
        </div>
      )}
    </div>
  );
}
