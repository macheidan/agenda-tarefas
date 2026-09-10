/**
 * Unificação de bairros escritos de formas diferentes.
 *
 * O bairro é digitado à mão no Saipos, em três canais, por pessoas diferentes —
 * então a mesma rua vira "Passo D'Areia", "Passo da Areia", "Passo D' Areia" e
 * "Passoa Dareia". Sem unificar, o maior bairro da Dáme aparece partido em
 * quatro pedaços de 186, 152, 1 e 1 cliente: o filtro esconde gente, e o
 * relatório por bairro mente sobre onde a loja de fato vende.
 *
 * A limpeza é só de APRESENTAÇÃO. O dado cru continua como veio do Saipos —
 * quem reescreve o cadastro é o coletor, e sobrescrever aqui esconderia erro de
 * digitação em vez de corrigi-lo na origem.
 */

// Palavras que ficam minúsculas no meio do nome. Sem isso, o Title Case
// devolve "Cais Do Porto" e "Costa E Silva".
const MINUSCULAS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'a', 'o']);

// Para a CHAVE, o "d" solto também é preposição — é o que sobra de "D'Areia"
// depois que o apóstrofo vira espaço. Sem ele, "Passo D'Areia" e "Passo da
// Areia" geram chaves diferentes e o maior bairro da loja continua partido.
// Fica fora de MINUSCULAS porque na exibição quem cuida do apóstrofo é o
// Title Case, não esta lista.
const PREPOSICOES_CHAVE = new Set([...MINUSCULAS, 'd']);

/**
 * Chave de comparação: sem acento, sem pontuação, sem espaço e sem as
 * preposições. É ela que junta "Passo da Areia" com "Passo D'Areia" — a
 * diferença entre os dois é exatamente um "a" de preposição.
 */
export function chaveBairro(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !PREPOSICOES_CHAVE.has(p))
    .join('');
}

/**
 * Grafias que a chave não junta sozinha, e por quê.
 *
 * Cada linha é um erro real medido na base em 10/09/2026, não uma suposição.
 * A chave da esquerda é o resultado de `chaveBairro`; o valor é como o nome
 * deve aparecer na tela.
 */
const SINONIMOS = {
  // "Passoa Dareia": o espaço caiu no lugar errado ao digitar.
  passoadareia: "Passo d'Areia",
  passoareia: "Passo d'Areia",
  // "Petropolsi": letras trocadas. "901petrópolis" veio com número de rota colado.
  petropolsi: 'Petrópolis',
  '901petropolis': 'Petrópolis',
  // "Jardom Botanico": o "i" virou "o".
  jardombotanico: 'Jardim Botânico',
  // "Paternon": letras trocadas.
  paternon: 'Partenon',
  // "B Fim" abreviado, e "Bonfim" colado — o bairro oficial é Bom Fim.
  bfim: 'Bom Fim',
  bonfim: 'Bom Fim',
  // Plural que não existe: o bairro é Moinhos de Vento.
  moinhosventos: 'Moinhos de Vento',
  // "Chac Das Pedras" abreviado.
  chacpedras: 'Chácara das Pedras',
  // "Cel." é a abreviação de Coronel.
  celaparicioborges: 'Coronel Aparício Borges',
  // Sem o "Jardim" na frente, mas é o mesmo bairro.
  lindoia: 'Jardim Lindóia',
  // Apóstrofo opcional: "Mont Serrat", "Mont'Serrat" e "Mont' Serrat" geram a
  // mesma chave, mas cada uma se exibiria com a própria grafia sem esta linha.
  montserrat: "Mont'Serrat",
};

/**
 * Nome canônico do bairro, para exibir e agrupar.
 *
 * Devolve string vazia para bairro ausente — quem chama decide se mostra "—"
 * ou esconde a linha.
 */
export function bairroCanonico(nome) {
  const bruto = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!bruto) return '';
  const chave = chaveBairro(bruto);
  if (SINONIMOS[chave]) return SINONIMOS[chave];

  // Sem sinônimo: só arruma a caixa alta. Corrige "Alto PetróPolis" e
  // "Cais Do Porto" sem inventar nome novo.
  return bruto
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((palavra, i) => {
      if (i > 0 && MINUSCULAS.has(palavra)) return palavra;
      // "d'areia" vira "d'Areia": a letra depois do apóstrofo também sobe.
      return palavra.replace(/(^|')([a-zà-ÿ])/g, (_, pre, letra) => pre + letra.toLocaleUpperCase('pt-BR'));
    })
    .join(' ');
}

/**
 * Agrupa uma lista de clientes por bairro canônico.
 * Devolve [{ nome, qtd }] ordenado do maior para o menor.
 */
export function contarPorBairro(clientes) {
  // Agrupa pela CHAVE, não pelo nome exibido: duas grafias equivalentes que eu
  // não tenha previsto em SINONIMOS ainda caem no mesmo balde, e o rótulo é a
  // grafia mais usada na própria base — quem decide como se escreve é o dado,
  // não a minha lista.
  const grupos = new Map();
  for (const c of clientes) {
    const nome = bairroCanonico(c.bairro);
    if (!nome) continue;
    const chave = chaveBairro(nome);
    const g = grupos.get(chave) || { qtd: 0, nomes: new Map() };
    g.qtd += 1;
    g.nomes.set(nome, (g.nomes.get(nome) || 0) + 1);
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .map((g) => ({
      nome: [...g.nomes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0],
      qtd: g.qtd,
    }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'));
}
