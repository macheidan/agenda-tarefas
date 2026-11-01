// Confere se o mes fechou COMPLETO na Mesa do Dono.
// Sai com 1 se faltar alguma metade - e o log da rodada mostra o que faltou.
//
// Existe por causa de agosto/2026: o doc existia, o faturamento estava certo,
// e mesmo assim a Mesa do Dono mostrava Pizzas e Ticket zerados, porque so a
// metade do DRE tinha sincronizado. Um doc que "existe" nao prova nada.
import { readFileSync, readdirSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const val = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : null;
};
const hoje = new Date();
const mes = val('--mes') ?? (hoje.getMonth() === 0 ? 12 : hoje.getMonth());
const ano = val('--ano') ?? (hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear());
const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

const dir = 'C:/claude_project/Hub/_credenciais/firebase';
const arq = readdirSync(dir).find((f) => f.endsWith('.json'));
initializeApp({ credential: cert(JSON.parse(readFileSync(`${dir}/${arq}`, 'utf8'))) });
const db = getFirestore();

// No dia 01 a DRE do mes ainda nao fechou: a linha da aba DADOS tem pizzas
// mas nao tem faturamento, e o SyncVendas so cria o doc com os dois. Isso NAO
// e buraco - e o estado normal ate o /dre rodar `--completar-linha` (que
// dispara o sync). Antes disso o job acusava falha todo mes (01/10 e 01/11).
// Buraco de verdade = DRE fechada (faturamento no doc) sem a metade VENDAS.
let falhou = false;
for (const marca of ['dame', 'lov']) {
  const snap = await db.collection('fechamentos_mensais').doc(`${anoMes}_${marca}`).get();
  if (!snap.exists || !snap.data().faturamento) {
    console.log(`${anoMes}_${marca}: aguardando DRE (faturamento ainda nao fechado) - nao e falha`);
    continue;
  }
  const v = snap.data();
  const faltas = [];
  if (!v.faturamento) faltas.push('faturamento (lado DRE)');
  if (!v.pizzas) faltas.push('pizzas (lado VENDAS LOJAS)');
  if (!v.ticket) faltas.push('ticket (lado VENDAS LOJAS)');
  if (!v.canais) faltas.push('canais (lado VENDAS LOJAS)');
  if (faltas.length) {
    console.log(`${anoMes}_${marca}: INCOMPLETO -> falta ${faltas.join(', ')} (origem=${v.origem ?? '-'})`);
    falhou = true;
  } else {
    console.log(
      `${anoMes}_${marca}: completo · faturamento=${v.faturamento.toFixed(2)} ` +
      `pizzas=${v.pizzas} ticket=${v.ticket.toFixed(2)} origem=${v.origem ?? '-'}`
    );
  }
}
process.exit(falhou ? 1 : 0);
