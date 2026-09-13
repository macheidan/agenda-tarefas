import { useState, useMemo } from 'react';
import CampanhaDetalhe from './CampanhaDetalhe';
import RespostasAutoForm from './RespostasAutoForm';
import { Icon } from './icons';
import { auth } from '../firebase';
import { arquivarCampanha } from '../hooks/useCampanhas';
import styles from '../styles/ClientesView.module.css';

// Painel de histórico da sub-seção Clientes: o que já foi disparado, o que os
// clientes responderam e quem pediu para sair. Divide o CSS module da
// ClientesView de propósito — é a mesma seção, com a mesma tabela.

const LOJA_LABELS = { dame: 'Dáme', lov: 'Lov' };

// Campanhas por página. Dez cabem na tela sem rolagem e é o bastante para achar
// a de ontem — o histórico inteiro vive no Firestore, não precisa estar aqui.
const POR_PAGINA = 10;

function quando(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CampanhasPanel({ campanhas, respostas, optOuts, podeEnviar, lojas, lojaLabels }) {
  const [pagina, setPagina] = useState(0);
  const [aberta, setAberta] = useState(null);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [arquivando, setArquivando] = useState(null);

  // Arquivar é o "não quero mais ver": some da lista principal e só aparece em
  // Arquivadas. Nada é apagado — é só um campo no documento.
  const arquivadasCount = useMemo(() => campanhas.filter((c) => c.arquivada === true).length, [campanhas]);
  const daAba = useMemo(
    () => campanhas.filter((c) => (verArquivadas ? c.arquivada === true : c.arquivada !== true)),
    [campanhas, verArquivadas]
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

  const alternarArquivo = async (e, c) => {
    // A linha inteira abre a campanha; o botão não pode abrir junto.
    e.stopPropagation();
    setArquivando(c.id);
    try {
      await arquivarCampanha(c.id, !c.arquivada, auth.currentUser);
    } catch (err) {
      console.error('Arquivar campanha:', err);
      window.alert(`Não consegui ${c.arquivada ? 'desarquivar' : 'arquivar'}: ${err.message}`);
    } finally {
      setArquivando(null);
    }
  };
  // O formulário fica FORA do early return: as respostas automáticas precisam
  // estar prontas antes do primeiro disparo, que é exatamente quando ainda não
  // existe campanha nenhuma para mostrar.
  const auto = <RespostasAutoForm ativo={podeEnviar} lojas={lojas} lojaLabels={lojaLabels || LOJA_LABELS} />;

  if (!campanhas.length && !respostas.length) {
    return (
      <>
        <div className={styles.empty}>
          <p>Nenhuma campanha disparada ainda.</p>
          <span>
            Escolha uma loja e uma faixa de dias na lista, e o botão{' '}
            <code>Enviar campanha</code> aparece com o recorte pronto.
          </span>
        </div>
        {auto}
      </>
    );
  }

  return (
    <>
      {campanhas.length > 0 && (
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

      {campanhas.length > 0 && daAba.length === 0 && (
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
              <th className={styles.colAcao} aria-label="Ações" />
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
                  {c.filtro && <span className={styles.subInfo}>{c.filtro}</span>}
                </td>
                <td data-label="Quando" className={styles.colData}>{quando(c.criadoEm)}</td>
                <td data-label="Alvo" className={`${styles.colPedidos} ${styles.num}`}>{c.totalAlvo ?? '—'}</td>
                <td data-label="Enviados" className={`${styles.colPedidos} ${styles.num}`}>{c.enviados ?? 0}</td>
                <td data-label="Entregues" className={`${styles.colPedidos} ${styles.num}`}>{c.entregues ?? 0}</td>
                <td data-label="Lidos" className={`${styles.colPedidos} ${styles.num}`}>{c.lidos ?? 0}</td>
                {/* Usos é digitado à mão dentro da campanha: a Meta não sabe quem
                    usou o cupom. Sem valor fica "—", não 0 — zero é um resultado. */}
                <td data-label="Usos" className={`${styles.colPedidos} ${styles.num}`}>{c.usos ?? '—'}</td>
                <td data-label="Falhas" className={`${styles.colPedidos} ${styles.num}`}>{c.falhas ?? 0}</td>
                <td className={styles.colAcao}>
                  <button
                    className={styles.acaoBtn}
                    title={c.arquivada ? 'Desarquivar' : 'Arquivar'}
                    aria-label={c.arquivada ? 'Desarquivar' : 'Arquivar'}
                    onClick={(e) => alternarArquivo(e, c)}
                    disabled={arquivando === c.id}
                    type="button"
                  >
                    <Icon k={c.arquivada ? 'archiveRestore' : 'archive'} />
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

      {respostas.length > 0 && (
        <>
          <h3 className={styles.subTitulo}>
            Respostas ({respostas.length}) · {optOuts.length} pediram para sair
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
              {respostas.map((r) => (
                <tr key={r.id}>
                  <td data-label="Cliente" className={styles.nome}>
                    {r.nome || <span className={styles.semNome}>Sem nome</span>}
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
