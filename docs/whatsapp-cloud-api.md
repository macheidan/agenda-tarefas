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
