# WhatsApp Cloud API — envio próprio, sem BSP

Como a seção **Clientes** dispara campanha direto na API oficial da Meta, sem
Zenvia/Twilio/360dialog no meio. Você paga só a Meta, por mensagem enviada.

## Como está montado

```
Intranet (browser)                 Vercel (gemini-proxy-intranet)        Meta
  ClientesView                       api/wa-send   ──────────────────►  Cloud API
   └ CampanhaModal ──lote de 20──►   (token fica só aqui)                  │
                                     api/wa-webhook ◄──────status/resposta─┘
                                          │
                                     Firestore: campanhas, campanhaEnvios,
                                                campanhaRespostas, clientesOptOut
```

**Por que tem um proxy no meio:** o token permanente da Meta não pode ir para o
browser — quem abrisse o DevTools mandaria mensagem em nome da loja. O proxy é o
mesmo projeto da Vercel que já esconde a chave do Gemini (`gemini-proxy/`), com
a mesma autenticação: ID token do Firebase + checagem de aprovação, agora também
exigindo a flag `clientesEnviar`.

**Por que o envio vai em lotes de 20:** função serverless tem poucos segundos de
execução — 500 envios numa requisição estouraria. Em lote o progresso aparece na
tela, dá para parar no meio, e retomar não duplica: o servidor pula quem já
recebeu aquela campanha (`campanhaEnvios/{campanhaId}__{telefone}`).

## Estado real das contas (conferido em 2026-08-19)

Boa parte do passo a passo abaixo **já está feita** — as duas marcas já existem
na plataforma há tempo. O que sobrou é bem menos do que parece.

| | Dáme (BM `1952138181466044`) | Lov (BM `621269871566486`) |
|---|---|---|
| Verificação do negócio | Em análise (enviada 19/08) | ✅ Verificada em 13/03/2026 |
| WABA | `206538077125724` | `110959808608511` (+ uma do app) |
| Número | **+55 51 3332-2440** — Conectado, qualidade Alta | **+55 51 3388-2002** — **Não verificado** |
| Limite de envio | **2.000 conversas/24h** (nível 2) | — |
| Templates | nenhum | nenhum |
| App de desenvolvedor | **nenhum** | **nenhum** |

⚠️ **A Dáme já está na Cloud API, mas pela ManyChat.** A ManyChat é **parceira
com controle total** da WABA e a conta é paga por uma **linha de crédito
"Allocated from: Manychat"** (Business ID `711214052401794`). O Fábio não usa
mais a ManyChat — então isso é ao mesmo tempo um risco (um terceiro pode mandar
mensagem pelo número da loja) e uma dependência (sem essa linha, não há forma de
pagamento).

**A ordem importa:** primeiro colocar pagamento próprio, por último remover a
ManyChat. Removendo antes, a WABA fica sem como pagar e o número para de enviar.
Para mexer em cobrança, o usuário precisa antes virar **editor financeiro** —
o próprio Billing Hub avisa e oferece "Modificar permissões".

O número da Lov está registrado em duas WABAs (a do app, "Offline", e a da API,
"Não verificado"): é o estado clássico de número que começou a migrar do
aplicativo para a API e não terminou. Nesse estado ele não envia.

### IDs já criados (Dáme) — 2026-08-19

| O quê | Valor |
|---|---|
| Portfólio (BM) | `1952138181466044` |
| WABA | `206538077125724` |
| **Phone number ID** (`WA_PHONE_ID_DAME`) | **`2802736619807612`** |
| Número | +55 51 3332-2440 · nome de exibição "Dáme Pizza" · @damepizza |
| App de desenvolvedor | `Intranet Pizzarias` — `1610742780487306` |
| Usuário de sistema | `intranet-whatsapp` — `61593572666697` (admin, WABA com acesso total) |

Nada aí é segredo — o que é segredo (token e app secret) não passa por aqui nem
pelo repositório: vai direto do painel da Meta para as env vars da Vercel.

### O que trava hoje (2026-08-19)

**A linha de crédito da ManyChat continua no portfólio da Dáme.** Remover a
ManyChat como *parceira* da WABA não removeu a *linha de crédito* que ela
alocou — ela segue lá, conectada à WABA `206538077125724`, com "Recebedor da
fatura" e "Parte compradora" = **ManyChat Inc**.

É ela que trava o pagamento. O tooltip do botão desabilitado diz: *"Você não
pode adicionar uma forma de pagamento porque está usando uma linha de crédito
compartilhada para pagar pelos anúncios."* E na tela de detalhes da linha
**não existe botão de remover** — quem aloca é quem desaloca. Saídas:

1. **suporte da ManyChat** pedindo para desalocar a linha de crédito — checado
   em 19/08 dentro do painel deles: **não dá para resolver por lá sozinho**. As
   duas contas (`fb3749628` "Dáme Pizza" e `fb2177147` "new WhatsApp account")
   estão com assinatura **Expired**, plano grátis, 0 contatos, e o canal
   WhatsApp aparece como **não conectado** ("Conectar"). Ou seja: não há canal
   para desconectar, e a ManyChat não expõe a alocação de linha de crédito ao
   cliente. Só o suporte deles desfaz;
2. suporte da Meta desvincular;
3. criar uma WABA nova e migrar o número para ela (a nova nasce limpa, mas
   migrar número entre WABAs tem risco próprio).

Enquanto isso, o **registro do número e o template podem seguir** — só o
disparo de marketing é que depende de pagamento válido.

**O número está "Offline"** e não há tela que refaça a ligação com um app. Use
`scripts/clientes/registrar_numero_wa.mjs` (roda no seu terminal, pergunta o
token na hora, não grava nada).

✅ **App publicado em 19/08.** Sem isso a Meta só manda webhook de teste. A
publicação exige **URL da Política de Privacidade**: usamos a do Delivery
Direto — `https://pedidos.mepizzas.com.br/portoalegre/mepizzas/termos-e-politicas`
(o site damepizza.com.br não tem página própria).

⚠️ **O número 3332-2440 é o WhatsApp público da loja** — é o link do botão
"WHATSAPP" no site, e é atendido no aplicativo WhatsApp Business (coexistência:
recebe no celular e aceita disparo pela API). Consequência para o template: um
botão `wa.me` apontando para ele **não faz sentido**, porque a campanha já sai
desse mesmo número. O certo é **Quick Reply** — a resposta chega no celular de
quem atende e também no nosso webhook, aparecendo no painel Campanhas.

### O número da Dáme é ON_PREMISE / SMB, não Cloud API (2026-08-19)

O registro pela API falhou com `[100] Register endpoint is not available for SMB
businesses`. O diagnóstico via Graph explica:

```
platform_type            ON_PREMISE      ← não é Cloud API
status                   DISCONNECTED
quality_rating           GREEN
code_verification_status NOT_VERIFIED
WABA                     APPROVED, business_verification verified, ownership SELF
apps assinados           Intranet Pizzarias ✅
templates                0
```

A WABA nasceu pelo **aplicativo WhatsApp Business** (é o rótulo que o Business
Manager mostra) — uma conta "SMB". Nessas, `POST /{phone_number_id}/register`
não existe: o caminho para usar a Cloud API sem tirar o número do celular é a
**coexistência**, que só é ativada pelo fluxo de *Embedded Signup* (popup do SDK
JS da Meta), não por chamada de API solta.

Três saídas:

1. **Coexistência via Embedded Signup** — preserva o número quente (qualidade
   GREEN, limite alto) e o atendimento no celular. Exige montar uma página com o
   SDK e um *config_id* de Embedded Signup no app.
2. **Chip novo só de campanha** — registro direto na Cloud API, sem atrito, mas
   começa frio (250/dia) e o cliente recebe de um número desconhecido.
3. **Migrar o número para Cloud API puro** — ele **sai do aplicativo** e ninguém
   mais atende pelo celular. Não serve: o número é o WhatsApp público da loja.

O que já está pronto e não se perde em nenhuma das opções: app publicado, WABA
aprovada, usuário de sistema, webhook verificado e **app assinado nos webhooks
da conta**.

## O chip de teste (2026-08-26) — ponte, não substituto

O 3332-2440 não registra e a coexistência ainda não está montada, então o teste
fim a fim passa por um **chip TIM novo**, só de campanha. Ele existe para provar
o pipeline (envio → status → resposta → descadastro) com dinheiro e risco
próximos de zero. **O destino final continua sendo a coexistência do
3332-2440** — o cliente precisa receber do número que ele já tem salvo.

### As três armadilhas do chip

1. **Nunca abrir o WhatsApp comum (nem o Business) com esse número.** Ao abrir,
   o número gruda numa conta do aplicativo e o registro na Cloud API passa a dar
   conflito — é exatamente o buraco em que o 3332-2440 caiu. Ative o chip num
   aparelho onde você não vá tocar no app, ou num aparelho sem WhatsApp
   instalado. O que precisa chegar nele é **SMS e ligação**, nada além disso.
2. **Prepago sem recarga vira número cancelado** e volta para o pool da
   operadora — junto com a WABA, o template e o histórico de qualidade. Deixe
   **recarga automática no cartão** (~R$ 15/mês) no mesmo dia da ativação.
3. **Número novo começa frio:** 250 destinatários novos/24h enquanto o negócio
   dono da WABA não estiver verificado, e o cliente recebe de um número
   desconhecido. Serve para testar, não para a campanha de verdade.

### Onde a WABA nova mora: BM da Lov

**Não pendurar na WABA da Dáme** (`206538077125724`) e nem criar outra WABA
dentro do BM da Dáme: o bloqueio de pagamento é da **linha de crédito ainda
alocada pela ManyChat no portfólio**, não da WABA — número novo ali herdaria o
mesmo "Você não pode adicionar uma forma de pagamento". O BM da Lov
(`621269871566486`) está com **"Adicionar forma de pagamento" liberado** e o
negócio **já verificado desde 13/03/2026**, que é o que tira o teto de 250/dia.

Consequência prática: **cada BM só reivindica um app**, e o app
`Intranet Pizzarias` (`1610742780487306`) já é do BM da Dáme. A WABA da Lov
roda sob **app próprio**, com **usuário de sistema próprio** e **outro app
secret** — por isso o `wa-webhook.js` confere o HMAC contra
`WA_APP_SECRET` **e** `WA_APP_SECRET_LOV`. O webhook do app novo aponta para a
mesma URL e usa o mesmo `WA_VERIFY_TOKEN`; só o segredo muda.

### O chip ocupa o slot LOV

O proxy lê `WA_TOKEN_<LOJA>`/`WA_PHONE_ID_<LOJA>` e só aceita `dame` e
`lov` — então o chip entra como **lov** e o teste é disparado escolhendo Lov no
modal. Nenhuma linha do `wa-send.js` muda. Quando o 3388-2002 da própria Lov
finalmente for verificado, ele entra **na mesma WABA** e só troca o
`WA_PHONE_ID_LOV`; o slot da Dáme fica intacto esperando a coexistência.

### Ordem de execução

| # | Passo | Onde |
|---|---|---|
| 1 | ✅ **Feito em 10/09** — chip ativado no CPF, com recarga automática | portal/app da TIM |
| 2 | Criar app + usuário de sistema no **BM da Lov** | developers.facebook.com |
| 3 | Criar a WABA e adicionar o número (SMS/ligação) | business.facebook.com |
| 4 | Webhook do app novo: mesma URL, mesmo verify token, campo `messages` | painel do app |
| 5 | Preencher `WA_WABA_LOV`, `WA_TOKEN_LOV`, `WA_PIN_LOV`, `WA_APP_SECRET_LOV` no store | `whatsapp-cloud.env` |
| 6 | `node scripts/clientes/registrar_numero_wa.mjs --loja lov` | terminal |
| 7 | `node scripts/clientes/criar_template_wa.mjs --loja lov` | terminal |
| 8 | Mesmas envs na Vercel + `npx vercel --prod` **na raiz do repo** | terminal |
| 9 | Disparo de teste para o próprio número, e responder **SAIR** | intranet → Clientes |

O passo 6 agora **imprime o `platform_type` e recusa antes de tentar** se o
número vier `ON_PREMISE` — é o erro que custou o dia 19/08 e que só aparecia
depois, como `[100] Register endpoint is not available for SMB businesses`.

### Template: vale por WABA, não por número

O que for aprovado na WABA de teste **não acompanha** o 3332-2440 quando a
coexistência entrar: lá o template é submetido de novo, na WABA da Dáme. O que
se aproveita é o texto já ter passado pela revisão uma vez. Por isso o primeiro
template é de **reativação sem oferta** — a promoção de verdade é submetida
quando o número definitivo estiver de pé, e não gasta aprovação à toa.

O `scripts/clientes/criar_template_wa.mjs` submete e acompanha
(`--listar`). Ele existe porque o campo que mais derruba aprovação é o
**exemplo da variável**, escondido atrás de um "Adicionar exemplo" fácil de
pular no painel — sem ele a Meta rejeita por conteúdo incompleto.

## FEITO em 2026-09-10 — o chip está registrado na Cloud API

| O quê | Valor |
|---|---|
| Número | **+55 51 98223-6600** (chip TIM, nunca aberto no app) |
| WABA nova | **`2468605356970524`** — "Dáme Pizza", no BM da Dáme |
| **Phone number ID** (`WA_PHONE_ID_DAME`) | **`1329634636895484`** |
| Conta de pagamento | `2063816380908016` |
| Template | `retorno_cliente` (pt_BR, MARKETING) — id `1086403230837685` |

Diagnóstico do número após o registro: `platform_type` **CLOUD_API**, `status`
**CONNECTED**, `code_verification_status` **VERIFIED**, `name_status`
PENDING_REVIEW. É a diferença que importa em relação ao 3332-2440, que é
ON_PREMISE e por isso nunca registrou.

O usuário de sistema `intranet-whatsapp` **já enxergava a WABA nova** sem
atribuição manual (ele é admin do BM), então o passo de "atribuir ativo" do
roteiro antigo não existiu. Envs de produção atualizadas na Vercel
(`WA_PHONE_ID_DAME`, `WA_ATENDIMENTO_DAME`) e proxy publicado.

### A conclusão de 19/08 sobre o pagamento estava errada

Aquele dia concluiu que a linha de crédito da ManyChat travava o **portfólio**
inteiro, e que "WABA nova dentro do BM da Dáme herdaria o bloqueio" — foi por
isso que a rota do BM da Lov nasceu. **Não herdou.** A WABA nova tem conta de
pagamento própria, com **"Adicionar forma de pagamento" habilitado**, e a linha
da ManyChat aparece lá como **"Acesso removido"**, limite "—". O bloqueio estava
amarrado à conta de pagamento da WABA antiga, não ao portfólio.

Consequência prática: **o BM da Lov deixou de ser necessário**, e o ticket
#555459 da ManyChat deixou de ser caminho crítico. Ele só volta a importar no
dia da coexistência do 3332-2440, que usa a WABA velha.

### A Meta recusa link de WhatsApp dentro de template

O botão de URL para o 2440 foi submetido e voltou
`[100] Invalid parameter → Os botões não podem conter links diretos para o
WhatsApp`. Template não pode apontar para outro número de WhatsApp, ponto.

Por isso o botão é **Quick Reply** e o link vive na **resposta automática**: o
clique chega ao webhook como mensagem de entrada (`type: 'button'`) e a resposta
sai como mensagem de sessão, onde a restrição não existe. O texto é diferente
para quem clicou (já demonstrou interesse) e para quem digitou (precisa saber
antes que ninguém lê ali).

### O que falta

1. **Cartão na conta de pagamento** — só o Fábio faz.
2. **Aprovação do template** (`--listar` acompanha) e do nome de exibição.
3. Ligar a flag **Enviar campanha** em Configurações e fazer o disparo de teste.

## Rota escolhida em 2026-09-10: chip como 2º número no BM da Dáme

O chip foi ativado em 10/09 (nunca aberto no app do WhatsApp). O Fábio decidiu
**não** usar o BM da Lov nem criar portfólio novo: a WABA do chip nasce **no BM
da Dáme** (`1952138181466044`), como **segundo número**, ao lado do 3332-2440.

O que isso encurta: o app `Intranet Pizzarias` (`1610742780487306`) já é
reivindicado por esse BM, o usuário de sistema `intranet-whatsapp` já existe e o
webhook já está verificado e no ar. Some tudo que a rota da Lov exigia de app
novo, usuário de sistema novo e `WA_APP_SECRET_LOV`.

**O 3332-2440 não é tocado.** Ele continua na WABA `206538077125724`, atendido
no aplicativo, com a qualidade GREEN e o tier de 2.000/24h. WABA é container: a
do chip é outra, e as duas convivem no mesmo portfólio. Não pendurar o chip na
WABA do 2240 — ela é SMB/ON_PREMISE; **WABA nova nasce CLOUD_API**, que é o que
permite registrar.

O chip ocupa o slot **`DAME`** das envs (`WA_TOKEN_DAME`/`WA_PHONE_ID_DAME`),
que hoje aponta para o 2240 `DISCONNECTED` — sobrescrever não custa nada e faz o
modal disparar para a base de clientes da Dáme.

⚠️ **O que continua travado:** mensagem de marketing é sempre paga e a forma de
pagamento é do **portfólio** — o mesmo que a linha de crédito da ManyChat
bloqueia. Os passos 1 a 8 rodam e o template pode até ser aprovado; o **disparo
real** só sai quando a linha for desalocada.

### A resposta da ManyChat (ticket #555459) — não seguir ao pé da letra

Respondeu em 19/08, **pelo AI Agent deles**, e cobrou resposta em 20/08. O
roteiro que mandaram manda **excluir o número da WABA pelo ícone da lixeira**.
**Não fazer isso**: joga fora a qualidade GREEN e o tier de 2.000/24h do
3332-2440, que não voltam — número re-adicionado começa frio. E o primeiro passo
deles ("remova a conta do WhatsApp da Manychat") parte de premissa errada: o
canal já aparece **não conectado** e as duas assinaturas estão Expired, como o
próprio ticket dizia. O caminho é escalar para humano pedindo a desalocação.

### Quem responde o número que ninguém atende

O chip não está aberto em aparelho nenhum — é condição para registrar na Cloud
API. Consequência: **quem responde à campanha não fala com ninguém**. Por isso
duas mudanças, feitas em 10/09:

1. **O botão do template virou URL** apontando para o 3332-2440
   (`wa.me/555133322440?text=Quero saber das novidades`), no lugar do Quick
   Reply. O Quick Reply fazia sentido quando o disparo sairia do próprio 2240;
   com número separado, o botão precisa levar o cliente para quem atende. O
   `?text=` também serve de atribuição.
2. **`wa-webhook.js` responde automaticamente** quem escreve em vez de clicar:
   texto livre na janela de 24h (que a mensagem do cliente abre), dizendo que a
   conta não é atendida e repetindo o link. Uma vez a cada 24h por número
   (`campanhaAutoRespostas/{telefone}`), e **nunca** para quem pediu SAIR —
   esse recebe só a confirmação do descadastro, uma única vez. Mandar link para
   quem acabou de pedir para sair é o caminho curto para o bloqueio, e bloqueio
   derruba a nota de qualidade.

Isso exige a env **`WA_ATENDIMENTO_DAME`** (número que atende, E.164 só dígitos:
`555133322440`). Sem ela o webhook simplesmente não responde nada.

## Passo a passo do cadastro (é o que falta para funcionar)

### 1. Conta e verificação
1. [business.facebook.com](https://business.facebook.com) → criar/usar o
   Business Manager da pizzaria.
2. **Verificação do negócio** (Configurações → Central de Segurança): CNPJ,
   comprovante de endereço, site. Leva de horas a alguns dias. **Sem isso o
   limite de envio trava em 250 destinatários novos por dia.**

### 2. App e produto WhatsApp
3. [developers.facebook.com](https://developers.facebook.com) → Criar app →
   tipo **Negócios** → adicionar o produto **WhatsApp**.
4. Isso cria uma **WABA** (WhatsApp Business Account) e um número de teste.

### 3. Números (um por marca)
5. Em WhatsApp → Configuração da API → **Adicionar número de telefone**.
6. O número precisa **receber SMS ou ligação** e **não estar em uso no app do
   WhatsApp**. Chip novo por marca é o caminho: o número de atendimento e o
   `whatsbot` (Baileys) continuam intactos.
7. Anote o **Phone number ID** de cada número (não é o telefone — é um ID
   numérico).

### 4. Token que não expira
8. Business Manager → Configurações → **Usuários do sistema** → criar um usuário
   de sistema com papel de administrador.
9. Atribuir a WABA a ele → **Gerar token** com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`.
10. Escolher **"Nunca expira"**. O token de 24h da tela de teste não serve.

### 5. Template aprovado
11. Gerenciador do WhatsApp → **Modelos de mensagem** → Criar.
12. Categoria **Marketing**, idioma **Português (BR)**.
13. Corpo com `{{1}}` onde entra o primeiro nome. Exemplo:

    > Oi, {{1}}! Faz um tempinho que você não pede na Dáme 🍕
    > Preparamos um cupom pra sua volta. Chama a gente pra pegar o seu.

14. Botão do tipo **URL** → `https://wa.me/55SEUNUMERODALOJA?text=Quero%20meu%20cupom`
    Esse botão é o que leva a conversa para o número da loja, onde o atendimento
    já existe — e o `?text=` faz a atribuição: quem chega com essa frase veio da
    campanha.
15. Aprovação costuma sair em minutos. Anote o **nome** do template (é ele que
    vai no modal, não o texto).

### 6a. Onde o token fica guardado

O token **não entra no repositório**. Ele vive em dois lugares:

1. **`C:\claude_project\Hub\_credenciais\whatsapp-cloud.env`** — o store
   central de credenciais (gitignored), com todas as chaves já nomeadas e os
   IDs preenchidos. É de lá que o `registrar_numero_wa.mjs` lê sozinho.
2. **Environment Variables do projeto Vercel `gemini-proxy-intranet`** — é o
   que o proxy usa em produção. As chaves têm os mesmos nomes.

### 6. Variáveis na Vercel
No projeto `gemini-proxy-intranet` → Settings → Environment Variables:

| Variável | O que é |
|---|---|
| `WA_TOKEN_DAME` | token permanente do usuário de sistema |
| `WA_PHONE_ID_DAME` | Phone number ID do número da Dáme |
| `WA_TOKEN_LOV` | idem, Lov |
| `WA_PHONE_ID_LOV` | idem, Lov |
| `WA_VERIFY_TOKEN` | frase que você inventa, usada só no passo 7 |
| `WA_APP_SECRET` | App Secret do app (Configurações → Básico) |
| `WA_ATENDIMENTO_DAME` | número que ATENDE (E.164 só dígitos) — destino da resposta automática |
| `WA_ATENDIMENTO_LOV` | idem, Lov (sem ela, nada é respondido nesse slot) |

`FIREBASE_SERVICE_ACCOUNT` e `ADMIN_EMAIL` já existem lá, do proxy do Gemini.

Depois: `cd gemini-proxy && npx vercel --prod` (o deploy do FTP **não** publica o
proxy — são coisas separadas).

### 7. Webhook

✅ **Configurado em 19/08** e com o campo `messages` assinado.

Duas armadilhas que custaram caro aqui:

1. **O verify token não é o access token.** O campo "Verificar token" recebeu por
   engano o token `EAA…` do usuário de sistema. São coisas diferentes: o verify
   token é uma frase qualquer, só para a Meta e o servidor se reconhecerem no
   handshake — hoje é `dame-webhook-2026`, o mesmo valor na env `WA_VERIFY_TOKEN`.
2. **`req.query` vem vazio** quando o arquivo declara `bodyParser: false` (que o
   `wa-webhook.js` precisa para conferir o HMAC sobre os bytes crus). O handshake
   lia dali e comparava `undefined`, devolvendo 403 para a Meta em toda tentativa.
   Agora lê de `req.url`.

Para testar sem depender do painel:

```bash
curl "https://gemini-proxy-intranet.vercel.app/api/wa-webhook?hub.mode=subscribe&hub.verify_token=dame-webhook-2026&hub.challenge=12345"
# 12345  → handshake ok
```

No app da Meta → WhatsApp → Configuração → Webhooks:

- **URL de callback:** `https://gemini-proxy-intranet.vercel.app/api/wa-webhook`
- **Token de verificação:** o mesmo valor de `WA_VERIFY_TOKEN`
- **Campos:** marcar `messages`

É o webhook que preenche entregue/lido/falhou e o descadastro.

### 8. Ligar na intranet
Configurações → Seções visíveis → **Clientes** → expandir → ligar **Enviar
campanha** para quem pode disparar. Nasce desligado, inclusive para o admin.

## Descadastro (LGPD)

Quem responde **SAIR**, **PARAR**, **CANCELAR**, **DESCADASTRAR**, **STOP** ou
**REMOVER** entra em `clientesOptOut` pelo webhook e nunca mais recebe — o
próprio servidor pula, não é só a tela. O número é gravado nas duas formas (com
e sem o 9), senão um celular antigo continuaria recebendo depois de ter pedido
para sair.

O telefone foi dado para entregar pizza, não para receber propaganda: vale pôr
"responda SAIR para não receber" no rodapé do template. Isso também protege a
nota de qualidade — quem consegue sair não bloqueia, e bloqueio derruba o número.

## Custo e limite

- **Limite de envio:** começa em 1.000 destinatários novos/24h com o negócio
  verificado (250 sem verificação) e sobe para 10.000 e ilimitado conforme a
  qualidade. O campo **Limite hoje** no modal existe para respeitar isso: o que
  sobra fica para o dia seguinte e a mesma campanha continua de onde parou.
- **Preço:** a Meta cobra por mensagem de marketing entregue, e o valor por país
  está na tabela dela. Sem BSP você paga só isso — não há mensalidade de
  plataforma nem taxa de habilitação.
- A conversa que continua no número da loja (via botão wa.me) **não é cobrada**:
  ela acontece fora da Cloud API.

## Se der errado

| Sintoma | Onde olhar |
|---|---|
| `403 sem permissão para esta ação` | flag `clientesEnviar` no settings do usuário |
| `503 WhatsApp da <loja> não configurado` | falta `WA_TOKEN_*`/`WA_PHONE_ID_*` na Vercel |
| Erro 131026 / "message undeliverable" | número não tem WhatsApp |
| Erro 131047 | fora da janela de 24h — só template resolve (é o que fazemos) |
| Erro 130429 / 131056 | bateu o limite de taxa; baixe o **Limite hoje** |
| Status para em "enviado" | webhook não configurado ou `WA_APP_SECRET` errado |
| Template rejeitado | categoria errada (tem que ser Marketing) ou promessa exagerada no texto |
