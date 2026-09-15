import { useState, useEffect, useRef } from 'react';
import { salvarCampanha } from '../hooks/useCampanhas';
import { auth } from '../firebase';
import CampanhaPreview from './CampanhaPreview';
import CampanhaTeste from './CampanhaTeste';
import cs from '../styles/ClientesView.module.css';
import styles from '../styles/CampanhaModal.module.css';

// Nome de template do WhatsApp: minúsculas, número e underscore. É a mesma
// regra do proxy e das rules — errar aqui só adiaria o erro para o disparo.
const TEMPLATE_OK = /^[a-z0-9_]{1,512}$/;

const VAZIO = {
  titulo: '', template: '', idioma: 'pt_BR', texto: '', cupom: '', botaoTexto: '', botaoUrl: '',
};

/**
 * Cadastro de campanha, fixo no topo da sub-aba Campanhas.
 *
 * Já foi o modal do botão "Enviar campanha" da Lista. Separar o cadastro do
 * disparo tira a digitação do momento em que a mensagem sai cobrada: a
 * campanha é montada e testada aqui, e a Lista só escolhe qual vai.
 *
 * `inicial` vem do ícone de copiar de uma campanha da lista; o painel troca a
 * `key` do componente a cada cópia, então o estado nasce de novo dela.
 */
export default function CampanhaForm({ lojas, lojaLabels, lojaPadrao, inicial, formRef }) {
  const [dados, setDados] = useState(() => ({ ...VAZIO, ...(inicial || {}) }));
  const [loja, setLoja] = useState(() => inicial?.loja || lojaPadrao || lojas[0] || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  // Segue a loja escolhida na barra de cima — mas só quando ela MUDA: no
  // primeiro render isso passaria por cima da loja de uma campanha copiada.
  const lojaAnterior = useRef(lojaPadrao);
  useEffect(() => {
    if (lojaPadrao && lojaPadrao !== lojaAnterior.current) setLoja(lojaPadrao);
    lojaAnterior.current = lojaPadrao;
  }, [lojaPadrao]);

  const set = (campo, valor) => {
    setDados((d) => ({ ...d, [campo]: valor }));
    setOk(null);
  };

  const salvar = async () => {
    const template = dados.template.trim();
    if (!loja) {
      setErro('Escolha a loja — cada marca dispara do seu próprio número.');
      return;
    }
    if (!TEMPLATE_OK.test(template)) {
      setErro('Informe o nome exato do template: minúsculas, números e _.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await salvarCampanha(
        {
          loja,
          titulo: dados.titulo.trim().slice(0, 120) || template,
          template,
          idioma: dados.idioma.trim() || 'pt_BR',
          texto: dados.texto.trim(),
          cupom: dados.cupom.trim(),
          botaoTexto: dados.botaoTexto.trim(),
          botaoUrl: dados.botaoUrl.trim(),
        },
        auth.currentUser
      );
      setDados(VAZIO);
      setOk('Campanha salva — já aparece na lista abaixo e para escolher no envio pela Lista.');
    } catch (e) {
      setErro(e.message || 'não consegui salvar');
    } finally {
      setSalvando(false);
    }
  };

  const temRascunho = Object.keys(VAZIO).some((k) => dados[k].trim() && dados[k] !== VAZIO[k]);

  return (
    <div className={`${cs.autoBloco} ${cs.formCampanha}`} ref={formRef}>
      <h3 className={cs.subTitulo}>{inicial ? 'Nova campanha (cópia)' : 'Nova campanha'}</h3>
      <p className={cs.subInfoBloco}>
        Monte e teste aqui; o envio é feito na Lista, marcando os clientes e escolhendo a campanha.
      </p>

      <div className={styles.linha}>
        <div className={styles.campoPequeno}>
          <label htmlFor="form-loja">Loja</label>
          <select id="form-loja" value={loja} onChange={(e) => setLoja(e.target.value)} disabled={salvando}>
            {!loja && <option value="">Escolha</option>}
            {lojas.map((l) => (
              <option key={l} value={l}>{lojaLabels?.[l] || l}</option>
            ))}
          </select>
        </div>
        <div className={styles.campo}>
          <label htmlFor="form-titulo">Nome da campanha</label>
          <input
            id="form-titulo"
            value={dados.titulo}
            onChange={(e) => set('titulo', e.target.value)}
            placeholder="ex: Reativação 31-60 dias · agosto"
            disabled={salvando}
          />
        </div>
      </div>

      <div className={styles.linha}>
        <div className={styles.campo}>
          <label htmlFor="form-template">Template aprovado</label>
          <input
            id="form-template"
            value={dados.template}
            onChange={(e) => set('template', e.target.value.toLowerCase())}
            placeholder="ex: volta_promo_agosto"
            disabled={salvando}
          />
          <span className={styles.dica}>O nome exato cadastrado no Gerenciador do WhatsApp.</span>
        </div>
        <div className={styles.campoPequeno}>
          <label htmlFor="form-idioma">Idioma</label>
          <input
            id="form-idioma"
            value={dados.idioma}
            onChange={(e) => set('idioma', e.target.value)}
            disabled={salvando}
          />
        </div>
      </div>

      <div className={styles.campo}>
        <label htmlFor="form-texto">Texto do template (só para conferir)</label>
        <textarea
          id="form-texto"
          value={dados.texto}
          onChange={(e) => set('texto', e.target.value)}
          rows={4}
          placeholder="Cole aqui o texto aprovado, usando {{1}} onde entra o primeiro nome."
          disabled={salvando}
        />
      </div>

      <div className={styles.linha}>
        <div className={styles.campo}>
          <label htmlFor="form-botao-texto">Botão · Acessar o site · título</label>
          <input
            id="form-botao-texto"
            value={dados.botaoTexto}
            onChange={(e) => set('botaoTexto', e.target.value)}
            placeholder="ex: Pedir agora"
            maxLength={25}
            disabled={salvando}
          />
          <span className={styles.dica}>
            O texto do botão como está no modelo (até 25 caracteres). A Meta não deixa trocar no
            envio — é para conferir.
          </span>
        </div>
        <div className={styles.campo}>
          <label htmlFor="form-url">Botão · Acessar o site · link</label>
          <input
            id="form-url"
            value={dados.botaoUrl}
            onChange={(e) => set('botaoUrl', e.target.value)}
            placeholder="https://damepizza.com.br/…"
            disabled={salvando}
          />
          <span className={styles.dica}>
            Só muda o destino se o botão foi cadastrado com URL dinâmica ({'{{1}}'} no fim). Com URL
            fixa vale a do modelo; vazio usa o exemplo aprovado.
          </span>
        </div>
      </div>

      <div className={styles.linha}>
        <div className={styles.campo}>
          <label htmlFor="form-cupom">Botão · Copiar código da oferta</label>
          <input
            id="form-cupom"
            value={dados.cupom}
            onChange={(e) => set('cupom', e.target.value.toUpperCase())}
            placeholder="DAME20"
            disabled={salvando}
          />
          <span className={styles.dica}>Vazio usa o código de exemplo aprovado com o modelo.</span>
        </div>
      </div>

      <CampanhaPreview
        texto={dados.texto}
        botaoTexto={dados.botaoTexto}
        botaoUrl={dados.botaoUrl}
        cupom={dados.cupom}
      />

      <CampanhaTeste id="form-teste" loja={loja} campanha={dados} disabled={salvando} />

      {erro && <div className={styles.erro}>{erro}</div>}
      {ok && <div className={styles.sucesso}>{ok}</div>}

      <div className={styles.acoes}>
        <button
          className={styles.ghost}
          onClick={() => { setDados(VAZIO); setErro(null); setOk(null); }}
          disabled={salvando || !temRascunho}
          type="button"
        >
          Limpar
        </button>
        <button className={styles.primario} onClick={salvar} disabled={salvando} type="button">
          {salvando ? 'Salvando…' : 'Salvar campanha'}
        </button>
      </div>
    </div>
  );
}
