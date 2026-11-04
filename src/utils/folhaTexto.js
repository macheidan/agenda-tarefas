// Leitura do texto colado da folha de pagamento (PDF do contador → Ctrl+A/Ctrl+C).
//
// O texto vem embaralhado: cada recibo sai em duas vias, recibo comprido vira
// várias páginas ("A TRANSPORTAR") e as colunas Código/Descrição/Referência/
// Valor saem em listas separadas. O que é estável:
//   • cada página termina numa linha "Data Data" → é o separador de blocos;
//   • o nome é a linha antes de "Nome do Funcionário";
//   • a última página de cada recibo traz, logo depois de "Declaro ter recebido…",
//     três valores: Total de Vencimentos, Total de Descontos e Valor Líquido
//     (venc − desc = líquido — é o que confirma que a trinca é a certa);
//   • empréstimo consignado = linhas "DESC. EMP. CRED. TRAB Nº <contrato>": o
//     contrato identifica o desconto, então a duplicata das duas vias some ao
//     indexar por ele.

const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const normNome = (s) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

// "1.234,56" → 1234.56
export const parseValor = (s) => {
  const t = String(s || '').trim();
  if (!/^-?[\d.]+,\d{2}$/.test(t)) return null;
  return Number(t.replace(/\./g, '').replace(',', '.'));
};

const isValor = (l) => /^[\d.]+,\d{2}$/.test(l) || /^\d+:\d{2}$/.test(l);
const isCodigo = (l) => /^\d+$/.test(l);
const RE_EMP_INLINE = /DESC\.?\s*EMP\.?\s*CRED\.?\s*TRAB\.?\s*N\S*\s*(\d+)\s+([\d.]+,\d{2})/i;
const RE_EMP = /DESC\.?\s*EMP\.?\s*CRED\.?\s*TRAB\.?\s*N\S*\s*(\d+)/i;
const cents = (n) => Math.round(n * 100) / 100;

function lerBloco(linhas) {
  const b = { nome: null, empresa: null, cargo: null, mes: null, ano: null, liquido: null, linhas };
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!b.nome && /^Nome do Funcion/i.test(l) && i > 0) b.nome = linhas[i - 1];
    if (!b.empresa && /^CNPJ/i.test(l) && i > 0) b.empresa = linhas[i - 1];
    const m = normNome(l).match(/^([a-z]+) de (\d{4})$/);
    if (!b.mes && m && MESES.includes(m[1])) { b.mes = MESES.indexOf(m[1]); b.ano = Number(m[2]); }
    if (!b.cargo && /Admiss[aã]o:/i.test(l)) b.cargo = l.replace(/\s*Admiss[aã]o:.*$/i, '').trim();
    if (b.liquido == null && /^Declaro ter recebido/i.test(l)) {
      // Às vezes códigos de verba se intercalam entre os totais (recibo da
      // Patricia): pula linhas só de código e testa as trincas seguidas.
      const vals = [];
      for (let j = i + 1; j < linhas.length && j <= i + 12; j++) {
        if (isCodigo(linhas[j])) continue;
        const v = parseValor(linhas[j]);
        if (v == null) break;
        vals.push(v);
      }
      for (let j = 0; j + 2 < vals.length; j++) {
        const [a, d, c] = vals.slice(j, j + 3);
        if (Math.abs(a - d - c) < 0.02) { b.liquido = c; break; }
      }
    }
  }
  return b;
}

// Empréstimos de um funcionário: { contrato: valor }. Primeiro o valor na mesma
// linha da descrição (o caso limpo); só para contrato sem valor inline, cai no
// alinhamento de colunas — a descrição na posição i de um bloco de descrições
// casa com o i-ésimo valor do bloco de valores logo a seguir.
function lerEmprestimos(blocos) {
  const out = {};
  for (const b of blocos) {
    for (const l of b.linhas) {
      const m = l.match(RE_EMP_INLINE);
      if (m && out[m[1]] == null) out[m[1]] = parseValor(m[2]);
    }
  }
  for (const b of blocos) {
    const L = b.linhas;
    for (let i = 0; i < L.length; i++) {
      if (isValor(L[i]) || isCodigo(L[i]) || !/[a-z]/i.test(L[i])) continue;
      // início de uma sequência de descrições
      let j = i;
      while (j < L.length && !isValor(L[j]) && !isCodigo(L[j]) && /[a-z]/i.test(L[j])) j++;
      const descs = L.slice(i, j);
      let k = j;
      while (k < L.length && isValor(L[k])) k++;
      const vals = L.slice(j, k);
      descs.forEach((d, idx) => {
        const m = d.match(RE_EMP);
        if (m && out[m[1]] == null && !RE_EMP_INLINE.test(d) && vals[idx] != null) {
          const v = parseValor(vals[idx]);
          if (v != null) out[m[1]] = v;
        }
      });
      i = j - 1;
    }
  }
  return out;
}

// Texto inteiro → [{ nome, empresa, cargo, mes, ano, liquido, emprestimos, emprestimoTotal, socio, rescisao }]
export function lerFolhaTexto(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blocos = [];
  let atual = [];
  for (const l of linhas) {
    if (/^Data\s+Data$/i.test(l)) { blocos.push(atual); atual = []; } else atual.push(l);
  }
  if (atual.length) blocos.push(atual);

  const porNome = new Map();
  for (const bl of blocos) {
    const b = lerBloco(bl);
    if (!b.nome) continue;
    const k = normNome(b.nome);
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push(b);
  }

  const res = [];
  for (const bs of porNome.values()) {
    const first = bs[0];
    const pick = (f) => bs.find((b) => b[f] != null)?.[f] ?? null;
    const emprestimos = lerEmprestimos(bs);
    const texto = bs.flatMap((b) => b.linhas).join('\n');
    res.push({
      nome: first.nome,
      empresa: pick('empresa'),
      cargo: pick('cargo'),
      mes: pick('mes'),
      ano: pick('ano'),
      liquido: pick('liquido'),
      emprestimos,
      emprestimoTotal: cents(Object.values(emprestimos).reduce((t, v) => t + v, 0)),
      socio: /PRO-?LABORE/i.test(texto) || /^SOCIO$/i.test(pick('cargo') || ''),
      rescisao: /RESCIS/i.test(texto),
    });
  }
  return res;
}

// Casa o nome da folha (completo) com o cadastro da intranet (apelido/primeiro
// nome: "Paty" ↔ PATRICIA, "Fabi" ↔ FABIANA). Mais de um candidato (dois Julios)
// desempata pela loja da empresa da folha; sem desempate, devolve null e a tela
// pede para escolher.
export function casarFuncionario(nomeFolha, employees, storeIdDaEmpresa) {
  const prim = normNome(nomeFolha).split(/\s+/)[0] || '';
  const prefixo = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
  const cands = employees.filter((e) => {
    const p = normNome(e.name).split(/\s+/)[0] || '';
    if (!p) return false;
    if (p === prim) return true;
    const c = prefixo(p, prim);
    return c >= 3 && c >= Math.min(p.length, prim.length) - 1;
  });
  // Ordem de confiança: nome igual → apelido que é começo do nome ("Fabi" ⊂
  // FABIANA, e não "Fabio") → parecido ("Paty" ↔ PATRICIA).
  const pnome = (e) => normNome(e.name).split(/\s+/)[0];
  const exatos = cands.filter((e) => pnome(e) === prim);
  const prefixos = cands.filter((e) => prim.startsWith(pnome(e)));
  const pool = exatos.length ? exatos : prefixos.length ? prefixos : cands;
  if (pool.length === 1) return pool[0];
  if (storeIdDaEmpresa) {
    const daLoja = pool.filter((e) => e.store === storeIdDaEmpresa);
    if (daLoja.length === 1) return daLoja[0];
  }
  return null;
}
