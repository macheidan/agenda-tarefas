#!/usr/bin/env node
/**
 * importSurveys.mjs — importa as pesquisas de satisfação (NPS) do Delivery
 * Direto para a coleção `surveys` do Firestore, que a SurveysView lê.
 *
 * Ponte Delivery Direto → Firestore. Usa Playwright porque o admin do DD é uma
 * SPA: o login é feito em JS e os endpoints rejeitam POST direto (403 CSRF/WAF).
 * O script deixa a própria página resolver o slug da pesquisa (`pesquisa-14`)
 * para o id numérico (`14735`) e intercepta a resposta de `/surveys/N/answers`,
 * então a config abaixo precisa só da URL que aparece no navegador.
 *
 * Escrita idempotente: id do doc = `dd_<brand>_<survey_hash>`, com merge.
 * Rodar de novo nunca duplica.
 *
 * Uso:
 *   node scripts/importSurveys.mjs [--dry] [--headed]
 *
 *   --dry     → mostra o que faria, sem escrever no Firestore
 *   --headed  → abre o browser (útil pra depurar login/2FA)
 *
 * Pré-requisitos:
 *   1. npm i -D playwright && npx playwright install chromium
 *   2. .env na raiz com DD_EMAIL e DD_PASSWORD (o .env já está no .gitignore —
 *      NUNCA commitar credencial)
 *   3. serviceAccount.json na raiz (ou GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Se a conta do DD tiver 2FA ativo, o login headless falha por definição — o
 * script avisa e você precisa desativar o 2FA dessa conta ou trocar para uma
 * conta de serviço sem 2FA.
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * Lojas a importar. `surveyUrl` é a URL da pesquisa como ela aparece no admin.
 * Para achar a da Lov: admin do DD da loja → Clientes → Pesquisa de satisfação.
 */
const STORES = [
  {
    brand: 'dame',
    storeName: 'DAME PIZZA',
    surveyUrl: 'https://deliverydireto.com.br/admin/portoalegre/mepizzas/surveys/pesquisa-14',
  },
  // TODO(Fábio): a conta machadofabio@gmail.com só enxerga a DAME PIZZA — não há
  // troca de loja no admin. Para trazer a Lov, adicione aqui a URL da pesquisa
  // dela. Se a Lov usar OUTRO login do DD, coloque as credenciais em
  // DD_EMAIL_LOV / DD_PASSWORD_LOV e preencha `credentials: 'lov'` abaixo.
  // {
  //   brand: 'lov',
  //   storeName: 'LOV PIZZA',
  //   surveyUrl: 'https://deliverydireto.com.br/admin/<marca>/<loja>/surveys/pesquisa-N',
  //   credentials: 'lov',
  // },
];

const SIGNIN_URL = 'https://deliverydireto.com.br/admin/signin';
const ANSWERS_RE = /\/surveys\/\d+\/answers/;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const HEADED = args.includes('--headed');

function loadEnv() {
  // .env simples (KEY=VALUE), sem dependência extra.
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function credentialsFor(store) {
  const suffix = store.credentials ? `_${store.credentials.toUpperCase()}` : '';
  const email = process.env[`DD_EMAIL${suffix}`];
  const password = process.env[`DD_PASSWORD${suffix}`];
  if (!email || !password) {
    throw new Error(
      `Faltam DD_EMAIL${suffix} / DD_PASSWORD${suffix} no .env (loja ${store.storeName}).`
    );
  }
  return { email, password };
}

async function login(page, { email, password }) {
  await page.goto(SIGNIN_URL, { waitUntil: 'domcontentloaded' });

  // Já logado (sessão reaproveitada): o DD redireciona para /pedidos.
  if (!/\/admin\/signin/.test(page.url())) return;

  const emailField = page.locator('input[type="email"], input[name="email"]').first();
  const passField = page.locator('input[type="password"], input[name="password"]').first();

  await emailField.waitFor({ state: 'visible', timeout: 20000 });
  await emailField.fill(email);
  await passField.fill(password);
  await passField.press('Enter');

  await page.waitForURL((u) => !/\/admin\/signin/.test(String(u)), { timeout: 30000 }).catch(() => {
    throw new Error(
      'Login no Delivery Direto não completou. Causas prováveis: credencial errada, ' +
        '2FA ativo na conta, ou o DD mudou a tela de login. Rode com --headed para ver.'
    );
  });
}

/** Carrega a página da pesquisa e captura o JSON que ela mesma busca. */
async function fetchAnswers(page, surveyUrl) {
  const waitForAnswers = page.waitForResponse(
    (r) => ANSWERS_RE.test(r.url()) && r.status() === 200,
    { timeout: 30000 }
  );
  await page.goto(surveyUrl, { waitUntil: 'domcontentloaded' });
  const response = await waitForAnswers.catch(() => {
    throw new Error(`Não veio resposta de /surveys/N/answers em ${surveyUrl}`);
  });
  const body = await response.json();
  if (body?.status !== 'success' || !body?.data?.questions) {
    throw new Error(`Resposta inesperada do DD em ${surveyUrl}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.data.questions;
}

/**
 * Achata as perguntas do DD em um respondente por `survey_hash`.
 * O DD repete `numeric_answer` (a nota) e os dados do cliente em TODA resposta
 * do mesmo hash; as perguntas TEXT viram a lista `answers`.
 */
function groupRespondents(questions, store) {
  const byHash = new Map();

  for (const question of questions) {
    for (const answer of question.answers || []) {
      const hash = answer.survey_hash;
      if (!hash) continue;

      if (!byHash.has(hash)) {
        byHash.set(hash, {
          source: 'dd',
          brand: store.brand,
          storeName: store.storeName,
          hash,
          nota: null,
          orderId: answer.orders_id || '',
          customerName: answer.user?.first_name || '',
          email: answer.user?.email || '',
          phone: answer.user?.telephone || '',
          // CPF (answer.user.document) existe no DD e é deliberadamente ignorado:
          // a intranet não precisa e é dado sensível de cliente.
          answers: [],
          _respondedAt: null,
        });
      }

      const entry = byHash.get(hash);
      const nota = Number(answer.numeric_answer);
      if (entry.nota === null && Number.isFinite(nota)) entry.nota = nota;
      if (!entry._respondedAt || answer.created > entry._respondedAt) {
        entry._respondedAt = answer.created;
      }

      const text = String(answer.answer ?? '').trim();
      if (question.type === 'TEXT' && text) {
        entry.answers.push({ question: question.description, answer: text });
      }
    }
  }

  return [...byHash.values()].map((entry) => {
    const { _respondedAt, ...rest } = entry;
    return {
      ...rest,
      respondedAt: _respondedAt ? Timestamp.fromDate(new Date(_respondedAt)) : null,
    };
  });
}

async function main() {
  loadEnv();

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright não instalado. Rode: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  if (STORES.length === 0) {
    console.error('Nenhuma loja configurada em STORES.');
    process.exit(1);
  }

  let db = null;
  if (!DRY) {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
    if (!existsSync(keyPath)) {
      console.error(`serviceAccount não encontrado em ${keyPath}.`);
      process.exit(1);
    }
    if (!getApps().length) {
      initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
    }
    db = getFirestore();
  }

  const browser = await chromium.launch({ headless: !HEADED });
  let total = 0;

  try {
    // Uma sessão por conjunto de credenciais (lojas do mesmo login reaproveitam).
    const contexts = new Map();

    for (const store of STORES) {
      const credKey = store.credentials || 'default';
      if (!contexts.has(credKey)) {
        const context = await browser.newContext();
        const page = await context.newPage();
        await login(page, credentialsFor(store));
        contexts.set(credKey, page);
        console.log(`Login OK (${credKey}).`);
      }
      const page = contexts.get(credKey);

      const questions = await fetchAnswers(page, store.surveyUrl);
      const respondents = groupRespondents(questions, store);
      console.log(
        `${store.storeName}: ${respondents.length} respondentes ` +
          `(${respondents.filter((r) => r.answers.length).length} com comentário).`
      );

      if (DRY) {
        const worst = [...respondents].sort((a, b) => (a.nota ?? 99) - (b.nota ?? 99)).slice(0, 3);
        for (const r of worst) {
          console.log(`  nota ${r.nota} · ${r.customerName} · pedido ${r.orderId}`);
        }
        total += respondents.length;
        continue;
      }

      let batch = db.batch();
      let pending = 0;
      for (const r of respondents) {
        batch.set(
          db.collection('surveys').doc(`dd_${store.brand}_${r.hash}`),
          { ...r, importedAt: Timestamp.now() },
          { merge: true }
        );
        pending += 1;
        if (pending === 400) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
      if (pending > 0) await batch.commit();
      total += respondents.length;
    }
  } finally {
    await browser.close();
  }

  console.log(DRY ? `[dry] ${total} respondentes — nada escrito.` : `${total} respondentes gravados em surveys.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
