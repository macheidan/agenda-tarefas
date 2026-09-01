# CLAUDE.md

> **2nd Brain Vault:** `G:\Meu Drive\03 Pessoal\Vault\` | Contexto master: `00-meta/AGENT-START-HERE.md` | GitHub: github.com/macheidan/2ndbrain

## Commands

```bash
npm run deploy:ftp  # PRODUÇÃO: build + publica em damepizza.com.br/intranet
npm run deploy:v2   # publica a v2 (tema TailAdmin) em /intranet/v2
npm run deploy      # legado: gh-pages (não usar — morto)
npx vercel --prod   # publica o PROXY (gemini-proxy/): Gemini + envio de WhatsApp
```

⚠️ O Action do FTP **não** publica o proxy — mexeu em `gemini-proxy/`, rode `npx vercel --prod`
**na raiz do repo** (a raiz é linkada ao projeto `gemini-proxy-intranet`, cujo Root Directory é
`gemini-proxy/`).

⚠️ **Nunca use `--cwd gemini-proxy`.** Em 2026-08-19 isso limpou o *Root Directory* do projeto e
desfez o link da raiz: a Vercel passou a buildar a raiz do repo, aplicou o `vercel.json` de
redirect e **todos os endpoints viraram 307** por ~20 min — derrubando junto o chat do Gemini.
Conserto: `Root Directory = gemini-proxy` nas Settings do projeto + recriar `.vercel/project.json`
na raiz com os ids do `gemini-proxy-intranet`. Confira depois com
`curl -o /dev/null -w "%{http_code}" https://gemini-proxy-intranet.vercel.app/api/generate` → **405**
(307 = quebrado).

**Produção:** https://damepizza.com.br/intranet/ — **deploy automático a cada push na `main`** pelo GitHub Action `.github/workflows/deploy-ftp.yml` (roda o mesmo `npm run deploy:ftp`, com as credenciais vindo de secrets). Conferir em `gh run list`. O `npm run deploy:ftp` local é só pra publicar fora de um push; precisa de `.env.ftp` na raiz (fora do git).

⚠️ Os hashes dos assets do FTP **nunca** batem com os de `npm run build`: o FTP builda com `--base=/intranet/`, o que muda o hash. Comparar os dois pra concluir que "o FTP está velho" é erro garantido — use `gh run list` pra saber se publicou.

**A Vercel foi aposentada em 2026-07-15.** O projeto `agenda-tarefas` ainda existe, mas só serve um **redirect 307** pra `damepizza.com.br/intranet` (ver `vercel.json`) — quem tem o link antigo salvo cai na nova sem quebrar. É 307 e não 308 de propósito: 308 fica cacheado no browser e seria difícil de reverter. Para voltar atrás: apagar `vercel.json` e publicar.

## Environment

Precisa de `.env` na raiz com credenciais Firebase (`VITE_FIREBASE_*`) e `VITE_ADMIN_EMAIL`. Ver `README.md` para lista completa. O email em `VITE_ADMIN_EMAIL` também está hard-coded em `firestore.rules` (substituir `ADMIN_EMAIL_PLACEHOLDER` antes de publicar regras).

## Arquitetura

Não tem backend próprio — toda lógica de permissão está em `firestore.rules` + checagem no cliente (`isAdmin`).

## Coleções Firestore (big picture)

Hooks em `src/hooks/` são a fonte da verdade sobre shape dos documentos. Coleções principais:

- `users/{uid}` — perfil básico, criado no primeiro login
- `tasks/{uid}/items/{taskId}` — **subcoleção por usuário** (único caso); tarefas com status, recorrência, comentários inline
- `notes/{noteId}`, `ideas/{ideaId}`, `reviews/{reviewId}`, `reels/{reelId}`, `scripts/{scriptId}` — coleções flat com `authorUid`/`targetUid`
- `surveys/{dd_<brand>_<hash>}` — aba **Avaliações**: pesquisas de satisfação (NPS) do Delivery Direto. Só leitura no cliente; escrita só via `scripts/importSurveys.mjs` (Admin SDK + Playwright). `reviews` é a seção *antiga* (avaliações internas admin→funcionário): sem tela desde 2026-07-15, dados preservados
- `clientes/{loja}_{n}` — aba **Clientes**: base viva de quem comprou nos últimos 90 dias — nome, telefone, bairro, última compra, pedidos, valor total. Entra **todo mundo**, com telefone ou sem: mais da metade dos cadastros vem de marketplace (nome + CPF + endereço, telefone mascarado pelo iFood) e serve para faturamento/recência/bairro, não para campanha. Quem tem telefone com DDD do RS (51/53/54/55) é o público de WhatsApp — a tela separa nos botões *Com WhatsApp / Sem contato*. O coletor **religa** parte dos sem-telefone ao cadastro de balcão/site da mesma pessoa por quatro regras, em ordem de confiança: CPF, nome+endereço exato, **nome completo (2+ palavras)+bairro** e **rua+número (sem o tipo do logradouro)+nome compatível**. As duas últimas existem porque as duas primeiras quase nunca casam — só 8,8% de quem tem telefone informa CPF (contra 90% de quem não tem) e o endereço vem escrito diferente em cada canal ("R. Barão de Ubá" × "Rua Barão de Ubá"). **Rua+número não é identidade sozinho**: 551 cadastros da Dáme casam o endereço e só 42 são a mesma pessoa — o resto é vizinho de prédio; por isso o conjunto é filtrado pelo nome antes de contar. Toda regra exige 1 para 1: chave com dois telefones não religa ninguém, porque dar o telefone de outra pessoa faria ela receber campanha alheia. Rende 79 registros (~1,2%). Quem é religado muda de identidade, então a coleta leva `chavesAntigas` para o importador absorver o registro órfão, e `coletar_historico.py` relê quem mudou de lista de `ids`. **O `religar` do coletor só enxerga a janela de 90 dias** — quem comprou no balcão há cinco meses e volta pelo iFood não tem com o que casar lá; por isso `importar_clientes.mjs` repete a regra de nome+bairro contra a **base inteira** (`porNomeBairro`, origem `base_nome_bairro`), que nunca esquece ninguém. Hoje isso quase não pega nada (a base tem dias); é o que segura o reconhecimento à medida que ela envelhece. CPF nunca sobe em claro, só o hash (`h`). **Frequência** vem de outro lugar: `qtt_sales` do Saipos é o total do cadastro desde sempre e **ignora o filtro de período** (medido: 86 pedidos tanto na janela de 7 dias quanto na de 90) — coletar mês a mês só diria *quem* comprou, nunca quantas vezes. Quem dá o histórico real é `scripts/clientes/coletar_historico.py`, que chama os dois endpoints do modal do cliente (`customers/search/{id}` → `id_store_customer`, depois `store_customers/list-customer-sales/{id_store_customer}`) por dentro da página, pelo `$http` do Angular. ~170 ms por cadastro com 8 chamadas em voo: base inteira em ~25 min, dia a dia em segundos (`--novos-de`). Vira `hm` (pedidos por mês, 12 meses) + `vm` (receita por mês) + `pc` (primeira compra). **Não é 1 doc por cliente**: cada doc é um bloco de até 800 clientes em `itens: [{k,t,h,n,p,v,u,b,c,x,o,a,e,hm,pc,vm,d}]` (+ `clientes/{loja}_meta`), senão a tela custaria milhares de leituras. **`d` é o endereço completo** (desde 2026-09-01, para o bot de WhatsApp em `Pizzarias/whatsbot` reconhecer o cliente pelo telefone e confirmar entrega quando o PC da loja está fora do ar): lista de `{logradouro, numero, complemento, bairro, cidade}`. A cobertura que importa é **entre quem tem telefone, que é o único público que o bot atende: 97% na Dáme e 95% na Lov** (no total, contando o cliente de marketplace sem telefone, cai para 92%/91% — esse número não mede nada de útil). É **lista** porque quem tem dois endereços tem dois de verdade, e quem escolhe é o bot na conversa; bairro e cidade se repetem dentro de cada endereço porque **52% dos cadastros com 2+ endereços têm bairro diferente entre eles** (24%, cidade). Ganha o doc de 249 para 532 bytes por cliente — maior bloco em 451 KB, longe do teto de 1 MB; só reduzir `CHUNK_SIZE` se passar de ~600 KB (o backfill imprime esse número toda vez). O parse mora em `scripts/clientes/enderecos.mjs`, **em JS e não no coletor**, porque o backfill também é Node e dois parsers em duas linguagens divergem: o `address` do Saipos é a lista INTEIRA de endereços colada com `<br>`, cada linha `Cidade, Bairro - Logradouro, Número, Complemento` — split ingênuo gruda dois endereços num só. O campo `complement` do Saipos é **redundante** (é o conjunto dos complementos que já estão no fim de cada linha do `address`) e não é lido. A união é por lugar (cidade + logradouro sem o tipo + número; **bairro fica fora da chave** de propósito — ruas de divisa e "passo da areia"/"passo d areia" partiriam 281 endereços em dois), o que a torna idempotente e faz endereço existente nunca ser sobrescrito por vazio. Retroativo por `node scripts/clientes/backfill_enderecos.mjs [--dry]`, que lê o JSONL do backup (a coleta só vê 90 dias) e recasa **só por telefone e hash de CPF** — nome, bairro e endereço **não** são chave aqui, mesmo sendo tentadores. A regra de nome+bairro existiu por meio dia e casava 419 cadastros; medindo quem dependia dela, eram 408 clientes e **nenhum com telefone** — ela era a única capaz de entregar no endereço de um homônimo e não alcançava ninguém que o bot atenda. **Não existe outra ponte entre canais**, e isso foi medido campo a campo no backup cruzando o canal de cada pedido: telefone está em 99% de quem nunca usou iFood e 1% de quem só usa; CPF, ao contrário (6% × 90%); e-mail 2%×0%, nascimento 1%×0%, `notes` vazio na base inteira. Só 22 cadastros na Dáme e 8 na Lov usaram iFood *e* outro canal com o mesmo `id_customer` — o Saipos não funde, e o CPF só liga um cadastro de iFood a outro com telefone em 27 casos por loja. A ponte que falta não está no Saipos: **está no bot**, que é o único ponto com telefone real e conversa — o endereço que o cliente informar para a entrega fecha o elo com o cadastro de iFood pela chave de lugar de `enderecos.mjs`. Testes: `node --test scripts/clientes/enderecos.test.mjs scripts/clientes/backfill_enderecos.test.mjs`. A sub-aba **Relatórios** (Retenção / Segmentos / Bairros / Mês a mês, contas em `src/utils/relatoriosClientes.js` com teste `node --test`) lê tudo isso no cliente. O detalhe que não pode ser esquecido: a base só enxerga 90 dias para trás **da primeira coleta em diante**, então mês ou coorte anterior a `{loja}_meta.coberturaDesde` só contém quem voltou — retenção de 100%, receita ínfima, curva de crescimento que nunca aconteceu. Essas linhas nascem escondidas atrás de um botão e vão marcadas; nunca compare-as com as de agora. Só leitura no cliente; escrita só por `scripts/clientes/` (Admin SDK + Playwright), todo dia às 04:10 (tarefa `ClientesColeta`). **Backup do dado cru em `G:/Meu Drive/02 Pizzarias/07 Backup Saipos`** (`scripts/clientes/arquivo.py`, doc em `LEIA-BACKUP.md`): JSONL com o cadastro inteiro (CPF em claro, endereço, `notes`, saldo) e um pedido por linha com **produto, canal e forma de pagamento** — nada disso sobrevive em outro lugar depois que `agregar()` reduz o registro. É merge, nunca sobrescrita, então guarda também quem envelheceu para fora dos 90 dias. **Nunca pôr no vault** (`03 Pessoal`), que sobe pro GitHub
- `campanhas/{id}`, `campanhaEnvios/{campanhaId}__{telefone}`, `campanhaRespostas/{msgId}`, `clientesOptOut/{telefone}` — disparo de WhatsApp da aba **Clientes** pela Cloud API da Meta (sem BSP). Escrita só do servidor: `gemini-proxy/api/wa-send.js` (disparo em lotes de 20) e `wa-webhook.js` (status, resposta e descadastro). Passo a passo do cadastro na Meta: `docs/whatsapp-cloud-api.md`
- `chats/{roomId}/messages/{msgId}` — 1 room por usuário não-admin; admin ouve todos
- `adminMessages/{msgId}` — broadcast com `targetUids[]`, `readBy[]`
- `settings/{uid}` — toggles de features por usuário (admin escreve)
- `knowledge/{docId}` — base de conhecimento + persona para o chat Gemini
- `fechamentos_mensais/{anoMes_marca}`, `dre_detalhes/{anoMes_marca}`, `vendas_itens/{anoMes_marca_cat_slug}`, `checkpoints/{id}` — categoria **Gestão** (Mesa do Dono / Dash / Vendas / DRE / Anotações), migrada do dashboard_pizzarias em 2026-08-25. Escrita só dos Apps Scripts das planilhas DRE e VENDAS LOJAS (dual-write nos 2 projetos Firebase) — exceto `checkpoints`, CRUD do admin pela aba Anotações. O Dash e o mês corrente da Mesa do Dono leem o JSON do coletor em fabiomachado.com.br/pizzas/data/ (CORS via .htaccess; token em `VITE_DASH_TOKEN`). **Ler `docs/gestao-migracao.md` antes de mexer.**

## Padrões não-óbvios (ler antes de mexer)

**1. Hooks variam escopo por admin/usuário comum.** Ex: `useIdeas(null, user, true)` traz ideias de todo mundo quando `fetchAll=true`; com `targetUid` específico, filtra. Admin quase sempre vê tudo. Ao adicionar feature nova, decida explicitamente: vale só pro dono, pro admin também, ou pra todos?

**2. Admin "viewing as" outro usuário.** `Dashboard` tem `selectedUid` (dropdown no Header) que faz admin navegar os dados de qualquer user. `viewingOther` banner sinaliza. Ao criar nova view, passe `selectedUid || user.uid` como alvo.

**3. Unread tracking via `readBy[]`.** Ideias, reviews, notes, chat, adminMessages usam array de UIDs em `readBy`. Contar unread = docs onde `user.uid` NÃO está em `readBy`. Marcar lido = `arrayUnion(user.uid)` em `readBy`. Segue esse padrão ao adicionar feature colaborativa.

**4. Comentários são arrays aninhados, não subcoleção.** Ideias/reviews/tasks guardam comentários como `comments: [{ text, authorUid, authorName, authorPhoto, createdAt, parentIndex }]`. Threading é via `parentIndex` (índice do pai no array). Cuidado com updates concorrentes (sem transação).

**5. Recorrência de tasks.** Tasks recorrentes são **múltiplos docs** com o mesmo `recurrenceGroup` (UUID). Editar "todas as ocorrências" = `updateTaskGroup(recurrenceGroup, updates)` em `useTasks`.

**6. Fallbacks de query sem índice.** Vários hooks têm catch do `FirebaseError` por índice composto faltando — refazem a query sem `orderBy` e ordenam client-side. Ao adicionar query nova com múltiplos `where`+`orderBy`, considere o mesmo fallback ou publique o índice.

**7. CSS modules + tema global.** Cada view tem `*.module.css` com classes scopeadas. Cores, sombras, bordas vêm de CSS vars em `src/styles/global.css` (tem 3 temas: Notion default, `[data-theme="dark"]`, `[data-theme="clean"]`). **Nunca hard-code cores** — use as vars (`var(--accent)`, `var(--text)`, etc.). A exceção são cores específicas de categorias (laranja #ff9800 pra Stories, roxo #9c27b0 pra Roteiros) que aparecem direto em classes.

**8. ReelsView tem 4 sub-seções no mesmo componente.** Reels / Stories / Roteiros / Arquivados são seções do Instagram controladas por booleanos (`showStories`, `showScripts`, `showArchived`). Cada sub-view retorna cedo (`if (showStories) return …`). Compartilham um `sectionHeader` JSX com tabs coloridas e botão **+ Novo** que adota a cor da seção ativa.

**9. Gemini no KnowledgeView.** Admin edita base de conhecimento + persona em Settings. O chat monta o system prompt concatenando persona e base. Modelo escolhido via dropdown no Settings.

**10. Sem router.** Navegação entre tabs é puro `useState` — mas o estado é **espelhado na query string** com `history.replaceState`: `?tab=` (aba, em `Dashboard.jsx`) e `?sub=` (sub-seção de Preços). É o que faz o F5 cair na mesma página em vez de voltar pra Agenda, e o que põe o nome da página no `document.title`. Ao criar uma seção com sub-navegação, siga o mesmo padrão (ler o param no `useState` inicial + efeito que grava a sub-página **exibida**). Não adicionar react-router.

## Convenções de código

- Português nas mensagens de UI e commits; inglês no código (nomes de vars, funções).
- Commits seguem `feat:`/`fix:`/`refactor:`/`chore:`/`docs:` (Conventional Commits, mas livre).
- Hooks exportam objetos com dados + funções (`{ tasks, addTask, updateTask, deleteTask }`).
- Modais são componentes separados (`TaskModal`, `NoteModal`, `AdminMessageModal`) que recebem `open`, `onClose`, e os dados necessários.

## Padrão de design (OBRIGATÓRIO — ler antes de criar ou mexer em qualquer view)

A constituição completa está em **`.specify/memory/constitution.md`**. Referências canônicas de design: **InfluencersView, ReelsView e NotesView**. O design system em `src/ui/` (tokens `--ds-*`) NÃO é usado. Resumo dos 10 princípios:

1. Toda view é um cartão único: `--card` + `radius-lg` + `shadow-sm` + `padding:24px`.
2. Header flex space-between: `<h2>` 18px/700 à esquerda, `.headerActions` à direita.
3. Sub-conteúdos = **submenu horizontal fixo na linha do título** (botões outline 2px coloridos, radius-md 8px, preenchem quando ativos, contador `(n)`). Modais só pra cadastros/configs pontuais.
4. Botões sempre radius-md; primário `--accent` sólido, ghost com borda `--input-border`, perigo `--danger`. Pílula 999px só em chip informativo.
5. Inputs retangulares radius-md, `:focus` acende `--accent`; forms em `--bg-secondary` com label 13/600 + hint 12.
6. Escala tipográfica fechada: 18/15/14/13/12/11px; TH uppercase 11px letter-spacing.
7. Só CSS vars do global.css; badges = chip `--accent-light`/`--accent` uppercase 11/700; destaques com `rgba()` suave.
8. Denso no desktop (`<table>` compacta), cards no mobile: breakpoints 768/480px, `tr` vira card com `td[data-label]::before`; inputs 16px @480 (iOS).
9. Empty state com borda tracejada em `--bg-secondary`; hover de card = sombra + borda accent; destrutivo pede `window.confirm`.
10. 1 seção = View + hook + css module (+ Modal separado); `useMemo` pra derivações; dicionários de config no topo; wiring completo (Dashboard, Header, tabIcons, useTabsOrder, SettingsView, rules); seção nova default OFF com flags `xVer*`/`xEdit*`.
