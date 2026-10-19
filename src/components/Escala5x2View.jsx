import { useState, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEscala5x2 } from '../hooks/useEscala5x2';
import {
  CORES, COR_KEYS, WD, DEFAULT_REGRAS,
  pad, dkey, parseKey, addDays, mondayOf, weekDays, toMin, fmt, hm, hhmm, snap, clamp,
  parseHoras, regrasOf, lockWin, makeTurno, fixTurno, storeTurno, shiftLabel, coverage, validar,
} from '../utils/escala5x2';
import Escala5x2Mes from './Escala5x2Mes';
import styles from '../styles/Escala5x2View.module.css';

const ROW = 36;
const NONE = [];
// Tinta escura fixa: o post-it continua claro também no tema escuro (igual aos Lembretes).
const POSTIT_INK = '#1a1d26';
const breakText = (pd) => (pd ? (pd === 60 ? '1 h' : `${pd} min`) : 'sem intervalo');

// Funcionário no período do contrato entre as datas ini e fim (YYYY-MM-DD)?
const inContract = (e, ini, fim) =>
  (!e.contractStart || e.contractStart <= fim) && (!e.contractEnd || e.contractEnd >= ini);
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
// Sub-seções da Escala 5x2.
const MODOS = [['semana', 'Semana'], ['mes', 'Mês']];

export default function Escala5x2View({ visibleStores, employees, canEdit }) {
  const { user } = useAuth();
  const [storeSel, setStoreSel] = useState(null);
  const storeId = visibleStores.find((s) => s.id === storeSel)?.id || visibleStores[0]?.id || null;
  const { config, semanas, loading, error, saveSemana, saveSemanas, saveConfig } = useEscala5x2(storeId);
  const [week, setWeek] = useState(() => dkey(mondayOf(new Date())));
  const [modo, setModo] = useState('semana'); // semana | mes
  const [mes, setMes] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [repN, setRepN] = useState(3);
  const [showRegras, setShowRegras] = useState(false);
  const [empDlg, setEmpDlg] = useState(null);   // { id, jr, ini, cor }
  const [turnoDlg, setTurnoDlg] = useState(null); // { k, i, ini, hrs, pi }
  const [toast, setToast] = useState('');
  const calRef = useRef(null);
  const asideRef = useRef(null);
  const tipRef = useRef(null);
  const toastTimer = useRef(null);

  const r = useMemo(() => regrasOf(config), [config]);
  const span = (r.h1 - r.h0) * 60;
  const pct = useCallback((m) => ((m - r.h0 * 60) / span) * 100, [r.h0, span]);

  // Período exibido: a semana ou o mês inteiro (define quem aparece pelo contrato).
  const [periodoIni, periodoFim] = modo === 'mes'
    ? [dkey(new Date(mes.y, mes.m, 1)), dkey(new Date(mes.y, mes.m + 1, 0))]
    : [week, dkey(addDays(parseKey(week), 6))];
  const emps = useMemo(() => {
    const cfg = config?.emps || {};
    return employees
      .filter((e) => e.store === storeId && e.active !== false && inContract(e, periodoIni, periodoFim))
      .map((e, i) => {
        const c = cfg[e.id] || {};
        const jr = c.jr ?? 8;
        return { id: e.id, name: e.name, jr, ini: c.ini || (jr <= 6 ? '18:00' : '15:00'), cor: c.cor || COR_KEYS[i % COR_KEYS.length] };
      });
  }, [employees, storeId, periodoIni, periodoFim, config]);
  const empById = useMemo(() => Object.fromEntries(emps.map((e) => [e.id, e])), [emps]);
  // Nome de quem saiu da loja mas ainda tem turno gravado em semana antiga.
  const nameOf = useCallback((id) => empById[id]?.name || employees.find((e) => e.id === id)?.name || '?', [empById, employees]);

  // Turnos completos (saída e intervalo calculados) de qualquer dia carregado.
  const allDays = useMemo(() => {
    const m = {};
    Object.values(semanas).forEach((days) => {
      Object.entries(days).forEach(([k, list]) => { m[k] = list.map((t) => fixTurno(t, r)); });
    });
    return m;
  }, [semanas, r]);
  const dayOf = useCallback((k) => allDays[k] || NONE, [allDays]);

  const weekKeys = useMemo(() => weekDays(week).map(dkey), [week]);
  const check = useMemo(() => validar({ emps, weekKeys, dayOf, r }), [emps, weekKeys, dayOf, r]);

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  // Altera a semana visível e grava no Firestore (sempre no formato enxuto).
  const commitWeek = useCallback((mutate) => {
    const days = {};
    weekKeys.forEach((k) => { days[k] = dayOf(k).map((t) => ({ ...t })); });
    mutate(days);
    const lean = {};
    Object.entries(days).forEach(([k, list]) => {
      if (list.length) lean[k] = list.map((t) => storeTurno(fixTurno(t, r)));
    });
    saveSemana(week, lean, user).catch((e) => flash(`Erro ao salvar: ${e.message}`));
  }, [weekKeys, dayOf, r, saveSemana, week, user]);

  const newTurno = useCallback((emp, ini) => makeTurno(emp.id, ini, Math.round(emp.jr * 4) / 4 * 60, null, r), [r]);

  /* ---------- arrastar (pointer events: mouse e toque) ---------- */
  const drag = useRef(null);
  const trackAt = (x, y) => document.elementFromPoint(x, y)?.closest(`.${styles.track}`) || null;
  const overAside = (x, y) => !!document.elementFromPoint(x, y)?.closest(`.${styles.aside}`);
  const minAt = (track, x) => { const b = track.getBoundingClientRect(); return r.h0 * 60 + ((x - b.left) / b.width) * span; };
  const showTip = (x, y, text) => {
    const el = tipRef.current; if (!el) return;
    el.style.display = text ? 'block' : 'none';
    el.textContent = text;
    el.style.left = `${x + 14}px`; el.style.top = `${y + 16}px`;
  };
  const clearDrop = () => {
    calRef.current?.querySelectorAll(`.${styles.drop}`).forEach((t) => t.classList.remove(styles.drop));
    asideRef.current?.classList.remove(styles.drop);
  };

  const onMove = (ev) => {
    const d = drag.current; if (!d) return;
    const x = ev.clientX, y = ev.clientY;
    if (!d.moved) {
      if (Math.hypot(x - d.x0, y - d.y0) < 4) return;
      d.moved = true;
      if (d.kind === 'new' || d.kind === 'move') {
        const b = d.el.getBoundingClientRect();
        const g = d.el.cloneNode(true);
        g.classList.add(styles.ghost);
        Object.assign(g.style, { position: 'fixed', left: `${b.left}px`, top: `${b.top}px`, width: `${Math.max(b.width, 160)}px`, margin: 0 });
        document.body.appendChild(g);
        d.ghost = g; d.r0 = b;
        if (d.kind === 'move') d.el.style.opacity = '.3';
      }
    }
    clearDrop();
    const t = trackAt(x, y);
    if (d.kind === 'new') {
      d.ghost.style.left = `${x - 8}px`; d.ghost.style.top = `${y - 14}px`;
      if (t) {
        t.classList.add(styles.drop);
        const a = newTurno(d.emp, snap(minAt(t, x)));
        showTip(x, y, `${shiftLabel(a)} · intervalo ${a.pd ? fmt(a.pi) : '—'}`);
      } else showTip(x, y, 'solte num dia');
      return;
    }
    const dm = snap(((x - d.x0) / d.tw) * span);
    if (d.kind === 'move') {
      d.ghost.style.left = `${d.r0.left + (dm / span) * d.tw}px`;
      d.ghost.style.top = `${d.r0.top + y - d.y0}px`;
      d.dm = dm;
      if (t) { t.classList.add(styles.drop); showTip(x, y, `${fmt(d.orig.ini + dm)}–${fmt(d.orig.fim + dm)}${ev.ctrlKey ? ' (copiar)' : ''}`); }
      else if (overAside(x, y)) { asideRef.current.classList.add(styles.drop); showTip(x, y, 'tirar do dia'); }
      else showTip(x, y, '');
      return;
    }
    // intervalo: a saída se recalcula conforme a posição
    const o = d.orig;
    const a = fixTurno({ ...o, pi: clamp(o.pi + dm, o.ini, o.fim - o.pd - 15) }, r);
    d.next = a;
    const w = a.fim - a.ini;
    d.el.style.left = `${pct(a.ini)}%`;
    d.el.style.width = `${(w / span) * 100}%`;
    const b = d.el.querySelector(`.${styles.brk}`);
    if (b) { b.style.left = `${((a.pi - a.ini) / w) * 100}%`; b.style.width = `${(a.pd / w) * 100}%`; }
    const tm = d.el.querySelector(`.${styles.tm}`);
    if (tm) tm.textContent = `${shiftLabel(a)} · ${hm(a.mins)}`;
    showTip(x, y, `intervalo ${fmt(a.pi)}–${fmt(a.pi + a.pd)} · sai ${fmt(a.fim)}`);
  };

  const onUp = (ev) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const d = drag.current; drag.current = null;
    if (!d) return;
    clearDrop(); showTip(0, 0, '');
    d.ghost?.remove();
    if (d.el) d.el.style.opacity = '';
    const x = ev.clientX, y = ev.clientY;
    if (!d.moved) {
      if (d.kind === 'new') {
        setEmpDlg({ id: d.emp.id, name: d.emp.name, hrs: hhmm(d.emp.jr * 60), ini: d.emp.ini, cor: d.emp.cor });
      } else {
        const t = dayOf(d.k)[d.i];
        setTurnoDlg({ k: d.k, i: d.i, ini: fmt(t.ini), hrs: hhmm(t.mins), pi: fmt(t.pi), pd: t.pd });
      }
      return;
    }
    if (d.kind === 'new') {
      const t = trackAt(x, y); if (!t) return;
      const k = t.dataset.date;
      if (dayOf(k).some((a) => a.e === d.emp.id)) { flash(`${d.emp.name} já está nesse dia`); return; }
      const turno = newTurno(d.emp, snap(minAt(t, x)));
      commitWeek((days) => { days[k].push(turno); });
      return;
    }
    if (d.kind === 'brk') {
      const a = d.next; if (!a) return;
      commitWeek((days) => { days[d.k][d.i] = a; });
      return;
    }
    // move
    const t = trackAt(x, y);
    if (!t) {
      if (overAside(x, y)) commitWeek((days) => { days[d.k].splice(d.i, 1); });
      return;
    }
    const k = t.dataset.date, dm = d.dm || 0;
    const moved = { ...d.orig, ini: d.orig.ini + dm, pi: d.orig.pi + dm };
    const copy = ev.ctrlKey || ev.metaKey;
    if (k === d.k && !copy) { commitWeek((days) => { days[k][d.i] = moved; }); return; }
    if (dayOf(k).some((a) => a.e === d.orig.e)) { flash(`${nameOf(d.orig.e)} já está nesse dia`); return; }
    commitWeek((days) => {
      days[k].push(moved);
      if (!copy) days[d.k].splice(d.i, 1);
    });
  };

  const startDrag = (ev, info) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    drag.current = { ...info, x0: ev.clientX, y0: ev.clientY, moved: false };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const onCardDown = (ev, emp) => {
    if (!canEdit) return;
    startDrag(ev, { kind: 'new', emp, el: ev.currentTarget });
  };
  const onBarDown = (ev, k, i) => {
    if (!canEdit) return;
    const el = ev.currentTarget;
    const orig = dayOf(k)[i];
    startDrag(ev, {
      kind: ev.target.closest(`.${styles.brk}`) ? 'brk' : 'move',
      k, i, el, orig: { ...orig }, tw: el.parentElement.getBoundingClientRect().width,
    });
  };

  /* ---------- ações ---------- */
  const shiftWeek = (n) => setWeek((w) => dkey(addDays(parseKey(w), n * 7)));
  const shiftMes = (n) => setMes(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  // Do mapa do mês para a semana do dia clicado.
  const openDay = (d) => { setWeek(dkey(mondayOf(d))); setModo('semana'); };
  const repetir = () => {
    const n = clamp(Number(repN) || 1, 1, 26);
    const base = semanas[week] || {};
    const entries = [];
    for (let w = 1; w <= n; w++) {
      const wk = dkey(addDays(parseKey(week), 7 * w));
      const days = {};
      weekKeys.forEach((k, i) => {
        if (base[k]?.length) days[dkey(addDays(parseKey(wk), i))] = base[k].map((t) => ({ ...t }));
      });
      entries.push({ week: wk, days });
    }
    if (!window.confirm(`Copiar esta semana para as próximas ${n}? O que já estiver nelas será substituído.`)) return;
    saveSemanas(entries, user).then(() => flash(`Semana copiada para as próximas ${n}`)).catch((e) => flash(`Erro: ${e.message}`));
  };
  const limpar = () => {
    if (!window.confirm('Limpar todos os turnos desta semana?')) return;
    saveSemana(week, {}, user).catch((e) => flash(`Erro: ${e.message}`));
  };
  const setRegra = (field, value) => saveConfig({ regras: { ...r, [field]: value } }, user);

  /* ---------- diálogos ---------- */
  const empPreview = useMemo(() => {
    if (!empDlg) return null;
    const h = parseHoras(empDlg.hrs);
    if (!(h > 0 && h <= 12)) return { err: 'Digite as horas trabalhadas (ex.: 6, 7:30, 8).' };
    const a = makeTurno('x', toMin(empDlg.ini || '18:00'), Math.round(h * 4) / 4 * 60, null, r);
    return { a, h, over: h > 8 };
  }, [empDlg, r]);
  const saveEmp = () => {
    if (!empPreview?.a) return;
    saveConfig({ emps: { [empDlg.id]: { jr: Math.round(empPreview.h * 4) / 4, ini: empDlg.ini || '18:00', cor: empDlg.cor } } }, user)
      .catch((e) => flash(`Erro: ${e.message}`));
    setEmpDlg(null);
  };

  const turnoPreview = useMemo(() => {
    if (!turnoDlg) return null;
    const base = dayOf(turnoDlg.k)[turnoDlg.i];
    if (!base) return null;
    let ini = toMin(turnoDlg.ini); if (base.ini >= 1440) ini += 1440;
    const h = parseHoras(turnoDlg.hrs);
    const mins = h > 0 && h <= 12 ? Math.round(h * 4) / 4 * 60 : base.mins;
    let pi = toMin(turnoDlg.pi); while (pi < ini) pi += 1440;
    const a = makeTurno(base.e, ini, mins, pi, r);
    return { a, moved: a.pd && pi % 1440 !== a.pi % 1440 };
  }, [turnoDlg, dayOf, r]);
  const changeTurnoIni = (v) => setTurnoDlg((t) => {
    const delta = toMin(v) - toMin(t.ini); // intervalo anda junto com a entrada
    return { ...t, ini: v, pi: fmt(toMin(t.pi) + delta) };
  });
  const saveTurno = () => {
    const a = turnoPreview?.a; if (!a) return;
    commitWeek((days) => { days[turnoDlg.k][turnoDlg.i] = a; });
    setTurnoDlg(null);
  };
  const removeTurno = () => {
    commitWeek((days) => { days[turnoDlg.k].splice(turnoDlg.i, 1); });
    setTurnoDlg(null);
  };

  /* ---------- render ---------- */
  if (!visibleStores.length) {
    return <div className={styles.empty}>Nenhuma loja visível para você no Depto Pessoal.</div>;
  }
  const hrs = r.h1 - r.h0;
  const lk = lockWin(r) || [];
  let o0 = toMin(r.o0), o1 = toMin(r.o1); if (o1 <= o0) o1 += 1440;
  const wd = weekDays(week);
  const wLabel = `${wd[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${wd[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.storeTabs}>
          {visibleStores.map((s) => (
            <button type="button" key={s.id}
              className={`${styles.storeTab} ${s.id === storeId ? styles.storeTabActive : ''}`}
              onClick={() => setStoreSel(s.id)}>{s.name}</button>
          ))}
        </div>
        <div className={styles.storeTabs}>
          {MODOS.map(([key, label]) => (
            <button type="button" key={key}
              className={`${styles.storeTab} ${modo === key ? styles.storeTabActive : ''}`}
              onClick={() => setModo(key)}>{label}</button>
          ))}
        </div>
        {modo === 'semana' ? (
          <div className={styles.weekNav}>
            <button type="button" className={styles.btn} onClick={() => shiftWeek(-1)} aria-label="Semana anterior">‹</button>
            <strong>{wLabel}</strong>
            <button type="button" className={styles.btn} onClick={() => shiftWeek(1)} aria-label="Próxima semana">›</button>
            <button type="button" className={styles.btn} onClick={() => setWeek(dkey(mondayOf(new Date())))}>Hoje</button>
          </div>
        ) : (
          <div className={styles.weekNav}>
            <button type="button" className={styles.btn} onClick={() => shiftMes(-1)} aria-label="Mês anterior">‹</button>
            <strong>{MONTHS[mes.m]} {mes.y}</strong>
            <button type="button" className={styles.btn} onClick={() => shiftMes(1)} aria-label="Próximo mês">›</button>
            <button type="button" className={styles.btn} onClick={() => setMes({ y: new Date().getFullYear(), m: new Date().getMonth() })}>Hoje</button>
          </div>
        )}
        <div className={styles.actions}>
          {canEdit && modo === 'semana' && (<>
            <button type="button" className={styles.btn} onClick={repetir} title="Copia esta semana para as próximas">Repetir semana</button>
            <span className={styles.muted}>por</span>
            <input type="number" min="1" max="26" value={repN} onChange={(e) => setRepN(e.target.value)} className={styles.numInput} />
            <span className={styles.muted}>sem.</span>
            <button type="button" className={styles.btn} onClick={limpar}>Limpar semana</button>
          </>)}
          <button type="button" className={`${styles.btn} ${showRegras ? styles.btnOn : ''}`} onClick={() => setShowRegras((v) => !v)}>Regras</button>
        </div>
      </div>

      {error && <div className={styles.error}>Erro ao acessar o banco: {error}. Pode faltar publicar as regras do Firestore (dpEscala5x2Config / dpEscala5x2Semanas).</div>}

      {showRegras && (
        <div className={styles.regras}>
          <label>Teto semanal
            <select disabled={!canEdit} value={r.teto} onChange={(e) => setRegra('teto', Number(e.target.value))}>
              <option value={42}>42 h (a partir de 16/12/2026)</option>
              <option value={40}>40 h (a partir de 16/12/2027)</option>
              <option value={44}>44 h (regra antiga)</option>
            </select>
          </label>
          <label>Folgas mínimas por semana
            <select disabled={!canEdit} value={r.folgas} onChange={(e) => setRegra('folgas', Number(e.target.value))}>
              <option value={2}>2 (5x2)</option><option value={1}>1 (6x1 antiga)</option>
            </select>
          </label>
          <label>Domingo de folga a cada (semanas, 0 = não checa)
            <input disabled={!canEdit} type="number" min="0" max="8" value={r.dom} onChange={(e) => setRegra('dom', Number(e.target.value) || 0)} />
          </label>
          <label>Hora noturna reduzida (22h–5h)
            <select disabled={!canEdit} value={r.not} onChange={(e) => setRegra('not', Number(e.target.value))}>
              <option value={0}>Só informar (horas de relógio)</option>
              <option value={1}>Encurtar o turno (52min30s = 1h)</option>
            </select>
          </label>
          <label>Proibido intervalo (trava)
            <span className={styles.pair}>
              <input disabled={!canEdit} type="time" step="900" value={r.lk0 || ''} onChange={(e) => setRegra('lk0', e.target.value)} />
              <span>até</span>
              <input disabled={!canEdit} type="time" step="900" value={r.lk1 || ''} onChange={(e) => setRegra('lk1', e.target.value)} />
            </span>
          </label>
          <label>Loja aberta (faixa destacada)
            <span className={styles.pair}>
              <input disabled={!canEdit} type="time" step="900" value={r.o0} onChange={(e) => setRegra('o0', e.target.value || DEFAULT_REGRAS.o0)} />
              <span>até</span>
              <input disabled={!canEdit} type="time" step="900" value={r.o1} onChange={(e) => setRegra('o1', e.target.value || DEFAULT_REGRAS.o1)} />
            </span>
          </label>
          <label>Régua do dia
            <span className={styles.pair}>
              <select disabled={!canEdit} value={r.h0} onChange={(e) => { const h0 = Number(e.target.value); setRegra('h0', h0); if (r.h1 < h0 + 4) setRegra('h1', Math.min(h0 + 12, 32)); }}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}h</option>)}
              </select>
              <span>até</span>
              <select disabled={!canEdit} value={r.h1} onChange={(e) => setRegra('h1', Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => i + r.h0 + 4).filter((h) => h <= 32).map((h) => (
                  <option key={h} value={h}>{pad(h % 24)}h{h >= 24 ? ' (+1)' : ''}</option>
                ))}
              </select>
            </span>
          </label>
          <label className={styles.full}>Mínimo de pessoas por dia
            <span className={styles.mins}>
              {WD.map((d, i) => (
                <span key={d}>{d}
                  <input disabled={!canEdit} type="number" min="0" max="30" value={r.mins[i]}
                    onChange={(e) => { const m = [...r.mins]; m[i] = Math.max(0, Number(e.target.value) || 0); setRegra('mins', m); }} />
                </span>
              ))}
            </span>
          </label>
          <p className={styles.law}>
            Base: Emenda Constitucional nº 141, de 16/10/2026. Máx. 8 h/dia; 2 descansos remunerados por semana (um preferencialmente no domingo) e teto de 42 h a partir de 16/12/2026; 40 h a partir de 16/12/2027.
            Intervalo (CLT art. 71): 15 min acima de 4 h, 1 h acima de 6 h. Interjornada mínima de 11 h (art. 66). DSR: no máximo 6 dias seguidos.
          </p>
        </div>
      )}

      {modo === 'mes' && (
        <Escala5x2Mes year={mes.y} month={mes.m} emps={emps} dayOf={dayOf} r={r} onOpenDay={openDay} />
      )}

      {modo === 'semana' && (<>
      <div className={styles.layout}>
        <aside className={styles.aside} ref={asideRef}>
          <h3 className={styles.asideTitle}>Funcionários</h3>
          <div className={styles.pool}>
            {emps.map((e) => (
              <div key={e.id} className={styles.card} style={{ background: CORES[e.cor], color: POSTIT_INK, cursor: canEdit ? 'grab' : 'default' }}
                onPointerDown={(ev) => onCardDown(ev, e)}
                title={canEdit ? 'Arraste para um dia · clique para ajustar horas, entrada e cor' : ''}>
                <span className={styles.cardName}>{e.name}</span>
                <span className={styles.cardJr}>{hm(e.jr * 60)}</span>
                <span className={styles.cardSub}>{shiftLabel(newTurno(e, toMin(e.ini)))}</span>
              </div>
            ))}
            {!emps.length && <div className={styles.empty}>Nenhum funcionário ativo nesta loja. Cadastre na sub-aba Escala.</div>}
          </div>
          {canEdit && (
            <p className={styles.hint}>
              <b>Escalar:</b> arraste o post-it até o dia; onde soltar é a entrada.<br />
              <b>Mover:</b> arraste a barra (lado = entrada; cima/baixo = dia; <b>Ctrl</b> copia).<br />
              <b>Intervalo:</b> arraste a faixa listrada; duração mínima e saída são calculadas. Não entra na faixa vermelha.<br />
              <b>Horas do dia:</b> clique na barra.<br />
              <b>Tirar:</b> arraste a barra de volta para cá.
            </p>
          )}
        </aside>

        <div className={styles.calWrap}>
          <div className={styles.cal} ref={calRef} style={{ '--hrs': hrs }}>
            <div className={`${styles.row} ${styles.ticks}`}>
              <div className={styles.dlabel}>Dia</div>
              <div className={styles.scale}>
                {Array.from({ length: hrs + 1 }, (_, i) => (
                  <span key={i} style={{ left: `${(i / hrs) * 100}%` }}>{pad((r.h0 + i) % 24)}h</span>
                ))}
              </div>
            </div>
            {weekKeys.map((k, i) => {
              const list = dayOf(k);
              const sorted = list.map((t, idx) => ({ t, idx })).sort((a, b) => a.t.ini - b.t.ini);
              const tot = list.reduce((s, t) => s + t.mins, 0);
              const short = r.mins[i] > 0 && list.length < r.mins[i];
              const d = parseKey(k);
              return (
                <div key={k} className={`${styles.day} ${short ? styles.short : ''}`}>
                  <div className={styles.row}>
                    <div className={styles.dlabel}>
                      <span className={`${styles.dn} ${i === 6 ? styles.sun : ''}`}>{WD[i]} {pad(d.getDate())}/{pad(d.getMonth() + 1)}</span>
                      <small>{list.length} pess · {hm(tot)}{r.mins[i] ? ` · mín ${r.mins[i]}` : ''}</small>
                    </div>
                    <div className={styles.track} data-date={k} style={{ height: (sorted.length + 1) * ROW + 4 }}>
                      <div className={styles.openBand} style={{ left: `${pct(o0)}%`, width: `${((o1 - o0) / span) * 100}%` }} />
                      {lk.map(([b0, b1]) => (
                        <div key={b0} className={styles.lockBand} style={{ left: `${pct(b0)}%`, width: `${((b1 - b0) / span) * 100}%` }} title={`Proibido intervalo ${r.lk0}–${r.lk1}`} />
                      ))}
                      {sorted.map(({ t, idx }, row) => {
                        const e = empById[t.e];
                        const w = t.fim - t.ini;
                        const st = check.issues[k]?.[t.e];
                        return (
                          <div key={`${t.e}-${idx}`}
                            className={`${styles.bar} ${st === 'bad' ? styles.bad : st === 'warn' ? styles.warnBar : ''}`}
                            style={{ left: `${pct(t.ini)}%`, width: `${(w / span) * 100}%`, top: row * ROW + 4, background: CORES[e?.cor] || CORES.gray, color: POSTIT_INK, cursor: canEdit ? 'grab' : 'default' }}
                            title={`${nameOf(t.e)} · ${shiftLabel(t)} · intervalo ${t.pd ? `${fmt(t.pi)}–${fmt(t.pi + t.pd)}` : '—'} · ${hm(t.mins)}`}
                            onPointerDown={(ev) => onBarDown(ev, k, idx)}>
                            {t.pd > 0 && <div className={styles.brk} style={{ left: `${((t.pi - t.ini) / w) * 100}%`, width: `${(t.pd / w) * 100}%` }} />}
                            <span className={styles.barName}>{nameOf(t.e)}</span>
                            <span className={styles.tm}>{shiftLabel(t)} · {hm(t.mins)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div className={`${styles.dlabel} ${styles.covLabel}`}>pessoas</div>
                    <div className={styles.covCells}>
                      {coverage(list, r).map((c, h) => (
                        <span key={h} className={c ? '' : styles.zero}
                          style={{ background: `color-mix(in srgb, var(--accent) ${Math.min(c * 12, 60)}%, transparent)` }}>{c}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {loading && <div className={styles.muted}>Carregando…</div>}

      <h3 className={styles.sectionTitle}>Horas por dia</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Funcionário</th>
              {wd.map((d, i) => <th key={i}>{WD[i]} {pad(d.getDate())}</th>)}
              <th>Semana</th>
              <th title="Horas de relógio trabalhadas entre 22h e 5h, sem o intervalo — base do adicional noturno">Após 22h</th>
              <th>Folgas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {check.rows.map(({ emp, cells, tot, noite, folgas, dias, st }) => (
              <tr key={emp.id}>
                <td data-label="Funcionário"><span className={styles.chip} style={{ background: CORES[emp.cor], color: POSTIT_INK }}>{emp.name}</span></td>
                {cells.map((t, i) => (
                  <td key={i} data-label={WD[i]} className={t ? styles.num : styles.off}>
                    {t ? <>{hm(t.mins)}<br /><small>{shiftLabel(t)}</small></> : 'folga'}
                  </td>
                ))}
                <td data-label="Semana" className={styles.num}><b>{hm(tot)}</b> / {r.teto}h</td>
                <td data-label="Após 22h" className={styles.num}>{noite ? hm(noite) : '—'}</td>
                <td data-label="Folgas" className={styles.num}>{folgas}</td>
                <td>{dias > 0 && <span className={`${styles.tag} ${styles[`tag_${st}`]}`}>{st === 'ok' ? 'ok' : st === 'err' ? 'erro' : 'menos dias'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className={styles.sectionTitle}>Alertas</h3>
      <ul className={styles.alerts}>
        {check.alerts.length
          ? check.alerts.map(([c, t], i) => <li key={i} className={c === 'err' ? styles.alertErr : styles.alertWarn}>{t}</li>)
          : <li className={styles.alertOk}>Nenhum problema nesta semana.</li>}
      </ul>
      </>)}

      {empDlg && (
        <div className={styles.overlay} onPointerDown={(e) => { if (e.target === e.currentTarget) setEmpDlg(null); }}>
          <div className={styles.modal} role="dialog" aria-label={empDlg.name}>
            <h3>{empDlg.name}</h3>
            <div className={styles.two}>
              <label>Horas trabalhadas por dia
                <input autoFocus inputMode="decimal" placeholder="ex.: 6, 7:30, 8" value={empDlg.hrs} onChange={(e) => setEmpDlg({ ...empDlg, hrs: e.target.value })} />
              </label>
              <label>Entrada padrão
                <input type="time" step="900" value={empDlg.ini} onChange={(e) => setEmpDlg({ ...empDlg, ini: e.target.value })} />
              </label>
            </div>
            <p className={`${styles.calc} ${empPreview?.err || empPreview?.over ? styles.calcErr : ''}`}>
              {empPreview?.err || (empPreview && (
                `Intervalo mínimo: ${breakText(empPreview.a.pd)}${empPreview.a.pd ? ` (${fmt(empPreview.a.pi)}–${fmt(empPreview.a.pi + empPreview.a.pd)})` : ''} · turno ${shiftLabel(empPreview.a)} · ${hm(empPreview.h * 300)}/semana em 5x2${empPreview.over ? ' — passa de 8 h/dia' : ''}.`
              ))}
            </p>
            <label>Cor
              <span className={styles.swatches}>
                {COR_KEYS.map((c) => (
                  <button type="button" key={c} aria-label={c} className={c === empDlg.cor ? styles.swOn : ''} style={{ background: CORES[c] }}
                    onClick={() => setEmpDlg({ ...empDlg, cor: c })} />
                ))}
              </span>
            </label>
            <div className={styles.modalActions}>
              <span />
              <span className={styles.pair}>
                <button type="button" className={styles.btn} onClick={() => setEmpDlg(null)}>Cancelar</button>
                <button type="button" className={styles.primary} onClick={saveEmp} disabled={!empPreview?.a}>Salvar</button>
              </span>
            </div>
          </div>
        </div>
      )}

      {turnoDlg && turnoPreview && (
        <div className={styles.overlay} onPointerDown={(e) => { if (e.target === e.currentTarget) setTurnoDlg(null); }}>
          <div className={styles.modal} role="dialog">
            <h3>{nameOf(turnoPreview.a.e)} — {parseKey(turnoDlg.k).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</h3>
            <div className={styles.two}>
              <label>Entra
                <input type="time" step="900" value={turnoDlg.ini} onChange={(e) => changeTurnoIni(e.target.value)} />
              </label>
              <label>Horas trabalhadas
                <input inputMode="decimal" placeholder="ex.: 6, 7:30" value={turnoDlg.hrs} onChange={(e) => setTurnoDlg({ ...turnoDlg, hrs: e.target.value })} />
              </label>
            </div>
            <label>Intervalo começa
              <input type="time" step="900" value={turnoDlg.pi} onChange={(e) => setTurnoDlg({ ...turnoDlg, pi: e.target.value })} />
            </label>
            <p className={`${styles.calc} ${turnoPreview.a.mins > 480 ? styles.calcErr : ''}`}>
              {turnoPreview.moved && <span className={styles.calcWarn}>Intervalo ajustado para {fmt(turnoPreview.a.pi)} (trava {r.lk0}–{r.lk1} ou fora do turno).<br /></span>}
              <b>Sai às {fmt(turnoPreview.a.fim)}</b> · intervalo mínimo: {breakText(turnoPreview.a.pd)}
              {turnoPreview.a.pd ? ` (${fmt(turnoPreview.a.pi)}–${fmt(turnoPreview.a.pi + turnoPreview.a.pd)})` : ''}
              {turnoPreview.a.mins > 480 ? ' — passa de 8 h no dia' : ''}
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.danger} onClick={removeTurno}>Tirar do dia</button>
              <span className={styles.pair}>
                <button type="button" className={styles.btn} onClick={() => setTurnoDlg(null)}>Cancelar</button>
                <button type="button" className={styles.primary} onClick={saveTurno}>Salvar</button>
              </span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.tip} ref={tipRef} />
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
