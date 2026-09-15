import { useState, useMemo, useRef } from 'react';
import CampanhaDetalhe from './CampanhaDetalhe';
import CampanhaForm from './CampanhaForm';
import RespostasAutoForm from './RespostasAutoForm';
import { Icon } from './icons';
import { auth } from '../firebase';
import { arquivarCampanha, excluirCampanha, ehTeste } from '../hooks/useCampanhas';
import styles from '../styles/ClientesView.module.css';

// Painel da sub-seção Campanhas: cadastro de campanha no topo, depois o que já
// foi salvo/disparado, o que os clientes responderam e quem pediu para sair.
// Divide o CSS module da ClientesView de propósito — é a mesma seção, com a
// mesma tabela.

const LOJA_LABELS = { dame: 'Dáme', lov: 'Lov' };

// Campanhas por página. Dez cabem na tela sem rolagem e é o bastante para achar
// a de ontem — o histórico inteiro vive no Firestore, não precisa estar aqui.
const POR_PAGINA = 10;

function quando(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Já saiu alguma mensagem? Campanha antiga não tem `disparadaEm` (o campo é de
// 15/09 em diante), então os contadores também contam.
const foiEnviada = (c) => Boolean(c.disparadaEm || c.enviados || c.falhas || c.pulados);

// % do funil, sempre sobre a etapa anterior (enviados/alvo, entregues/enviados,
// lidos/entregues, usos/lidos). Teto de 100%: o webhook só anda o status para
// frente, então um "entregue" que chega depois do "lido" não soma em entregues
// e lidos pode passar deles — mostrar 104% seria ruído, não informação.
function Pct({ parte, base, titulo }) {
  if (!base || parte == null) return null;
  const v = Math.min(100, Math.round((parte / base) * 100));
  return <span className={styles.pct} title={`${v}% ${titulo}`}>{v}%</span>;
}

// "Todas as lojas" mostra tudo; com uma loja escolhida, só o que é dela.
const daEquipe = (lojaFiltro, lojasDoItem) =>
  !lojaFiltro || lojaFiltro === 'all' || lojasDoItem.includes(lojaFiltro);

export default function CampanhasPanel({
  campanhas, respostas, optOuts, podeEnviar, lojas, lojaLabels, lojaFiltro,
}) {
  const [pagina, setPagina] = useState(0);
  const [aberta, setAberta] = useState(null);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [ocupada, setOcupada] = useState(null);
  // Cópia de uma campanha para o formulário. `n` muda a cada clique e vira a
  // `key` do form, que assim nasce de novo com os campos da cópia.
  const [copia, setCopia] = useState(null);
  const formRef = useRef(null);
  const labels = lojaLabels || LOJA_LABELS;

  // Teste de envio não é campanha: fica fora da tela inteira. Sem `template`
  // é cabeçalho fantasma — o webhook recria com `merge` só os contadores de
  // uma campanha excluída quando um status atrasado chega depois.
  const daLoja = useMemo(
    () =>
      campanhas.filter(
        (c) =>
          !ehTeste(c) &&
          c.template &&
          (!lojaFiltro || lojaFiltro === 'all' || c.loja === lojaFiltro)
      ),
    [campanhas, lojaFiltro]
  );

  // Respostas e descadastros são da equipe cujo número recebeu a mensagem
  // (`loja`, gravada pelo webhook). Descadastro é por telefone e guarda
  // `lojas`: quem saiu das duas aparece nas duas.
  const respostasDaLoja = useMemo(
    () => respostas.filter((r) => daEquipe(lojaFiltro, r.loja ? [r.loja] : [])),
    [respostas, lojaFiltro]
  );
  const optOutsDaLoja = useMemo(
    () => optOuts.filter((o) => daEquipe(lojaFiltro, o.lojas || (o.loja ? [o.loja] : []))),
    [optOuts, lojaFiltro]
  );
  const saiuSet = useMemo(() => new Set(optOutsDaLoja.map((o) => o.telefone)), [optOutsDaLoja]);

  // Arquivar é o "não quero mais ver": some da lista principal e só aparece em
  // Arquivadas. Nada é apagado — é só um campo no documento.
  const arquivadasCount = useMemo(() => daLoja.filter((c) => c.arquivada === true).length, [daLoja]);
  const daAba = useMemo(
    () => daLoja.filter((c) => (verArquivadas ? c.arquivada === true : c.arquivada !== true)),
    [daLoja, verArquivadas]
  );

  // A campanha aberta vem da lista viva, não de uma cópia congelada: os
  // contadores continuam subindo pelo webhook enquanto a tela está aberta.
  const detalhe = aberta ? campanhas.find((c) => c.id === aberta) : null;
  if (detalhe) return <CampanhaDetalhe campanha={detalhe} onVoltar={() => setAberta(null)} />;

  const totalPaginas = Math.max(1, Math.ceil(daAba.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = daAba.slice(paginaAtual * POR_PAGINA, paginaAtual * POR_PAGINA + POR_PAGINA);

  const alternarAba = () => {
    setVerArquivadas((v) => !v);
    setPagina(0);
  };

  // Os botões ficam dentro da linha, que inteira abre a campanha: nenhum deles
  // pode abrir junto.
  const alternarArquivo = async (e, c) => {
    e.stopPropagation();
    setOcupada(c.id);
    try {
      await arquivarCampanha(c.id, !c.arquivada, auth.currentUser);
    } catch (err) {
      console.error('Arquivar campanha:', err);
      window.alert(`Não consegui ${c.arquivada ? 'desarquivar' : 'arquivar'}: ${err.message}`);
    } finally {
      setOcupada(null);
    }
  };

  const copiar = (e, c) => {
    e.stopPropagation();
    setCopia({
      n: Date.now(),
      dados: {
        loja: c.loja,
        titulo: `${c.titulo || c.template} (cópia)`,
        template: c.template || '',
        idioma: c.idioma || 'pt_BR',
        texto: c.texto || '',
        cupom: c.cupom || '',
        botaoTexto: c.botaoTexto || '',
        botaoUrl: c.botaoUrl || '',
      },
    });
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const excluir = async (e, c) => {
    e.stopPropagation();
    const nome = c.titulo || c.template;
    const ok = window.confirm(
      `Excluir a campanha "${nome}"? Tem certeza?\n\n` +
        (foiEnviada(c)
          ? `Ela já foi enviada para ${c.enviados || 0} cliente(s): os números dela somem da lista. `
          : '') +
        'Não tem como desfazer.'
    );
    if (!ok) return;
    setOcupada(c.id);
    try {
      await excluirCampanha(c.id);
    } catch (err) {
      console.error('Excluir campanha:', err);
      window.alert(`Não consegui excluir: ${err.message}`);
    } finally {
      setOcupada(null);
    }
  };

  const form = podeEnviar && (
    <CampanhaForm
      key={copia?.n || 'nova'}
      formRef={formRef}
      lojas={lojas}
      lojaLabels={labels}
      lojaPadrao={lojaFiltro && lojaFiltro !== 'all' ? lojaFiltro : null}
      inicial={copia?.dados || null}
    />
  );

  // O formulário de respostas fica FORA do early return: as respostas
  // automáticas precisam estar prontas antes do primeiro disparo, que é
  // exatamente quando ainda não existe campanha nenhuma para mostrar.
  const auto = <RespostasAutoForm ativo={podeEnviar} lojas={lojas} lojaLabels={labels} />;

  if (!daLoja.length && !respostasDaLoja.length) {
    return (
      <>
        {form}
        <div className={styles.empty}>
          <p>Nenhuma campanha salva ainda.</p>
          <span>
            Preencha o formulário acima e clique em <code>Salvar campanha</code>. Depois, na Lista,
            marque os clientes e escolha a campanha em <code>Enviar campanha</code>.
          </span>
        </div>
        {auto}
      </>
    );
  }

  return (
    <>
      {form}

      {daLoja.length > 0 && (
        <div className={styles.campanhasTopo}>
          <h3 className={styles.subTitulo}>
            {verArquivadas ? `Campanhas arquivadas (${daAba.length})` : `Campanhas (${daAba.length})`}
          </h3>
          {(arquivadasCount > 0 || verArquivadas) && (
            <button className={styles.ghostBtn} onClick={alternarAba} type="button">
              {verArquivadas ? '← Voltar' : `Arquivadas (${arquivadasCount})`}
            </button>
          )}
        </div>
      )}

      {daLoja.length > 0 && daAba.length === 0 && (
        <div className={styles.empty}>
          <p>{verArquivadas ? 'Nenhuma campanha arquivada.' : 'Todas as campanhas estão arquivadas.'}</p>
        </div>
      )}

      {daAba.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Campanha</th>
              <th className={styles.colData}>Quando</th>
              <th className={styles.colPedidos}>Alvo</th>
              <th className={styles.colPedidos}>Enviados</th>
              <th className={styles.colPedidos}>Entregues</th>
              <th className={styles.colPedidos}>Lidos</th>
              <th className={styles.colPedidos}>Usos</th>
              <th className={styles.colPedidos}>Falhas</th>
              <th className={styles.colAcoes} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => (
              <tr
                key={c.id}
                className={styles.linhaClicavel}
                onClick={() => setAberta(c.id)}
                title="Ver quem recebeu esta campanha"
              >
                <td data-label="Campanha" className={styles.nome}>
                  {c.titulo || c.template}
                  <span className={styles.brandChip}>{LOJA_LABELS[c.loja] || c.loja}</span>
                  {!foiEnviada(c) && <span className={styles.naoEnviadaChip}>não enviada</span>}
                  <span className={styles.subInfo}>
                    {[c.template, c.cupom && `código ${c.cupom}`, c.filtro].filter(Boolean).join(' · ')}
                  </span>
                </td>
                <td data-label="Quando" className={styles.colData}>{quando(c.disparadaEm || c.criadoEm)}</td>
                <td data-label="Alvo" className={`${styles.colPedidos} ${styles.num}`}>{c.totalAlvo ?? '—'}</td>
                <td data-label="Enviados" className={`${styles.colPedidos} ${styles.num}`}>
                  {c.enviados ?? 0}
                  <Pct parte={c.enviados} base={c.totalAlvo} titulo="do alvo" />
                </td>
                <td data-label="Entregues" className={`${styles.colPedidos} ${styles.num}`}>
                  {c.entregues ?? 0}
                  <Pct parte={c.entregues} base={c.enviados} titulo="dos enviados" />
                </td>
                <td data-label="Lidos" className={`${styles.colPedidos} ${styles.num}`}>
                  {c.lidos ?? 0}
                  <Pct parte={c.lidos} base={c.entregues} titulo="dos entregues" />
                </td>
                {/* Usos é digitado à mão dentro da campanha: a Meta não sabe quem
                    usou o cupom. Sem valor fica "—", não 0 — zero é um resultado. */}
                <td data-label="Usos" className={`${styles.colPedidos} ${styles.num}`}>
                  {c.usos ?? '—'}
                  {c.usos != null && <Pct parte={c.usos} base={c.lidos} titulo="dos lidos" />}
                </td>
                <td data-label="Falhas" className={`${styles.colPedidos} ${styles.num}`}>{c.falhas ?? 0}</td>
                <td className={styles.colAcoes}>
                  <button
                    className={styles.acaoBtn}
                    title="Copiar para uma nova campanha"
                    aria-label="Copiar para uma nova campanha"
                    onClick={(e) => copiar(e, c)}
                    disabled={!podeEnviar}
                    type="button"
                  >
                    <Icon k="copy" />
                  </button>
                  <button
                    className={styles.acaoBtn}
                    title={c.arquivada ? 'Desarquivar' : 'Arquivar'}
                    aria-label={c.arquivada ? 'Desarquivar' : 'Arquivar'}
                    onClick={(e) => alternarArquivo(e, c)}
                    disabled={ocupada === c.id}
                    type="button"
                  >
                    <Icon k={c.arquivada ? 'archiveRestore' : 'archive'} />
                  </button>
                  <button
                    className={`${styles.acaoBtn} ${styles.acaoPerigo}`}
                    title="Excluir"
                    aria-label="Excluir"
                    onClick={(e) => excluir(e, c)}
                    disabled={ocupada === c.id}
                    type="button"
                  >
                    <Icon k="trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPaginas > 1 && (
        <div className={styles.paginacao}>
          <button
            className={styles.ghostBtn}
            onClick={() => setPagina((n) => Math.max(0, n - 1))}
            disabled={paginaAtual === 0}
          >
            ← Anterior
          </button>
          <span className={styles.paginaInfo}>
            Página {paginaAtual + 1} de {totalPaginas} · {daAba.length} campanhas
          </span>
          <button
            className={styles.ghostBtn}
            onClick={() => setPagina((n) => Math.min(totalPaginas - 1, n + 1))}
            disabled={paginaAtual >= totalPaginas - 1}
          >
            Próxima →
          </button>
        </div>
      )}

      {respostasDaLoja.length > 0 && (
        <>
          <h3 className={styles.subTitulo}>
            Respostas ({respostasDaLoja.length}) · {optOutsDaLoja.length} pediram para sair
          </h3>
          <p className={styles.subInfoBloco}>
            Quem responde no número da campanha cai aqui — o número de campanha não é atendido por
            ninguém, então vale conferir de vez em quando.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th className={styles.colTel}>Telefone</th>
                <th>Resposta</th>
                <th className={styles.colData}>Quando</th>
              </tr>
            </thead>
            <tbody>
              {respostasDaLoja.map((r) => (
                <tr key={r.id}>
                  <td data-label="Cliente" className={styles.nome}>
                    {r.nome || <span className={styles.semNome}>Sem nome</span>}
                    {(!lojaFiltro || lojaFiltro === 'all') && r.loja && (
                      <span className={styles.brandChip}>{LOJA_LABELS[r.loja] || r.loja}</span>
                    )}
                    {saiuSet.has(r.telefone) && (
                      <span className={styles.optOutChip} title="Pediu para não receber mensagens">
                        descadastrado
                      </span>
                    )}
                  </td>
                  <td data-label="Telefone" className={styles.colTel}>
                    <a
                      className={styles.telLink}
                      href={`https://wa.me/55${r.telefone}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.telefone}
                    </a>
                  </td>
                  <td data-label="Resposta">{r.texto || '—'}</td>
                  <td data-label="Quando" className={styles.colData}>{quando(r.recebidoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {auto}
    </>
  );
}
