# Backup do Saipos

O que a intranet mostra é uma redução do que o Saipos devolve. Este arquivo
guarda o dado bruto, inteiro e para sempre.

## Onde

```
G:\Meu Drive\02 Pizzarias\07 Backup Saipos\
  cadastros\dame.jsonl            1 linha por cadastro, todos os campos
  cadastros\lov.jsonl
  pedidos\dame-2026-08.jsonl      1 linha por pedido, no mês em que foi feito
  pedidos\lov-2026-08.jsonl
```

Pasta do Drive: o Google replica e versiona. Sobrepor com a variável de ambiente
`SAIPOS_BACKUP`.

**Nunca colocar isto no vault** (`G:\Meu Drive\03 Pessoal\Vault`) nem em pasta
de repositório: o vault sobe para github.com/macheidan/2ndbrain, e aqui tem CPF
em claro, endereço completo e telefone.

## O que só existe aqui

| | Firestore | JSON de `data/` | Este arquivo |
|---|---|---|---|
| CPF | só o hash | em claro, 7 dias | **em claro, sempre** |
| Rua, número, complemento | não | 7 dias | **sempre** |
| E-mail, aniversário, gênero | e-mail e aniversário | 7 dias | **sempre** |
| `notes`, saldo, ticket médio do Saipos | não | não | **sempre** |
| Produto de cada pedido | não | não | **sempre** |
| Canal e forma de pagamento por pedido | não | agregado | **por pedido** |
| Quem envelheceu para fora dos 90 dias | sim | não | **sim** |

## Como é mantido

`arquivo.py`, chamado pelos dois coletores dentro da rotina diária das 03:40.
Duas garantias, com teste em `test_arquivo.py`:

- **nunca perde** — é merge, não sobrescrita. Cadastro que sair do Saipos, ou
  cliente que envelhecer para fora da janela de 90 dias, continua aqui.
- **idempotente** — rodar duas vezes no mesmo dia não duplica nada.

A escrita é pelo temporário com troca no fim: queda no meio não deixa arquivo
pela metade. Se o `G:` não estiver montado, a coleta avisa e segue sem
arquivar — perder o backup de um dia é ruim, derrubar a coleta é pior.

Pedido é imutável, então o shard do mês fecha e nunca mais muda. É o que evita
o Drive re-subir tudo todo dia.

## Para ler

```bash
# quantos pedidos por canal em agosto
cat "pedidos/dame-2026-08.jsonl" | python -c "
import sys,json
from collections import Counter
print(Counter(json.loads(l)['canal'] for l in sys.stdin))"

# um cadastro específico
grep '\"id_customer\": 40994210' cadastros/dame.jsonl | python -m json.tool
```

## Se a base da intranet for perdida

Dá para refazer daqui: `cadastros/*.jsonl` tem todo cliente que já apareceu,
com a última compra de cada um, e `pedidos/*.jsonl` tem o histórico com
`_id_customer` ligando pedido a cadastro. É estritamente mais completo que o
Firestore — que por sua vez é mais completo que a coleta de um dia.
