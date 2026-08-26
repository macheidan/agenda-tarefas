// Registra um número na Cloud API sob o NOSSO app e assina o webhook.
//
// Por que existe: quando um parceiro (no caso a ManyChat) é removido, o número
// fica "Offline" — ele continua na conta, mas sem nenhum app conectado, e não há
// tela no painel da Meta que refaça essa ligação. São duas chamadas de API:
//
//   POST /{waba}/subscribed_apps      → o app passa a receber os webhooks da conta
//   POST /{phone_number_id}/register  → o número volta a ficar "Conectado"
//
// ⚠️ `register` NÃO EXISTE em conta SMB (número que nasceu no aplicativo
// WhatsApp Business): responde `[100] Register endpoint is not available for SMB
// businesses`. É o caso do +55 51 3332-2440 da Dáme. O passo 1 imprime o
// `platform_type` justamente para você ver isso ANTES de tentar registrar:
// CLOUD_API registra, ON_PREMISE não registra por ajuste nenhum de script.
//
// O token NÃO fica no repositório nem passa por variável de ambiente comitada:
// o script pergunta na hora e usa só em memória. Rode você mesmo, no seu
// terminal — é o mesmo token que vai depois para a Vercel (WA_TOKEN_*).
//
// Uso:
//   node scripts/clientes/registrar_numero_wa.mjs            # Dáme
//   node scripts/clientes/registrar_numero_wa.mjs --loja lov
//   node scripts/clientes/registrar_numero_wa.mjs --so-listar
//   node scripts/clientes/registrar_numero_wa.mjs --loja lov --waba 123 --phone 456

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

// IDs conferidos no Business Manager em 2026-08-19 (não são segredo). Servem só
// de padrão: o que estiver em WA_WABA_<LOJA>/WA_PHONE_ID_<LOJA> no store tem
// precedência, e --waba/--phone têm mais ainda. É o que permite apontar o script
// para uma WABA recém-criada sem mexer em código.
const LOJAS = {
  dame: { waba: '206538077125724', phone: '2802736619807612', rotulo: 'Dáme · +55 51 3332-2440' },
  // Slot da Lov — hoje é por ele que passa o chip TIM de teste, numa WABA nova
  // no BM da Lov (a WABA da Dáme está travada pela linha de crédito da ManyChat).
  lov: { waba: '110959808608511', phone: null, rotulo: 'Lov / chip de teste' },
};

// Mensagens da Meta que valem tradução — são as que de fato aparecem aqui.
const DICAS = {
  100: 'Parâmetro inválido — confira se o phone number ID está certo. Se a mensagem falar em "SMB businesses", o número é ON_PREMISE e não tem como registrar: só coexistência via Embedded Signup.',
  190: 'Token inválido ou expirado. Gere de novo no usuário de sistema.',
  200: 'O token não tem permissão. Precisa de whatsapp_business_management + whatsapp_business_messaging.',
  133005: 'PIN de verificação em duas etapas errado. Redefina em Gerenciador do WhatsApp → Números de telefone → o número → Verificação em duas etapas.',
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
  // indexOf(-1)+1 daria args[0]: sem esse helper, `--so-listar` sozinho viraria
  // nome de loja e o script morria dizendo "loja desconhecida: --so-listar".
  const opcao = (nome) => {
    const i = args.indexOf(`--${nome}`);
    return i >= 0 ? String(args[i + 1] || '').trim() : '';
  };
  const loja = (opcao('loja') || 'dame').toLowerCase();
  const soListar = args.includes('--so-listar');
  const cfg = LOJAS[loja];
  if (!cfg) {
    console.error(`loja desconhecida: ${loja} (use dame ou lov)`);
    process.exit(1);
  }
  const SUF = loja.toUpperCase();
  const waba = opcao('waba') || doStore(`WA_WABA_${SUF}`) || cfg.waba;
  const phoneFixo = opcao('phone') || doStore(`WA_PHONE_ID_${SUF}`) || cfg.phone;
  if (!waba) {
    console.error(`sem WABA para ${loja}: preencha WA_WABA_${SUF} no store ou passe --waba`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log(`\n== ${cfg.rotulo} ==`);
  console.log(`WABA: ${waba}`);

  let token = doStore(`WA_TOKEN_${SUF}`);
  if (token) {
    console.log(`Token lido de ${STORE}`);
  } else {
    console.log('O token é o do usuário de sistema (nunca expira).');
    console.log(`Dica: cole em ${STORE} e ele é lido sozinho da próxima vez.`);
    token = (await rl.question('Token de acesso: ')).trim();
  }
  if (!token) {
    console.error('sem token, saindo');
    process.exit(1);
  }

  try {
    console.log('\n1) Números na conta:');
    const campos =
      'id,display_phone_number,verified_name,status,quality_rating,code_verification_status,platform_type';
    const numeros = await chamar(`/${waba}/phone_numbers?fields=${campos}`, token);
    for (const n of numeros.data || []) {
      console.log(
        `   ${n.display_phone_number}  id=${n.id}  status=${n.status}` +
          `  qualidade=${n.quality_rating ?? '—'}  plataforma=${n.platform_type ?? '—'}`
      );
    }
    if (soListar) return;

    const phoneId = phoneFixo || numeros.data?.[0]?.id;
    if (!phoneId) throw new Error('não achei o phone number ID');
    const alvo = (numeros.data || []).find((n) => n.id === phoneId);
    if (alvo?.platform_type === 'ON_PREMISE') {
      throw new Error(
        'esse número é ON_PREMISE (conta SMB) — o endpoint /register não existe nele.\n' +
          '      → Não adianta insistir: o caminho é coexistência via Embedded Signup.'
      );
    }

    console.log('\n2) Assinando o app nos webhooks da conta...');
    await chamar(`/${waba}/subscribed_apps`, token, {});
    console.log('   ok');

    console.log('\n3) Registrando o número.');
    let pin = doStore(`WA_PIN_${SUF}`);
    if (pin) {
      console.log(`   PIN lido de ${STORE}`);
    } else {
      console.log('   O PIN é a verificação em duas etapas do número (6 dígitos).');
      console.log(`   Em número novo é você que escolhe — anote no store como WA_PIN_${SUF}.`);
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
