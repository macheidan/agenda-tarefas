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

`FIREBASE_SERVICE_ACCOUNT` e `ADMIN_EMAIL` já existem lá, do proxy do Gemini.

Depois: `cd gemini-proxy && npx vercel --prod` (o deploy do FTP **não** publica o
proxy — são coisas separadas).

### 7. Webhook
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
