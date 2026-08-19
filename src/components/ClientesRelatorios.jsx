import { useState, useEffect, useMemo } from 'react';
import {
  SEGMENTOS,
  coortes,
  segmentos as calcularSegmentos,
  bairros as calcularBairros,
  painelMensal,
  diasAteSegundaCompra,
} from '../utils/relatoriosClientes';
import styles from '../styles/ClientesRelatorios.module.css';

/**
 * Sub-seção Relatórios da aba Clientes.
 *
 * Recebe a lista já filtrada por loja e permissão — o filtro de loja é o mesmo
 * da Lista, de propósito: "ver os bairros da Lov" é o mesmo gesto de "ver os
 * clientes da Lov", e duplicar o seletor só criaria duas verdades na tela.
 *
 * As contas vivem em utils/relatoriosClientes.js. Aqui é só desenho — e os
 * avisos, que são metade do trabalho: quase todo número que olha para trás tem
 * viés de sobrevivência, e a tela precisa dizer isso em vez de deixar alguém
 * concluir que o negócio triplicou.
 */

const RELATORIOS = [
  { key: 'retencao', label: 'Retenção' },
  { key: 'segmentos', label: 'Segmentos' },
  { key: 'bairros', label: 'Bairros' },
  { key: 'meses', label: 'Mês a mês' },
];

const MES_NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "jul/26" a partir de "2026-07". */
function mesLabel(rotulo) {
  const [a, m] = rotulo.split('-');
  return `${MES_NOMES[Number(m) - 1]}/${a.slice(2)}`;
}

const reais = (v) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const pct = (v) => `${Math.round((v || 0) * 100)}%`;

const num = (v) => (v || 0).toLocaleString('pt-BR');

export default function ClientesRelatorios({
  clientes,
  hoje,
  coberturaDesde,
  lojas,
  lojaLabels,
  lojaFiltro,
  onVerSegmento,
}) {
  // Qual relatório está aberto vai na URL (?rel=), como o ?sub= de Preços: F5
  // não pode jogar de volta na primeira aba.
  const [rel, setRel] = useState(() => {
    try {
      const r = new URLSearchParams(window.location.search).get('rel');
      return RELATORIOS.some((x) => x.key === r) ? r : 'retencao';
    } catch {
      return 'retencao';
    }
  });

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('rel') === rel) return;
      url.searchParams.set('rel', rel);
      window.history.replaceState(null, '', url);
    } catch {
      /* URL malformada: a navegação por estado continua de pé */
    }
  }, [rel]);

  // Só as lojas que ganham coluna própria na tabela de bairros: com uma loja
  // escolhida a coluna seria a própria linha repetida.
  const colunasLoja = lojaFiltro === 'all' && lojas.length > 1 ? lojas : [];

  const dados = useMemo(
    () => ({
      coorte: coortes(clientes, { hoje, coberturaDesde }),
      segs: calcularSegmentos(clientes, hoje),
      bairros: calcularBairros(clientes, { lojas: colunasLoja }),
      meses: painelMensal(clientes, { hoje, coberturaDesde }),
      retorno: diasAteSegundaCompra(clientes, coberturaDesde),
    }),
    // colunasLoja é derivado de lojaFiltro/lojas; listar os dois evita array novo a cada render
    [clientes, hoje, coberturaDesde, lojaFiltro, lojas] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const semHistorico = useMemo(() => clientes.filter((c) => !c.historicoMeses).length, [clientes]);

  if (!clientes.length) {
    return (
      <div className={styles.empty}>
        <p>Nada para relatar ainda.</p>
        <span>Os relatórios se montam com a base de clientes — ela chega pela coleta da madrugada.</span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.relTabs}>
        {RELATORIOS.map((r) => (
          <button
            key={r.key}
            className={`${styles.relTab} ${rel === r.key ? styles.relTabActive : ''}`}
            onClick={() => setRel(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {semHistorico > 0 && (
        <p className={styles.aviso}>
          {num(semHistorico)} cliente{semHistorico === 1 ? '' : 's'} ainda sem histórico coletado —
          entram nos totais de valor, mas ficam de fora de retenção e do painel mensal.
        </p>
      )}

      {rel === 'retencao' && <Retencao dados={dados} coberturaDesde={coberturaDesde} />}
      {rel === 'segmentos' && <Segmentos segs={dados.segs} onVerSegmento={onVerSegmento} />}
      {rel === 'bairros' && (
        <Bairros linhas={dados.bairros} colunasLoja={colunasLoja} lojaLabels={lojaLabels} />
      )}
      {rel === 'meses' && <Meses linhas={dados.meses} coberturaDesde={coberturaDesde} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Retenção                                                         */
/* ------------------------------------------------------------------ */

function Retencao({ dados, coberturaDesde }) {
  const { linhas: todas, maxOffset } = dados.coorte;
  // Turma anterior ao início da base aparece com retenção de 100% — não porque
  // todo mundo voltou, mas porque quem não voltou nem está na base. Fica
  // escondida por padrão: número que não dá para ler é pior que número nenhum.
  const [verIncompletas, setVerIncompletas] = useState(false);
  const incompletas = todas.filter((l) => !l.completa).length;
  const linhas = verIncompletas ? todas : todas.filter((l) => l.completa);
  const completas = todas.filter((l) => l.completa && l.tamanho >= 20);
  // A coorte mais nova ainda está verde demais para virar placar: a referência
  // é a mais recente que já teve pelo menos um mês inteiro para voltar.
  const referencia = completas[1] || completas[0] || null;

  return (
    <>
      <div className={styles.kpis}>
        <Kpi
          titulo="Voltam para a 2ª compra"
          valor={referencia ? pct(referencia.pctVoltaram) : '—'}
          nota={referencia ? `turma de ${mesLabel(referencia.mes)} · ${num(referencia.tamanho)} novos` : 'sem turma fechada ainda'}
        />
        <Kpi
          titulo="Quando voltam"
          valor={dados.retorno.mediana != null ? `${Math.round(dados.retorno.mediana)} dias` : '—'}
          nota={
            dados.retorno.n
              ? `mediana de ${num(dados.retorno.n)} clientes · ${pct(dados.retorno.ateUmaSemana)} em até 7 dias`
              : 'ninguém voltou ainda dentro da janela medida'
          }
        />
        <Kpi
          titulo="Novos no mês corrente"
          valor={linhas[0] ? num(linhas[0].tamanho) : '—'}
          nota={linhas[0] ? `turma de ${mesLabel(linhas[0].mes)}, ainda correndo` : ''}
        />
      </div>

      <p className={styles.legenda}>
        Cada linha é a turma que comprou pela <strong>primeira vez</strong> naquele mês. As colunas
        dizem quantos dessa turma compraram de novo 1, 2, 3… meses depois. É o placar que separa
        "vendemos muito" de "construímos clientela".
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Turma</th>
              <th className={styles.num}>Novos</th>
              <th className={styles.num}>Voltaram</th>
              {Array.from({ length: maxOffset }, (_, i) => (
                <th key={i} className={styles.num}>
                  +{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className={l.completa ? '' : styles.parcial}>
                <td data-label="Turma">
                  {mesLabel(l.mes)}
                  {!l.completa && (
                    <span
                      className={styles.marca}
                      title="Turma anterior ao início da base: só estão aqui os que voltaram, então a retenção sai inflada"
                    >
                      *
                    </span>
                  )}
                </td>
                <td data-label="Novos" className={styles.num}>
                  {num(l.tamanho)}
                </td>
                <td data-label="Voltaram" className={`${styles.num} ${styles.destaque}`}>
                  {pct(l.pctVoltaram)}
                </td>
                {l.celulas.map((c, i) => (
                  <td key={i} data-label={`+${i + 1}`} className={styles.num}>
                    {c ? (
                      <span className={styles.celula} title={`${num(c.qtd)} de ${num(l.tamanho)}`}>
                        <span className={styles.heat} style={{ opacity: Math.min(0.3, c.pct * 1.4) }} />
                        <span className={styles.celulaTexto}>
                          {pct(c.pct)}
                          {c.parcial ? '…' : ''}
                        </span>
                      </span>
                    ) : (
                      <span className={styles.vazio}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {incompletas > 0 && (
        <div className={styles.maisRow}>
          <button className={styles.ghostBtn} onClick={() => setVerIncompletas((v) => !v)}>
            {verIncompletas
              ? 'Esconder turmas anteriores ao início da base'
              : `Mostrar ${incompletas} turma${incompletas === 1 ? '' : 's'} anterior${
                  incompletas === 1 ? '' : 'es'
                } ao início da base`}
          </button>
        </div>
      )}

      <p className={styles.rodape}>
        <strong>*</strong> turma anterior a{' '}
        {coberturaDesde ? formatarData(coberturaDesde) : 'o início da base'}: a coleta só enxerga 90
        dias para trás, então dessas turmas só estão na base os que voltaram. A retenção delas está
        inflada e não serve de comparação. As turmas sem asterisco são completas. "…" marca mês
        ainda correndo.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Segmentos                                                        */
/* ------------------------------------------------------------------ */

function Segmentos({ segs, onVerSegmento }) {
  const total = segs.reduce((s, x) => s + x.qtd, 0);
  const valorTotal = segs.reduce((s, x) => s + x.valor, 0);

  return (
    <>
      <p className={styles.legenda}>
        Frequência manda em recência: quem pediu 6 vezes em 6 meses continua campeão mesmo parado há
        um mês — e é justamente ele que vale um telefonema. Clicar num segmento abre a lista já
        filtrada.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Segmento</th>
              <th className={styles.num}>Clientes</th>
              <th className={styles.num}>% da base</th>
              <th className={styles.num}>Valor histórico</th>
              <th className={styles.num}>% do valor</th>
              <th className={styles.num}>Ticket</th>
              <th className={styles.num}>Com WhatsApp</th>
              <th>O que fazer</th>
            </tr>
          </thead>
          <tbody>
            {segs.map((s) => (
              <tr key={s.key} className={styles.clicavel} onClick={() => onVerSegmento?.(s.key)}>
                <td data-label="Segmento">
                  <button className={styles.segLink} type="button">
                    {s.label}
                  </button>
                  <span className={styles.regra}>{s.regra}</span>
                </td>
                <td data-label="Clientes" className={styles.num}>
                  {num(s.qtd)}
                </td>
                <td data-label="% da base" className={`${styles.num} ${styles.suave}`}>
                  {pct(s.pct)}
                </td>
                <td data-label="Valor histórico" className={styles.num}>
                  {reais(s.valor)}
                </td>
                <td data-label="% do valor" className={`${styles.num} ${styles.destaque}`}>
                  {pct(s.pctValor)}
                </td>
                <td data-label="Ticket" className={styles.num}>
                  {reais(s.ticket)}
                </td>
                <td
                  data-label="Com WhatsApp"
                  className={styles.num}
                  title="Quantos desse segmento dá para alcançar por campanha"
                >
                  {num(s.comZap)}
                  <span className={styles.suave}> ({pct(s.qtd ? s.comZap / s.qtd : 0)})</span>
                </td>
                <td data-label="O que fazer" className={styles.acao}>
                  {s.acao}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className={styles.num}>{num(total)}</td>
              <td className={styles.num}>100%</td>
              <td className={styles.num}>{reais(valorTotal)}</td>
              <td className={styles.num}>100%</td>
              <td />
              <td className={styles.num}>{num(segs.reduce((s, x) => s + x.comZap, 0))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className={styles.rodape}>
        Valor histórico é tudo o que o cliente já gastou na loja, não só na janela de 90 dias — por
        isso a soma passa longe do faturamento do trimestre.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Bairros                                                          */
/* ------------------------------------------------------------------ */

function Bairros({ linhas, colunasLoja, lojaLabels }) {
  return (
    <>
      <p className={styles.legenda}>
        Onde o dinheiro mora. Os dois negócios ocupam bairros diferentes — é o que decide raio de
        entrega, panfleto e geo do anúncio.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Bairro</th>
              <th className={styles.num}>Clientes</th>
              {colunasLoja.map((l) => (
                <th key={l} className={styles.num}>
                  {lojaLabels[l] || l}
                </th>
              ))}
              <th className={styles.num}>Valor histórico</th>
              <th className={styles.num}>% do valor</th>
              <th className={styles.num}>Ticket</th>
              <th className={styles.num} title="Metade do bairro está acima disso, metade abaixo">
                Dias sem pedir
              </th>
              <th className={styles.num}>Com WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((b) => (
              <tr key={b.bairro} className={b.resto ? styles.parcial : ''}>
                <td data-label="Bairro">{b.bairro}</td>
                <td data-label="Clientes" className={styles.num}>
                  {num(b.qtd)}
                </td>
                {colunasLoja.map((l) => (
                  <td key={l} data-label={lojaLabels[l] || l} className={`${styles.num} ${styles.suave}`}>
                    {num(b.porLoja[l] || 0)}
                  </td>
                ))}
                <td data-label="Valor histórico" className={styles.num}>
                  {reais(b.valor)}
                </td>
                <td data-label="% do valor" className={`${styles.num} ${styles.destaque}`}>
                  {pct(b.pctValor)}
                </td>
                <td data-label="Ticket" className={styles.num}>
                  {reais(b.ticket)}
                </td>
                <td data-label="Dias sem pedir" className={styles.num}>
                  {b.diasMediana == null ? '—' : Math.round(b.diasMediana)}
                </td>
                <td data-label="Com WhatsApp" className={styles.num}>
                  {num(b.comZap)}
                  <span className={styles.suave}> ({pct(b.qtd ? b.comZap / b.qtd : 0)})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.rodape}>
        Bairros com menos de 3 clientes caem na linha "Outros" — são erro de digitação e entrega
        avulsa, e enchiam a tabela sem dizer nada. Eles continuam somando nos totais.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Painel mês a mês                                                 */
/* ------------------------------------------------------------------ */

function Meses({ linhas: todas, coberturaDesde }) {
  // Mesmo motivo da retenção: mês anterior ao início da base vem com um terço
  // dos clientes que de fato compraram, e a curva vira um crescimento falso.
  const [verIncompletos, setVerIncompletos] = useState(false);
  const incompletos = todas.filter((l) => !l.completo && !l.correndo).length;
  const linhas = verIncompletos ? todas : todas.filter((l) => l.completo || l.correndo);
  const temParcial = verIncompletos && incompletos > 0;
  const temReceitaParcial = linhas.some((l) => l.receitaParcial);

  return (
    <>
      <p className={styles.legenda}>
        Quem comprou em cada mês, separado por <strong>novo</strong> (primeira compra),{' '}
        <strong>reativado</strong> (já era cliente e estava 2 meses sumido) e{' '}
        <strong>recorrente</strong>. Crescimento que só vem de novo é balde furado.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Mês</th>
              <th className={styles.num}>Clientes</th>
              <th className={styles.num}>Novos</th>
              <th className={styles.num}>Reativados</th>
              <th className={styles.num}>Recorrentes</th>
              <th className={styles.num}>Pedidos</th>
              <th className={styles.num}>Ped./cliente</th>
              <th className={styles.num}>Receita</th>
              <th className={styles.num}>Ticket</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className={l.completo ? '' : styles.parcial}>
                <td data-label="Mês">
                  {mesLabel(l.mes)}
                  {l.correndo && <span className={styles.chip}>em curso</span>}
                  {!l.completo && !l.correndo && (
                    <span
                      className={styles.marca}
                      title="Mês anterior ao início da base: só aparecem os clientes que voltaram depois"
                    >
                      *
                    </span>
                  )}
                </td>
                <td data-label="Clientes" className={styles.num}>
                  {num(l.ativos)}
                </td>
                <td data-label="Novos" className={styles.num}>
                  {num(l.novos)}
                </td>
                <td
                  data-label="Reativados"
                  className={styles.num}
                  title={
                    l.separacaoConhecida
                      ? undefined
                      : 'Mês mais antigo do histórico: não há os 2 meses anteriores para dizer quem estava sumido'
                  }
                >
                  {l.separacaoConhecida ? num(l.reativados) : <span className={styles.vazio}>—</span>}
                </td>
                <td data-label="Recorrentes" className={`${styles.num} ${styles.destaque}`}>
                  {l.separacaoConhecida ? num(l.recorrentes) : <span className={styles.vazio}>—</span>}
                </td>
                <td data-label="Pedidos" className={styles.num}>
                  {num(l.pedidos)}
                </td>
                <td data-label="Ped./cliente" className={`${styles.num} ${styles.suave}`}>
                  {l.pedidosPorCliente.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td data-label="Receita" className={styles.num}>
                  {reais(l.receita)}
                  {l.receitaParcial && (
                    <span
                      className={styles.marca}
                      title={`${num(l.semReceita)} cliente(s) do mês ainda sem receita coletada: o valor está subestimado`}
                    >
                      ↓
                    </span>
                  )}
                </td>
                <td data-label="Ticket" className={styles.num}>
                  {reais(l.ticket)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {incompletos > 0 && (
        <div className={styles.maisRow}>
          <button className={styles.ghostBtn} onClick={() => setVerIncompletos((v) => !v)}>
            {verIncompletos
              ? 'Esconder meses anteriores ao início da base'
              : `Mostrar ${incompletos} mês${incompletos === 1 ? '' : 'es'} anterior${
                  incompletos === 1 ? '' : 'es'
                } ao início da base`}
          </button>
        </div>
      )}

      <p className={styles.rodape}>
        {temParcial && (
          <>
            <strong>*</strong> mês anterior a{' '}
            {coberturaDesde ? formatarData(coberturaDesde) : 'o início da base'}: a base só enxerga
            90 dias para trás, então desses meses só aparecem os clientes que compraram de novo
            depois. Os números vêm baixos e a curva parece um crescimento que não aconteceu — não
            compare esses meses com os de agora.{' '}
          </>
        )}
        {temReceitaParcial && (
          <>
            <strong>↓</strong> receita subestimada: parte dos clientes daquele mês ainda não teve o
            valor por pedido coletado. Some sozinho na próxima coleta.
          </>
        )}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Kpi({ titulo, valor, nota }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiTitulo}>{titulo}</span>
      <strong className={styles.kpiValor}>{valor}</strong>
      {nota && <span className={styles.kpiNota}>{nota}</span>}
    </div>
  );
}

function formatarData(iso) {
  const [a, m, d] = String(iso).split('-');
  return d ? `${d}/${m}/${a}` : iso;
}
