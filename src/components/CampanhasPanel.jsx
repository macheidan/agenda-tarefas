import styles from '../styles/ClientesView.module.css';

// Painel de histórico da sub-seção Clientes: o que já foi disparado, o que os
// clientes responderam e quem pediu para sair. Divide o CSS module da
// ClientesView de propósito — é a mesma seção, com a mesma tabela.

const LOJA_LABELS = { dame: 'Dáme', lov: 'Lov' };

function quando(ts) {
  const d = ts?.toDate?.();
  if (!d) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CampanhasPanel({ campanhas, respostas, optOuts }) {
  if (!campanhas.length && !respostas.length) {
    return (
      <div className={styles.empty}>
        <p>Nenhuma campanha disparada ainda.</p>
        <span>
          Escolha uma loja e uma faixa de dias na lista, e o botão{' '}
          <code>Enviar campanha</code> aparece com o recorte pronto.
        </span>
      </div>
    );
  }

  return (
    <>
      {campanhas.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Campanha</th>
              <th className={styles.colData}>Quando</th>
              <th className={styles.colPedidos}>Alvo</th>
              <th className={styles.colPedidos}>Enviados</th>
              <th className={styles.colPedidos}>Entregues</th>
              <th className={styles.colPedidos}>Lidos</th>
              <th className={styles.colPedidos}>Falhas</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id}>
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
                <td data-label="Falhas" className={`${styles.colPedidos} ${styles.num}`}>{c.falhas ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </>
  );
}
