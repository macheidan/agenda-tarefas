# Gestão — migração do dashboard_pizzarias (2026-08-25)

As seções **Mesa do Dono, Dash, Vendas, DRE e Anotações** foram migradas do
projeto `dashboard_pizzarias` (fabiomachado.com.br/pizzas, Firebase
`dash-pizzarias`) para a intranet, na categoria **Gestão** do menu. As views
foram reescritas no padrão da casa (JS + CSS modules + constituição); os
gráficos usam **recharts** (chunk próprio no build).

Todas as 5 seções nascem **OFF** (`mesaDonoEnabled`, `dashEnabled`,
`vendasEnabled`, `dreEnabled`, `gestaoNotasEnabled` — `=== true`); o admin
habilita por usuário nas Configurações.

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
- **JSON do coletor** (`dashboard-data-<VITE_DASH_TOKEN>.json`): continua sendo
  publicado pelo runner Python externo (Hub) via FTP em
  `fabiomachado.com.br/pizzas/data/`. A intranet busca de lá **cross-origin**
  — o CORS vem de um `.htaccess` que foi criado nessa pasta
  (`Access-Control-Allow-Origin: *`; a proteção do arquivo segue sendo o token
  no nome). Se o runner um dia limpar a pasta, recriar o `.htaccess`.

## Quem mantém o Firestore em dia: Apps Scripts em DUAL-WRITE

Os dois Apps Scripts das planilhas gravam via REST (OAuth do dono, ignora as
rules). As versões **dual-write** em `scripts/gestao/*.gs` (fora do git — têm
token de sync) gravam nos DOIS projetos: `dash-pizzarias` (dashboard antigo) e
`agenda-tarefas-76ef8` (intranet).

**Passo manual pendente (Fábio):**

1. Planilha **DRE** → Extensões → Apps Script → colar
   `scripts/gestao/SyncDashboard.gs` por cima do script existente → salvar.
2. Planilha **VENDAS LOJAS** → Extensões → Apps Script → colar
   `scripts/gestao/SyncVendas.gs` por cima → salvar.
3. Rodar `syncTudo()` uma vez no editor de cada um (vai pedir re-autorização
   por causa do segundo projeto) e conferir no toast/log que gravou.

Gatilhos onChange e Web Apps (`/exec`) existentes continuam valendo — nada a
reimplantar. **Enquanto o passo não for feito, as coleções da intranet ficam
congeladas na cópia de 2026-08-25** (o dashboard antigo segue atualizando).
Quando o dashboard antigo for aposentado, tirar `'dash-pizzarias'` de
`PROJECT_IDS` nos dois scripts.

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
