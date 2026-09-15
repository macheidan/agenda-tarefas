import { useState } from 'react';
import { enviarLote, novaCampanhaId } from '../utils/whatsapp';
import { auth } from '../firebase';
import styles from '../styles/CampanhaModal.module.css';

/**
 * Um envio só, para um número digitado na hora.
 *
 * Existe porque o disparo normal manda para os MARCADOS da lista, e quem vai
 * conferir se o template ficou bom quase nunca está na base de clientes. Vai
 * pelo mesmo caminho do disparo de verdade — proxy, template, webhook —, senão
 * não seria teste de nada. Cria campanha própria com id `teste-…`, que as
 * listas de campanha escondem (`ehTeste`).
 *
 * Aparece no formulário de Campanhas (testar antes de salvar) e no disparo da
 * Lista (testar a campanha escolhida).
 */
export default function CampanhaTeste({ loja, campanha, disabled, id = 'camp-teste' }) {
  const [tel, setTel] = useState('');
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const enviar = async () => {
    const telefone = tel.replace(/\D/g, '');
    const template = String(campanha?.template || '').trim();
    if (telefone.length < 10) {
      setResultado({ erro: 'Telefone incompleto. Digite com DDD.' });
      return;
    }
    if (!loja) {
      setResultado({ erro: 'Escolha a loja — cada marca dispara do seu próprio número.' });
      return;
    }
    if (!template) {
      setResultado({ erro: 'Informe o nome do template aprovado na Meta.' });
      return;
    }
    setTestando(true);
    setResultado(null);
    try {
      const nome = (auth.currentUser?.displayName || '').trim().split(/\s+/)[0] || 'Fábio';
      const r = await enviarLote({
        campanhaId: `teste-${novaCampanhaId(loja)}`,
        loja,
        template,
        idioma: String(campanha?.idioma || '').trim() || 'pt_BR',
        cupom: String(campanha?.cupom || '').trim(),
        botaoUrl: String(campanha?.botaoUrl || '').trim(),
        destinatarios: [{ telefone, nome }],
        meta: { titulo: `Teste · ${telefone}`, filtro: 'envio de teste' },
      });
      setResultado({
        ok: r.enviados > 0,
        msg: r.enviados > 0
          ? 'Enviado! Confira o celular.'
          : r.pulados > 0
            ? 'Pulado: esse número pediu para sair ou já recebeu este teste.'
            : r.resultados?.[0]?.erro || 'não saiu',
      });
    } catch (e) {
      setResultado({ erro: e.message || 'falha no envio' });
    } finally {
      setTestando(false);
    }
  };

  return (
    <div className={styles.teste}>
      <label htmlFor={id}>Enviar um teste antes</label>
      <div className={styles.testeLinha}>
        <input
          id={id}
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          placeholder="51 99999-9999"
          disabled={testando || disabled}
        />
        <button
          className={styles.testeBtn}
          onClick={enviar}
          disabled={testando || disabled || !tel.trim()}
          type="button"
        >
          {testando ? 'Enviando…' : 'Enviar teste'}
        </button>
      </div>
      <span className={styles.dica}>
        Uma mensagem só, para o número que você digitar — mesmo caminho do disparo de verdade, e
        cobrada como qualquer outra. Não precisa estar na lista de clientes.
      </span>
      {resultado && (
        <span className={resultado.ok ? styles.testeOk : styles.testeErro}>
          {resultado.erro || resultado.msg}
        </span>
      )}
    </div>
  );
}
