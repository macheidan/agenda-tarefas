import { useState, useEffect } from 'react';
import { useRespostasAuto, PADROES } from '../hooks/useRespostasAuto';
import { auth } from '../firebase';
import styles from '../styles/ClientesView.module.css';

// As três respostas automáticas do número de campanha, na ordem em que o
// cliente as encontra: clicou no botão, escreveu sem clicar, pediu para sair.
const CAMPOS = [
  {
    key: 'clicou',
    label: 'Quem clica no botão do template',
    hint: 'Já demonstrou interesse — leve direto para a conversa, sem explicação.',
  },
  {
    key: 'digitou',
    label: 'Quem escreve em vez de clicar',
    hint: 'Precisa saber antes que aqui ninguém lê, senão fica esperando resposta.',
  },
  {
    key: 'saiu',
    label: 'Quem pede para sair',
    hint: 'Confirmação do descadastro. Nunca leva link: quem pediu para sair não quer conversa.',
  },
];

export default function RespostasAutoForm({ ativo }) {
  const { mensagens, loading, salvar } = useRespostasAuto(ativo);
  const [rascunho, setRascunho] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(false);

  // O rascunho nasce do que está gravado, e só na primeira vez que os dados
  // chegam — recarregar a cada snapshot apagaria o que está sendo digitado.
  useEffect(() => {
    if (mensagens && rascunho === null) {
      setRascunho({
        clicou: mensagens.clicou ?? PADROES.clicou,
        digitou: mensagens.digitou ?? PADROES.digitou,
        saiu: mensagens.saiu ?? PADROES.saiu,
      });
    }
  }, [mensagens, rascunho]);

  if (!ativo) return null;
  if (loading || !rascunho) return null;

  const mudou = CAMPOS.some((c) => (mensagens?.[c.key] ?? PADROES[c.key]) !== rascunho[c.key]);
  const semLink = !rascunho.clicou.includes('{link}') || !rascunho.digitou.includes('{link}');

  const gravar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      // Quem salvou fica gravado no doc: é texto que sai em nome da loja.
      await salvar(rascunho, auth.currentUser);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      setErro(e.message || 'não consegui salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className={styles.autoBloco}>
      <h3 className={styles.subTitulo}>Respostas automáticas</h3>
      <p className={styles.subInfoBloco}>
        O número que dispara a campanha não fica aberto em nenhum celular — é condição para ele
        funcionar na API oficial. Estes textos são o que o cliente recebe quando interage com ele.
        Valem no envio seguinte, sem precisar publicar nada. Use <code>{'{link}'}</code> onde entra
        o WhatsApp que atende e <code>{'{nome}'}</code> para o primeiro nome de quem escreveu.
      </p>

      {CAMPOS.map((campo) => (
        <div key={campo.key} className={styles.autoCampo}>
          <label htmlFor={`auto-${campo.key}`}>{campo.label}</label>
          <textarea
            id={`auto-${campo.key}`}
            rows={campo.key === 'saiu' ? 2 : 4}
            value={rascunho[campo.key]}
            onChange={(e) => setRascunho({ ...rascunho, [campo.key]: e.target.value })}
            disabled={salvando}
          />
          <span className={styles.autoHint}>{campo.hint}</span>
        </div>
      ))}

      {semLink && (
        <p className={styles.autoAviso}>
          Sem <code>{'{link}'}</code> no texto, o cliente não recebe o caminho para falar com a
          loja — e é justamente isso que essas duas mensagens existem para fazer.
        </p>
      )}
      {erro && <p className={styles.autoAviso}>{erro}</p>}

      <div className={styles.autoAcoes}>
        <button
          className={styles.autoSalvar}
          onClick={gravar}
          disabled={salvando || !mudou}
          type="button"
        >
          {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar mensagens'}
        </button>
        <button
          className={styles.autoGhost}
          onClick={() => setRascunho({ ...PADROES })}
          disabled={salvando}
          type="button"
        >
          Voltar ao texto padrão
        </button>
      </div>
    </div>
  );
}
