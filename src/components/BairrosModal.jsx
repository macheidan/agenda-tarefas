import { useState, useMemo } from 'react';
import styles from '../styles/CampanhaModal.module.css';

// Seleção de bairros para o filtro da lista. É modal e não uma lista de botões
// porque a base tem dezenas de bairros: em linha, o filtro empurraria a tabela
// para fora da tela justamente quando alguém quer olhar a tabela.

// Mesma normalização da busca da lista: acento não pode separar "Tristeza" de
// "tristeza" nem "Sarandí" de "Sarandi".
function semAcento(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export default function BairrosModal({ open, onClose, bairros, selecionados, onAplicar }) {
  const [marcados, setMarcados] = useState(() => new Set(selecionados));
  const [busca, setBusca] = useState('');

  // Os hooks vêm ANTES de qualquer return: `useMemo` depois de um `return null`
  // muda a ordem dos hooks entre renders e o React quebra.
  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    return termo ? bairros.filter((b) => semAcento(b.nome).includes(termo)) : bairros;
  }, [bairros, busca]);

  if (!open) return null;

  const mudou =
    marcados.size !== selecionados.size || [...marcados].some((b) => !selecionados.has(b));

  const alternar = (nome) => {
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(nome)) n.delete(nome); else n.add(nome);
      return n;
    });
  };

  const tentarFechar = () => {
    if (mudou && !window.confirm('Sair sem aplicar? A seleção de bairros será perdida.')) return;
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={tentarFechar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={tentarFechar} aria-label="Fechar">
          ×
        </button>
        <h3 className={styles.titulo}>Filtrar por bairro</h3>
        <p className={styles.subtitulo}>
          {marcados.size === 0
            ? 'Nenhum bairro marcado — a lista mostra todos.'
            : `${marcados.size} bairro${marcados.size === 1 ? '' : 's'} marcado${marcados.size === 1 ? '' : 's'}.`}
        </p>

        <div className={styles.campo}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar bairro"
            autoFocus
          />
        </div>

        <div className={styles.listaBairros}>
          {filtrados.map((b) => (
            <label key={b.nome} className={styles.itemBairro}>
              <input
                type="checkbox"
                checked={marcados.has(b.nome)}
                onChange={() => alternar(b.nome)}
              />
              <span className={styles.itemNome}>{b.nome}</span>
              <span className={styles.itemQtd}>{b.qtd}</span>
            </label>
          ))}
          {filtrados.length === 0 && <p className={styles.subtitulo}>Nenhum bairro com esse nome.</p>}
        </div>

        <div className={styles.acoes}>
          <button className={styles.ghost} onClick={() => setMarcados(new Set())} type="button">
            Limpar
          </button>
          <button
            className={styles.primario}
            onClick={() => { onAplicar(marcados); onClose(); }}
            type="button"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
