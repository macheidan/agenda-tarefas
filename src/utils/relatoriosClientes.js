/**
 * Contas dos relatórios da seção Clientes.
 *
 * Módulo puro de propósito: a parte difícil aqui não é desenhar tabela, é não
 * mentir. A base só enxerga quem comprou nos últimos 90 dias da PRIMEIRA coleta
 * em diante, então qualquer olhar para trás tem viés de sobrevivência — de
 * setembro só sobraram os que voltaram. Por isso toda função que olha para o
 * passado recebe `coberturaDesde` e marca como parcial o que vem antes dele.
 *
 * Entrada é sempre a lista já achatada pelo useClientes (com `historicoMeses` e
 * `receitaMeses`), e a saída é só dado — nada de JSX.
 */

/** Rótulo "YYYY-MM" de uma data. */
export function mesDe(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

/** Anda `k` meses a partir de um rótulo "YYYY-MM" (k pode ser negativo). */
export function somarMeses(rotulo, k) {
  const [a, m] = rotulo.split('-').map(Number);
  const total = a * 12 + (m - 1) + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Os `n` meses terminando no mês de `hoje`, do mais antigo para o mais novo. */
export function janelaDeMeses(hoje, n) {
  const fim = mesDe(hoje);
  return Array.from({ length: n }, (_, i) => somarMeses(fim, i - (n - 1)));
}

/**
 * Segmentos RFV. A ordem é a da leitura: quem vale mais primeiro, quem já foi
 * por último. Frequência ganha de recência de propósito — um campeão que passou
 * 40 dias sem pedir continua sendo campeão, e é justamente ele que vale um
 * telefonema.
 */
export const SEGMENTOS = [
  {
    key: 'campeao',
    label: 'Campeão',
    regra: '6+ pedidos em 6 meses',
    acao: 'Reconhecer: brinde, prioridade, atendimento pelo nome',
  },
  {
    key: 'fiel',
    label: 'Fiel',
    regra: '3 a 5 pedidos em 6 meses',
    acao: 'Aumentar frequência: combo, dia fixo, indicação',
  },
  {
    key: 'ativo',
    label: 'Ativo',
    regra: 'comprou nos últimos 30 dias',
    acao: 'Empurrar a 2ª compra — a mediana de retorno é ~18 dias',
  },
  {
    key: 'esfriando',
    label: 'Esfriando',
    regra: '31 a 60 dias sem pedir',
    acao: 'Lembrete leve: novidade do cardápio',
  },
  {
    key: 'risco',
    label: 'Em risco',
    regra: '61 a 90 dias sem pedir',
    acao: 'Oferta de retorno com prazo curto',
  },
  {
    key: 'perdido',
    label: 'Perdido',
    regra: '91+ dias sem pedir',
    acao: 'Última tentativa; depois parar de gastar mensagem',
  },
];

/** Pedidos do cliente nos últimos `n` meses (o mês corrente conta). */
export function pedidosRecentes(cliente, hoje, n = 6) {
  const hm = cliente.historicoMeses;
  if (!hm) return null;
  const meses = janelaDeMeses(hoje, n);
  return meses.reduce((s, m) => s + (hm[m] || 0), 0);
}

/**
 * Em que segmento o cliente cai. Sem histórico coletado a frequência é
 * desconhecida, então ele é classificado só por recência — nunca é promovido a
 * campeão por falta de dado.
 */
export function segmentoDe(cliente, hoje) {
  const recentes = pedidosRecentes(cliente, hoje, 6);
  if (recentes !== null) {
    if (recentes >= 6) return 'campeao';
    if (recentes >= 3) return 'fiel';
  }
  const d = cliente.dias;
  if (!Number.isFinite(d)) return 'perdido';
  if (d <= 30) return 'ativo';
  if (d <= 60) return 'esfriando';
  if (d <= 90) return 'risco';
  return 'perdido';
}

/**
 * Retenção por coorte: de cada turma de clientes novos, quantos compraram de
 * novo no 1º, 2º, 3º… mês seguinte.
 *
 * `coberturaDesde` ("YYYY-MM-DD") é a data a partir da qual a base é completa.
 * Coorte que começa antes disso só contém quem sobreviveu até a primeira coleta
 * — a retenção dela sai inflada e vai marcada `completa: false`.
 *
 * Célula null = mês que ainda não aconteceu. Célula `parcial` = mês corrente,
 * que ainda está correndo.
 */
export function coortes(clientes, { hoje, maxOffset = 6, coberturaDesde = '' } = {}) {
  const mesAtual = mesDe(hoje);
  const primeiroCompleto = coberturaDesde ? somarMeses(coberturaDesde.slice(0, 7), 1) : '';
  const janela = janelaDeMeses(hoje, 12);
  const minMes = janela[0];

  const turmas = new Map();
  for (const c of clientes) {
    const pc = (c.primeiraCompra || '').slice(0, 7);
    if (!pc || pc < minMes || pc > mesAtual || !c.historicoMeses) continue;
    if (!turmas.has(pc)) turmas.set(pc, []);
    turmas.get(pc).push(c);
  }

  const linhas = [];
  for (const mes of [...turmas.keys()].sort()) {
    const turma = turmas.get(mes);
    const celulas = [];
    for (let k = 1; k <= maxOffset; k += 1) {
      const alvo = somarMeses(mes, k);
      if (alvo > mesAtual) {
        celulas.push(null);
        continue;
      }
      const qtd = turma.filter((c) => (c.historicoMeses[alvo] || 0) > 0).length;
      celulas.push({ offset: k, qtd, pct: qtd / turma.length, parcial: alvo === mesAtual });
    }
    // Voltou alguma vez, em qualquer mês depois do primeiro: é a taxa de
    // recompra que interessa na conversa do dia a dia.
    const voltaram = turma.filter((c) => {
      for (let k = 1; k <= 11; k += 1) {
        if ((c.historicoMeses[somarMeses(mes, k)] || 0) > 0) return true;
      }
      // Duas compras no mesmo mês de entrada também é recompra.
      return (c.historicoMeses[mes] || 0) > 1;
    }).length;
    linhas.push({
      mes,
      tamanho: turma.length,
      completa: !primeiroCompleto || mes >= primeiroCompleto,
      voltaram,
      pctVoltaram: turma.length ? voltaram / turma.length : 0,
      celulas,
    });
  }
  return { linhas: linhas.reverse(), maxOffset };
}

/** Resumo de um punhado de clientes: quantidade, valor, ticket, alcance de zap. */
function resumo(lista) {
  const valor = lista.reduce((s, c) => s + (c.valorTotal || 0), 0);
  const pedidos = lista.reduce((s, c) => s + (c.pedidos || 0), 0);
  return {
    qtd: lista.length,
    valor,
    pedidos,
    ticket: pedidos ? valor / pedidos : 0,
    comZap: lista.filter((c) => c.podeReceber).length,
  };
}

/** Os 6 segmentos com tamanho, valor e alcance de WhatsApp de cada um. */
export function segmentos(clientes, hoje) {
  const porSeg = new Map(SEGMENTOS.map((s) => [s.key, []]));
  for (const c of clientes) porSeg.get(segmentoDe(c, hoje))?.push(c);
  const valorTotal = clientes.reduce((s, c) => s + (c.valorTotal || 0), 0) || 1;
  return SEGMENTOS.map((s) => {
    const lista = porSeg.get(s.key) || [];
    const r = resumo(lista);
    return {
      ...s,
      ...r,
      pct: clientes.length ? r.qtd / clientes.length : 0,
      pctValor: r.valor / valorTotal,
    };
  });
}

/** Mediana simples (lista pequena, ordenar é mais barato que ser esperto). */
function mediana(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Quanto tempo o cliente novo leva para voltar. Só quem comprou exatamente duas
 * vezes entra: aí a distância entre a primeira e a última compra É o intervalo
 * de retorno, sem precisar do histórico pedido a pedido.
 *
 * Restrito a quem entrou depois de `coberturaDesde` porque, antes disso, quem
 * nunca voltou nem está na base — a mediana sairia otimista.
 */
export function diasAteSegundaCompra(clientes, coberturaDesde = '') {
  const gaps = [];
  for (const c of clientes) {
    if ((c.pedidos || 0) !== 2) continue;
    const { primeiraCompra: pc, ultimaCompra: uc } = c;
    if (!pc || !uc || (coberturaDesde && pc < coberturaDesde)) continue;
    const d = Math.round((Date.parse(`${uc}T00:00:00Z`) - Date.parse(`${pc}T00:00:00Z`)) / 86400000);
    if (Number.isFinite(d) && d >= 0) gaps.push(d);
  }
  return {
    n: gaps.length,
    mediana: mediana(gaps),
    ateUmaSemana: gaps.length ? gaps.filter((d) => d <= 7).length / gaps.length : 0,
  };
}

/**
 * Chave de agrupamento de bairro. O Saipos recebe o bairro digitado (balcão) ou
 * vindo do marketplace, então o mesmo lugar chega escrito de vários jeitos:
 * "Passo D'Areia" e "Passo da Areia" apareciam como duas linhas de ~150
 * clientes cada, e nenhuma das duas entrava no top da tabela.
 *
 * Tira acento, pontuação e os conectivos (da/de/do/d'), que é onde mora a
 * variação. Não tenta corrigir grafia — "Petropolis" e "Petrópolis" casam,
 * "Petrópoles" não.
 */
const CONECTIVOS_BAIRRO = new Set(['da', 'de', 'do', 'das', 'dos', 'd', 'e']);

export function chaveBairro(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((p) => p && !CONECTIVOS_BAIRRO.has(p))
    .join(' ');
}

/**
 * Bairros ordenados por receita. `lojas` é a lista de chaves ('dame','lov') que
 * ganham coluna própria de contagem — é o que mostra que Petrópolis é da Dáme e
 * Boa Vista é da Lov.
 */
export function bairros(clientes, { lojas = [], minimo = 3 } = {}) {
  // Agrupa pela chave normalizada, mas exibe a grafia mais comum do grupo — é a
  // que as pessoas reconhecem.
  const mapa = new Map();
  const grafias = new Map();
  for (const c of clientes) {
    const nome = c.bairro || 'Sem bairro';
    const chave = chaveBairro(nome) || 'sem bairro';
    if (!mapa.has(chave)) {
      mapa.set(chave, []);
      grafias.set(chave, new Map());
    }
    mapa.get(chave).push(c);
    const g = grafias.get(chave);
    g.set(nome, (g.get(nome) || 0) + 1);
  }
  const rotulo = (chave) =>
    [...grafias.get(chave)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const valorTotal = clientes.reduce((s, c) => s + (c.valorTotal || 0), 0) || 1;
  const linhas = [];
  let ouTodos = null;
  for (const [chave, lista] of mapa) {
    // Bairro com 1 ou 2 clientes é ruído de digitação e enche a tabela: vira uma
    // linha só no fim, que continua somando no total.
    if (lista.length < minimo) {
      if (!ouTodos) ouTodos = [];
      ouTodos.push(...lista);
      continue;
    }
    const r = resumo(lista);
    linhas.push({
      bairro: rotulo(chave),
      ...r,
      pctValor: r.valor / valorTotal,
      diasMediana: mediana(lista.map((c) => c.dias).filter(Number.isFinite)),
      porLoja: Object.fromEntries(lojas.map((l) => [l, lista.filter((c) => c.loja === l).length])),
    });
  }
  linhas.sort((a, b) => b.valor - a.valor);
  if (ouTodos && ouTodos.length) {
    const r = resumo(ouTodos);
    linhas.push({
      bairro: `Outros (${new Set(ouTodos.map((c) => chaveBairro(c.bairro) || 'sem bairro')).size} bairros)`,
      ...r,
      resto: true,
      pctValor: r.valor / valorTotal,
      diasMediana: mediana(ouTodos.map((c) => c.dias).filter(Number.isFinite)),
      porLoja: Object.fromEntries(lojas.map((l) => [l, ouTodos.filter((c) => c.loja === l).length])),
    });
  }
  return linhas;
}

/**
 * Painel mês a mês: quantos clientes compraram, quantos eram novos, quantos
 * voltaram depois de sumir, quanto entrou.
 *
 * Reativado = comprou no mês, já era cliente antes e estava há pelo menos dois
 * meses sem comprar. Dois meses e não três porque a frequência média da casa é
 * de um pedido a cada ~76 dias: exigir mais tempo chamaria de "reativado" o
 * comportamento normal.
 *
 * Nos dois meses mais antigos da janela isso é INCALCULÁVEL: o histórico só
 * guarda 12 meses, então os meses anteriores a eles não existem e todo mundo
 * pareceria "sumido". Essas linhas vêm com `separacaoConhecida: false` e a tela
 * mostra "—" — antes disso, setembro aparecia com 903 reativados e 0
 * recorrentes, que é o artefato e não o negócio.
 *
 * A receita sai de `receitaMeses` (valor real de cada pedido). Quando parte dos
 * clientes ativos do mês ainda não tem esse campo, a linha vem com
 * `receitaParcial: true` — subestimada, e a tela avisa em vez de fingir.
 */
export function painelMensal(clientes, { hoje, meses = 12, coberturaDesde = '' } = {}) {
  const janela = janelaDeMeses(hoje, meses);
  const mesAtual = mesDe(hoje);
  const primeiroCompleto = coberturaDesde ? somarMeses(coberturaDesde.slice(0, 7), 1) : '';
  const comHistorico = clientes.filter((c) => c.historicoMeses);
  // Só dá para dizer "estava sumido" quando os dois meses anteriores estão
  // dentro do histórico guardado.
  const maisAntigo = janela[0];

  return janela
    .map((mes) => {
      const ativos = comHistorico.filter((c) => (c.historicoMeses[mes] || 0) > 0);
      const pedidos = ativos.reduce((s, c) => s + c.historicoMeses[mes], 0);
      let receita = 0;
      let semReceita = 0;
      for (const c of ativos) {
        if (c.receitaMeses && c.receitaMeses[mes] != null) receita += c.receitaMeses[mes];
        else semReceita += 1;
      }
      const novos = ativos.filter((c) => (c.primeiraCompra || '').slice(0, 7) === mes);
      const separacaoConhecida = somarMeses(mes, -2) >= maisAntigo;
      const reativados = ativos.filter(
        (c) =>
          (c.primeiraCompra || '').slice(0, 7) < mes &&
          !(c.historicoMeses[somarMeses(mes, -1)] || 0) &&
          !(c.historicoMeses[somarMeses(mes, -2)] || 0)
      );
      return {
        mes,
        ativos: ativos.length,
        novos: novos.length,
        separacaoConhecida,
        reativados: separacaoConhecida ? reativados.length : null,
        recorrentes: separacaoConhecida ? ativos.length - novos.length - reativados.length : null,
        pedidos,
        receita,
        ticket: pedidos ? receita / pedidos : 0,
        pedidosPorCliente: ativos.length ? pedidos / ativos.length : 0,
        completo: (!primeiroCompleto || mes >= primeiroCompleto) && mes !== mesAtual,
        correndo: mes === mesAtual,
        receitaParcial: semReceita > 0,
        semReceita,
      };
    })
    .reverse();
}
