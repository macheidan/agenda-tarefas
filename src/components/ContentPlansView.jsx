import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ContentPlansView.module.css';

export default function ContentPlansView({ plans, loading, uploadPlan, deletePlan }) {
  const { isAdmin } = useAuth();
  const [activeBrand, setActiveBrand] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const activePlan = plans.find((p) => p.id === activeBrand) || plans[0] || null;

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      try {
        await uploadPlan(file);
      } catch (err) {
        console.error('Erro no upload:', err);
      }
    }
    setUploading(false);
    e.target.value = '';
  };

  const formatDate = (timestamp) => {
    if (!timestamp?.seconds) return '';
    const d = new Date(timestamp.seconds * 1000);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>Carregando...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Planejamento de Conteúdo</h2>
        {isAdmin && (
          <>
            <button
              className={styles.uploadBtn}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Enviando...' : 'Upload HTML'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm"
              multiple
              onChange={handleUpload}
              hidden
            />
          </>
        )}
      </div>

      {plans.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhum planejamento carregado.{isAdmin ? ' Faça upload dos arquivos HTML do cowork.' : ' Peça ao administrador para carregar.'}</p>
        </div>
      ) : (
        <>
          <div className={styles.brandTabs}>
            {plans.map((plan) => (
              <button
                key={plan.id}
                className={(activePlan?.id === plan.id) ? styles.brandTabActive : styles.brandTab}
                onClick={() => setActiveBrand(plan.id)}
              >
                {plan.brand}
              </button>
            ))}
          </div>

          {activePlan && (
            <>
              <div className={styles.metaRow}>
                <span className={styles.meta}>
                  {activePlan.fileName} — Atualizado em {formatDate(activePlan.updatedAt)}
                </span>
                {isAdmin && (
                  <button
                    className={styles.deleteBtn}
                    onClick={() => deletePlan(activePlan.id)}
                  >
                    Excluir
                  </button>
                )}
              </div>
              <iframe
                className={styles.iframe}
                srcDoc={activePlan.html}
                sandbox="allow-same-origin"
                title={`Planejamento ${activePlan.brand}`}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
