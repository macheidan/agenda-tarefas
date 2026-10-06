// Sobe para a intranet (Firestore `clientes`) os clientes que NASCERAM no
// sistema de pedidos (balcão ou bot do WhatsApp) e que a coleta do Saipos nunca
// vai enxergar. Regra do Fábio, 2026-10-06: "cliente que não tem cadastro na
// intranet e fez o primeiro contato pelo sistema: assim que o caixa for
// finalizado, subir o cadastro dele junto com os outros".
//
// De onde vêm: o PDV sobe cada cliente para a tabela Supabase `pdv_clientes`
// segundos depois de cada pedido (sync.js). Aqui lê-se essa tabela — nenhuma
// credencial do Firebase precisa ir para o PC da loja.
//
// O que entra: só quem NÃO casa com ninguém da base (modo `soNovos` do
// importador). Quem já existe segue sendo atualizado pela coleta diária do
// Saipos, que é a fonte de pedidos, receita e histórico. O item entra com
// `f: 'pdv'` para a tela saber de onde veio.
//
// Uso: node scripts/clientes/subir_pdv.mjs --loja dame [--dias 2] [--dry] [--forcar]
// Quem chama: o monitor do whatsbot ao receber "caixa fechado" da loja, e o
// run_clientes.cmd de madrugada (com --forcar, porque roda dentro da janela da
// coleta, logo depois dela — é a rede de segurança para um fechamento que falhou).

import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fundir, carregarExistentes, gravar, initFirestore, LOJAS } from './importar_clientes.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const loja = opt('--loja', '');
const dias = Math.max(1, Number(opt('--dias', 2)) || 2);
const dry = args.includes('--dry');
const forcar = args.includes('--forcar');

if (!LOJAS.includes(loja)) {
  console.error('uso: node scripts/clientes/subir_pdv.mjs --loja dame|lov [--dias 2] [--dry] [--forcar]');
  process.exit(1);
}

// Janela da coleta diária (run_clientes.cmd às 03:40, até ~1 h): o importador lê
// a base inteira, funde e REGRAVA os blocos; uma escrita nossa no meio se perde.
const agora = new Date();
const hora = agora.getHours() + agora.getMinutes() / 60;
if (!forcar && hora >= 3.33 && hora < 5) {
  console.log('janela da coleta diária (03:20–05:00): pulando; o run_clientes.cmd sobe o PDV no fim dela');
  process.exit(0);
}

// Lock: dois fechamentos de caixa (dois PCs) ou fechamento + madrugada não
// podem gravar os blocos ao mesmo tempo. Lock com mais de 10 min é de um
// processo que morreu.
const DATA_DIR = join(AQUI, 'data');
mkdirSync(DATA_DIR, { recursive: true });
const LOCK = join(DATA_DIR, `subir_pdv-${loja}.lock`);
if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs < 10 * 60 * 1000) {
  console.log('outra subida em andamento para esta loja: pulando');
  process.exit(0);
}
writeFileSync(LOCK, String(process.pid));

// A credencial é a mesma do importador; fixar o caminho aqui deixa o script
// indiferente ao diretório de onde foi chamado (o whatsbot chama de outro lugar).
process.env.GOOGLE_APPLICATION_CREDENTIALS ||= join(AQUI, '..', '..', 'serviceAccount.json');

function lerSupabase() {
  const arquivo = process.env.PDV_SUPABASE_JSON || 'C:/claude_project/Pizzarias/pedidos dame lov/supabase.json';
  const supa = JSON.parse(readFileSync(arquivo, 'utf8'));
  if (!supa.url || !supa.key) throw new Error(`${arquivo} sem url/key`);
  return supa;
}

async function clientesDoPdv(supa) {
  const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
  const url =
    `${supa.url.replace(/\/+$/, '')}/rest/v1/pdv_clientes` +
    `?marca=eq.${loja}&total_pedidos=gt.0&ultimo_pedido=gte.${desde}` +
    '&select=telefone,nome,rua,numero,complemento,bairro,total_pedidos,ultimo_pedido';
  const r = await fetch(url, {
    headers: { apikey: supa.key, Authorization: `Bearer ${supa.key}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { desde, linhas: await r.json() };
}

// Linha do PDV -> formato que o importador espera do coletor (ver daColeta).
function paraColeta(l) {
  const telefone = String(l.telefone || '').replace(/\D/g, '');
  return {
    chave: `t:${telefone}`,
    telefone,
    nome: String(l.nome || '').trim(),
    ultimaCompra: l.ultimo_pedido || '',
    // Primeira compra só é conhecida quando este foi o único pedido.
    primeiraCompra: l.total_pedidos === 1 ? l.ultimo_pedido || '' : '',
    pedidos: l.total_pedidos || 0,
    bairro: String(l.bairro || '').trim(),
    cidade: 'Porto Alegre',
    telefoneOrigem: 'cadastro',
    enderecosCrus: l.rua
      ? [{ logradouro: l.rua, numero: l.numero || '', complemento: l.complemento || '', bairro: l.bairro || '', cidade: 'Porto Alegre' }]
      : [],
    fonte: 'pdv',
  };
}

try {
  const supa = lerSupabase();
  const { desde, linhas } = await clientesDoPdv(supa);
  const novos = linhas.map(paraColeta).filter((c) => c.telefone.length >= 10 && c.nome);

  const db = initFirestore();
  const { itens: existentes, chunks, metaAntiga } = await carregarExistentes(db, loja);
  const { itens, inseridos, pulados } = fundir(existentes, novos, { soNovos: true });
  console.log(
    `== ${loja.toUpperCase()} == pdv desde ${desde}: ${linhas.length} (${novos.length} válidos) · ` +
      `novos na intranet: ${inseridos} · já na base: ${pulados} · base final: ${itens.length}`
  );
  if (inseridos) {
    const nomes = itens.filter((i) => i.f === 'pdv' && !existentes.includes(i)).map((i) => `${i.n} (${i.t})`);
    console.log(`  entram: ${nomes.slice(0, 20).join(', ')}${nomes.length > 20 ? ` +${nomes.length - 20}` : ''}`);
  }
  if (!inseridos) {
    console.log('  nada a gravar');
  } else if (dry) {
    console.log('  [dry] nada gravado');
  } else {
    const blocos = await gravar(db, loja, itens, {}, chunks, metaAntiga, { soNovos: true });
    console.log(`  gravado em ${blocos} bloco(s)`);
  }
} finally {
  try {
    unlinkSync(LOCK);
  } catch {}
}
process.exit(0);
