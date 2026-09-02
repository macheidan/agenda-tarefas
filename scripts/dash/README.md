# scripts/dash — coletor do Dash

Alimenta as abas **Dash** e **Mesa do Dono** (mês corrente) da intranet. Roda todo
dia às 03:00 pela tarefa do Task Scheduler `DashboardColeta3h` → `run_dash.cmd`,
que chama `runner.py --headless` e grava o log em `data/runner.log`.

Veio do dashboard pessoal do machado-labs (fabiomachado.com.br/dashboard),
descontinuado em 2026-09-02. Desde então o único consumidor do JSON é a intranet.

## Fluxo

1. Coletores gravam um `.json` cada em `data/`:
   - `saipos_vendas.py` — valor, pedidos e pizzas de **ontem** por loja
     (`vendas.json`) e o **mês corrente por canal** (`vendas_mes.json`), via
     Playwright no Saipos (relatórios *sales-by-period* e *store-item-sold*).
     Loja sempre pelo ID (10677 Dáme, 11377 Lov), nunca por posição.
   - `news.py`, `harvester.py`, `newsletters.py` (IMAP), `youtube.py` — IA e mercado.
   - `agenda.py` (Google Calendar), `projetos.py`, `instagram.py`, `extras.py` (clima, câmbio).
2. `runner.py` consolida tudo em `data/dashboard-data.json` (mantém 7 dias em
   `vendas_hist.json` e o mês em `vendas_dias.json`) e envia por FTPS para
   `fabiomachado.com.br/pizzas/data/dashboard-data-<dash_token>.json`.
3. A intranet lê esse arquivo cross-origin (`useDashFeed`, `VITE_DASH_TOKEN`);
   o CORS vem de um `.htaccess` na pasta remota — se a pasta for limpa, recriar.

## Uso manual

```
python runner.py --so-consolida --sem-envio   # só junta os .json (debug)
python runner.py --so-vendas --headless       # só Saipos, com retry e backfill dos dias que faltam
python runner.py --backfill-mes --headless    # popula a tabela diária do mês na primeira vez
python saipos_vendas.py --dia 2026-08-30      # um dia específico
```

## Fora do git

`config.json` (senhas FTP/IMAP, `dash_token`), `token_calendar.pickle` e `data/`
(faturamento, caches, log). Modelo das chaves em `config.example.json`.
