import styles from '../styles/CampanhaModal.module.css';

/**
 * Conferência do que chega no celular: corpo com o {{1}} trocado pelo nome e
 * os dois botões do modelo. É só conferência — quem manda o conteúdo é o
 * template aprovado na Meta.
 */
export default function CampanhaPreview({ texto, nome, botaoTexto, botaoUrl, cupom }) {
  const corpo = String(texto || '').replace(/\{\{1\}\}/g, nome || 'Fulano');
  const url = String(botaoUrl || '').trim();
  const tituloBotao = String(botaoTexto || '').trim();
  const codigo = String(cupom || '').trim();
  if (!corpo.trim() && !url && !tituloBotao && !codigo) return null;

  return (
    <div className={styles.preview}>
      <span className={styles.previewLabel}>Como chega para {nome || 'o cliente'}</span>
      {corpo.trim() && <p>{corpo}</p>}
      {(url || tituloBotao || codigo) && (
        <div className={styles.previewBotoes}>
          {(url || tituloBotao) && (
            <span className={styles.previewBotao} title={url || undefined}>
              {tituloBotao || 'Acessar o site'}
            </span>
          )}
          {codigo && <span className={styles.previewBotao}>Copiar código da oferta · {codigo}</span>}
        </div>
      )}
    </div>
  );
}
