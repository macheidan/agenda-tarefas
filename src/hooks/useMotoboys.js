import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ---- Constantes do domínio (espelham a planilha "Dáme Coopale") ----

export const MOTOBOY_LOJAS = [
  { id: 'dame', nome: 'Dáme' },
  { id: 'lov', nome: 'Lov' },
];

export const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// 4 taxas ativas + 2 reservas (como na planilha). Valores editáveis por semana.
export const DEFAULT_MOTOBOY_CONFIG = {
  taxas: [
    { label: 'Taxa 1', valor: 10.5, faixa: 'até 3km' },
    { label: 'Taxa 2', valor: 13, faixa: 'até 4km' },
    { label: 'Taxa 3', valor: 15, faixa: 'até 5km' },
    { label: 'Taxa 4', valor: 18, faixa: 'até 8km' },
    { label: 'Taxa 5', valor: null, faixa: '' },
    { label: 'Taxa 6', valor: null, faixa: '' },
  ],
  garantia: 100, // mínimo por noite trabalhada (Acréscimo completa até esse valor)
  taxaCoop: 20, // taxa da cooperativa por moto-dia trabalhado
};

// ---- Helpers de data (semana = segunda a domingo) ----

// Date local → 'YYYY-MM-DD'.
export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Segunda-feira da semana que contém a data.
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0=dom
  d.setDate(d.getDate() - ((dow + 6) % 7));
  return isoDate(d);
}

export function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoDate(dt);
}

export function formatDiaCurto(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function semanaDocId(loja, segunda) {
  return `${loja}_${segunda}`;
}

// ---- Cálculos (réplica das fórmulas da planilha) ----

// Um dia de um motoboy: { t: {0..5: qtd}, desc: number|null, ok: bool }.
// `ok` é o checkbox de confirmação do dia: sem ele, o dia não gera acréscimo
// (garantia) nem conta como moto-dia (taxa coop) — as bandas seguem valendo.
export function calcDia(cel, config) {
  const taxas = config?.taxas || DEFAULT_MOTOBOY_CONFIG.taxas;
  const garantia = Number(config?.garantia) || 0;
  const ok = cel?.ok === true;
  let qtd = 0;
  let bandas = 0;
  for (let i = 0; i < taxas.length; i++) {
    const n = Number(cel?.t?.[i]) || 0;
    qtd += n;
    bandas += n * (Number(taxas[i]?.valor) || 0);
  }
  // Acréscimo: se o dia foi confirmado, trabalhou e rendeu menos que a garantia, completa.
  const acrescimo = ok && qtd > 0 && bandas < garantia ? garantia - bandas : 0;
  const desconto = Number(cel?.desc) || 0;
  const valor = bandas + acrescimo + desconto;
  return { qtd, bandas, acrescimo, desconto, valor, trabalhou: ok && qtd > 0, ok };
}

// Semana inteira de um motoboy → { dias: [7×calcDia], total: {...} }.
export function calcMotoboySemana(mb, config) {
  const dias = [];
  const total = { qtd: 0, bandas: 0, acrescimo: 0, desconto: 0, valor: 0, diasTrabalhados: 0 };
  for (let d = 0; d < 7; d++) {
    const r = calcDia(mb?.dias?.[d], config);
    dias.push(r);
    total.qtd += r.qtd;
    total.bandas += r.bandas;
    total.acrescimo += r.acrescimo;
    total.desconto += r.desconto;
    total.valor += r.valor;
    if (r.trabalhou) total.diasTrabalhados += 1;
  }
  return { dias, total };
}

// Resumo da semana (todas as motos): Entregas, Motos (moto-dias), Taxa coop,
// Transbordo (Σ acréscimos) e Total a Pagar (Σ valores + taxa coop).
export function calcResumoSemana(motoboys, config) {
  const taxaCoop = Number(config?.taxaCoop) || 0;
  let entregas = 0;
  let motoDias = 0;
  let transbordo = 0;
  let somaValores = 0;
  Object.values(motoboys || {}).forEach((mb) => {
    const r = calcMotoboySemana(mb, config);
    entregas += r.total.qtd;
    motoDias += r.total.diasTrabalhados;
    transbordo += r.total.acrescimo;
    somaValores += r.total.valor;
  });
  const taxaCoopTotal = motoDias * taxaCoop;
  return { entregas, motoDias, taxaCoopTotal, transbordo, somaValores, totalPagar: somaValores + taxaCoopTotal };
}

// ---- Normalização de nomes (mesma usada pelo importador do Saipos) ----
export function normalizarNome(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function novoMid() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---- Hook principal ----

export function useMotoboys(loja, segunda, author) {
  const [semana, setSemana] = useState(null); // doc motoboySemanas (null = não existe)
  const [semanaLoading, setSemanaLoading] = useState(true);
  const [configLoja, setConfigLoja] = useState(null); // doc motoboyConfig/{loja}
  const [extras, setExtras] = useState([]); // bandas extras da loja (filtradas por semana no consumo)
  const [error, setError] = useState(null);

  const docId = semanaDocId(loja, segunda);

  // Semana selecionada.
  useEffect(() => {
    setSemanaLoading(true);
    const unsub = onSnapshot(
      doc(db, 'motoboySemanas', docId),
      (snap) => {
        setSemana(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setSemanaLoading(false);
        setError(null);
      },
      (err) => {
        setSemanaLoading(false);
        setError(err?.message || String(err));
      }
    );
    return unsub;
  }, [docId]);

  // Config/roster da loja.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'motoboyConfig', loja),
      (snap) => setConfigLoja(snap.exists() ? snap.data() : null),
      () => {}
    );
    return unsub;
  }, [loja]);

  // Bandas extras da loja (volume pequeno; filtro por semana fica no cliente).
  useEffect(() => {
    const q = query(collection(db, 'motoboyExtras'), where('loja', '==', loja));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (a.data < b.data ? -1 : 1));
        setExtras(items);
      },
      () => {}
    );
    return unsub;
  }, [loja]);

  const extrasDaSemana = extras.filter((e) => {
    const fim = addDaysIso(segunda, 6);
    return e.data >= segunda && e.data <= fim;
  });

  // Config efetiva da semana (semana > default da loja > default fixo).
  const config = semana?.config || configLoja?.config || DEFAULT_MOTOBOY_CONFIG;

  // Cria a semana se não existir, com config da loja e SEM motoboys:
  // cada semana começa vazia e os nomes entram manualmente (roster vira sugestão).
  const criarSemana = useCallback(async () => {
    const cfg = configLoja?.config || DEFAULT_MOTOBOY_CONFIG;
    await setDoc(
      doc(db, 'motoboySemanas', docId),
      {
        loja,
        semana: segunda,
        config: cfg,
        motoboys: {},
        criadoEm: Timestamp.now(),
        criadoPor: author?.uid || null,
      },
      { merge: true }
    );
  }, [docId, loja, segunda, configLoja, author]);

  // Lança quantidade de entregas de uma taxa num dia (null apaga a célula).
  const setCelula = useCallback(
    async (mid, diaIdx, taxaIdx, qtd) => {
      const path = `motoboys.${mid}.dias.${diaIdx}.t.${taxaIdx}`;
      await updateDoc(doc(db, 'motoboySemanas', docId), {
        [path]: qtd == null || qtd === 0 ? deleteField() : Number(qtd),
        atualizadoEm: Timestamp.now(),
      });
    },
    [docId]
  );

  // Checkbox de confirmação do dia (libera acréscimo e moto-dia no cálculo).
  const setDiaOk = useCallback(
    async (mid, diaIdx, ok) => {
      const path = `motoboys.${mid}.dias.${diaIdx}.ok`;
      await updateDoc(doc(db, 'motoboySemanas', docId), {
        [path]: ok ? true : deleteField(),
        atualizadoEm: Timestamp.now(),
      });
    },
    [docId]
  );

  // Desconto (R$) de um motoboy num dia (valor negativo desconta).
  const setDesconto = useCallback(
    async (mid, diaIdx, valor) => {
      const path = `motoboys.${mid}.dias.${diaIdx}.desc`;
      await updateDoc(doc(db, 'motoboySemanas', docId), {
        [path]: valor == null ? deleteField() : Number(valor),
        atualizadoEm: Timestamp.now(),
      });
    },
    [docId]
  );

  // Adiciona motoboy na semana (e no roster da loja, para as próximas semanas).
  const addMotoboy = useCallback(
    async (nome) => {
      const limpo = String(nome || '').trim();
      if (!limpo) return null;
      const norm = normalizarNome(limpo);
      // Reaproveita o mid do roster se o nome já existe.
      const roster = configLoja?.roster || {};
      let mid = Object.keys(roster).find((k) => normalizarNome(roster[k].nome) === norm);
      if (!mid) mid = novoMid();
      const ordem = Object.keys(semana?.motoboys || {}).length;
      await updateDoc(doc(db, 'motoboySemanas', docId), {
        [`motoboys.${mid}`]: { nome: limpo, ordem, dias: {} },
        atualizadoEm: Timestamp.now(),
      });
      await setDoc(
        doc(db, 'motoboyConfig', loja),
        { roster: { [mid]: { nome: limpo, ativo: true, ordem } } },
        { merge: true }
      );
      return mid;
    },
    [docId, loja, semana, configLoja]
  );

  // Remove o motoboy da semana (mantém no roster da loja).
  const removeMotoboy = useCallback(
    async (mid) => {
      await updateDoc(doc(db, 'motoboySemanas', docId), {
        [`motoboys.${mid}`]: deleteField(),
        atualizadoEm: Timestamp.now(),
      });
    },
    [docId]
  );

  // Comentário do dia de um motoboy (sirene). Texto vazio apaga.
  const setObs = useCallback(
    async (mid, diaIdx, texto) => {
      const t = String(texto || '').trim();
      await updateDoc(doc(db, 'motoboySemanas', docId), {
        [`motoboys.${mid}.dias.${diaIdx}.obs`]: t
          ? { t, por: author?.displayName || author?.email || null, em: new Date().toISOString() }
          : deleteField(),
        atualizadoEm: Timestamp.now(),
      });
    },
    [docId, author]
  );

  // ---- Cadastro (roster da loja): adicionar, renomear, arquivar ----

  // Adiciona nome ao roster sem colocar na semana (entra nas próximas semanas).
  const addRosterMotoboy = useCallback(
    async (nome) => {
      const limpo = String(nome || '').trim();
      if (!limpo) return null;
      const norm = normalizarNome(limpo);
      const roster = configLoja?.roster || {};
      let mid = Object.keys(roster).find((k) => normalizarNome(roster[k].nome) === norm);
      if (mid) {
        // Já existe: só garante ativo.
        await setDoc(doc(db, 'motoboyConfig', loja), { roster: { [mid]: { ativo: true } } }, { merge: true });
        return mid;
      }
      mid = novoMid();
      const ordem = Object.keys(roster).length;
      await setDoc(
        doc(db, 'motoboyConfig', loja),
        { roster: { [mid]: { nome: limpo, ativo: true, ordem } } },
        { merge: true }
      );
      return mid;
    },
    [loja, configLoja]
  );

  // Renomeia no roster e, se o motoboy está na semana aberta, nela também.
  const renameMotoboy = useCallback(
    async (mid, nome) => {
      const limpo = String(nome || '').trim();
      if (!limpo) return;
      await setDoc(doc(db, 'motoboyConfig', loja), { roster: { [mid]: { nome: limpo } } }, { merge: true });
      if (semana?.motoboys?.[mid]) {
        await updateDoc(doc(db, 'motoboySemanas', docId), {
          [`motoboys.${mid}.nome`]: limpo,
          atualizadoEm: Timestamp.now(),
        });
      }
    },
    [docId, loja, semana]
  );

  // Arquiva/desarquiva no roster (arquivado não entra em semanas novas;
  // semanas já criadas não mudam).
  const setRosterAtivo = useCallback(
    async (mid, ativo) => {
      await setDoc(doc(db, 'motoboyConfig', loja), { roster: { [mid]: { ativo: !!ativo } } }, { merge: true });
    },
    [loja]
  );

  // Atualiza config da semana e grava como novo default da loja.
  const setConfig = useCallback(
    async (patch) => {
      const nova = { ...config, ...patch };
      await updateDoc(doc(db, 'motoboySemanas', docId), {
        config: nova,
        atualizadoEm: Timestamp.now(),
      });
      await setDoc(doc(db, 'motoboyConfig', loja), { config: nova }, { merge: true });
    },
    [docId, loja, config]
  );

  // ---- Bandas extras ----
  const addExtra = useCallback(
    async ({ data, mid, nome, quantidade, taxaIdx, justificativa }) => {
      await addDoc(collection(db, 'motoboyExtras'), {
        loja,
        data,
        mid: mid || null,
        nome: String(nome || '').trim(),
        quantidade: Number(quantidade) || 1,
        taxaIdx: Number(taxaIdx) || 0,
        justificativa: String(justificativa || '').trim(),
        createdAt: Timestamp.now(),
        createdBy: author?.uid || null,
      });
    },
    [loja, author]
  );

  const deleteExtra = useCallback(async (id) => {
    await deleteDoc(doc(db, 'motoboyExtras', id));
  }, []);

  // Atribui um nome não casado do Saipos a um motoboy e salva o alias
  // (o importador usa motoboyConfig.aliases nas próximas rodadas).
  const atribuirNaoCasado = useCallback(
    async (nomeSaipos, mid) => {
      const norm = normalizarNome(nomeSaipos);
      const naoCasados = (semana?.pa?.naoCasados || []).filter(
        (n) => normalizarNome(n.nome) !== norm
      );
      const alvo = (semana?.pa?.naoCasados || []).find((n) => normalizarNome(n.nome) === norm);
      if (!alvo) return;
      const atual = semana?.pa?.entregas?.[mid] || {};
      const merged = { ...atual };
      Object.entries(alvo.dias || {}).forEach(([d, q]) => {
        merged[d] = (Number(merged[d]) || 0) + (Number(q) || 0);
      });
      // Detalhe por taxa (quando o import trouxe): merge no pa.taxas do destino.
      const taxasAtual = semana?.pa?.taxas?.[mid] || {};
      const taxasMerged = JSON.parse(JSON.stringify(taxasAtual));
      Object.entries(alvo.taxas || {}).forEach(([d, porTaxa]) => {
        if (!taxasMerged[d]) taxasMerged[d] = {};
        Object.entries(porTaxa).forEach(([ti, q]) => {
          taxasMerged[d][ti] = (Number(taxasMerged[d][ti]) || 0) + (Number(q) || 0);
        });
      });
      await updateDoc(doc(db, 'motoboySemanas', docId), {
        [`pa.entregas.${mid}`]: merged,
        ...(Object.keys(taxasMerged).length ? { [`pa.taxas.${mid}`]: taxasMerged } : {}),
        'pa.naoCasados': naoCasados,
        atualizadoEm: Timestamp.now(),
      });
      await setDoc(
        doc(db, 'motoboyConfig', loja),
        { aliases: { [norm]: mid } },
        { merge: true }
      );
    },
    [docId, loja, semana]
  );

  return {
    semana,
    semanaLoading,
    config,
    configLoja,
    extras: extrasDaSemana,
    error,
    criarSemana,
    setCelula,
    setDiaOk,
    setDesconto,
    addMotoboy,
    removeMotoboy,
    setObs,
    addRosterMotoboy,
    renameMotoboy,
    setRosterAtivo,
    setConfig,
    addExtra,
    deleteExtra,
    atribuirNaoCasado,
  };
}
