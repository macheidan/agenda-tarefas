/**
 * planilha-precos-sync.gs — sincroniza a planilha de preços dos insumos a partir
 * do Supabase (mesma fonte da aba "Preços Insumos" da intranet).
 *
 * COMO USAR (resumo — passo a passo completo no fim do arquivo):
 *   1. script.google.com → Novo projeto (STANDALONE, não crie preso à planilha).
 *   2. Cole este arquivo inteiro.
 *   3. Configurações do projeto → Propriedades do script → adicione:
 *        SUPABASE_SERVICE_KEY = <a service_role key do seu projeto Supabase>
 *      (a service_role ignora o RLS; por isso o projeto é standalone e só seu —
 *       assim a chave não vaza pra quem tem acesso à planilha.)
 *   4. Rode `sync` uma vez com DRY_RUN = true e leia o Log (Ver → Registros de
 *      execução): ele mostra CADA célula que gravaria, sem tocar na planilha.
 *   5. Conferido, troque DRY_RUN = false e crie um gatilho de tempo (ex.: a cada
 *      6h) apontando pra função `sync`.
 *
 * O que ele NÃO faz: nunca insere/apaga colunas suas, nunca escreve em colunas de
 * cabeçalho manual (DEZ, jan.1, FEV…). Ele só escreve nas células que ele mesmo
 * controla (registradas por produto+data) ou na próxima célula livre da linha.
 */

// ── Configuração ────────────────────────────────────────────────────────────
var SHEET_ID   = '1U1lOgF9O5xVj_KwybpLX-wIa-6whI-qc8FH9Wbr5zfM';
var SHEET_GID  = 1177072428;   // aba específica (do link); null = primeira aba
var HEADER_ROW = 2;            // linha dos títulos (Produto, Último valor, …)
var FIRST_DATA_ROW = 3;        // primeira linha de produto

var DRY_RUN = true;            // true = só loga o que faria; false = grava de verdade

// Cabeçalhos usados pra achar as colunas (case-insensitive, sem acento).
var COL_PRODUTO   = 'produto';        // coluna do "Produto (planilha)" p/ casar a linha
var COL_ULTIMO    = 'ultimo valor';   // coluna "Último valor"
var COL_PENULTIMO = 'penultimo';      // sua coluna nova; se não achar, pula essa parte
var COL_TAIL      = ['r$', '%', 'gramas', 'resultado']; // 1º desses à direita = fim da região de preços

var SET_PENULTIMO_FORMULA = true;
var SET_ULTIMO_FORMULA    = false;    // true = sobrescreve "Último valor" com fórmula de último não-vazio
var SET_CONDITIONAL_FORMAT = true;

var SUPABASE_URL = 'https://uaeqvecqlkjqffwbtqsm.supabase.co';

// ── Ponto de entrada ────────────────────────────────────────────────────────
function sync() {
  var key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Falta a propriedade SUPABASE_SERVICE_KEY nas Propriedades do script.');

  var sheet = getSheet_();
  var cols = detectColumns_(sheet);
  Logger.log('Cabeçalho na linha %s (dados a partir de %s). Colunas: produto=%s, ultimo=%s, penultimo=%s, preços=[%s..%s]',
    cols.headerRow, cols.firstDataRow, cols.produto, cols.ultimo, cols.penultimo, cols.priceStart, cols.priceEnd);
  if (!cols.produto || !cols.ultimo) {
    throw new Error('Não achei "Produto"/"Último valor" no cabeçalho. Confira a aba (SHEET_GID) e os nomes em COL_PRODUTO/COL_ULTIMO.');
  }

  var notas = fetchNotas_(key);                 // [{planilha, data, resultado}]
  var porProduto = groupByProduto_(notas);      // { nomePlanilha: [{data, resultado}] }
  Logger.log('Supabase: %s notas, %s produtos (planilha) mapeados', notas.length,
    Object.keys(porProduto).length);

  var rowsByName = indexRows_(sheet, cols);     // nomeNormalizado -> nº da linha
  var props = PropertiesService.getScriptProperties();

  var writes = 0, skipped = 0, semLinha = [];
  for (var nome in porProduto) {
    var row = rowsByName[normalize_(nome)];
    if (!row) { semLinha.push(nome); continue; }

    // Só o ÚLTIMO cadastrado de cada item: pega a nota de data mais recente e
    // grava só ela (1 célula por produto). Assim não faz backfill do histórico —
    // cada compra nova vira uma célula nova; o hist. manual da planilha fica intacto.
    var todas = porProduto[nome].slice().sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1 : 0;
    });
    var lista = todas.length ? [todas[todas.length - 1]] : [];

    // Assinatura: se a data/resultado do último não mudou desde o run anterior, pula.
    var sig = lista.map(function (n) {
      return n.data + '=' + (n.resultado == null ? '' : n.resultado.toFixed(4));
    }).join('|');
    var sigKey = 'sig_' + nome;
    if (props.getProperty(sigKey) === sig) { skipped++; continue; }

    // Mapa data->célula que ESTE script já escreveu nesta linha (idempotência).
    var mapKey = 'cells_' + nome;
    var cellMap = JSON.parse(props.getProperty(mapKey) || '{}');

    for (var i = 0; i < lista.length; i++) {
      var n = lista[i];
      var col = cellMap[n.data];
      if (!col) {
        col = nextFreeCol_(sheet, row, cols, cellMap);
        if (!col) { Logger.log('SEM ESPAÇO na linha %s (%s) — adicione colunas', row, nome); break; }
        cellMap[n.data] = col;
      }
      var val = n.resultado == null ? '' : n.resultado;
      if (DRY_RUN) {
        Logger.log('  %s | %s | %s -> %s%s', nome, n.data,
          val === '' ? '(sem fator → vazio)' : 'R$ ' + Number(val).toFixed(2),
          columnToLetter_(col), row);
      } else {
        sheet.getRange(row, col).setValue(val);
      }
      writes++;
    }

    if (!DRY_RUN) {
      props.setProperty(mapKey, JSON.stringify(cellMap));
      props.setProperty(sigKey, sig);
    }
  }

  if (semLinha.length) Logger.log('SEM LINHA na planilha (produto no Supabase, mas não achei a linha): %s', semLinha.join(', '));
  Logger.log('%s gravações, %s produtos sem mudança.%s', writes, skipped, DRY_RUN ? '  [DRY_RUN — nada foi gravado]' : '');

  applyPenultimoEFormat_(sheet, cols);
}

// ── Supabase ────────────────────────────────────────────────────────────────
// service_role ignora RLS, então lê tudo sem token de usuário Firebase.
function fetchNotas_(key) {
  var out = [], PAGE = 1000;
  for (var off = 0; off < 100000; off += PAGE) {
    var url = SUPABASE_URL + '/rest/v1/precos'
      + '?select=data,preco_normalizado,produtos(nome_padrao,fator_regra3)'
      + '&order=data.asc&limit=' + PAGE + '&offset=' + off;
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { apikey: key, Authorization: 'Bearer ' + key },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() >= 300) throw new Error('Supabase ' + resp.getResponseCode() + ': ' + resp.getContentText());
    var rows = JSON.parse(resp.getContentText());
    if (!rows.length) break;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], p = r.produtos;
      if (!p || !p.nome_padrao) continue;               // sem "Produto (planilha)" → ignora
      var data = parseDataISO_(r.data);
      if (!data) continue;
      out.push({
        planilha: p.nome_padrao,
        data: data,
        resultado: calcResultado_(Number(r.preco_normalizado) || 0, p.fator_regra3),
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

// Regra3 idêntica à da intranet: "2" multiplica, "/2" divide, vírgula = decimal.
function calcResultado_(precoNorm, raw) {
  if (raw === '' || raw == null) return null;           // sem fator → Resultado vazio
  var s = String(raw).trim();
  var isDiv = s.charAt(0) === '/';
  var numStr = (isDiv ? s.slice(1) : s).replace(',', '.').trim();
  var n = Number(numStr);
  if (numStr === '' || isNaN(n)) return null;
  if (isDiv) return n === 0 ? null : precoNorm / n;
  return precoNorm * n;
}

// Uma data pode ter vários registros (fornecedores/notas diferentes) — mantém o
// último resultado não-nulo do dia (o "mais recente" daquela data).
function groupByProduto_(notas) {
  var out = {};
  for (var i = 0; i < notas.length; i++) {
    var n = notas[i];
    var m = out[n.planilha] || (out[n.planilha] = {});
    if (m[n.data] == null || n.resultado != null) m[n.data] = n.resultado;
  }
  var res = {};
  for (var nome in out) {
    res[nome] = Object.keys(out[nome]).map(function (d) { return { data: d, resultado: out[nome][d] }; });
  }
  return res;
}

// ── Planilha: colunas, linhas, célula livre ─────────────────────────────────
function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  if (SHEET_GID != null) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) if (all[i].getSheetId() === SHEET_GID) return all[i];
  }
  return ss.getSheets()[0];
}

function detectColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  // Acha automaticamente a LINHA do cabeçalho: varre as primeiras linhas atrás de
  // uma que tenha "Produto" (idealmente também "Último valor"). Assim não depende
  // de o cabeçalho estar exatamente na linha HEADER_ROW.
  var scanRows = Math.min(8, sheet.getLastRow());
  var scan = sheet.getRange(1, 1, scanRows, lastCol).getValues();
  var headerRow = HEADER_ROW, hdr = null;
  for (var rr = 0; rr < scanRows; rr++) {
    var norm = scan[rr].map(normalize_);
    var hasProd = norm.some(function (v) { return v.indexOf(COL_PRODUTO) === 0; });
    var hasUlt = norm.some(function (v) { return v.indexOf(COL_ULTIMO) === 0; });
    if (hasProd && hasUlt) { headerRow = rr + 1; hdr = norm; break; }
    if (hasProd && hdr == null) { headerRow = rr + 1; hdr = norm; } // só produto = fallback
  }
  if (hdr == null) hdr = (scan[HEADER_ROW - 1] || []).map(normalize_);

  function find(sub) { for (var c = 0; c < hdr.length; c++) if (hdr[c].indexOf(sub) === 0) return c + 1; return 0; }
  var produto = find(COL_PRODUTO);
  var ultimo  = find(COL_ULTIMO);
  var penultimo = find(COL_PENULTIMO);
  // Fim da região de preços = 1ª coluna de "cauda" (R$/%/GRAMAS/RESULTADO) depois de Último valor.
  var tail = lastCol + 1;
  for (var c = ultimo; c < hdr.length; c++) {
    if (COL_TAIL.indexOf(hdr[c]) >= 0) { tail = c + 1; break; }
  }
  // Início dos preços = logo após Último valor (e após Penúltimo, se ela estiver
  // à esquerda da série) — assim a série de preços nunca inclui essas colunas.
  var effPen = (penultimo && penultimo < tail) ? penultimo : 0;
  var priceStart = Math.max(ultimo, effPen) + 1;
  return {
    headerRow: headerRow, firstDataRow: headerRow + 1,
    produto: produto, ultimo: ultimo, penultimo: penultimo,
    priceStart: priceStart, priceEnd: tail - 1,
  };
}

function indexRows_(sheet, cols) {
  var last = sheet.getLastRow();
  var vals = sheet.getRange(cols.firstDataRow, cols.produto, last - cols.firstDataRow + 1, 1).getValues();
  var idx = {};
  for (var i = 0; i < vals.length; i++) {
    var nome = String(vals[i][0] || '').trim();
    if (nome) idx[normalize_(nome)] = cols.firstDataRow + i;
  }
  return idx;
}

// Próxima célula vazia da linha dentro da região de preços, que não esteja já
// reservada por outra data no cellMap (evita duas datas na mesma coluna).
function nextFreeCol_(sheet, row, cols, cellMap) {
  var reserved = {};
  for (var d in cellMap) reserved[cellMap[d]] = true;
  var width = cols.priceEnd - cols.priceStart + 1;
  var rowVals = sheet.getRange(row, cols.priceStart, 1, width).getValues()[0];
  for (var i = 0; i < width; i++) {
    var col = cols.priceStart + i;
    if (reserved[col]) continue;
    if (rowVals[i] === '' || rowVals[i] === null) return col;
  }
  return 0;
}

// ── Penúltimo valor + cores (vermelho subiu / verde desceu) ─────────────────
function applyPenultimoEFormat_(sheet, cols) {
  var last = sheet.getLastRow();
  var fdr = cols.firstDataRow;
  var nRows = last - fdr + 1;
  if (nRows <= 0) return;
  var pStart = columnToLetter_(cols.priceStart);
  var pEnd = columnToLetter_(cols.priceEnd);

  // OBS locale: esta planilha é pt-BR — o separador de argumentos de fórmula é ';'
  // (não ','). O setFormula grava o texto como está, então TEM que ser ';', senão
  // vira #ERROR! de parse (que o IFERROR não pega). Mesma coisa nas fórmulas da
  // formatação condicional. Espelha o estilo da fórmula do "Último valor" (D).
  if (SET_ULTIMO_FORMULA && cols.ultimo) {
    var uf = [];
    for (var r = fdr; r <= last; r++) {
      var au = pStart + r + ':' + pEnd + r;
      uf.push(['=IFERROR(INDEX(' + au + ';1;MAX(IF(' + au + '<>"";COLUMN(' + au + ')-COLUMN(' + pStart + r + ')+1)));"")']);
    }
    if (!DRY_RUN) sheet.getRange(fdr, cols.ultimo, nRows, 1).setFormulas(uf);
  }

  if (SET_PENULTIMO_FORMULA && cols.penultimo) {
    var pf = [];
    for (var r2 = fdr; r2 <= last; r2++) {
      var a = pStart + r2 + ':' + pEnd + r2;                 // ex.: F2:AD2
      // 2º valor não-vazio da linha (o penúltimo): LARGE(...;2) da posição.
      pf.push(['=IFERROR(INDEX(' + a + ';1;LARGE(IF(' + a + '<>"";COLUMN(' + a + ')-COLUMN(' + pStart + r2 + ')+1);2));"")']);
    }
    if (!DRY_RUN) sheet.getRange(fdr, cols.penultimo, nRows, 1).setFormulas(pf);
  }

  if (SET_CONDITIONAL_FORMAT && cols.ultimo && cols.penultimo && !DRY_RUN) {
    // Remove regras de formatação condicional que versões anteriores deste script
    // adicionaram na coluna Último (a CF por fórmula quebra com o locale pt-BR).
    var keep = sheet.getConditionalFormatRules().filter(function (rule) {
      return rule.getRanges().every(function (rg) { return rg.getColumn() !== cols.ultimo; });
    });
    sheet.setConditionalFormatRules(keep);

    // Colore o fundo do Último (D) comparando os VALORES exibidos em Último (D) e
    // Penúltimo (E) — assim a cor sempre bate com o que aparece na tela. À prova de
    // locale, recalc a cada run: vermelho se subiu, verde se desceu, branco se igual.
    SpreadsheetApp.flush(); // garante que a fórmula do penúltimo já calculou
    var ults = sheet.getRange(fdr, cols.ultimo, nRows, 1).getValues();
    var pens = sheet.getRange(fdr, cols.penultimo, nRows, 1).getValues();
    var bg = [];
    for (var i = 0; i < nRows; i++) {
      var u = ults[i][0], p = pens[i][0];
      var cor = '#FFFFFF';
      if (typeof u === 'number' && typeof p === 'number') {
        if (u > p) cor = '#F4CCCC'; else if (u < p) cor = '#D9EAD3';
      }
      bg.push([cor]);
    }
    sheet.getRange(fdr, cols.ultimo, nRows, 1).setBackgrounds(bg);
  }
}

// ── Utils ───────────────────────────────────────────────────────────────────
function normalize_(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function parseDataISO_(raw) {
  if (!raw) return '';
  var s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + '-' + br[2] + '-' + br[1];
  var d = new Date(s);
  return isNaN(d) ? '' : Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd');
}

function columnToLetter_(col) {
  var s = '';
  while (col > 0) { var m = (col - 1) % 26; s = String.fromCharCode(65 + m) + s; col = (col - m - 1) / 26; }
  return s;
}

/**
 * ─── PASSO A PASSO DE INSTALAÇÃO ────────────────────────────────────────────
 * 1) No Supabase (Project Settings → API) copie a chave "service_role" (secreta).
 * 2) script.google.com → Novo projeto → cole este arquivo.
 * 3) ⚙ Configurações do projeto → Propriedades do script → Adicionar:
 *      Nome:  SUPABASE_SERVICE_KEY
 *      Valor: <a service_role key>
 * 4) Selecione a função `sync` e clique ▶ Executar. Autorize os acessos
 *    (planilha + rede). Abra "Registros de execução" e confira o que ele
 *    gravaria — DRY_RUN está true, então NADA é escrito ainda.
 * 5) Se o mapeamento (colunas e produtos) estiver certo, mude DRY_RUN para false.
 * 6) ⏰ Acionadores → Adicionar acionador → função `sync`, baseado em tempo,
 *    ex.: a cada 6 horas. Pronto: a planilha passa a se atualizar sozinha e
 *    sempre recalcula do fator atual (se você corrigir um fator na intranet,
 *    o próximo run conserta a planilha).
 */
