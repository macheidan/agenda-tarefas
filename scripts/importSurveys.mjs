#!/usr/bin/env node
/**
 * importSurveys.mjs — importa as pesquisas de satisfação (NPS) do Delivery
 * Direto para a coleção `surveys` do Firestore, que a SurveysView lê.
 *
 * Login e credenciais reaproveitados do projeto irmão `caixas-conferencia`
 * (coletores/stripe_dd.py), que já faz isso em produção: mesmos seletores,
 * mesmo .env. NÃO duplicar credencial aqui — a fonte da verdade é
 * C:\claude_project\Pizzarias\KPI\.env (DAME_EMAIL/DAME_PASSWORD,
 * LOV_EMAIL/LOV_PASSWORD). Cada loja é uma CONTA diferente do DD, por isso
 * cada uma roda num contexto de browser isolado.
 *
 * Playwright (e não fetch) porque o admin do DD é uma SPA e os endpoints de
 * auth rejeitam POST direto com 403 (CSRF/WAF). O id numérico da pesquisa
 * (14735) não sai do slug (`pesquisa-14`) nem do HTML, então o script deixa a
 * própria página resolver e intercepta a resposta de `/surveys/N/answers`.
 *
 * Escrita idempotente: id do doc = `dd_<brand>_<survey_hash>`, com merge.
 * Rodar de novo nunca duplica.
 *
 * Uso:
 *   node scripts/importSurveys.mjs [--dry] [--headed] [--loja DAME|LOV]
 *
 * Pré-requisitos: npx playwright install chromium · serviceAccount.json na raiz.
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/** Mesma fonte de credenciais do caixas-conferencia (coletores/stripe_dd.py). */
const KPI_ENV = 'C:\\claude_project\\Pizzarias\\KPI\\.env';

const SIGNIN = 'https://deliverydireto.com.br/admin/signin';
const ANSWERS_RE = /\/surveys\/\d+\/answers/;

/**
 * Uma entrada por loja. `surveyPath` é a URL da pesquisa como aparece no admin
 * (Clientes → Pesquisa de satisfação → Ver resultados).
 */
const STORES = [
  {
    loja: 'DAME',
    brand: 'dame',
    storeName: 'DAME PIZZA',
    surveyPath: '/admin/portoalegre/mepizzas/surveys/pesquisa-14',
  },
  // TODO(Fábio): falta a URL da pesquisa da Lov. O slug da loja é
  // `lovpizza/lovpizza` (confirmado em caixas-conferencia/coletores/dd_stats.py)
  // e as credenciais LOV_* já existem no KPI/.env — só falta o `pesquisa-N`.
  // {
  //   loja: 'LOV',
  //   brand: 'lov',
  //   storeName: 'LOV PIZZA',
  //   surveyPath: '/admin/lovpizza/lovpizza/surveys/pesquisa-N',
  // },
];

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const HEADED = args.includes('--headed');
const only = args.includes('--loja') ? args[args.indexOf('--loja') + 1]?.toUpperCase() : null;

/** Lê o .env do KPI sem depender de dotenv. Os valores nunca são logados. */
function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

function credentialsFor(loja, env) {
  const email = env[`${loja}_EMAIL`];
  const password = env[`${loja}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`credenciais ${loja}_* não encontradas em ${KPI_ENV}`);
  }
  return { email, password };
}

/** Login no DD — mesmos seletores do caixas-conferencia (stripe_dd.py::_login). */
async function login(page, { email, password }, loja) {
  await page.goto(SIGNIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  if (!page.url().includes('signin')) return; // sessão já ativa

  await page.click('.adopt-c-Imbrw', { timeout: 2000 }).catch(() => {}); // banner cookies
  await page.fill('input#email', email);
  await page.fill('input#password', password);
  await page.click('.js-signin-btn');
  await page
    .waitForURL((u) => !String(u).includes('signin'), { timeout: 30000 })
    .catch(() => {
      throw new Error(
        `login no DD não completou (${loja}). Confira ${loja}_EMAIL/${loja}_PASSWORD ` +
          `em ${KPI_ENV}, ou rode com --headed para ver a tela.`
      );
    });
  await page.waitForTimeout(2000);
}

/** Carrega a página da pesquisa e captura o JSON que ela mesma busca. */
async function fetchAnswers(page, surveyPath) {
  const waitForAnswers = page.waitForResponse(
    (r) => ANSWERS_RE.test(r.url()) && r.status() === 200,
    { timeout: 40000 }
  );
  await page.goto(`https://deliverydireto.com.br${surveyPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  const response = await waitForAnswers.catch(() => {
    throw new Error(
      `não veio resposta de /surveys/N/answers em ${surveyPath} — a pesquisa existe nessa loja?`
    );
  });
  const body = await response.json();
  if (body?.status !== 'success' || !body?.data?.questions) {
    throw new Error(`resposta inesperada do DD em ${surveyPath}`);
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

  return [...byHash.values()].map(({ _respondedAt, ...rest }) => ({
    ...rest,
    respondedAt: _respondedAt ? Timestamp.fromDate(new Date(_respondedAt)) : null,
  }));
}

async function main() {
  const env = readEnvFile(KPI_ENV);
  const stores = only ? STORES.filter((s) => s.loja === only) : STORES;
  if (stores.length === 0) {
    console.error(only ? `loja ${only} não configurada em STORES.` : 'nenhuma loja configurada.');
    process.exit(1);
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright não instalado: npm i -D playwright && npx playwright install chromium');
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
    for (const store of stores) {
      // Contexto isolado por loja: cada uma é uma conta distinta do DD, então
      // os cookies não podem vazar de uma pra outra.
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await login(page, credentialsFor(store.loja, env), store.loja);

        const questions = await fetchAnswers(page, store.surveyPath);
        const respondents = groupRespondents(questions, store);
        const comComentario = respondents.filter((r) => r.answers.length).length;
        const detratores = respondents.filter((r) => r.nota <= 6).length;
        console.log(
          `${store.storeName}: ${respondents.length} respondentes · ` +
            `${comComentario} com comentário · ${detratores} detratores`
        );

        if (DRY) {
          const piores = [...respondents].sort((a, b) => (a.nota ?? 99) - (b.nota ?? 99)).slice(0, 3);
          for (const r of piores) console.log(`  nota ${r.nota} · ${r.customerName} · pedido ${r.orderId}`);
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
          if (++pending === 400) {
            await batch.commit();
            batch = db.batch();
            pending = 0;
          }
        }
        if (pending > 0) await batch.commit();
        total += respondents.length;
      } finally {
        await context.close();
      }
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
