// Deploy do portal (build estatico) para hospedagem FTP — publica em
// damepizza.com.br/intranet SEM afetar o deploy da Vercel (que roda na raiz).
//
// Uso:
//   1. Copie .env.ftp.example para .env.ftp e preencha host/usuario/senha.
//      (.env.ftp esta no .gitignore — a senha NUNCA vai pro git.)
//   2. npm run deploy:ftp
//
// O script:
//   - roda `npm run build:ftp` (vite build --base=/intranet/), a menos que
//     voce passe --skip-build (para subir um dist/ ja gerado);
//   - envia o conteudo de dist/ para FTP_DIR no servidor.
//
// Variaveis (em .env.ftp ou no ambiente):
//   FTP_HOST      host FTP            (ex: ftp.damepizza.com.br)
//   FTP_USER      usuario
//   FTP_PASSWORD  senha
//   FTP_DIR       pasta remota        (ex: /public_html/intranet)
//   FTP_SECURE    "true" p/ FTPS explicito (TLS). Padrao: false
//   FTP_PORT      porta               (padrao: 21)
//   FTP_CLEAN     "true" apaga a pasta remota antes de subir. Padrao: false
//                 (false mantem chunks antigos vivos p/ quem estiver com a
//                  pagina aberta; true deixa o servidor limpo mas pode quebrar
//                  sessoes em andamento por alguns segundos)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from 'basic-ftp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Carrega .env.ftp (parser simples KEY=VALUE) sem sobrescrever o que ja veio do ambiente.
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(resolve(root, '.env.ftp'));

const {
  FTP_HOST, FTP_USER, FTP_PASSWORD,
  FTP_DIR = '/intranet',
  FTP_SECURE = 'false',
  FTP_PORT = '21',
  FTP_CLEAN = 'false',
  // URL publica pra checagem pos-deploy. Se vazio, o check e pulado.
  PUBLIC_URL = '',
} = process.env;

const faltando = ['FTP_HOST', 'FTP_USER', 'FTP_PASSWORD'].filter(k => !process.env[k]);
if (faltando.length) {
  console.error(`\n[deploy-ftp] Faltam variaveis: ${faltando.join(', ')}`);
  console.error('Crie um arquivo .env.ftp (veja .env.ftp.example) ou defina no ambiente.\n');
  process.exit(1);
}

const skipBuild = process.argv.includes('--skip-build');

// --v2            publica em <FTP_DIR>/v2 (design TailAdmin, ligado pelo
//                 [data-v2] que o index.html seta quando a URL é /intranet/v2)
// --subdir <nome> publica num subpath qualquer. Serve pra conferir a V1 rodando
//                 e logada: como o path não casa /intranet/v2, o [data-v2] não
//                 liga e o build renderiza o caminho da v1 — e por ser a mesma
//                 origem, a sessão do Firebase vem junto (localhost não vem).
//                 Ex: npm run deploy:ftp -- --subdir v1check
// Sem flag nenhuma, tudo se comporta como antes.
const isV2 = process.argv.includes('--v2');
const subIdx = process.argv.indexOf('--subdir');
const subdir = subIdx !== -1 && process.argv[subIdx + 1]
  ? process.argv[subIdx + 1].replace(/^\/+|\/+$/g, '')
  : (isV2 ? 'v2' : null);

const WEB_BASE = subdir ? `/intranet/${subdir}/` : '/intranet/'; // casa com o --base do build
const targetDir = subdir ? `${FTP_DIR.replace(/\/$/, '')}/${subdir}` : FTP_DIR;
const buildScript = subdir ? `npx vite build --base=${WEB_BASE}` : 'npm run build:ftp';
const publicUrl = subdir && PUBLIC_URL
  ? `${PUBLIC_URL.replace(/\/$/, '')}/${subdir}/`
  : PUBLIC_URL;

if (!skipBuild) {
  console.log(`[deploy-ftp] Buildando com base=${WEB_BASE} ...`);
  // shell: true e obrigatorio no Windows pra resolver o npm (.cmd). Comando como
  // string unica (sem array de args) evita o DeprecationWarning DEP0190.
  const r = spawnSync(buildScript, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error('[deploy-ftp] build falhou.'); process.exit(1); }
} else {
  console.log('[deploy-ftp] --skip-build: usando dist/ existente.');
}

const distDir = resolve(root, 'dist');
if (!existsSync(distDir)) {
  console.error('[deploy-ftp] pasta dist/ nao encontrada. Rode sem --skip-build.');
  process.exit(1);
}

// O manifest PWA fica em public/ com caminhos absolutos ("/") que o Vite nao
// reescreve. No subpath /intranet/ isso faria o "instalar app" abrir a raiz
// errada — entao ajustamos o manifest do dist/ (nao toca no repo nem na Vercel).
const manifestPath = resolve(distDir, 'manifest.webmanifest');
if (existsSync(manifestPath)) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    m.start_url = WEB_BASE;
    m.scope = WEB_BASE;
    if (Array.isArray(m.icons)) {
      for (const ic of m.icons) {
        if (typeof ic.src === 'string' && ic.src.startsWith('/') && !ic.src.startsWith(WEB_BASE)) {
          ic.src = WEB_BASE.replace(/\/$/, '') + ic.src;
        }
      }
    }
    writeFileSync(manifestPath, JSON.stringify(m, null, 2));
    console.log(`[deploy-ftp] manifest ajustado para ${WEB_BASE}`);
  } catch (e) {
    console.warn('[deploy-ftp] aviso: nao consegui ajustar o manifest:', e.message);
  }
}

const client = new Client(30_000);
client.ftp.verbose = false;

try {
  console.log(`[deploy-ftp] Conectando em ${FTP_HOST}:${FTP_PORT} (secure=${FTP_SECURE}) ...`);
  await client.access({
    host: FTP_HOST,
    port: Number(FTP_PORT),
    user: FTP_USER,
    password: FTP_PASSWORD,
    secure: FTP_SECURE === 'true',
    // HostGator: FTPS explicito com cert que nao casa o hostname (ftp.dominio).
    // TLS "loose" (nao valida o cert) — mesmo comportamento do deploy do
    // machado-labs (security: loose) e do dame_brand (FTP_TLS_INSECURE=1).
    secureOptions: { rejectUnauthorized: false },
  });

  await client.ensureDir(targetDir); // cria (se preciso) e entra na pasta remota
  if (FTP_CLEAN === 'true') {
    console.log('[deploy-ftp] FTP_CLEAN=true: limpando pasta remota ...');
    await client.clearWorkingDir();
  }

  console.log(`[deploy-ftp] Enviando dist/ -> ${targetDir} ...`);
  await client.uploadFromDir(distDir);

  console.log('\n[deploy-ftp] ✓ Upload concluido.');
} catch (err) {
  console.error('\n[deploy-ftp] Erro:', err.message);
  process.exitCode = 1;
} finally {
  client.close();
}

// Checagem pos-deploy: confirma que a URL publica responde 200 e que o HTML
// aponta os assets pro base certo. So roda se o upload foi ok e PUBLIC_URL existe.
if (process.exitCode !== 1 && publicUrl) {
  const url = publicUrl.endsWith('/') ? publicUrl : publicUrl + '/';
  // Da uns segundos pro FTP/CDN assentar antes de bater na URL.
  await new Promise(r => setTimeout(r, 3000));
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    clearTimeout(t);
    const html = await res.text();
    const assetsOk = html.includes(`${WEB_BASE}assets/`);
    if (res.status === 200 && assetsOk) {
      console.log(`[deploy-ftp] ✓ ${url} respondeu 200 e os assets apontam pra ${WEB_BASE}.`);
    } else if (res.status === 200) {
      console.warn(`[deploy-ftp] ⚠ ${url} respondeu 200, mas nao achei "${WEB_BASE}assets/" no HTML — confira o base do build.`);
    } else {
      console.warn(`[deploy-ftp] ⚠ ${url} respondeu HTTP ${res.status} (esperado 200).`);
      process.exitCode = 1;
    }
  } catch (e) {
    console.warn(`[deploy-ftp] ⚠ nao consegui checar ${url}: ${e.message}`);
  }
} else if (process.exitCode !== 1) {
  console.log('[deploy-ftp] (defina PUBLIC_URL no .env.ftp pra checar a URL automaticamente)');
}
