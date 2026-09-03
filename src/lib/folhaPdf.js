// Exportação em PDF do Resumo Mensal de Salários Folha (Banco + Flash).
//
// Mesmo mecanismo do PDF de motoboys: monta um HTML autocontido numa janela
// nova e chama print() — o usuário salva como PDF pelo diálogo do navegador.
// Sem dependência nova no bundle.
//
// REGRA: leva só o que o espelho dpSalariosBanco tem (banco e flash por linha).
// Salário, adiantamento, empréstimo e dinheiro "por fora" nunca entram aqui —
// é o que permite entregar este PDF pra quem fecha a folha sem expor a ficha.

import { formatBRL } from '../utils/money';

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const val = (n) => (n ? esc(formatBRL(n)) : '—');
const tot = (n) => esc(formatBRL(n) || 'R$ 0,00');

const CSS = `
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #1a1a1a;
    font-size: 12px;
  }
  h1 { font-size: 16px; margin: 0; }
  .sub { font-size: 12px; color: #666; margin: 4px 0 16px; }
  .bloco { margin-bottom: 18px; page-break-inside: avoid; }
  .blocoTitulo { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    border: 1px solid #d8d8d8;
    padding: 4px 6px;
    text-align: right;
    font-size: 11px;
    white-space: nowrap;
  }
  th { background: #f4f4f4; font-weight: 700; text-align: center; }
  th.nome, td.nome { text-align: left; width: 34%; }
  td.banco { background: #fff3e6; }
  td.flash { background: #fbeaf3; }
  td.total { font-weight: 700; }
  tr.subtotal td { font-weight: 700; background: #f4f4f4; border-top: 2px solid #bbb; }
  tr.geral td { font-weight: 700; background: #f0f6ff; border-top: 2px solid #9dbdf0; }
  .rodape { margin-top: 18px; font-size: 10px; color: #888; }
`;

// grupos: [{ storeName, rows: [{ name, banco5, banco20, flash5, flash20, extraBanco, extraFlash, total }], subtotal }]
export function montarHtmlResumoFolha({ mesLabel, grupos, grandTotal, hasExtra, geradoEm }) {
  const cabecalho = `
    <tr>
      <th class="nome">Funcionário</th>
      <th>Banco 5</th>
      <th>Banco 20</th>
      <th>Flash 5</th>
      <th>Flash 20</th>
      ${hasExtra ? '<th>Banco extra</th><th>Flash extra</th>' : ''}
      <th>Total</th>
    </tr>`;

  const linha = (r) => `
    <tr>
      <td class="nome">${esc(r.name)}</td>
      <td class="banco">${val(r.banco5)}</td>
      <td class="banco">${val(r.banco20)}</td>
      <td class="flash">${val(r.flash5)}</td>
      <td class="flash">${val(r.flash20)}</td>
      ${hasExtra ? `<td class="banco">${val(r.extraBanco)}</td><td class="flash">${val(r.extraFlash)}</td>` : ''}
      <td class="total">${val(r.total)}</td>
    </tr>`;

  const totais = (cls, label, t) => `
    <tr class="${cls}">
      <td class="nome">${esc(label)}</td>
      <td>${tot(t.banco5)}</td>
      <td>${tot(t.banco20)}</td>
      <td>${tot(t.flash5)}</td>
      <td>${tot(t.flash20)}</td>
      ${hasExtra ? `<td>${tot(t.extraBanco)}</td><td>${tot(t.extraFlash)}</td>` : ''}
      <td>${tot(t.total)}</td>
    </tr>`;

  const blocos = grupos
    .map(
      (g) => `
      <div class="bloco">
        <div class="blocoTitulo">${esc(g.storeName)}</div>
        <table>
          <thead>${cabecalho}</thead>
          <tbody>
            ${g.rows.map(linha).join('')}
            ${totais('subtotal', `Total ${g.storeName}`, g.subtotal)}
          </tbody>
        </table>
      </div>`
    )
    .join('');

  const geral =
    grupos.length > 1
      ? `
      <div class="bloco">
        <table>
          <thead>${cabecalho}</thead>
          <tbody>${totais('geral', 'Total geral', grandTotal)}</tbody>
        </table>
      </div>`
      : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Folha ${esc(mesLabel)}</title>
<style>${CSS}</style>
</head>
<body>
  <h1>Salários Folha — Resumo Mensal</h1>
  <div class="sub">${esc(mesLabel)} · Banco e Flash por funcionário</div>
  ${blocos}
  ${geral}
  <div class="rodape">Gerado em ${esc(geradoEm)} pela intranet.</div>
</body>
</html>`;
}

export function exportarResumoFolhaPdf(dados) {
  const html = montarHtmlResumoFolha(dados);
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Espera o layout assentar antes de imprimir (Safari/iOS precisam disso).
  const imprimir = () => {
    win.print();
  };
  if (win.document.readyState === 'complete') setTimeout(imprimir, 250);
  else win.onload = () => setTimeout(imprimir, 250);
  return true;
}
