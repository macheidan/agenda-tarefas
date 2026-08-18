import { useState, useMemo } from 'react';
import { useClientes } from '../hooks/useClientes';
import styles from '../styles/ClientesView.module.css';

// As duas lojas são fixas, não derivadas dos dados: a loja precisa aparecer na
// barra mesmo com zero clientes importados, senão o filtro some justo quando
// alguém quer saber por que ela está vazia. Espelha LOJAS do SurveysView.
const LOJAS = [
  { key: 'dame', label: 'Dáme', flag: 'clientesVerDame' },
  { key: 'lov', label: 'Lov', flag: 'clientesVerLov' },
];
const LOJA_LABELS = Object.fromEntries(LOJAS.map((l) => [l.key, l.label]));

// Faixas de dias sem pedir. Quem comprou nos últimos 6 dias não entra em
// nenhuma delas (não é alvo de recuperação) — aparece só em "Todos".
const FAIXAS = [
  { key: '7', label: '7 a 30 dias', min: 7, max: 30, classe: null },
  { key: '31', label: '31 a 60 dias', min: 31, max: 60, classe: 'dias_31' },
  { key: '61', label: '61 a 90 dias', min: 61, max: 90, classe: 'dias_61' },
  { key: '91', label: '91+ dias', min: 91, max: Infinity, classe: 'dias_91' },
];

const COLUNAS = {
  nome: (c) => (c.nome || '').toLowerCase(),
  telefone: (c) => c.telefone,
  ultimaCompra: (c) => c.ultimaCompra || '',
  dias: (c) => c.dias,
  pedidos: (c) => c.pedidos,
};

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
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState({ campo: 'dias', dir: 'desc' });
  const [limite, setLimite] = useState(PAGINA);
  const [copiado, setCopiado] = useState(false);

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

  const daMarca = useMemo(
    () => (lojaFiltro === 'all' ? comDias : comDias.filter((c) => c.loja === lojaFiltro)),
    [comDias, lojaFiltro]
  );

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

  // Todo filtro volta pro topo da lista — senão a pessoa continua vendo o
  // "mostrar mais" de um recorte que não existe mais.
  const trocarFaixa = (v) => { setFaixa(v); setLimite(PAGINA); };
  const trocarLoja = (v) => { setLojaFiltro(v); setLimite(PAGINA); };
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

  const copiarTelefones = async () => {
    try {
      await navigator.clipboard.writeText(filtrados.map((c) => paraWhatsapp(c.telefone)).join('\n'));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.alert('Não consegui copiar — o navegador bloqueou a área de transferência.');
    }
  };

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
          <strong>{filtrados.length}</strong> cliente{filtrados.length === 1 ? '' : 's'}
          {atualizadoEm && ` · atualizado em ${atualizadoEm.toLocaleDateString('pt-BR')}`}
        </span>
        <button
          className={styles.ghostBtn}
          onClick={copiarTelefones}
          disabled={filtrados.length === 0}
        >
          {copiado ? 'Copiado!' : `Copiar telefones (${filtrados.length})`}
        </button>
      </div>

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
                <th className={`${styles.colData} ${styles.thSort}`} onClick={() => ordenarPor('ultimaCompra')}>
                  Última compra {seta('ultimaCompra')}
                </th>
                <th className={`${styles.colDias} ${styles.thSort}`} onClick={() => ordenarPor('dias')}>
                  Dias sem pedir {seta('dias')}
                </th>
                <th className={`${styles.colPedidos} ${styles.thSort}`} onClick={() => ordenarPor('pedidos')}>
                  Pedidos {seta('pedidos')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => {
                const f = FAIXAS.find((x) => c.dias >= x.min && c.dias <= x.max);
                return (
                  <tr key={`${c.loja}_${c.telefone}`} className={f?.classe ? styles[f.classe] : ''}>
                    <td data-label="Nome" className={styles.nome}>
                      {c.nome || <span className={styles.semNome}>Sem nome</span>}
                      {lojaFiltro === 'all' && marcasComDados.size > 1 && (
                        <span className={styles.brandChip}>{LOJA_LABELS[c.loja] || c.loja}</span>
                      )}
                    </td>
                    <td data-label="Telefone" className={styles.colTel}>
                      <a
                        className={styles.telLink}
                        href={`https://wa.me/${paraWhatsapp(c.telefone)}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir conversa no WhatsApp"
                      >
                        {formatarTelefone(c.telefone)}
                      </a>
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
    </div>
  );
}
