# Simulação de regime tributário — 2027

Rodar: `node scripts/fiscal/simular.mjs` · Testes: `node --test scripts/fiscal/regimes.test.mjs`

**Por que 2027 e não 2026.** A opção por Lucro Presumido ou Lucro Real é anual e
irretratável, exercida no primeiro recolhimento de janeiro — 2026 já está travado.
E 2027 é o ano em que PIS/COFINS deixam de existir, o que muda o eixo da decisão.
Os dados de entrada continuam sendo o DRE de 2026 (jan–jul realizado).

## De onde vêm os números

Planilha **DRE** no Drive (`1ocnKjysZ-Eb7IIgtGO-BY1lGE9jNDNtI61eZgnzFuvE`), abas
`DAME 2026`, `LOV 2026`, `DAME 2025`, `LOV 2025` e a aba de lançamentos dos
extratos. Copiados para `scripts/fiscal/dados.mjs` — se a planilha mudar, é lá
que se atualiza.

A linha **Tributos** do DRE é um agregado de caixa: mistura imposto sobre venda,
imposto sobre lucro e encargo de folha. A simulação precisa dos três separados, e
a única decomposição exata que existe é a de janeiro/2026, item a item do extrato.
Por isso ela está gravada em `TRIBUTOS_JAN_2026` e serve de gabarito: os testes
reconstroem PIS, COFINS, IRPJ e CSLL pelas alíquotas e conferem contra o que
realmente saiu do banco (desvio < 4%).

## O regime atual é Lucro Presumido — e isso é dedução, não suposição

O extrato de janeiro/2026 mostra ICMS pago direto à Secretaria da Fazenda e
PIS/COFINS em DARF separado. Nenhum dos dois existiria no Simples Nacional. Mais:
a razão entre os dois DARFs de 26/01 é exatamente 3,00/0,65 — a assinatura do
PIS/COFINS cumulativo. E os DARFs de 30/01 batem, a menos de 3%, com o IRPJ e a
CSLL do 4º trimestre/2025 calculados sobre presunção de 8% e 12%.

Componentes medidos:

| | ICMS | PIS+COFINS | IRPJ+CSLL | INSS+FGTS |
|---|---|---|---|---|
| Dáme, jan/26 | R$ 9.949 | R$ 10.313 | R$ 20.861 | R$ 12.270 |
| Lov, jan/26 | R$ 7.670 | R$ 7.282 | R$ 14.575 | R$ 10.104 |

O ICMS é o regime diferenciado do RS para bares e restaurantes: 3,5% da receita
bruta, sem crédito (RICMS/RS art. 38-A, Decreto 57.930/2024, vigente até 2028).

## Simples Nacional está vedado

Não por causa do faturamento de cada uma — as duas cabem no teto isoladamente —
mas porque você é sócio-administrador das duas. A LC 123/2006, art. 3º, §4º,
incisos III e V, manda **somar a receita bruta global** nesse caso. Receita global
de R$ 6,84 mi em 2025 e R$ 6,01 mi projetados para 2027, contra teto de R$ 4,8 mi.

Não é perda: o Anexo I na faixa de vocês daria 11,80% (Dáme) e 10,82% (Lov), carga
próxima da atual. O Simples nunca foi a oportunidade aqui.

## Em 2027 a CBS sai da disputa — e isso destrava o Lucro Real

Hoje, o que segura o Lucro Real é o PIS/COFINS: 3,65% cumulativo no Presumido
contra 9,25% não cumulativo no Real, sem crédito relevante porque insumo de cesta
básica é alíquota zero. Essa penalidade compensava a economia de IRPJ/CSLL.

Em 2027 PIS/COFINS acabam. A CBS de bares e restaurantes (LC 214/2025, arts. 273 a
276) é **por atividade, não por regime**: alíquota reduzida em 40% (5,28% em 2027,
sobre CBS de 8,8% já descontado o 0,1 p.p. do IBS de transição), cumulativa, e com
a base excluindo intermediação de plataforma digital, entrega e gorjeta (art. 274,
parágrafo único) — o que num delivery tira ~14% da base. Fica idêntica no Presumido
e no Real, e some da comparação.

Sobra o IRPJ/CSLL. E aí a conta é direta: o Presumido tributa 8% e 12% de lucro
presumido; a margem real medida é 4,53% na Dáme e **negativa** na Lov.

| | receita 2027 | margem real | Presumido | Real | diferença |
|---|---|---|---|---|---|
| Dáme | R$ 3.496.817 | 4,53% | R$ 77.563 | R$ 38.001 | −R$ 39.561 |
| Lov | R$ 2.510.560 | −1,32% | R$ 53.978 | R$ 0 | −R$ 53.978 |
| **Grupo** | R$ 6.007.377 | | **R$ 131.541** | **R$ 38.001** | **−R$ 93.540** |

Economia bruta R$ 93.540/ano; líquida de ~R$ 48 mil de contabilidade adicional,
**R$ 45.540/ano**. Mais o prejuízo fiscal de R$ 33 mil da Lov, que no Presumido
simplesmente se perde.

Detalhe que vale dinheiro: optar pelo **Lucro Real anual**, não trimestral. As duas
casas têm meses fortemente negativos (janeiro) e fortemente positivos. No anual,
com balancete de suspensão, os meses ruins abatem os bons dentro do próprio ano;
no trimestral, prejuízo de um trimestre só compensa 30% do lucro do seguinte.

## Pessoa física

Renda projetada de R$ 633 mil (R$ 573 mil de distribuição + R$ 60 mil de
pró-labore) põe você logo acima do piso do IRPFM, com alíquota de 0,56%.

- **IRRF de 10% sobre dividendos** (Lei 15.270/2025): o teto de R$ 50 mil é por
  CNPJ e por sócio, mês a mês, e quando estoura pega o valor **inteiro** do mês.
  Em junho/2026 a Dáme passou por R$ 379 e isso custou R$ 5.038.
- Alisar os saques abaixo do teto economiza só R$ 1.514/ano, porque o IRRF é
  compensável contra o IRPFM. Vale fazer mesmo assim — é grátis, e protege de meses
  em que a distribuição sobe.
- Ter duas empresas dá teto de R$ 100 mil/mês sem retenção, desde que cada CNPJ
  fique abaixo do seu.
- Manter pró-labore baixo continua certo: dividendo custa ~0% até o teto, pró-labore
  custa 20% de INSS patronal sem limite. A exceção é que, no Lucro Real, pró-labore
  vira despesa dedutível (escudo de 24%) — se em algum momento você quiser subir o
  pró-labore, 2027 no Real é o momento mais barato.

## O ponto que vale mais que a escolha de regime

Lucro contábil do grupo em 2027, já no melhor cenário: ~R$ 87 mil. Distribuição
projetada: R$ 573 mil. Descoberto de ~R$ 486 mil.

Lucro distribuído acima do lucro apurado não é isento — vira rendimento tributável
do sócio pela tabela progressiva. E a Lov, dando prejuízo, não tem lucro nenhum a
distribuir. Isso pesa mais que os R$ 45 mil da troca de regime e precisa ser
conferido contra a **ECD** antes de qualquer decisão: o DRE aqui é gerencial e de
caixa, e pode estar classificando como distribuição o que na escrituração é
pró-labore, reembolso ou mútuo. Se a ECD confirmar, o caminho é ajustar a
classificação e o nível de retirada, não mexer no regime.

## Premissas explícitas

- Receita de 2027 igual à projeção de 2026 fechado (sem crescimento). 2026 roda
  ~12% abaixo de 2025 nas duas casas; ago–dez é a sazonalidade de 2025 corrigida
  por esse ritmo.
- Margem de 2027 igual à medida em jan–jul/2026.
- Alíquota de referência da CBS em 8,8%. Se o número final subir, a carga sobe
  igual nos dois regimes — não muda a decisão.
- Contabilidade adicional do Lucro Real a R$ 24 mil/ano por empresa
  (`--custo-contabil=`). A decisão só vira em ~R$ 47 mil por empresa.
- Lucro contábil aproximado pelo caixa do DRE gerencial. Depreciação e competência
  provavelmente **reduzem** o lucro tributável — ou seja, tendem a favorecer ainda
  mais o Lucro Real.

Isto é uma simulação gerencial para orientar a conversa com a contabilidade, não
um parecer tributário. A opção precisa ser formalizada no primeiro recolhimento de
janeiro/2027 e é irretratável para o ano.
