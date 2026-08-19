// Registra o número da loja na Cloud API sob o NOSSO app e assina o webhook.
//
// Por que existe: quando um parceiro (no caso a ManyChat) é removido, o número
// fica "Offline" — ele continua na conta, mas sem nenhum app conectado, e não há
// tela no painel da Meta que refaça essa ligação. São duas chamadas de API:
//
//   POST /{waba}/subscribed_apps      → o app passa a receber os webhooks da conta
//   POST /{phone_number_id}/register  → o número volta a ficar "Conectado"
//
// O token NÃO fica no repositório nem passa por variável de ambiente comitada:
// o script pergunta na hora e usa só em memória. Rode você mesmo, no seu
// terminal — é o mesmo token que vai depois para a Vercel (WA_TOKEN_DAME).
//
// Uso:
//   node scripts/clientes/registrar_numero_wa.mjs            # Dáme
//   node scripts/clientes/registrar_numero_wa.mjs --loja lov
//   node scripts/clientes/registrar_numero_wa.mjs --so-listar

import readline from 'node:readline/promises';
import { existsSync, readFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';

const GRAPH = 'https://graph.facebook.com/v21.0';

// Store central de credenciais (gitignored). Se o token já estiver lá, o script
// não pergunta nada — é o mesmo valor que vai para as env vars da Vercel.
const STORE = 'C:\\claude_project\\Hub\\_credenciais\\whatsapp-cloud.env';

function doStore(chave) {
  if (!existsSync(STORE)) return '';
  for (const linha of readFileSync(STORE, 'utf8').split(/\r?\n/)) {
    const s = linha.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    if (s.slice(0, i).trim() === chave) return s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return '';
}

// IDs conferidos no Business Manager em 2026-08-19 (não são segredo).
const LOJAS = {
  dame: { waba: '206538077125724', phone: '2802736619807612', rotulo: 'Dáme · +55 51 3332-2440' },
  // A Lov ainda não tem o número verificado; preencher quando tiver.
  lov: { waba: '110959808608511', phone: null, rotulo: 'Lov · +55 51 3388-2002' },
};

// Mensagens da Meta que valem tradução — são as que de fato aparecem aqui.
const DICAS = {
  100: 'Parâmetro inválido — confira se o phone number ID está certo.',
  190: 'Token inválido ou expirado. Gere de novo no usuário de sistema.',
  200: 'O token não tem permissão. Precisa de whatsapp_business_management + whatsapp_business_messaging.',
  133005: 'PIN de verificação em duas etapas errado. Se foi a ManyChat que definiu, redefina em Gerenciador do WhatsApp → Números de telefone → o número → Verificação em duas etapas.',
  133016: 'Número bloqueado por tentativas demais. Espere e tente de novo mais tarde.',
  133010: 'O número ainda não foi verificado nessa conta.',
};

async function chamar(caminho, token, corpo) {
  const resp = await fetch(`${GRAPH}${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = dados?.error || {};
    const dica = DICAS[e.code];
    throw new Error(`[${e.code ?? resp.status}] ${e.message || 'erro'}${dica ? `\n      → ${dica}` : ''}`);
  }
  return dados;
}

async function main() {
  const args = process.argv.slice(2);
  const loja = (args[args.indexOf('--loja') + 1] || 'dame').toLowerCase();
  const soListar = args.includes('--so-listar');
  const cfg = LOJAS[loja];
  if (!cfg) {
    console.error(`loja desconhecida: ${loja} (use dame ou lov)`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log(`\n== ${cfg.rotulo} ==`);

  let token = doStore(`WA_TOKEN_${loja.toUpperCase()}`);
  if (token) {
    console.log(`Token lido de ${STORE}`);
  } else {
    console.log('O token é o do usuário de sistema intranet-whatsapp (nunca expira).');
    console.log(`Dica: cole em ${STORE} e ele é lido sozinho da próxima vez.`);
    token = (await rl.question('Token de acesso: ')).trim();
  }
  if (!token) {
    console.error('sem token, saindo');
    process.exit(1);
  }

  try {
    console.log('\n1) Números na conta:');
    const numeros = await chamar(`/${cfg.waba}/phone_numbers?fields=id,display_phone_number,verified_name,status,quality_rating,code_verification_status`, token);
    for (const n of numeros.data || []) {
      console.log(`   ${n.display_phone_number}  id=${n.id}  status=${n.status}  qualidade=${n.quality_rating ?? '—'}`);
    }
    if (soListar) return;

    const phoneId = cfg.phone || numeros.data?.[0]?.id;
    if (!phoneId) throw new Error('não achei o phone number ID');

    console.log('\n2) Assinando o app nos webhooks da conta...');
    await chamar(`/${cfg.waba}/subscribed_apps`, token, {});
    console.log('   ok');

    console.log('\n3) Registrando o número.');
    let pin = doStore(`WA_PIN_${loja.toUpperCase()}`);
    if (pin) {
      console.log(`   PIN lido de ${STORE}`);
    } else {
      console.log('   O PIN é a verificação em duas etapas do número (6 dígitos).');
      console.log('   Se a ManyChat definiu um e você não sabe qual é, redefina antes no');
      console.log('   Gerenciador do WhatsApp → Números de telefone → o número → Verificação em duas etapas.');
      pin = (await rl.question('   PIN de 6 dígitos: ')).trim();
    }
    if (!/^\d{6}$/.test(pin)) throw new Error('o PIN precisa ter exatamente 6 dígitos');

    await chamar(`/${phoneId}/register`, token, { messaging_product: 'whatsapp', pin });
    console.log('   ok — o número deve aparecer como "Conectado" em alguns segundos.');

    console.log('\nPronto. Confira em Gerenciador do WhatsApp → Números de telefone.');
  } catch (e) {
    console.error(`\nFALHOU: ${e.message}`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
