// Conferir Pedidos: traduz a linha da NOTA FISCAL para a unidade em que o
// gerente PEDIU, para que a assistente compare "2 cx" com "2 cx" — nunca
// "2 cx" com "25 KG".
//
// O parser abaixo foi medido contra 1826 linhas de nota reais (90 dias):
// 61% convertem sozinhas pelas regras seguras. O resto depende da equivalência
// declarada (ver `converter`).
//
// REGRA PERMANENTE, aprendida no dado real: `unidade_embalagem = "ML"` no
// manjericão e na salsinha NÃO é mililitro, é MAÇO (81 ocorrências). Um parser
// que adivinha unidade transformaria 14 maços em 0,014 kg e acusaria uma falta
// que não existe. Por isso: converter só pelas regras seguras + equivalência
// declarada por humano; onde não souber, devolver null e mostrar os dois lados
// crus. NÃO SABER NUNCA VIRA ZERO.

// Normalização forte (sem acento, sem pontuação, espaço único): é ela que faz
// 'Muçarela  Tirol 12,5Kg' casar com 'MUCARELA TIROL 12.5 KG'. Mais agressiva
// que a `norm` de lib/suprimentos, que só serve pra busca na tela.
export const normNome = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const norm = normNome;

// Embalagem: o que o gerente conta ("2 cx"). Sinônimos do catálogo e da nota
// apontam para o mesmo código.
const EMB = {
  cx: 'CX', caixa: 'CX', caixas: 'CX', c: 'CX',
  pct: 'PCT', pc: 'PCT', pacote: 'PCT', pacotes: 'PCT', pack: 'PCT',
  fd: 'FD', fardo: 'FD', fardos: 'FD',
  sc: 'SC', saco: 'SC', sacos: 'SC', sca: 'SC',
  bd: 'BD', balde: 'BD', baldes: 'BD',
  gl: 'GL', galao: 'GL', bombona: 'GL',
  lt: 'LT', lata: 'LT', latas: 'LT',
  bj: 'BJ', bandeja: 'BJ', bandejas: 'BJ',
  dz: 'DZ', duzia: 'DZ',
  pt: 'PT', pote: 'PT', potes: 'PT',
  pente: 'PENTE', pentes: 'PENTE',
  bg: 'BG', bag: 'BG',
  un: 'UN', und: 'UN', uni: 'UN', unid: 'UN', unidade: 'UN', unidades: 'UN',
  pe: 'UN', peca: 'UN', 'pç': 'UN',
};

// Medida: o que se pesa/mede. Fator para a unidade base da família.
const MED = {
  kg: ['KG', 1], quilo: ['KG', 1], quilos: ['KG', 1], k: ['KG', 1],
  g: ['KG', 0.001], gr: ['KG', 0.001], grama: ['KG', 0.001], gramas: ['KG', 0.001],
  l: ['L', 1], lt: ['L', 1], litro: ['L', 1], litros: ['L', 1],
  ml: ['L', 0.001],
};

/** Lê o campo `unid` do catálogo (texto livre: 'cx 12,5kg', 'kg', 'un', 'sc 25kg'). */
export function parseUnid(bruto) {
  const s = norm(bruto);
  if (!s) return null;
  const toks = s.split(' ').filter(Boolean);

  let emb = null;
  let conteudo = null; // { qtd, med, fator } — o que cabe DENTRO de uma embalagem
  let med = null;      // pedido medido direto (kg, l)

  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];

    // '12,5kg' ou '12' seguido de 'kg' — quantidade + medida grudadas ou não.
    const m = t.match(/^(\d+(?:[.,]\d+)?)([a-z]*)$/);
    if (m) {
      const qtd = Number(m[1].replace(',', '.'));
      const sufixo = m[2] || toks[i + 1] || '';
      const info = MED[sufixo] || null;
      if (info && qtd > 0) {
        conteudo = { qtd, med: info[0], fator: info[1] };
        if (!m[2]) i += 1;
        continue;
      }
      if (EMB[sufixo] && qtd > 0) { conteudo = { qtd, med: EMB[sufixo], fator: 1 }; if (!m[2]) i += 1; }
      continue;
    }

    if (!emb && EMB[t] && !MED[t]) { emb = EMB[t]; continue; }
    if (!med && MED[t]) { med = MED[t]; continue; }
    // 'lt' é ambíguo (lata × litro): sem número junto, vale litro.
    if (!emb && EMB[t]) emb = EMB[t];
  }

  if (!emb && !med && !conteudo) return null;
  return { emb, med, conteudo, bruto };
}

/**
 * Tamanho da embalagem escondido no NOME do produto — 'Água c/ Gás 500ml',
 * 'Coloreti Tradicional 1kg'. É o que permite converter quando o campo Unid.
 * diz só 'un' e a nota vem em ML/KG.
 */
export function tamanhoNoNome(nome) {
  const s = norm(nome);
  const achados = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|gr|g|ml|lt|l)(?:\s|$)/g)];
  if (!achados.length) return null;
  const ultimo = achados[achados.length - 1];
  const qtd = Number(ultimo[1].replace(',', '.'));
  const info = MED[ultimo[2]];
  if (!info || !qtd) return null;
  return { qtd, med: info[0], fator: info[1] };
}

/** Unidade comercial da nota ('CX', 'KG', 'UN', 'PC'...) num código comparável. */
export function parseUnidNota(bruto) {
  const s = norm(bruto);
  if (!s) return null;
  if (MED[s]) return { tipo: 'med', cod: MED[s][0], fator: MED[s][1] };
  if (EMB[s]) return { tipo: 'emb', cod: EMB[s] };
  return null;
}

/** O pedido de uma linha, pré-processado uma vez (parse do Unid. + nome). */
export function perfilPedido(linha) {
  const p = parseUnid(linha.unid);
  const nome = tamanhoNoNome(linha.produto);
  if (!p) return nome ? { emb: null, med: null, conteudo: null, nome, bruto: linha.unid || '' } : null;
  return { ...p, nome: p.conteudo ? null : nome };
}

// Rótulo de cada regra, pra tela poder explicar de onde veio o número.
export const REGRAS = {
  0: 'equivalência declarada',
  1: 'mesma embalagem',
  2: 'conteúdo da embalagem',
  3: 'medida direta',
  4: 'tamanho no nome',
};

/**
 * Converte a quantidade da nota para a unidade em que o gerente pediu.
 * Devolve { qtd, regra } ou **null** quando não souber.
 *
 * `equiv` é a equivalência DECLARADA por humano no item, e é gravada na direção
 * em que gente fala: `{ DZ: 2.5 }` significa "1 pente (do pedido) tem 2,5 DZ
 * (da nota)". Daí `qtdPedido = qtdNota / equiv`.
 *
 * Guardar no sentido inverso (fator multiplicador) daria o mesmo resultado, mas
 * obrigaria a assistente a digitar 0,4 onde ela sabe dizer 2,5 — e ninguém
 * confere nada digitando o inverso de cabeça.
 *
 * Vem PRIMEIRO na ordem porque é a única fonte que sabe, por exemplo, que "ML"
 * no manjericão é maço.
 */
export function converter(pedido, qtdNota, unidNotaBruta, equiv) {
  const chave = String(unidNotaBruta || '').trim().toUpperCase();
  const porPedido = Number(equiv?.[chave]);
  if (porPedido > 0) return { qtd: qtdNota / porPedido, regra: 0 };

  const nota = parseUnidNota(unidNotaBruta);
  if (!pedido || !nota) return null;

  // 1. A nota conta a mesma embalagem que o gerente ('CX' × 'cx 12,5kg').
  if (pedido.emb && nota.tipo === 'emb' && nota.cod === pedido.emb) {
    return { qtd: qtdNota, regra: 1 };
  }
  // 2. A nota conta o CONTEÚDO da embalagem ('25 KG' × 'cx 12,5kg' = 2 cx).
  if (pedido.conteudo && nota.tipo === 'med' && nota.cod === pedido.conteudo.med) {
    const emBase = qtdNota * nota.fator;
    return { qtd: emBase / (pedido.conteudo.qtd * pedido.conteudo.fator), regra: 2 };
  }
  if (pedido.conteudo && nota.tipo === 'emb' && nota.cod === pedido.conteudo.med) {
    return { qtd: qtdNota / pedido.conteudo.qtd, regra: 2 };
  }
  // 3. Pedido medido direto, mesma família ('KG' × 'kg', 'G' × 'kg').
  if (pedido.med && nota.tipo === 'med' && nota.cod === pedido.med[0]) {
    return { qtd: (qtdNota * nota.fator) / pedido.med[1], regra: 3 };
  }
  // 3b. Pedido em unidade avulsa e nota também ('UN' × 'un').
  if (pedido.emb && nota.tipo === 'emb' && pedido.emb === 'UN' && nota.cod === 'UN') {
    return { qtd: qtdNota, regra: 3 };
  }
  // 4. O tamanho não está no campo Unid., está no nome ('Água 500ml' pedida em
  //    'un', nota em ML).
  if (pedido.nome && nota.tipo === 'med' && nota.cod === pedido.nome.med) {
    const emBase = qtdNota * nota.fator;
    return { qtd: emBase / (pedido.nome.qtd * pedido.nome.fator), regra: 4 };
  }
  return null;
}

/**
 * Equivalência sugerida a partir dos números observados, na mesma direção que
 * `converter` espera: quantas unidades da NOTA cabem em 1 do PEDIDO. Pediu 2
 * fardos, a nota trouxe 12 UN → sugere 6 ("1 fardo = 6 UN").
 *
 * É só uma SUGESTÃO, e vale supondo que ESTA entrega veio completa — o que é
 * verdade na maioria das linhas, não em todas. Por isso a assistente confirma;
 * e por isso só sugere quando o resultado é um número que gente usa pra
 * embalagem (1, 6, 12, 2,5, 12,5...). Uma razão torta como 7/3 é mais provável
 * de ser uma falta disfarçada do que uma equivalência, e aí não sugere nada.
 */
export function sugereEquivalencia(qtdPedida, qtdNota) {
  const p = Number(qtdPedida);
  const n = Number(qtdNota);
  if (!(p > 0) || !(n > 0)) return null;
  const bruto = n / p;
  const candidatos = [
    1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10, 12, 12.5, 15, 20, 24, 25, 30, 50,
    0.5, 0.25, 1 / 3, 1 / 6, 1 / 12,
  ];
  for (const c of candidatos) {
    if (Math.abs(bruto - c) <= c * 0.02) return Math.round(c * 10000) / 10000;
  }
  return null;
}

/**
 * Palpite de equivalência para um par (item, unidade da nota) que nenhuma regra
 * converteu — usado pra PRÉ-PREENCHER a lista de unidades pendentes, sem
 * nenhum número observado à mão.
 *
 * Só arrisca no caso em que o palpite é quase certo: o gerente pede em unidade
 * GENÉRICA ('un') e a nota conta uma embalagem qualquer ('GL', 'PC', 'FD').
 * Aí "1 un" É o galão — a nota só deu nome ao que ele conta solto. 1:1.
 *
 * Quando o pedido nomeia a embalagem ('fardo', 'cx', 'pente') e a nota nomeia
 * OUTRA ('UN', 'PT', 'DZ'), 1:1 é justamente o palpite errado: um fardo de
 * Fruki tem 6 unidades, e chutar 1 esconderia falta. Devolve null — a tela
 * pergunta.
 */
export function palpiteEquivalencia(unidPedido, unidNota) {
  const p = parseUnid(unidPedido);
  const n = parseUnidNota(unidNota);
  if (!p || !n) return null;
  const generico = p.emb === 'UN' && !p.conteudo && !p.med;
  return generico && n.tipo === 'emb' && n.cod !== 'UN' ? 1 : null;
}

/**
 * Pares (item × unidade da nota) que ainda não convertem, com quantas linhas de
 * nota cada um derruba — é a fila de trabalho da caixa "Unidades".
 * Mais frequente primeiro: os primeiros da lista pagam a maior parte.
 */
export function pendenciasDeUnidade(itens, linhasNota) {
  const porNome = new Map();
  for (const i of itens) {
    for (const k of [normNome(i.planilhaNome), normNome(i.produto)]) {
      if (k && !porNome.has(k)) porNome.set(k, i);
    }
  }
  const mapa = new Map();
  for (const r of linhasNota) {
    const item = porNome.get(normNome(r.planilha)) || porNome.get(normNome(r.produto));
    if (!item) continue;
    if (converter(perfilPedido(item), r.qtd, r.unid, item.equiv)) continue;
    const unidNota = String(r.unid || '').trim().toUpperCase();
    if (!unidNota) continue;
    const chave = `${item.id}|${unidNota}`;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave,
        item,
        unidNota,
        n: 0,
        palpite: palpiteEquivalencia(item.unid, unidNota),
      });
    }
    mapa.get(chave).n += 1;
  }
  return [...mapa.values()].sort((a, b) => b.n - a.n);
}

/** Nº da NF dentro da chave de acesso (posições 26–34 dos 44 dígitos). */
export function nfNumero(chave) {
  const s = String(chave || '').replace(/\D/g, '');
  if (s.length !== 44) return '';
  return String(Number(s.slice(25, 34)));
}

// Tolerância relativa da comparação. Entrega pesada nunca fecha no número
// exato: uma caixa de 12,5 kg vem com 12,3. Sem tolerância toda linha pesada
// viraria divergência falsa e afogaria as verdadeiras.
export const TOLERANCIA = 0.02;

/**
 * Situação de uma linha: o que foi pedido contra o que a nota trouxe.
 *   ok · faltou · sobrou · naoVeio · confirmar (não soube converter)
 */
export function situacao(pediu, veio, converteu) {
  if (!converteu) return 'confirmar';
  if (!(veio > 0)) return 'naoVeio';
  const margem = Math.max(pediu * TOLERANCIA, 0.01);
  if (Math.abs(veio - pediu) <= margem) return 'ok';
  return veio < pediu ? 'faltou' : 'sobrou';
}

export const SITUACAO_LABEL = {
  ok: 'ok',
  faltou: 'faltou',
  sobrou: 'veio a mais',
  naoVeio: 'não veio',
  confirmar: 'confirmar',
};

// Quantidade de tela: até 3 casas, sem zeros à direita, decimal com vírgula.
export const fmtNum = (n) => {
  const v = Number(n) || 0;
  const s = Math.abs(v - Math.round(v)) < 0.0005 ? String(Math.round(v)) : v.toFixed(3).replace(/0+$/, '');
  return s.replace('.', ',');
};
