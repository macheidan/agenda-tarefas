import { useState, useMemo } from 'react';
import { useClientes, primeiroNome } from '../hooks/useClientes';
import { useCampanhas } from '../hooks/useCampanhas';
import CampanhaModal from './CampanhaModal';
import CampanhasPanel from './CampanhasPanel';
import styles from '../styles/ClientesView.module.css';

// As duas lojas são fixas, não derivadas dos dados: a loja precisa aparecer na
// barra mesmo com zero clientes importados, senão o filtro some justo quando
// alguém quer saber por que ela está vazia. Espelha LOJAS do SurveysView.
const LOJAS = [
  { key: 'dame', label: 'Dáme', flag: 'clientesVerDame' },
  { key: 'lov', label: 'Lov', flag: 'clientesVerLov' },
];
const LOJA_LABELS = Object.fromEntries(LOJAS.map((l) => [l.key, l.label]));

// Faixas de dias sem pedir. Cobrem a base inteira: a primeira começa em 0, então
// quem comprou hoje já entra nela — "Todos" e a soma das faixas batem.
const FAIXAS = [
  { key: '0', label: '0 a 30 dias', min: 0, max: 30, classe: null },
  { key: '31', label: '31 a 60 dias', min: 31, max: 60, classe: 'dias_31' },
  { key: '61', label: '61 a 90 dias', min: 61, max: 90, classe: 'dias_61' },
  { key: '91', label: '91+ dias', min: 91, max: Infinity, classe: 'dias_91' },
];

// Quem dá para incluir numa campanha e quem só existe como número. Metade da
// base chega pelo marketplace, que entrega nome, endereço e CPF mas mascara o
// telefone — sem esse recorte a tela misturaria as duas coisas.
const CONTATOS = [
  { key: 'todos', label: 'Todos' },
  { key: 'com', label: 'Com WhatsApp', teste: (c) => c.podeReceber },
  { key: 'sem', label: 'Sem contato', teste: (c) => !c.podeReceber },
];

const COLUNAS = {
  nome: (c) => (c.nome || '').toLowerCase(),
  telefone: (c) => c.telefone,
  bairro: (c) => (c.bairro || '').toLowerCase(),
  ultimaCompra: (c) => c.ultimaCompra || '',
  dias: (c) => c.dias,
  pedidos: (c) => c.pedidos,
  valorTotal: (c) => c.valorTotal,
  ticket: (c) => c.ticket,
};

const reais = (v) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const PAGINA = 200;

/** Meia-noite de hoje em UTC — a base guarda datas soltas (YYYY-MM-DD), então
 *  a conta de dias tem de ser feita fora do fuso, senão vira/perde um dia. */
function hojeUTC() {
  const agora = new Date();
  return Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

function diasSemPedir(iso, hoje) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return null;
  return Math.max(0, Math.round((hoje - Date.UTC(a, m - 1, d)) / 86400000));
}

function formatarData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function formatarTelefone(tel) {
  const t = String(tel || '');
  if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return t;
}

/** Número no formato que o wa.me espera (DDI + DDD + número). */
function paraWhatsapp(tel) {
  const t = String(tel || '');
  return t.startsWith('55') && t.length >= 12 ? t : `55${t}`;
}

const semAcento = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export default function ClientesView({ settings, isAdmin }) {
  const { clientes, meta, loading, error } = useClientes();
  const [faixa, setFaixa] = useState('todos');
  const [lojaFiltro, setLojaFiltro] = useState('all');
  const [contato, setContato] = useState('todos');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState({ campo: 'dias', dir: 'desc' });
  const [limite, setLimite] = useState(PAGINA);
  const [copiado, setCopiado] = useState(false);
  const [mostrarCampanhas, setMostrarCampanhas] = useState(false);
  const [modalCampanha, setModalCampanha] = useState(false);

  // Disparar campanha é permissão à parte de ver a lista: quem consulta cliente
  // não necessariamente pode mandar mensagem cobrada em nome da loja.
  const podeEnviar = isAdmin || settings?.clientesEnviar === true;
  const { campanhas, respostas, optOuts } = useCampanhas(podeEnviar);
  const optOutSet = useMemo(() => new Set(optOuts.map((o) => o.id)), [optOuts]);

  // Lojas liberadas pro usuário (default: as duas). Admin vê tudo.
  const lojas = useMemo(
    () => LOJAS.filter((l) => isAdmin || settings?.[l.flag] !== false),
    [settings, isAdmin]
  );

  // Quem só pode ver uma loja nunca escapa dela: o filtro é travado na
  // permissão, não no que a pessoa clicou.
  const permitidas = useMemo(() => new Set(lojas.map((l) => l.key)), [lojas]);
  const daLoja = useMemo(
    () => (lojas.length === LOJAS.length ? clientes : clientes.filter((c) => permitidas.has(c.loja))),
    [clientes, permitidas, lojas]
  );

  const hoje = useMemo(() => hojeUTC(), []);
  const comDias = useMemo(
    () =>
      daLoja.map((c) => ({ ...c, dias: diasSemPedir(c.ultimaCompra, hoje) ?? Infinity })),
    [daLoja, hoje]
  );

  const daMarca = useMemo(() => {
    const base = lojaFiltro === 'all' ? comDias : comDias.filter((c) => c.loja === lojaFiltro);
    const teste = CONTATOS.find((c) => c.key === contato)?.teste;
    return teste ? base.filter(teste) : base;
  }, [comDias, lojaFiltro, contato]);

  // Busca por nome ou telefone: dígitos na busca viram busca de telefone, o
  // resto casa com o nome sem acento.
  const buscados = useMemo(() => {
    const termo = busca.trim();
    if (!termo) return daMarca;
    const digitos = termo.replace(/\D/g, '');
    const texto = semAcento(termo);
    return daMarca.filter(
      (c) =>
        (digitos.length >= 3 && c.telefone.includes(digitos)) ||
        (texto && semAcento(c.nome).includes(texto))
    );
  }, [daMarca, busca]);

  const contagens = useMemo(() => {
    const out = { todos: buscados.length };
    for (const f of FAIXAS) {
      out[f.key] = buscados.filter((c) => c.dias >= f.min && c.dias <= f.max).length;
    }
    return out;
  }, [buscados]);

  const filtrados = useMemo(() => {
    const f = FAIXAS.find((x) => x.key === faixa);
    const base = f ? buscados.filter((c) => c.dias >= f.min && c.dias <= f.max) : buscados;
    const pegar = COLUNAS[ordem.campo] || COLUNAS.dias;
    const sinal = ordem.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = pegar(a);
      const vb = pegar(b);
      if (va === vb) return (a.nome || '').localeCompare(b.nome || '');
      return va > vb ? sinal : -sinal;
    });
  }, [buscados, faixa, ordem]);

  const visiveis = filtrados.slice(0, limite);
  const marcasComDados = useMemo(() => new Set(daLoja.map((c) => c.loja)), [daLoja]);

  // Contagem de cada recorte de contato dentro da loja escolhida — sem passar
  // pelo próprio filtro, senão o botão não selecionado mostraria zero.
  const contagemContato = useMemo(() => {
    const base = lojaFiltro === 'all' ? comDias : comDias.filter((c) => c.loja === lojaFiltro);
    const out = { todos: base.length };
    for (const c of CONTATOS) {
      if (c.teste) out[c.key] = base.filter(c.teste).length;
    }
    return out;
  }, [comDias, lojaFiltro]);

  // Soma do recorte na tela: é o que transforma a lista numa leitura de
  // faturamento ("os 91+ dias levaram R$ X embora").
  const totais = useMemo(() => {
    const valor = filtrados.reduce((s, c) => s + (c.valorTotal || 0), 0);
    const pedidos = filtrados.reduce((s, c) => s + (c.pedidos || 0), 0);
    return { valor, pedidos, ticket: pedidos ? valor / pedidos : 0 };
  }, [filtrados]);

  // Todo filtro volta pro topo da lista — senão a pessoa continua vendo o
  // "mostrar mais" de um recorte que não existe mais.
  const trocarFaixa = (v) => { setFaixa(v); setLimite(PAGINA); };
  const trocarLoja = (v) => { setLojaFiltro(v); setLimite(PAGINA); };
  const trocarContato = (v) => { setContato(v); setLimite(PAGINA); };
  const trocarBusca = (v) => { setBusca(v); setLimite(PAGINA); };

  const ordenarPor = (campo) => {
    setLimite(PAGINA);
    setOrdem((o) =>
      o.campo === campo
        ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' }
        : { campo, dir: campo === 'nome' || campo === 'telefone' ? 'asc' : 'desc' }
    );
  };

  const seta = (campo) =>
    ordem.campo === campo ? <span className={styles.sortSeta}>{ordem.dir === 'asc' ? '▲' : '▼'}</span> : null;

  // Quem não tem telefone com DDD do RS não entra em lista de contato nenhuma —
  // nem na cópia, nem no disparo. Continua contando no resto da tela.
  const comWhatsapp = useMemo(() => filtrados.filter((c) => c.podeReceber), [filtrados]);

  const copiarLista = async () => {
    const texto = comWhatsapp
      .map((c) => `${primeiroNome(c.nome)},${paraWhatsapp(c.telefone)}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.alert('Não consegui copiar — o navegador bloqueou a área de transferência.');
    }
  };

  // Campanha é por loja: cada marca dispara do seu próprio número na Meta, então
  // "Todas as lojas" não tem de onde sair. Quem só enxerga uma loja não precisa
  // escolher nada.
  const lojaAlvo = lojaFiltro !== 'all' ? lojaFiltro : lojas.length === 1 ? lojas[0].key : null;

  // Descadastrado nunca entra no disparo. Ele continua na tabela, marcado — some
  // da lista seria pior: ninguém entenderia por que o total não bate.
  const destinatarios = useMemo(
    () =>
      comWhatsapp
        .filter((c) => !optOutSet.has(c.telefone))
        .map((c) => ({ telefone: c.telefone, nome: primeiroNome(c.nome) })),
    [comWhatsapp, optOutSet]
  );

  const faixaAtual = FAIXAS.find((f) => f.key === faixa);
  const filtroDesc = [
    faixaAtual ? faixaAtual.label : 'todos os dias',
    lojaAlvo ? LOJA_LABELS[lojaAlvo] : 'todas as lojas',
    busca.trim() ? `busca "${busca.trim()}"` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // "Atualizado em" vem do meta da coleta, não do relógio do navegador: é o que
  // diz se a lista de hoje já subiu.
  const atualizadoEm = useMemo(() => {
    const datas = lojas
      .map((l) => meta[l.key]?.atualizadoEm?.toDate?.())
      .filter(Boolean)
      .sort((a, b) => b - a);
    return datas[0] || null;
  }, [meta, lojas]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Clientes</h2>
        <div className={styles.headerActions}>
          <button
            className={`${styles.sectionTab} ${faixa === 'todos' ? styles.sectionTabActive : ''}`}
            onClick={() => trocarFaixa('todos')}
          >
            Todos ({contagens.todos})
          </button>
          {FAIXAS.map((f) => (
            <button
              key={f.key}
              className={`${styles.sectionTab} ${faixa === f.key ? styles.sectionTabActive : ''}`}
              onClick={() => trocarFaixa(f.key)}
            >
              {f.label} ({contagens[f.key]})
            </button>
          ))}
          {podeEnviar && (
            <button
              className={`${styles.sectionTab} ${mostrarCampanhas ? styles.sectionTabActive : ''}`}
              onClick={() => setMostrarCampanhas((v) => !v)}
            >
              {mostrarCampanhas ? 'Voltar' : `Campanhas (${campanhas.length})`}
            </button>
          )}
        </div>
      </div>

      {lojas.length > 1 && (
        <div className={styles.storeBar}>
          <button
            className={`${styles.sectionTab} ${lojaFiltro === 'all' ? styles.sectionTabActive : ''}`}
            onClick={() => trocarLoja('all')}
          >
            Todas as lojas
          </button>
          {lojas.map((l) => (
            <button
              key={l.key}
              className={`${styles.sectionTab} ${lojaFiltro === l.key ? styles.sectionTabActive : ''}`}
              onClick={() => trocarLoja(l.key)}
            >
              {l.label} ({comDias.filter((c) => c.loja === l.key).length})
            </button>
          ))}
        </div>
      )}

      <div className={styles.storeBar}>
        {CONTATOS.map((c) => (
          <button
            key={c.key}
            className={`${styles.sectionTab} ${contato === c.key ? styles.sectionTabActive : ''}`}
            onClick={() => trocarContato(c.key)}
            title={
              c.key === 'sem'
                ? 'Cliente que chegou pelo marketplace: tem nome, bairro e histórico, mas o telefone vem mascarado'
                : undefined
            }
          >
            {c.label} ({contagemContato[c.key] ?? 0})
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          value={busca}
          onChange={(e) => trocarBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          aria-label="Buscar por nome ou telefone"
        />
        <span className={styles.resumo}>
          <strong>{filtrados.length}</strong> cliente{filtrados.length === 1 ? '' : 's'} · histórico
          de <strong>{reais(totais.valor)}</strong> em {totais.pedidos} pedido
          {totais.pedidos === 1 ? '' : 's'} · ticket {reais(totais.ticket)}
          {atualizadoEm && ` · atualizado em ${atualizadoEm.toLocaleDateString('pt-BR')}`}
        </span>
        <button
          className={styles.ghostBtn}
          onClick={copiarLista}
          disabled={comWhatsapp.length === 0}
          title="Copia primeiro nome e telefone, um por linha, separados por vírgula"
        >
          {copiado ? 'Copiado!' : `Copiar nomes + telefones (${comWhatsapp.length})`}
        </button>
        {podeEnviar && (
          <button
            className={styles.primaryBtn}
            onClick={() => setModalCampanha(true)}
            disabled={!lojaAlvo || destinatarios.length === 0}
            title={
              lojaAlvo
                ? 'Dispara o template aprovado na Meta para este recorte'
                : 'Escolha uma loja — cada marca dispara do seu próprio número'
            }
          >
            Enviar campanha ({destinatarios.length})
          </button>
        )}
      </div>

      {mostrarCampanhas ? (
        <CampanhasPanel campanhas={campanhas} respostas={respostas} optOuts={optOuts} />
      ) : (
        <>
      {loading && (
        <div className={styles.empty}>
          <p>Carregando clientes…</p>
        </div>
      )}

      {!loading && error && (
        <div className={styles.empty}>
          <p>Não foi possível carregar os clientes.</p>
          <span>
            {error.code === 'permission-denied'
              ? 'Sem permissão para ler a coleção clientes — publique as firestore.rules.'
              : error.message}
          </span>
        </div>
      )}

      {!loading && !error && daLoja.length === 0 && (
        <div className={styles.empty}>
          <p>Nenhum cliente importado ainda.</p>
          <span>
            A coleta roda de madrugada (<code>scripts/clientes/run_clientes.cmd</code>) e traz quem
            comprou nos últimos 90 dias.
          </span>
        </div>
      )}

      {!loading && !error && daLoja.length > 0 && filtrados.length === 0 && (
        <div className={styles.empty}>
          <p>Nenhum cliente nesse filtro.</p>
          {faixa === '91' && (
            <span>
              A faixa de 91+ dias se forma com o tempo: a coleta só traz quem comprou nos últimos 90
              dias, e quem já está aqui vai envelhecendo.
            </span>
          )}
        </div>
      )}

      {filtrados.length > 0 && (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thSort} onClick={() => ordenarPor('nome')}>
                  Nome {seta('nome')}
                </th>
                <th className={`${styles.colTel} ${styles.thSort}`} onClick={() => ordenarPor('telefone')}>
                  Telefone {seta('telefone')}
                </th>
                <th className={`${styles.colBairro} ${styles.thSort}`} onClick={() => ordenarPor('bairro')}>
                  Bairro {seta('bairro')}
                </th>
                <th className={`${styles.colData} ${styles.thSort}`} onClick={() => ordenarPor('ultimaCompra')}>
                  Última compra {seta('ultimaCompra')}
                </th>
                <th className={`${styles.colDias} ${styles.thSort}`} onClick={() => ordenarPor('dias')}>
                  Dias sem pedir {seta('dias')}
                </th>
                <th className={`${styles.colPedidos} ${styles.thSort}`} onClick={() => ordenarPor('pedidos')}>
                  Pedidos {seta('pedidos')}
                </th>
                <th
                  className={`${styles.colValor} ${styles.thSort}`}
                  onClick={() => ordenarPor('valorTotal')}
                  title="Tudo o que o cliente já gastou na loja, não só na janela de 90 dias"
                >
                  Total {seta('valorTotal')}
                </th>
                <th className={`${styles.colValor} ${styles.thSort}`} onClick={() => ordenarPor('ticket')}>
                  Ticket {seta('ticket')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => {
                const f = FAIXAS.find((x) => c.dias >= x.min && c.dias <= x.max);
                return (
                  <tr key={`${c.loja}_${c.chave}`} className={f?.classe ? styles[f.classe] : ''}>
                    <td data-label="Nome" className={styles.nome}>
                      {c.nome || <span className={styles.semNome}>Sem nome</span>}
                      {lojaFiltro === 'all' && marcasComDados.size > 1 && (
                        <span className={styles.brandChip}>{LOJA_LABELS[c.loja] || c.loja}</span>
                      )}
                      {optOutSet.has(c.telefone) && (
                        <span className={styles.optOutChip} title="Pediu para não receber mensagens">
                          descadastrado
                        </span>
                      )}
                    </td>
                    <td data-label="Telefone" className={styles.colTel}>
                      {c.telefone ? (
                        <a
                          className={styles.telLink}
                          href={`https://wa.me/${paraWhatsapp(c.telefone)}`}
                          target="_blank"
                          rel="noreferrer"
                          title={
                            c.telefoneOrigem
                              ? `Telefone de outro cadastro do mesmo cliente (casado por ${
                                  c.telefoneOrigem === 'cpf' ? 'CPF' : 'nome e endereço'
                                })`
                              : 'Abrir conversa no WhatsApp'
                          }
                        >
                          {formatarTelefone(c.telefone)}
                          {c.telefoneOrigem ? ' *' : ''}
                        </a>
                      ) : (
                        <span className={styles.semNome} title="Pedido de marketplace: telefone mascarado">
                          sem contato
                        </span>
                      )}
                    </td>
                    <td data-label="Bairro" className={styles.colBairro}>
                      {c.bairro || '—'}
                    </td>
                    <td data-label="Última compra" className={styles.colData}>
                      {formatarData(c.ultimaCompra)}
                    </td>
                    <td data-label="Dias sem pedir" className={`${styles.colDias} ${styles.num}`}>
                      {Number.isFinite(c.dias) ? c.dias : '—'}
                    </td>
                    <td data-label="Pedidos" className={`${styles.colPedidos} ${styles.num}`}>
                      {c.pedidos}
                    </td>
                    <td data-label="Total" className={`${styles.colValor} ${styles.num}`}>
                      {reais(c.valorTotal)}
                    </td>
                    <td data-label="Ticket" className={`${styles.colValor} ${styles.num}`}>
                      {reais(c.ticket)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtrados.length > visiveis.length && (
            <div className={styles.maisRow}>
              <button className={styles.ghostBtn} onClick={() => setLimite((n) => n + PAGINA)}>
                Mostrar mais ({filtrados.length - visiveis.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
        </>
      )}

      <CampanhaModal
        open={modalCampanha}
        onClose={() => setModalCampanha(false)}
        loja={lojaAlvo}
        lojaLabel={LOJA_LABELS[lojaAlvo] || ''}
        destinatarios={destinatarios}
        filtroDesc={filtroDesc}
      />
    </div>
  );
}
