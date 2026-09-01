// Backfill do campo `d` (endereços) na coleção `clientes`, a partir do backup.
//
// POR QUE O BACKUP E NÃO A COLETA
// -------------------------------
// A rotina diária já grava `d` desde 2026-09-01, mas ela só enxerga quem
// comprou nos últimos 90 dias — quem envelheceu para fora da janela nunca mais
// aparece numa coleta e ficaria sem endereço para sempre. O arquivo em
// `G:\Meu Drive\02 Pizzarias\07 Backup Saipos\cadastros\{loja}.jsonl` é merge e
// nunca esquece ninguém (ver LEIA-BACKUP.md), então é dele que sai a correção
// retroativa.
//
// COMO O CADASTRO DO BACKUP ACHA O CLIENTE DO FIRESTORE
// -----------------------------------------------------
// O Firestore não guarda `id_customer` — a identidade lá é a chave `k`, e ela
// muda quando o coletor religa alguém. Então o casamento é refeito aqui, e são
// só duas regras, as duas fortes:
//
//   1. telefone      2. hash do CPF
//
// NÃO existe regra por nome+bairro aqui, e isso é uma decisão medida. Ela
// existiu na primeira versão e casava 419 cadastros (223 dame + 196 lov). Ao
// medir quem dependia só dela, o número foi este:
//
//   408 clientes ganhavam endereço apenas por nome+bairro — e ZERO deles têm
//   telefone.
//
// Ou seja: a única regra capaz de dar a uma pessoa o endereço de um homônimo
// não alcançava nenhum cliente que o bot do WhatsApp possa atender (o bot só
// fala com quem tem telefone). Custo de removê-la para o caso de uso: nenhum.
// Ganho: a classe de erro grave deixa de existir.
//
// E QUEM PEDE PELO IFOOD, COMO É ACHADO?
// --------------------------------------
// Pelo CPF, e é por isso que ele responde por 3.946 dos 4.114 casamentos. O
// iFood mascara o telefone mas repassa o CPF: medido cruzando o canal de cada
// pedido com o cadastro dele (backup, 2026-09-01),
//
//   cadastro que só pediu por iFood   90% tem CPF,  1% tem telefone, 99% endereço
//   cadastro que nunca usou iFood      6% tem CPF, 99% tem telefone, 96% endereço
//
// O CPF aqui não está fazendo ponte entre sistemas: ele reencontra o MESMO
// cadastro que já gerou o `h` do cliente no Firestore. Ponte de verdade — um
// CPF que ligue um cadastro de iFood a outro com telefone — existe em 27 casos
// por loja. Ver o comentário no fim deste arquivo sobre por que não há mais.
//
// GARANTIAS
// ---------
//   nunca piora  — endereço gravado não é sobrescrito por vazio; a lista é
//                  UNIÃO do que já havia com o que o backup trouxe.
//   idempotente  — a união é por lugar (enderecos.mjs), então rodar duas vezes
//                  não duplica endereço nem alonga lista. A segunda rodada
//                  grava zero blocos.
//
// CPF NUNCA SOBE. O backup tem `cpf_cnpj` em claro; daqui só sai o hash, e só
// para casar — ele nem é gravado (o item já tem o seu `h`).
//
// Uso:
//   node scripts/clientes/backfill_enderecos.mjs --dry
//   node scripts/clientes/backfill_enderecos.mjs
//   node scripts/clientes/backfill_enderecos.mjs --loja=lov

import { createReadStream, readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { montarEnderecos, parseEndereco, normalizar } from './enderecos.mjs';

const RAIZ_BACKUP =
  process.env.SAIPOS_BACKUP || 'G:\\Meu Drive\\02 Pizzarias\\07 Backup Saipos';
const LOJAS = ['dame', 'lov'];
// Espelha o CHUNK_SIZE do importador: os blocos precisam ser reescritos com o
// mesmo tamanho, senão o próximo import diário reparticiona tudo.
const CHUNK_SIZE = 800;

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

/** Espelha `digerir()` de coletar_clientes.py — o `h` do Firestore é isto. */
const digerir = (v) => createHash('sha1').update(v, 'utf8').digest('hex').slice(0, 16);

/** Espelha `limpar_telefone()`: só os dígitos do PRIMEIRO telefone do campo. */
function limparTelefone(v) {
  const t = String(v || '').split('<br>')[0].replace(/\D/g, '');
  return t.length >= 10 ? t : '';
}

/** Espelha `limpar_cpf()`: CNPJ e lixo viram vazio. */
function limparCpf(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? d : '';
}

/** Espelha `limpar_nome()`. */
function limparNome(v) {
  const n = String(v || '').replace(/\s+/g, ' ').trim();
  return /[A-Za-zÀ-ÿ0-9]/.test(n) ? n : '';
}

/** Espelha a escolha do endereço principal em `preparar()`: o da cidade da loja
 *  ganha, porque é o que define o bairro que a tela e os relatórios usam. */
function bairroPrincipal(ends) {
  const poa = ends.filter((e) => normalizar(e.cidade) === 'porto alegre');
  const p = (poa[0] || ends[0]) || null;
  return p ? { bairro: p.bairro || '', cidade: p.cidade || '' } : { bairro: '', cidade: '' };
}

/** Um cadastro por linha do JSONL, já com os endereços quebrados. */
async function lerBackup(loja) {
  const caminho = join(RAIZ_BACKUP, 'cadastros', `${loja}.jsonl`);
  if (!existsSync(caminho)) throw new Error(`backup nao encontrado: ${caminho}`);
  const cadastros = [];
  let ilegiveis = 0;
  const rl = createInterface({ input: createReadStream(caminho, 'utf8'), crlfDelay: Infinity });
  for await (const linha of rl) {
    const s = linha.trim();
    if (!s) continue;
    let r;
    try {
      r = JSON.parse(s);
    } catch {
      ilegiveis += 1;
      continue;
    }
    const ends = String(r.address || '')
      .split('<br>')
      .map(parseEndereco)
      .filter(Boolean);
    cadastros.push({
      id: r.id_customer,
      tel: limparTelefone(r.phone),
      cpf: limparCpf(r.cpf_cnpj),
      nome: limparNome(r.full_name),
      ends,
      ...bairroPrincipal(ends),
    });
  }
  return { cadastros, ilegiveis };
}

/** Os blocos da loja, com os itens e o doc de onde cada um veio. */
async function carregarClientes(db, loja) {
  const snap = await db.collection('clientes').where('loja', '==', loja).get();
  const blocos = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.meta === true) return;
    blocos.push({ id: doc.id, chunk: data.chunk ?? 0, itens: data.itens || [] });
  });
  blocos.sort((a, b) => a.chunk - b.chunk);
  return blocos;
}

/**
 * Decide, para cada item do Firestore, quais endereços do backup são dele.
 *
 * Devolve o mapa item -> lista de endereços, mais o porquê de cada cliente que
 * ficou de fora. As contagens existem para o `--dry` poder responder à única
 * pergunta que importa antes de gravar: quem ganha endereço, quem não ganha e
 * por quê.
 */
function casar(itens, cadastros) {
  const porTel = new Map();
  const porHash = new Map();
  for (const it of itens) {
    if (it.t && !porTel.has(it.t)) porTel.set(it.t, it);
    if (it.h && !porHash.has(it.h)) porHash.set(it.h, it);
  }

  const achados = new Map(); // item -> lista de listas de endereços
  const via = { telefone: 0, cpf: 0 };
  let semEndereco = 0;
  let semCliente = 0;

  for (const c of cadastros) {
    if (!c.ends.length) {
      semEndereco += 1;
      continue;
    }
    let alvo = null;
    let regra = '';
    if (c.tel && porTel.has(c.tel)) {
      alvo = porTel.get(c.tel);
      regra = 'telefone';
    } else if (c.cpf && porHash.has(digerir(c.cpf))) {
      alvo = porHash.get(digerir(c.cpf));
      regra = 'cpf';
    }
    // Sem telefone e sem CPF o cadastro fica de fora. Nome+bairro casaria mais
    // 419, todos de clientes sem telefone (ver o cabeçalho) — não vale o risco
    // de entregar no endereço de um homônimo.
    if (!alvo) {
      semCliente += 1;
      continue;
    }
    via[regra] += 1;
    if (!achados.has(alvo)) achados.set(alvo, []);
    achados.get(alvo).push(c.ends);
  }
  return { achados, via, semEndereco, semCliente };
}

/** Aplica os endereços achados. Não muda nada quando o resultado é igual ao que
 *  já estava — é o que faz a segunda rodada gravar zero blocos. */
function aplicar(blocos, achados) {
  let ganharam = 0;
  let cresceram = 0;
  let inalterados = 0;
  const mudou = new Set();
  const exemplos = [];

  for (const bloco of blocos) {
    bloco.itens = bloco.itens.map((it) => {
      const novas = achados.get(it) || [];
      const d = montarEnderecos([it.d, ...novas], { bairro: it.b, cidade: it.c });
      const antes = JSON.stringify(it.d ?? null);
      const depois = JSON.stringify(d ?? null);
      if (antes === depois) {
        inalterados += 1;
        return it;
      }
      mudou.add(bloco);
      if (!it.d) ganharam += 1;
      else cresceram += 1;
      if (exemplos.length < 400) exemplos.push({ item: it, d, cru: novas.flat() });
      const out = { ...it };
      if (d) out.d = d;
      else delete out.d;
      return out;
    });
  }
  return { ganharam, cresceram, inalterados, mudou, exemplos };
}

/** Bytes que o doc ocupa no Firestore, aproximados pelo JSON. Serve para saber
 *  se o bloco está longe do teto de 1 MB — o número exato do Firestore é um
 *  pouco maior (nome do campo + overhead por valor), mas a ordem de grandeza é
 *  esta e é ela que decide se o CHUNK_SIZE precisa cair. */
const bytes = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');

function mostrarExemplos(exemplos) {
  const acha = (fn) => exemplos.find(fn);
  const anon = (s) => String(s || '').replace(/\d/g, '#');
  const linha = (e) =>
    [e.logradouro, e.numero && anon(e.numero), e.complemento && anon(e.complemento)]
      .filter(Boolean)
      .join(', ') + ` — ${e.bairro || '?'}, ${e.cidade || '?'}`;

  const casos = [
    ['um endereço só', acha((x) => x.d.length === 1 && !x.d[0].complemento)],
    ['dois ou mais endereços', acha((x) => x.d.length > 1)],
    [
      'complemento embutido no address',
      acha((x) => x.d.some((e) => e.complemento && e.complemento.length > 6)),
    ],
  ];
  for (const [titulo, ex] of casos) {
    if (!ex) continue;
    console.log(`\n  -- ${titulo} --`);
    // Nome e telefone não aparecem, e os dígitos do endereço vão mascarados:
    // isto é log de terminal, não relatório com dado pessoal dentro.
    console.log(`     cliente ..${String(ex.item.k || '').slice(-4)} (${ex.item.b || 'sem bairro'})`);
    for (const cru of ex.cru.slice(0, 3)) console.log(`     cru: ${anon(JSON.stringify(cru))}`);
    for (const e of ex.d) console.log(`     ->  ${anon(linha(e))}`);
  }
}

async function gravar(db, loja, blocos, mudou) {
  const batch = db.batch();
  for (const bloco of blocos) {
    if (!mudou.has(bloco)) continue;
    batch.update(db.collection('clientes').doc(bloco.id), {
      itens: bloco.itens,
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const soLoja = (args.find((a) => a.startsWith('--loja=')) || '').split('=')[1];
  const lojas = soLoja ? [soLoja] : LOJAS;
  const db = initFirestore();

  for (const loja of lojas) {
    console.log(`\n=================== ${loja.toUpperCase()} ===================`);
    const { cadastros, ilegiveis } = await lerBackup(loja);
    const blocos = await carregarClientes(db, loja);
    const itens = blocos.flatMap((b) => b.itens);
    if (!itens.length) {
      console.log('  nenhum cliente no Firestore, pulando');
      continue;
    }
    const antesBytes = blocos.map((b) => bytes(b.itens));
    const comEnderecoAntes = itens.filter((i) => i.d).length;

    console.log(
      `  backup: ${cadastros.length} cadastros` +
        (ilegiveis ? ` (${ilegiveis} linhas ilegiveis)` : '') +
        ` · Firestore: ${itens.length} clientes em ${blocos.length} bloco(s)`
    );

    const { achados, via, semEndereco, semCliente } = casar(itens, cadastros);
    const { ganharam, cresceram, inalterados, mudou, exemplos } = aplicar(blocos, achados);

    const depois = blocos.flatMap((b) => b.itens);
    const comEndereco = depois.filter((i) => i.d).length;
    const multi = depois.filter((i) => i.d && i.d.length > 1).length;
    const sem = depois.filter((i) => !i.d);

    console.log('\n  -- cadastros do backup --');
    console.log(
      `     casados: ${via.telefone} por telefone, ${via.cpf} por CPF`
    );
    console.log(`     sem endereco no cadastro: ${semEndereco}`);
    console.log(`     sem cliente correspondente na base: ${semCliente}`);

    console.log('\n  -- clientes --');
    console.log(`     ganham endereco agora: ${ganharam}`);
    console.log(`     ja tinham e ganham endereco a mais: ${cresceram}`);
    console.log(`     ja estavam certos (nada a fazer): ${inalterados}`);
    console.log(
      `     com endereco: ${comEnderecoAntes} -> ${comEndereco} de ${depois.length} ` +
        `(${Math.round((100 * comEndereco) / depois.length)}%)`
    );
    // A métrica que decide se o bot funciona. O total acima conta junto o
    // cliente de marketplace sem telefone, que o bot nunca vai atender — ele
    // pesa em faturamento e bairro, não em atendimento.
    const comTel = depois.filter((i) => i.t);
    const comTelEEndereco = comTel.filter((i) => i.d).length;
    console.log(
      `     DESTES, com telefone (o publico do bot): ${comTelEEndereco} de ${comTel.length} ` +
        `(${Math.round((100 * comTelEEndereco) / Math.max(comTel.length, 1))}%)`
    );
    console.log(`     com mais de um endereco: ${multi}`);
    console.log(`     ficam SEM endereco: ${sem.length}`);
    if (sem.length) {
      // O motivo importa, e nenhum destes é bug — é o limite do dado:
      //   sem chave        cadastro de marketplace, sem telefone e sem CPF:
      //                    não há por onde achá-lo no backup.
      //   tel. emprestado  o telefone do item não é do cadastro, foi o coletor
      //                    que religou (campo `o`); o backup não tem esse número.
      //   sem endereço     achamos o cadastro, mas ele não tem `address`.
      const semChave = sem.filter((i) => !i.t && !i.h).length;
      const emprestado = sem.filter((i) => i.o).length;
      console.log(
        `       ${semChave} sem telefone e sem CPF (cadastro de marketplace: nao ha o que casar)` +
          `\n       ${emprestado} com telefone emprestado pelo coletor (o backup nao tem esse numero)` +
          `\n       ${sem.length - semChave - emprestado} restantes: o cadastro casou mas nao tem ` +
          'endereco, ou saiu do Saipos'
      );
    }

    const depoisBytes = blocos.map((b) => bytes(b.itens));
    const kb = (n) => `${Math.round(n / 1024)} KB`;
    const media = (a) => a.reduce((x, y) => x + y, 0) / Math.max(depois.length, 1);
    console.log('\n  -- tamanho do doc (teto do Firestore: 1 MB) --');
    console.log(
      `     por cliente: ${Math.round(media(antesBytes))} -> ${Math.round(media(depoisBytes))} bytes`
    );
    console.log(
      `     maior bloco: ${kb(Math.max(...antesBytes))} -> ${kb(Math.max(...depoisBytes))}` +
        `  (blocos de ${CHUNK_SIZE})`
    );
    const maior = Math.max(...depoisBytes);
    if (maior > 600 * 1024) {
      console.log(`     *** ATENCAO: passou de 600 KB. Reduzir CHUNK_SIZE. ***`);
    }

    if (exemplos.length) mostrarExemplos(exemplos);

    if (dry) {
      console.log(`\n  [dry] nada gravado (${mudou.size} bloco(s) seriam reescritos)`);
      continue;
    }
    if (!mudou.size) {
      console.log('\n  nada a gravar — a base ja esta em dia');
      continue;
    }
    await gravar(db, loja, blocos, mudou);
    console.log(`\n  gravado: ${mudou.size} bloco(s) de ${blocos.length}`);
  }
  console.log('\nOK');
}

// POR QUE NÃO HÁ COMO LIGAR O CLIENTE DE IFOOD AO DE BALCÃO
// ---------------------------------------------------------
// A pergunta natural é se existe uma chave melhor que endereço para reconhecer
// a mesma pessoa entre canais. Todos os campos do cadastro foram medidos no
// backup (2026-09-01), separando quem só pediu por iFood de quem nunca usou:
//
//   campo        iFood   balcão/DD   serve de ponte?
//   telefone       1%       99%      não — nunca está nos dois
//   CPF           90%        6%      quase não — 27 pontes por loja
//   endereço      99%       96%      é o único presente dos dois lados
//   e-mail         0%        2%      não
//   nascimento     0%        1%      não
//   `notes`        0%        0%      vazio na base inteira
//
// E o Saipos não funde sozinho: apenas 22 cadastros na dame e 8 na lov usaram
// iFood e outro canal com o mesmo `id_customer`. Quem pede pelos dois tem dois
// cadastros, e nada no dado os liga além do endereço.
//
// A ponte que falta não está no Saipos — está no bot. Ele é o único ponto do
// sistema que tem o telefone REAL e uma conversa: quando alguém escreve e a
// base não o reconhece, o endereço que ele informar para a entrega fecha o elo
// com o cadastro de iFood pela chave de lugar de `enderecos.mjs`. É a única
// forma de construir o vínculo, e ela se paga sozinha — o bot já precisaria
// perguntar o endereço de qualquer jeito.

// O casamento é a parte delicada; exportar as funções puras deixa testá-lo sem
// Firestore e sem o backup (scripts/clientes/backfill_enderecos.test.mjs).
export { casar, aplicar, limparTelefone, limparNome, bairroPrincipal, digerir };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
