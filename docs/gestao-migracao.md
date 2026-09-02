# Gestão — migração do dashboard_pizzarias (2026-08-25)

As seções **Mesa do Dono, Dash, Vendas, DRE e Anotações** foram migradas do
projeto `dashboard_pizzarias` (fabiomachado.com.br/pizzas, Firebase
`dash-pizzarias`) para a intranet, na categoria **Gestão** do menu. As views
foram reescritas no padrão da casa (JS + CSS modules + constituição); os
gráficos usam **recharts** (chunk próprio no build).

**A categoria inteira é EXCLUSIVA do admin** (machadofabio@gmail.com, o
`isAdmin()` das rules) desde 2026-08-25 — assim como a sub-aba **Salários**
do Depto Pessoal (a flag `dpSalariosVisible` foi aposentada). O trava é em
duas camadas: no cliente as flags são lidas com `isAdmin && x === true`, e
nas firestore.rules a leitura das coleções é `isAdmin()` puro. As flags
`xEnabled` (default OFF) seguem existindo só pro próprio admin esconder
seções do seu menu — em Configurações, as linhas da Gestão só aparecem
quando o usuário selecionado é o admin.

## De onde vem cada dado

| Seção | Fonte | Coleção/arquivo |
|---|---|---|
| Mesa do Dono | Firestore + JSON do coletor | `fechamentos_mensais`, `checkpoints` + `dashboard-data-<token>.json` |
| Dash | JSON do coletor + localStorage | `dashboard-data-<token>.json` (foco/frases/layout ficam no browser) |
| Vendas | Firestore | `vendas_itens`, `checkpoints` |
| DRE | Firestore | `fechamentos_mensais`, `dre_detalhes` |
| Anotações | Firestore (CRUD, só admin escreve) | `checkpoints` |

- **Firestore**: as 4 coleções foram copiadas de `dash-pizzarias` para
  `agenda-tarefas-76ef8` por `scripts/gestao/migrarDadosDash.mjs` (3.092 docs
  em 2026-08-25). O script é idempotente; pra re-rodar precisa das duas
  service accounts (ver cabeçalho dele).
- **JSON do coletor** (`dashboard-data-<VITE_DASH_TOKEN>.json`): publicado
  pelo runner Python em `scripts/dash/` (todo dia 03:00, tarefa do Task
  Scheduler `DashboardColeta3h` → `run_dash.cmd`; até 2026-09-02 morava em
  `machado-labs/_ferramentas/dashboard`) via FTPS em
  `fabiomachado.com.br/pizzas/data/`. Os coletores são `saipos_vendas.py`
  (valor, pedidos e pizzas de ontem + mês corrente por canal, via Playwright no
  Saipos), `news.py`/`harvester.py`/`newsletters.py`/`youtube.py` (IA e
  mercado), `agenda.py` (Google Calendar), `projetos.py`, `instagram.py` e
  `extras.py` (clima, câmbio). `config.json` (senhas FTP/IMAP), `*.pickle` e
  `data/` (histórico de vendas, caches, log) ficam fora do git. Debug:
  `python runner.py --so-consolida --sem-envio`; só vendas com retry e
  backfill dos dias que faltarem: `python runner.py --so-vendas --headless`;
  popular a tabela diária do mês na primeira vez: `--backfill-mes`. A intranet
  busca de lá **cross-origin**
  — o CORS vem de um `.htaccess` que foi criado nessa pasta
  (`Access-Control-Allow-Origin: *`; a proteção do arquivo segue sendo o token
  no nome). Se o runner um dia limpar a pasta, recriar o `.htaccess`.

## Quem mantém o Firestore em dia: Apps Scripts em DUAL-WRITE

Os dois Apps Scripts das planilhas gravam via REST (OAuth do dono, ignora as
rules). As versões **dual-write** em `scripts/gestao/*.gs` (fora do git — têm
token de sync) gravam nos DOIS projetos: `dash-pizzarias` (dashboard antigo) e
`agenda-tarefas-76ef8` (intranet).

**Instalado em 2026-08-25** (via Claude in Chrome): os dois scripts foram
colados por cima dos originais, os Web Apps foram **reimplantados em nova
versão** (DRE → Versão 5; VENDAS → Versão 3 — a URL `/exec` não muda) e o
`syncTudo()` rodou nos dois com dual-write confirmado no Firestore da
intranet (`dre_synced_at`/`dados_synced_at`/`synced_at` de 2026-08-25).

Detalhes de manutenção:
- O gatilho onChange sempre roda a versão HEAD do script — sincroniza os dois
  projetos a cada edição da planilha, sem depender da implantação.
- O Web App (`/exec`, botão "Atualizar da planilha" da intranet) roda a
  **versão implantada**: mexeu no `.gs`, precisa criar "Nova versão" em
  Implantar → Gerenciar implantações, senão o botão fica no código velho.
- `doGet` sem parâmetro (rodado pelo editor) chama `syncTudo()` direto — o
  token continua obrigatório em requisições web reais.
- Quando o dashboard antigo for aposentado, tirar `'dash-pizzarias'` de
  `PROJECT_IDS` nos dois scripts (e criar nova versão das implantações).

## Variáveis de ambiente novas (`.env` + secret `DOTENV` do Action)

```
VITE_DASH_TOKEN=…          # nome do JSON do coletor
VITE_SYNC_DRE_URL=…        # Web App do SyncDashboard.gs (planilha DRE)
VITE_SYNC_DRE_TOKEN=…
VITE_SYNC_VENDAS_URL=…     # Web App do SyncVendas.gs (planilha VENDAS LOJAS)
VITE_SYNC_VENDAS_TOKEN=…
```

Sem elas o app funciona, mas: sem `VITE_DASH_TOKEN` o Dash e o card "Vendas
por dia" ficam sem dados; sem as `VITE_SYNC_*` os botões "Atualizar da
planilha" somem (`dreSyncConfigured`/`vendasSyncConfigured`).

## firestore.rules

Bloco "Gestão" no fim do arquivo: leitura atrás da flag da seção
(`fechamentos_mensais` abre pra Mesa do Dono OU DRE; `checkpoints` abre pra
qualquer flag da Gestão porque os gráficos leem as anotações), escrita
`false` (Apps Script ignora rules) — exceto `checkpoints`, onde o admin tem
CRUD pela aba Anotações. Publicadas em 2026-08-25.

## O que ficou de fora (de propósito)

- **Margem por canal na Mesa do Dono**: o card de canais mostra só a fatia %
  — a cadeia de CMV do dashboard antigo (`cmv_sabores`, `cardapio_adicionais`,
  `useMargensCanal`) não veio, porque a intranet já tem CMV/Margem próprios em
  Preços. Integrar os dois é melhoria futura.
- **iFood Semanal, Disparos e Gerador Story**: seções do dashboard antigo que
  não faziam parte do pedido; continuam só lá.
- **Comparativo Dáme × Lov** na Mesa do Dono: era placeholder no original,
  não veio.
