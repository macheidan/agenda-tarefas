import { useState, useEffect, useMemo } from 'react';
import { useClientes, primeiroNome } from '../hooks/useClientes';
import { useCampanhas } from '../hooks/useCampanhas';
import { segmentoDe, SEGMENTOS } from '../utils/relatoriosClientes';
import CampanhaModal from './CampanhaModal';
import CampanhasPanel from './CampanhasPanel';
import ClientesRelatorios from './ClientesRelatorios';
import styles from '../styles/ClientesView.module.css';

// As duas lojas são fixas, não derivadas dos dados: a loja precisa aparecer na
// barra mesmo com zero clientes importados, senão o filtro some justo quando
// alguém quer saber por que ela está vazia. Espelha LOJAS do SurveysView.
const LOJAS = [
  { key: 'dame', label: 'Dáme', flag: 'clientesVerDame' },
  { key: 'lov', label: 'Lov', flag: 'clientesVerLov' },
];
const LOJA_LABELS = Object.fromEntries(LOJAS.map((l) => [l.key, l.label]));

// Cor de fundo da linha por quanto tempo o cliente está sumido. Já foram botões
// de filtro; a régua de dois pontos faz o corte melhor (e em qualquer valor),
// então sobrou o que os botões nunca deram: enxergar a temperatura da lista
// enquanto se rola por ela.
const FAIXAS = [
  { min: 0, max: 30, classe: null },
  { min: 31, max: 60, classe: 'dias_31' },
  { min: 61, max: 90, classe: 'dias_61' },
  { min: 91, max: Infinity, classe: 'dias_91' },
];

// Quem dá para incluir numa campanha e quem só existe como número. Metade da
// base chega pelo marketplace, que entrega nome, endereço e CPF mas mascara o
// telefone — sem esse recorte a tela misturaria as duas coisas.
const CONTATOS = [
  { key: 'todos', label: 'Todos' },
  { key: 'com', label: 'Com WhatsApp', teste: (c) => c.podeReceber },
  { key: 'sem', label: 'Sem contato', teste: (c) => !c.podeReceber },
];

// Sub-seções da aba. A lista é a casa: relatórios e campanhas são leituras
// dela, não seções paralelas — por isso dividem o mesmo seletor de loja.
const SUBS = [
  { key: 'lista', label: 'Lista' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'campanhas', label: 'Campanhas', restrita: true },
];

const SEG_LABELS = Object.fromEntries(SEGMENTOS.map((s) => [s.key, s.label]));

const COLUNAS = {
  nome: (c) => (c.nome || '').toLowerCase(),
  telefone: (c) => c.telefone,
  bairro: (c) => (c.bairro || '').toLowerCase(),
  ultimaCompra: (c) => c.ultimaCompra || '',
  dias: (c) => c.dias,
  pedidos: (c) => c.pedidos,
  valorTotal: (c) => c.valorTotal,
  ticket: (c) => c.ticket,
  // Sem histórico coletado a frequência é null: vai para o fim da ordenação em
  // vez de empatar com quem de fato não compra.
  frequencia: (c) => (c.frequencia === null ? -1 : c.frequencia),
};

/** "1,5" pedido por mês. Uma casa decimal — duas fingem uma precisão que a
 *  medida não tem. */
const porMes = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const reais = (v) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const PAGINA = 200;

// Fim da régua de dias sem pedir: um ano. Quem passou disso continua na lista —
// o ponto direito no fim da régua significa "sem teto", não 365.
const REGUA_MAX = 365;

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
  const { clientes, meta, coberturaDesde, loading, error } = useClientes();
  // Janela de dias sem pedir. `max: null` é "sem teto" — é o que mantém a faixa
  // de 91+ dias funcionando quando a base envelhece além do fim da régua.
  const [janela, setJanela] = useState({ min: 0, max: null });
  const [lojaFiltro, setLojaFiltro] = useState('all');
  const [contato, setContato] = useState('todos');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState({ campo: 'dias', dir: 'desc' });
  const [limite, setLimite] = useState(PAGINA);
  const [copiado, setCopiado] = useState(false);
  const [modalCampanha, setModalCampanha] = useState(false);
  // Recorte por segmento RFV, ligado a partir do relatório. Fica na lista (e não
  // nos relatórios) porque o destino de clicar num segmento é justamente a lista
  // pronta para copiar ou disparar.
  const [segmentoFiltro, setSegmentoFiltro] = useState(null);
  // Sub-seção vem do ?sub= (mesmo padrão de Preços e Suprimentos), pra que o F5
  // volte no relatório aberto em vez de cair sempre na lista.
  const [sub, setSub] = useState(() => {
    try {
      const s = new URLSearchParams(window.location.search).get('sub');
      return SUBS.some((x) => x.key === s) ? s : 'lista';
    } catch { return 'lista'; }
  });

  // Disparar campanha é permissão à parte de ver a lista: quem consulta cliente
  // não necessariamente pode mandar mensagem cobrada em nome da loja.
  const podeEnviar = isAdmin || settings?.clientesEnviar === true;
  const { campanhas, respostas, optOuts } = useCampanhas(podeEnviar);
  const optOutSet = useMemo(() => new Set(optOuts.map((o) => o.id)), [optOuts]);

  // Quem não pode disparar não tem aba de campanhas — nem por URL montada.
  const subsVisiveis = useMemo(() => SUBS.filter((x) => !x.restrita || podeEnviar), [podeEnviar]);
  const subAtiva = subsVisiveis.some((x) => x.key === sub) ? sub : 'lista';

  // Espelha a sub-seção EXIBIDA na URL, como o Dashboard faz com ?tab=.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('sub') === subAtiva) return;
      url.searchParams.set('sub', subAtiva);
      window.history.replaceState(null, '', url);
    } catch { /* URL malformada: a navegação por estado segue funcionando */ }
  }, [subAtiva]);

  // Lojas liberadas pro usuário (default: as duas). Admin vê tudo.
  const lojas = useMemo(
    () => LOJAS.filter((l) => isAdmin || settings?.[l.flag] !== false),
    [settings, isAdmin]
  );

  // Quem só pode ver uma loja nunca escapa dela: o filtro é travado na
  // permissão, não no que a pessoa clicou.
  const permitidas = useMemo(() => new Set(lojas.map((l) => l.key)), [lojas]);
  // Array estável: os relatórios varrem milhares de clientes num useMemo, e um
  // `.map()` solto no JSX invalidaria a memo a cada render.
  const lojaKeys = useMemo(() => lojas.map((l) => l.key), [lojas]);
  const daLoja = useMemo(
    () => (lojas.length === LOJAS.length ? clientes : clientes.filter((c) => permitidas.has(c.loja))),
    [clientes, permitidas, lojas]
  );

  const hoje = useMemo(() => hojeUTC(), []);
  // O timestamp acima é meia-noite UTC (conta de dias); os relatórios contam
  // MESES e precisam do calendário local — daí as duas referências.
  const hojeData = useMemo(() => new Date(), []);
  const comDias = useMemo(
    () =>
      daLoja.map((c) => ({ ...c, dias: diasSemPedir(c.ultimaCompra, hoje) ?? Infinity })),
    [daLoja, hoje]
  );

  // A lista de uma loja só, sem os outros filtros: é o que os relatórios leem —
  // bairro e coorte não podem depender de onde a régua de dias parou.
  const daLojaEscolhida = useMemo(
    () => (lojaFiltro === 'all' ? comDias : comDias.filter((c) => c.loja === lojaFiltro)),
    [comDias, lojaFiltro]
  );

  const daMarca = useMemo(() => {
    const teste = CONTATOS.find((c) => c.key === contato)?.teste;
    let base = teste ? daLojaEscolhida.filter(teste) : daLojaEscolhida;
    if (segmentoFiltro) base = base.filter((c) => segmentoDe(c, hojeData) === segmentoFiltro);
    return base;
  }, [daLojaEscolhida, contato, segmentoFiltro, hojeData]);

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

  const filtrados = useMemo(() => {
    const base = buscados.filter(
      (c) => c.dias >= janela.min && (janela.max === null || c.dias <= janela.max)
    );
    const pegar = COLUNAS[ordem.campo] || COLUNAS.dias;
    const sinal = ordem.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = pegar(a);
      const vb = pegar(b);
      if (va === vb) return (a.nome || '').localeCompare(b.nome || '');
      return va > vb ? sinal : -sinal;
    });
  }, [buscados, janela, ordem]);

  const visiveis = filtrados.slice(0, limite);
  const marcasComDados = useMemo(() => new Set(daLoja.map((c) => c.loja)), [daLoja]);

  // Contagem de cada recorte de contato dentro da loja escolhida — sem passar
  // pelo próprio filtro, senão o botão não selecionado mostraria zero.
  const contagemContato = useMemo(() => {
    const base = daLojaEscolhida;
    const out = { todos: base.length };
    for (const c of CONTATOS) {
      if (c.teste) out[c.key] = base.filter(c.teste).length;
    }
    return out;
  }, [daLojaEscolhida]);

  // Soma do recorte na tela: é o que transforma a lista numa leitura de
  // faturamento ("os 91+ dias levaram R$ X embora").
  const totais = useMemo(() => {
    const valor = filtrados.reduce((s, c) => s + (c.valorTotal || 0), 0);
    const pedidos = filtrados.reduce((s, c) => s + (c.pedidos || 0), 0);
    return { valor, pedidos, ticket: pedidos ? valor / pedidos : 0 };
  }, [filtrados]);

  // Todo filtro volta pro topo da lista — senão a pessoa continua vendo o
  // "mostrar mais" de um recorte que não existe mais.
  const trocarJanela = (nova) => { setJanela(nova); setLimite(PAGINA); };
  const trocarLoja = (v) => { setLojaFiltro(v); setLimite(PAGINA); };
  const trocarContato = (v) => { setContato(v); setLimite(PAGINA); };
  const trocarBusca = (v) => { setBusca(v); setLimite(PAGINA); };

  // Clicar num segmento no relatório leva pra lista já filtrada. A janela de
  // dias volta pra "todos" de propósito: o segmento já carrega a recência dele,
  // e manter os dois cortes daria uma lista vazia sem explicação.
  const verSegmento = (key) => {
    setSegmentoFiltro(key);
    setJanela({ min: 0, max: null });
    setLimite(PAGINA);
    setSub('lista');
  };

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

  const todosAtivo = janela.min === 0 && janela.max === null;
  const janelaDesc = janela.max === null ? `${janela.min}+ dias` : `${janela.min} a ${janela.max} dias`;

  // Sem teto, o ponto da direita mora no fim da régua.
  const maxValor = janela.max === null ? REGUA_MAX : Math.min(janela.max, REGUA_MAX);
  const pctMin = (Math.min(janela.min, REGUA_MAX) / REGUA_MAX) * 100;
  const pctMax = (maxValor / REGUA_MAX) * 100;

  // Um ponto nunca passa do outro: o que sobrar do arrasto vira empate.
  const mudarMin = (v) => trocarJanela({ ...janela, min: Math.min(Number(v), maxValor) });
  const mudarMax = (v) => {
    const n = Math.max(Number(v), janela.min);
    trocarJanela({ ...janela, max: n >= REGUA_MAX ? null : n });
  };

  const filtroDesc = [
    todosAtivo ? 'todos os dias' : janelaDesc,
    lojaAlvo ? LOJA_LABELS[lojaAlvo] : 'todas as lojas',
    segmentoFiltro ? `segmento ${SEG_LABELS[segmentoFiltro]}` : null,
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
          {subsVisiveis.map((x) => (
            <button
              key={x.key}
              className={`${styles.sectionTab} ${subAtiva === x.key ? styles.sectionTabActive : ''}`}
              onClick={() => setSub(x.key)}
            >
              {x.label}
              {x.key === 'campanhas' ? ` (${campanhas.length})` : ''}
            </button>
          ))}
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

      {subAtiva === 'lista' && (
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
      )}

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

      {subAtiva === 'lista' && (
        <>
      {/* Régua de dois pontos: o único corte por tempo da tela. Substituiu os
          botões de faixa (0 a 30, 31 a 60…) porque faz o mesmo e mais — "quem
          sumiu entre 45 e 70 dias" não tinha botão. Arrastar o ponto direito
          até o fim solta o teto; senão quem está além da régua sumiria. */}
      <div className={styles.reguaBox}>
        <div className={styles.reguaTopo}>
          <span className={styles.reguaLabel}>Dias sem pedir</span>
          <strong className={styles.reguaValor}>{todosAtivo ? 'todos' : janelaDesc}</strong>
        </div>
        <div className={styles.regua}>
          <div className={styles.trilho} />
          <div
            className={styles.trilhoAtivo}
            style={{ left: `${pctMin}%`, width: `${Math.max(0, pctMax - pctMin)}%` }}
          />
          <input
            className={styles.pontoRegua}
            type="range"
            min="0"
            max={REGUA_MAX}
            value={janela.min}
            // Os dois pontos podem se encostar; quem fica por cima é sempre o
            // que ainda tem para onde ir, senão um deles fica impossível de pegar.
            style={{ zIndex: pctMin >= 100 ? 3 : 5 }}
            onChange={(e) => mudarMin(e.target.value)}
            aria-label="Mínimo de dias sem pedir"
            aria-valuetext={`a partir de ${janela.min} dias`}
          />
          <input
            className={styles.pontoRegua}
            type="range"
            min="0"
            max={REGUA_MAX}
            value={maxValor}
            style={{ zIndex: pctMin >= 100 ? 5 : 4 }}
            onChange={(e) => mudarMax(e.target.value)}
            aria-label="Máximo de dias sem pedir"
            aria-valuetext={janela.max === null ? 'sem limite' : `até ${janela.max} dias`}
          />
        </div>
        <div className={styles.reguaEscala}>
          <span>0</span>
          <span>{REGUA_MAX}+</span>
        </div>
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
        {segmentoFiltro && (
          <button
            className={styles.filtroChip}
            onClick={() => { setSegmentoFiltro(null); setLimite(PAGINA); }}
            title="Voltar para a base inteira"
          >
            Segmento: {SEG_LABELS[segmentoFiltro]} <span aria-hidden="true">✕</span>
          </button>
        )}
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
          {janela.min >= 91 && (
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
                <th
                  className={`${styles.colFreq} ${styles.thSort}`}
                  onClick={() => ordenarPor('frequencia')}
                  title="Pedidos por mês nos últimos 6 meses"
                >
                  Frequência {seta('frequencia')}
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
                    <td
                      data-label="Frequência"
                      className={`${styles.colFreq} ${styles.num}`}
                      title={
                        c.frequencia === null
                          ? 'Histórico de pedidos ainda não coletado'
                          : `${c.pedidos6m} pedido${c.pedidos6m === 1 ? '' : 's'} em 6 meses` +
                            (c.intervaloDias ? ` · 1 a cada ${Math.round(c.intervaloDias)} dias` : '') +
                            (c.primeiraCompra ? ` · cliente desde ${formatarData(c.primeiraCompra)}` : '')
                      }
                    >
                      {c.frequencia === null ? '—' : `${porMes(c.frequencia)}/mês`}
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

      {subAtiva === 'relatorios' && !loading && !error && (
        <ClientesRelatorios
          clientes={daLojaEscolhida}
          hoje={hojeData}
          coberturaDesde={coberturaDesde}
          lojas={lojaKeys}
          lojaLabels={LOJA_LABELS}
          lojaFiltro={lojaFiltro}
          onVerSegmento={verSegmento}
        />
      )}

      {subAtiva === 'campanhas' && (
        <CampanhasPanel campanhas={campanhas} respostas={respostas} optOuts={optOuts} />
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
