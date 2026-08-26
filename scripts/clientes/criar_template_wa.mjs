// Submete (e acompanha) o template de marketing na Cloud API da Meta.
//
// Por que existe: no painel o template é preenchido à mão, e o campo que mais
// derruba aprovação — o EXEMPLO da variável — fica escondido atrás de um
// "Adicionar exemplo" fácil de pular. Sem exemplo a Meta rejeita por
// "conteúdo incompleto". Aqui o exemplo vai junto, sempre.
//
// ⚠️ Template é POR WABA. O que for aprovado na WABA de teste NÃO acompanha o
// número quando a coexistência do 3332-2440 entrar no ar: lá ele é submetido de
// novo, na WABA da Dáme. O que se aproveita é o texto já aprovado uma vez.
//
// Token e WABA saem do mesmo store do registrar_numero_wa.mjs (gitignored).
//
// Uso:
//   node scripts/clientes/criar_template_wa.mjs --loja lov            # submete
//   node scripts/clientes/criar_template_wa.mjs --loja lov --listar   # status
//   node scripts/clientes/criar_template_wa.mjs --loja lov --seco     # só mostra o JSON

import { existsSync, readFileSync } from 'node:fs';

const GRAPH = 'https://graph.facebook.com/v21.0';
const STORE = 'C:\\claude_project\\Hub\\_credenciais\\whatsapp-cloud.env';

const WABA_PADRAO = { dame: '206538077125724', lov: '' };

// O template, como vai para a Meta. Categoria MARKETING é obrigatória para
// mensagem de reativação: mandar isso como UTILITY é o caminho mais curto para
// a conta levar advertência.
const TEMPLATE = {
  name: 'retorno_cliente',
  language: 'pt_BR',
  category: 'MARKETING',
  corpo:
    'Oi, {{1}}! Faz um tempo que você não pede aqui 🍕\n\n' +
    'Queremos te ver de volta — chama a gente que a gente te conta as novidades da semana.',
  // O exemplo é o que a Meta usa para revisar. Nome curto e comum: nome
  // esquisito faz o revisor achar que a variável aceita qualquer coisa.
  exemplo: ['Fábio'],
  // Rodapé de descadastro: além da LGPD, é ele que segura a nota de qualidade —
  // quem consegue sair não bloqueia, e bloqueio derruba o número.
  rodape: 'Responda SAIR para não receber mais.',
  // Quick Reply, não URL: a campanha sai do mesmo número que atende, então um
  // botão wa.me apontaria para a própria conversa. A resposta do quick reply
  // chega no celular de quem atende E no nosso webhook (vira campanhaRespostas).
  botao: 'Quero saber',
};

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

function corpoDaApi() {
  return {
    name: TEMPLATE.name,
    language: TEMPLATE.language,
    category: TEMPLATE.category,
    components: [
      {
        type: 'BODY',
        text: TEMPLATE.corpo,
        example: { body_text: [TEMPLATE.exemplo] },
      },
      { type: 'FOOTER', text: TEMPLATE.rodape },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: TEMPLATE.botao }] },
    ],
  };
}

async function chamar(caminho, token, corpo) {
  const resp = await fetch(`${GRAPH}${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = dados?.error || {};
    throw new Error(`[${e.code ?? resp.status}] ${e.message || 'erro'}${e.error_user_msg ? `\n      → ${e.error_user_msg}` : ''}`);
  }
  return dados;
}

async function main() {
  const args = process.argv.slice(2);
  const opcao = (nome) => {
    const i = args.indexOf(`--${nome}`);
    return i >= 0 ? String(args[i + 1] || '').trim() : '';
  };
  const loja = (opcao('loja') || 'lov').toLowerCase();
  const SUF = loja.toUpperCase();

  if (args.includes('--seco')) {
    console.log(JSON.stringify(corpoDaApi(), null, 2));
    return;
  }

  const waba = opcao('waba') || doStore(`WA_WABA_${SUF}`) || WABA_PADRAO[loja] || '';
  const token = doStore(`WA_TOKEN_${SUF}`);
  if (!waba) {
    console.error(`sem WABA para ${loja}: preencha WA_WABA_${SUF} no store ou passe --waba`);
    process.exit(1);
  }
  if (!token) {
    console.error(`sem token: preencha WA_TOKEN_${SUF} em ${STORE}`);
    process.exit(1);
  }

  try {
    if (args.includes('--listar')) {
      const r = await chamar(`/${waba}/message_templates?fields=name,status,category,language,rejected_reason&limit=50`, token);
      if (!r.data?.length) {
        console.log('Nenhum template nessa WABA.');
        return;
      }
      for (const t of r.data) {
        console.log(
          `   ${t.name}  ${t.language}  ${t.category}  → ${t.status}` +
            (t.rejected_reason && t.rejected_reason !== 'NONE' ? `  (${t.rejected_reason})` : '')
        );
      }
      return;
    }

    console.log(`\nSubmetendo "${TEMPLATE.name}" (${TEMPLATE.language}) na WABA ${waba}...`);
    const r = await chamar(`/${waba}/message_templates`, token, corpoDaApi());
    console.log(`   ok — id=${r.id} status=${r.status ?? 'PENDING'}`);
    console.log('\nA aprovação leva de minutos a 24h. Acompanhe com --listar.');
    console.log(`No modal de campanha da intranet, o nome do template é: ${TEMPLATE.name}`);
  } catch (e) {
    console.error(`\nFALHOU: ${e.message}`);
    process.exitCode = 1;
  }
}

main();
