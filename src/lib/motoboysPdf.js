// Exportação em PDF da semana de motoboys.
//
// Monta um HTML autocontido numa janela nova e chama print() — o usuário salva
// como PDF pelo diálogo do navegador. Sem dependência nova no bundle.
//
// REGRA: o PDF NÃO leva nada vindo da Saipos (linha "Saipos + bandas extras",
// os "/ n" ao lado das quantidades, badges de divergência e a lista de nomes
// não casados). O relatório é o que foi lançado pelo gerente.

import { formatBRL } from '../utils/money';
import {
  DIAS_CURTOS,
  addDaysIso,
  formatDiaCurto,
  calcMotoboySemana,
  calcResumoSemana,
} from '../hooks/useMotoboys';

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CSS = `
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #1a1a1a;
    font-size: 12px;
  }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { font-size: 12px; color: #666; margin-bottom: 16px; }
  .bloco { margin-bottom: 14px; page-break-inside: avoid; }
  .blocoTitulo {
    display: flex; align-items: baseline; gap: 10px;
    font-size: 14px; font-weight: 700; margin-bottom: 4px;
  }
  .blocoTitulo .qtd { font-size: 11px; font-weight: 600; color: #666; }
  .blocoTitulo .total { margin-left: auto; font-size: 13px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    border: 1px solid #d8d8d8;
    padding: 3px 5px;
    text-align: center;
    font-size: 11px;
  }
  th { background: #f4f4f4; font-weight: 700; }
  th.rot, td.rot { text-align: left; white-space: nowrap; }
  td.rot { background: #fafafa; }
  .rot .lbl { display: block; font-weight: 600; }
  .rot .hint { display: block; font-size: 9px; color: #888; font-weight: 400; }
  .diaData { display: block; font-size: 9px; font-weight: 400; color: #777; }
  .apoio { display: block; font-size: 9px; font-weight: 600; color: #a06800; }
  .colApoio { background: #fff8e1; }
  .totCol { background: #f4f4f4; font-weight: 700; }
  tr.sep td, tr.sep th { border-top: 2px solid #bbb; }
  tr.valor td { font-weight: 700; background: #f0f6ff; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  table.extras td, table.extras th { text-align: left; }
  .resumo { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; page-break-inside: avoid; }
  .card {
    border: 1px solid #d8d8d8; border-radius: 6px; padding: 8px 12px; min-width: 130px;
  }
  .card .lbl { display: block; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .card .val { display: block; font-size: 15px; font-weight: 700; margin-top: 2px; }
  .card.tot { background: #f0f6ff; border-color: #9dbdf0; }
  .rodape { margin-top: 18px; font-size: 10px; color: #888; }
  .vazio { color: #888; font-style: italic; }
`;

// Gera o HTML do relatório da semana (exportado para facilitar testes/uso futuro).
export function montarHtmlSemana({
  lojaNome,
  segunda,
  semana,
  config,
  extras = [],
  mostrarLancamentos = true,
  mostrarResultado = true,
}) {
  const diasIso = Array.from({ length: 7 }, (_, i) => addDaysIso(segunda, i));
  const fim = diasIso[6];
  const taxas = config?.taxas || [];
  const motoboys = semana?.motoboys || {};
  const lista = Object.entries(motoboys)
    .map(([mid, mb]) => ({ mid, ...mb }))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome));

  // Mesma regra da tela: taxa aparece se tem valor definido ou algum lançamento.
  const taxaVisivel = taxas.map((tx, i) => {
    if (tx.valor != null && tx.valor !== '') return true;
    return lista.some((mb) => Object.values(mb.dias || {}).some((d) => Number(d?.t?.[i]) > 0));
  });

  const resumo = calcResumoSemana(motoboys, config);

  const blocos = lista
    .map((mb) => {
      const r = calcMotoboySemana(mb, config);
      const semGar = diasIso.map((_, di) => mb.dias?.[di]?.semGarantia === true);
      const cls = (di) => (semGar[di] ? ' class="colApoio"' : '');

      const cabecalho = `
        <tr>
          <th class="rot"></th>
          ${diasIso
            .map(
              (d, i) =>
                `<th${cls(i)}>${DIAS_CURTOS[i]}<span class="diaData">${formatDiaCurto(d)}</span>${
                  semGar[i] ? '<span class="apoio">Apoio</span>' : ''
                }</th>`
            )
            .join('')}
          <th class="totCol">Total</th>
        </tr>`;

      const linhasTaxa = mostrarLancamentos
        ? taxas
            .map((tx, ti) => {
              if (!taxaVisivel[ti]) return '';
              const totLinha = diasIso.reduce(
                (acc, _, di) => acc + (Number(mb.dias?.[di]?.t?.[ti]) || 0),
                0
              );
              return `
                <tr>
                  <td class="rot">
                    <span class="lbl">${esc(tx.label)}</span>
                    <span class="hint">${esc(
                      [tx.valor != null ? formatBRL(tx.valor) : '', tx.faixa || ''].filter(Boolean).join(' · ')
                    )}</span>
                  </td>
                  ${diasIso
                    .map((_, di) => `<td${cls(di)}>${Number(mb.dias?.[di]?.t?.[ti]) || ''}</td>`)
                    .join('')}
                  <td class="totCol">${totLinha || ''}</td>
                </tr>`;
            })
            .join('')
        : '';

      const linhaDesc = mostrarLancamentos
        ? `
          <tr>
            <td class="rot"><span class="lbl">Descontos</span><span class="hint">R$</span></td>
            ${diasIso
              .map((_, di) => `<td${cls(di)}>${esc(formatBRL(mb.dias?.[di]?.desc ?? null))}</td>`)
              .join('')}
            <td class="totCol">${esc(r.total.desconto ? formatBRL(r.total.desconto) : '')}</td>
          </tr>`
        : '';

      const linhaEntregas = mostrarLancamentos
        ? `
          <tr class="sep">
            <td class="rot"><span class="lbl">Entregas</span></td>
            ${r.dias.map((d, i) => `<td${cls(i)}>${d.qtd || ''}</td>`).join('')}
            <td class="totCol">${r.total.qtd || ''}</td>
          </tr>`
        : '';

      const linhasResultado = mostrarResultado
        ? `
          <tr>
            <td class="rot"><span class="lbl">Total bandas</span><span class="hint">qtde × valor da taxa</span></td>
            ${r.dias.map((d, i) => `<td${cls(i)}>${esc(d.bandas ? formatBRL(d.bandas) : '')}</td>`).join('')}
            <td class="totCol">${esc(r.total.bandas ? formatBRL(r.total.bandas) : '')}</td>
          </tr>
          <tr>
            <td class="rot"><span class="lbl">Acréscimo</span><span class="hint">completa a garantia de ${esc(
              formatBRL(config?.garantia)
            )}</span></td>
            ${r.dias.map((d, i) => `<td${cls(i)}>${esc(d.acrescimo ? formatBRL(d.acrescimo) : '')}</td>`).join('')}
            <td class="totCol">${esc(r.total.acrescimo ? formatBRL(r.total.acrescimo) : '')}</td>
          </tr>
          <tr class="valor">
            <td class="rot"><span class="lbl">Valor a receber</span><span class="hint">bandas + acréscimo + descontos</span></td>
            ${r.dias.map((d, i) => `<td${cls(i)}>${esc(d.valor ? formatBRL(d.valor) : '')}</td>`).join('')}
            <td class="totCol">${esc(formatBRL(r.total.valor))}</td>
          </tr>`
        : '';

      return `
        <div class="bloco">
          <div class="blocoTitulo">
            <span>${esc(mb.nome)}</span>
            ${r.total.qtd ? `<span class="qtd">${r.total.qtd} entregas</span>` : ''}
            ${mostrarResultado ? `<span class="total">${esc(formatBRL(r.total.valor))}</span>` : ''}
          </div>
          <table>
            <thead>${cabecalho}</thead>
            <tbody>${linhasTaxa}${linhaDesc}${linhaEntregas}${linhasResultado}</tbody>
          </table>
        </div>`;
    })
    .join('');

  const blocoExtras =
    mostrarLancamentos && extras.length > 0
      ? `
        <h2>Bandas extras</h2>
        <table class="extras">
          <thead>
            <tr><th>Data</th><th>Motoboy</th><th>Qtd</th><th>Taxa</th><th>Justificativa</th></tr>
          </thead>
          <tbody>
            ${extras
              .map(
                (e) => `
                  <tr>
                    <td>${esc(formatDiaCurto(e.data))}</td>
                    <td>${esc(e.nome || motoboys[e.mid]?.nome || '—')}</td>
                    <td>${esc(e.quantidade)}</td>
                    <td>${esc(taxas[e.taxaIdx]?.label || `Taxa ${(e.taxaIdx ?? 0) + 1}`)}</td>
                    <td>${esc(e.justificativa)}</td>
                  </tr>`
              )
              .join('')}
          </tbody>
        </table>`
      : '';

  const blocoResumo = mostrarResultado
    ? `
      <div class="resumo">
        <div class="card"><span class="lbl">Entregas</span><span class="val">${resumo.entregas}</span></div>
        <div class="card"><span class="lbl">Motos (diárias)</span><span class="val">${resumo.motoDias}</span></div>
        <div class="card"><span class="lbl">Taxa coop (${esc(
          formatBRL(config?.taxaCoop)
        )}/moto)</span><span class="val">${esc(formatBRL(resumo.taxaCoopTotal))}</span></div>
        <div class="card"><span class="lbl">Transbordo</span><span class="val">${esc(
          formatBRL(resumo.transbordo)
        )}</span></div>
        <div class="card tot"><span class="lbl">Total a pagar</span><span class="val">${esc(
          formatBRL(resumo.totalPagar)
        )}</span></div>
      </div>`
    : '';

  const titulo = `Motoboys ${lojaNome} — ${formatDiaCurto(segunda)} a ${formatDiaCurto(fim)}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>${CSS}</style>
</head>
<body>
  <h1>${esc(titulo)}</h1>
  <div class="sub">Semana de ${esc(formatDiaCurto(segunda))} a ${esc(formatDiaCurto(fim))} · ${esc(lojaNome)}</div>
  ${blocos || '<p class="vazio">Nenhum motoboy lançado nesta semana.</p>'}
  ${blocoExtras}
  ${blocoResumo}
  <div class="rodape">Gerado em ${esc(new Date().toLocaleString('pt-BR'))} pela intranet.</div>
</body>
</html>`;
}

// Abre o relatório numa janela nova e dispara o diálogo de impressão
// (o usuário escolhe "Salvar como PDF"). Retorna false se o popup foi bloqueado.
export function exportarSemanaPdf(dados) {
  const html = montarHtmlSemana(dados);
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
