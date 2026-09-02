# Dashboard Pessoal — Spec v2

> Documento-norte. Editável. Protótipo visual: `preview/index.html`.
> Data: 2026-06-22

## Visão geral

Dashboard pessoal do Fábio. Coleta roda **na máquina de casa**, de madrugada,
e publica um JSON estático que o frontend lê. Resumo matinal: operação das
pizzarias, novidades de IA, mundo, negócios, projetos.

## Arquitetura

```
[Máquina de casa - 03h, Task Scheduler]
   runner orquestra:
     ├─ coleta_vendas.py   (Playwright, reusa dre_saipos)   → sem IA
     ├─ coleta_news.py     (APIs/RSS + cascata IA free)
     ├─ coleta_agenda.py   (Google Calendar API)
     ├─ coleta_projetos.py (mtime de ~/.claude/projects + vault)
     └─ coleta_extras.py   (cotações USD/BTC, clima, feeds, Gmail)
   → gera dashboard-data.json (mantém 7 dias de histórico)
   → publica via FTP no HostGator

[Frontend]  rota /dashboard no Astro (machado-labs)
   → fetch dashboard-data.json
   → botão ATUALIZAR aciona coleta via Cloudflare Tunnel (endpoint + token)
       máquina ligada   → re-coleta na hora
       máquina desligada → botão cinza + "última atualização: HH:MM"

[Regras]
   - NÃO roda catch-up ao ligar (só 03h ou botão manual)
   - Acesso protegido por .htaccess (basic auth) na HostGator
```

## Layout (v3.0, 2026-06-27) — design do site + conteúdo curado

Segundo redesenho no mesmo dia. O Fábio rejeitou a v2 ("não é por ai"): queria
(1) conteúdo/fontes **curados por mim a partir dos interesses dele** (lidos do
vault) e (2) um design **na cara do site** (não o dark-azul Vision UI genérico).

**Design:** clona o design system do `src/components/Shell.astro` (estética
Raycast): fundo `#07080a` com **aurora** animada (laranja/violeta/ciano/rosa) +
grain, **Inter** (corpo) + **Geist Mono** (números, dá peso de console), accent
**laranja `#ff5c2b`**, **nav em pílula flutuante** ("Fábio Machado / dashboard"
com mark em gradiente), cards `linear-gradient(137deg,#111214,#0c0d0f)`.

**Curadoria de conteúdo (do vault — perfil-fabio, persona-decisao, 01 AI/_plano_v4):**
o dash deixou de ser dominado por notícia de IA. Zonas por prioridade real:
- **Operação (esq):** Vendas (herói) · **Foco** (âncora anti-inconstância: projeto
  de IA food-service até 15/11, próximo portão = 1º high-ticket) · Agenda.
- **Mercado (centro, destaque):** food-service/delivery/foodtech, o **radar do
  projeto de IA** dele. Reaproveita a chave `biz` do JSON (antes coletada e
  invisível) com fontes BR recuradas em `news.py` (FONTES_BIZ → Mercado&Consumo,
  The Spoon, NeoFeed, Startups.com.br, Brazil Journal; validadas por HTTP).
- **IA & ferramentas (dir):** card com abas Fronteira(`ai`) · GitHub · News
  (`newsletters`) · Feeds(`feeds`). Toda a IA num lugar só.
- **Projetos (dir):** cases no Claude.

Sem paginador (listas rolam). Resumo no clique mantido (Mercado/IA/Feeds/News).
Mobile = fluxo de app (Vendas → Foco → Agenda → Mercado → IA → Projetos).
Backend intacto, exceto FONTES_BIZ em news.py. Mesmo `dashboard-data.json`.

### Layout v2.0 (arquivado)

Modelo de **2 zonas** (Operação | Radar de IA com abas), tema Vision UI dark-azul.
Rejeitado por não refletir os interesses nem o design do site.

Princípios da v2:
- **Hierarquia, não uniformidade.** O dinheiro é o herói.
- **Um painel de IA, não quatro.** As 4 fontes viram abas de um só card.
- **Sem paginador por painel.** Listas rolam (jeito de app); vendas e agenda
  mantêm navegação por dia (setas).

| Zona | Conteúdo |
|------|----------|
| Topbar | saudação por horário + data · chips clima/USD/BTC (% verde/vermelho) · "atualizado HH:MM" |
| Operação (coluna esquerda, fixa ~340-420px) | **Vendas (herói)** · Agenda · Projetos em andamento |
| Radar de IA (coluna direita, larga) | abas **Notícias · Newsletters · GitHub · Feeds** num card só |

**Vendas (herói):** número grande do total do dia (R$) + **variação % vs dia
anterior** (verde/vermelho), KPIs pedidos/pizzas, dois blocos Dáme/Lov (cor da
marca), e um **mini-gráfico de barras dos 7 dias** (barra do dia selecionado
destacada e clicável). Setas ‹ › navegam por dia (até 7 dias). Botão ↻ rebusca o
JSON (cache-bust). É o relatório das pizzarias, mantido e turbinado.

**Radar de IA:** abas em pílula trocam a fonte sem sair do card. GitHub tem
sub-abas dia/semana/mês. No ultrawide a lista vira 2 colunas pra encher a tela.
Notícias/Newsletters/Feeds abrem **resumo no próprio card** ao clicar (GitHub
abre o repo). Ctrl/Cmd+clique abre o original em nova aba.

**Mobile (≤560px):** topbar fica sticky no topo (saudação + chips roláveis); o
conteúdo é um fluxo vertical único na ordem Vendas → Agenda → Projetos → Radar.
Toques grandes, abas roláveis. Sem accordion (rolagem natural, como app).

### Layout antigo (v1, arquivado)

| Coluna | Painéis (prioridade: Operação primeiro) |
|--------|------------------------------------------|
| 1. Operação (canto nobre) | Vendas · Agenda · Projetos em andamento |
| 2. IA News (mais larga) | IA News · GitHub Trending |
| 3. Newsletters | Newsletters de IA (lidas do Gmail) |
| 4. Fontes | Fontes & feeds de IA |

Clicar numa notícia (IA/Global/Biz/Feeds) abre um **resumo de um parágrafo em
pt-BR dentro do próprio card** (não sai pra aba externa), com botão **voltar** e
link **ler no original** (nova aba). Ctrl/Cmd+clique abre o original direto. O
resumo é PRÉ-GERADO na coleta (pega o texto mais longo do feed: content:encoded
/ content do Atom, senão description / og:description; traduzido e cortado em
~600 chars) — clique instantâneo, sem depender de IA/rede no momento
nem da máquina ligada (decisão: pré-resumir, não on-demand, por ser dashboard
estático). HN/Reddit sem descrição caem num texto de fallback + link.

Densidade: muitos cards compactos. **Paginação individual** em cada tabela.
Notícias com imagem (thumbnail), link pra fonte (abre em nova aba). **Títulos
SEMPRE traduzidos pra pt-BR** (no runner, via Google Translate público + cache;
substitui a regra antiga de "inglês original"). **Preenchimento por altura**:
cada tabela (IA/Global/Biz/GitHub/Feeds/Projetos) lista itens até encher o card
(cresce até o máximo que cabe sem cortar) e só então pagina. **Mobile (≤760px):
teto de 5 itens por página** em todas. GitHub: resumo traduzido cortado em ~200
caracteres.

## Painéis e fontes

### Vendas (por marca, navegável por dia) — IMPLEMENTADO
- Coletor: `coletores/saipos_vendas.py` (Playwright, reusa sessão logada do dre-ai).
- Valor e pedidos: relatório `sales-by-period` ("Total dos pedidos" / "Qtde total de pedidos").
- Pizzas: relatório `store-item-sold`, lido do scope AngularJS (vm.itemsResult +
  vm.choicesResult), com as regras do Fábio:
  - soma a quantidade dos produtos, desconsiderando bebidas (por categoria);
  - promoções de 2 pizzas / pizza em dobro contam x2;
  - "Pequena Combo" soma só os filhos ≠ "Nenhum" (a pizza pequena do combo).
  - Configurável no config.json: bebidas_cat, bebidas_kw (fallback), opcoes_pizza,
    ignorar_filho, dobro_kw.
- Saída: `data/vendas.json`. Validado 2026-06-21: Dáme 121, Lov 89.
- Tabela no front: Dáme / Lov / Total, colunas Valor · Pizzas · Pedidos.
- Navegação ‹ › por dia, até 7 dias atrás (histórico).

### Agenda — IMPLEMENTADO
- Google Calendar API (calendário primário machadofabio@gmail.com), via agenda.py.
- Janela de 7 dias (hoje + próximos), até 10 eventos, com rótulo de dia
  (hoje / amanhã / "qui 25/06") + hora + título. Vem no JSON da coleta.
- Front mostra dia+hora empilhados por evento. Card: "Agenda · próximos dias".
- Outros calendários (Familia, lovpizza, mepizzas) ficam de fora por ora.

### Projetos em andamento
- Lista dos projetos trabalhados no Claude na última semana.
- Fonte: mtime das pastas de sessão em `~/.claude/projects/` (mais fiel) e/ou
  mtime dos `contexto.md` em `01-projetos-dev/` do vault.
- Nome + última atividade + status. Paginação.

### IA News
- Curadas (cruas, sem IA): TLDR AI, Hacker News, Techmeme, GitHub Trending,
  Product Hunt, Hugging Face trending.
- Com cascata IA (dedup + rank, ruído alto): Reddit, arXiv, RSS oficiais
  (Anthropic, OpenAI, DeepMind, Meta, Mistral, xAI), X.
- Tag por categoria (Claude / GPT / Gemini / Open / Robotics / Space...).
- Imagem (og:image) por item. Busca em inglês, fontes fora do Brasil.

### GitHub Trending
- day / week / month. Cada repo com **resumo de uma linha** + linguagem + stars.

### Newsletters de IA — IMPLEMENTADO (IMAP) | substituiu Global + Biz News
- A coluna 3 deixou de ser Global/Biz News e virou um painel único de
  **newsletters de IA que o Fábio assina**, lidas de uma **caixa dedicada via
  IMAP** (macheidan@aol.com), separada do email pessoal. Curadoria humana de
  verdade, sem o "mais do mesmo" dos agregadores.
- Coletor: `coletores/newsletters.py` (imaplib, **biblioteca padrão**, sem dep
  nova, sem OAuth). Conecta IMAP_SSL, seleciona INBOX em readonly (não marca
  como lido), busca por **allowlist de remetentes** (config -> 
  `newsletters_remetentes`) com SINCE de 10 dias, FETCH BODY.PEEK[]. Nunca
  varre tudo. Config IMAP: `newsletters_imap_host/_user/_pass/_port`.
- **Uma linha por edição** (decisão do Fábio): título (traduzido pt-BR no
  runner) + fonte + tempo; clique abre um snippet do corpo como resumo no card,
  com link "ler no original" (tenta o link "ver no navegador" do HTML; senão #).
  Teto 24, ordena por data desc, dedup por (fonte, assunto).
- Caixa: **AOL** (macheidan@aol.com). AOL/Yahoo exige **senha de app** gerada em
  login.aol.com (o login normal de apps de terceiros é bloqueado); fica no
  config local (untracked). Fábio assina as newsletters com esse email.
- Fontes recomendadas (já na allowlist default): Evolving AI Insights, The
  Rundown AI, The Neuron, TLDR AI, The Batch. Captam sozinhas a partir da 1ª
  edição que chegar na caixa AOL.
- **Setup manual pendente:** (1) assinar as newsletters com a AOL; (2) gerar a
  senha de app da AOL e colar em `newsletters_imap_pass` no config.json.
- Global News e Biz News saíram da UI; o runner ainda gera as chaves no JSON
  (código dos coletores intacto), só não são mais renderizadas.

### Fontes & feeds de IA — IMPLEMENTADO (harvester)
- Deixou de ser lista estática de veículos. Agora é uma **fila priorizada por
  viralização**, gerada por `coletores/harvester.py` (modelo do "Blueprint —
  Pipeline de Harvesting de Conteúdo"; só estágios 🟢🟡, stdlib-only).
- Estágios: fetch (RSS imprensa/labs + HN Algolia + Reddit best-effort) →
  normalize (schema) → dedup (URL canônica + similaridade de título → clusters)
  → score (pesos calibrados p/ resumo matinal: engagement_velocity .20 +
  cross_source .25 + recency .20 + source_authority .25 + niche_match .10)
  → diversificação (cap de 4 itens por fonte) → top 24 → `data/feeds.json`.
  Clustering junta título com Jaccard >= .50. Pesos/cap/Jaccard são 🎛️ no topo
  do harvester. Calibragem tira o monopólio do HN (único com engajamento) e dá
  voz às fontes oficiais; o topo fica variado.
- NÃO faz enrich/draft com Claude nem SQLite (fases 3-4 do roadmap do blueprint;
  o painel só precisa da fila). Camada 🔴 (IG/X) fica de fora por desenho (ToS).
- Recorte: IA amplo com lente de operador (include/exclude no topo do harvester,
  ajustável). Cross-source = sinal forte: badge "N fontes" quando ≥2 corroboram;
  "novo" quando ≤4h.
- Foto: cada item tem thumbnail (og:image buscada pelo harvester só nos 24
  finais, em paralelo via ThreadPoolExecutor); fallback pro ícone da fonte
  quando não há imagem (HN/Reddit às vezes não têm), pra ficar uniforme.
- Front: card preenche TODA a altura disponível (paginação dinâmica calculada
  pela altura do `.list`, com correção de overflow) e pagina; teto de 24 itens.
  Item: título + ícone por tipo + fonte + tempo (ago) + badge.
- Fontes-semente (5.2): press = MIT TR, The Verge, TechCrunch, VentureBeat,
  Ars Technica; lab = OpenAI, DeepMind, Google AI, Hugging Face; HN queries
  (AI/LLM/agent/OpenAI·Anthropic·Claude/GPT·Gemini, pts≥30); Reddit r/artificial,
  r/LocalLLaMA, r/MachineLearning, r/OpenAI (score≥80, bloqueia fora de IP casa).

### Topbar / extras
- Clima POA.
- Cotações: **USD e BTC com variação %** (verde alta / vermelho baixa). Euro removido.

## Cascata IA (free)

Reusa o módulo do whatsapp-bot. Ordem (melhor → pior):
1. Gemini 2.5 Flash → 2.0 Flash → 2.0 Flash Lite
2. Groq (Llama 3.3 70B)
3. Cerebras
4. OpenRouter (DeepSeek V3 :free)
5. Ollama local (rede de segurança)

Só roda onde agrega: dedup, rank do top do dia, filtro de sentimento
(GlobalNews positivas). Fontes já curadas não passam por IA.

## Histórico

7 dias guardados (vendas + notícias). Navegação por dia no frontend.

## Tema

Vision UI (dark navy, glassmorphism, gradiente roxo/azul, Plus Jakarta Sans).
Replicado em CSS no Astro. Sem menu lateral, sem login na UI. Já aplicado no
protótipo; ajuste fino de paleta quando o tema final chegar.

## Segurança

- Senha Saipos hoje em texto plano no Drive → mover pra `.env` fora do Drive
  e trocar a senha (esteve exposta).
- `credentials.json` (OAuth) também fora do Drive/git.
- Dashboard protegido por `.htaccess` (basic auth) na HostGator.
- Nada de senha/credencial entra em git, JSON público ou logs.

## Pendências / próximos passos

- [x] Esqueleto visual Astro/HTML com mock + tema base (preview/index.html).
- [ ] Definir agenda: JSON vs fetch client-side (tempo real).
- [ ] Definir fonte de "projetos em andamento": ~/.claude/projects vs vault.
- [x] Coletor de vendas (saipos_vendas.py): valor + pedidos + pizzas → vendas.json.
- [x] extras.py (cotações USD/BTC + clima POA → extras.json).
- [x] projetos.py (projetos da última semana via ~/.claude/projects → projetos.json).
- [x] agenda.py (Google Calendar, calendário primário → agenda.json).
- [x] news.py (GitHub Trending + IA/Global/Biz via RSS curados + og:image).
      Global = fontes já positivas (Positive News, Good News, Science Daily,
      New Scientist, Singularity Hub). Biz = startups/ideias/gestão (TechCrunch,
      HN, Entrepreneur, Inc). Cascata IA (Gemini) ficou de fora: cota em 429 e
      as fontes já entregam o recorte; dá pra ligar depois pra curadoria fina.
- [ ] feeds/Gmail (Evolving AI e demais fontes) — opcional, exige +1 auth Google.
- [x] runner.py (roda os coletores + consolida em dashboard-data.json + envia FTPS).
      Histórico de 7 dias de vendas em vendas_hist.json. Modos: --so-consolida,
      --sem-envio, --headless. Envio via ftplib FTP_TLS (security loose) pra /dashboard.
- [x] Front lê dashboard-data.json (fetch + fallback pro mock). Botão ATUALIZAR
      rebusca o JSON publicado (cache-bust); re-coleta via túnel fica pra depois.
- [ ] Preencher credenciais FTP no config.json (ftp_server/ftp_user/ftp_pass).
- [ ] Runner + Task Scheduler 03h (sem catch-up).
- [x] Coleta só às 3h (Task Scheduler). Botão ATUALIZAR apenas re-busca o JSON
      publicado (cache-bust). Re-coleta sob demanda foi descartada a pedido do
      Fábio (não quer watcher lendo a cada minuto).
- [ ] .htaccess (basic auth) na HostGator — protege faturamento na URL pública.
- [ ] (DEPOIS DO BACKEND) Skin final: consolidar cores em variáveis de tema,
      botão claro/escuro (sol/lua) no canto superior direito, aplicar paleta
      Vision UI definitiva e polish de hover/sombras. Adiado a pedido do Fábio.
