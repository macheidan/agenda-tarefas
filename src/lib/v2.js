/**
 * Flag da versão v2 (damepizza.com.br/intranet/v2).
 *
 * O atributo [data-v2] é setado no <html> pelo script inline do index.html
 * quando a URL é /intranet/v2 (ou ?v2=1 em dev) — antes do paint. Ler o
 * atributo aqui mantém JS e CSS ligados pelo MESMO sinal: se o tema v2 está
 * ativo, o shell v2 também está.
 */
export const IS_V2 =
  typeof document !== 'undefined' && document.documentElement.hasAttribute('data-v2');
